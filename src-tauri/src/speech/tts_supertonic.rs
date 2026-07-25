//! Supertonic 3 on-device TTS.
//!
//! This is a faithful port of the upstream Rust reference
//! (`supertone-inc/supertonic`, `rust/src/helper.rs`) adapted to agodesk:
//! - no WAV file output; we return 16-bit PCM + sample rate like `tts_sherpa`,
//! - no `ndarray`; tensors are passed to `ort` as `(shape, flat Vec)` tuples so
//!   the crate's ONNX Runtime bindings stay decoupled from any `ndarray` version,
//! - the four ONNX sessions are cached across requests.
//!
//! The pipeline is: text preprocessing -> unicode indexing -> duration
//! prediction -> text encoding -> latent flow-matching (denoising loop) ->
//! vocoder -> f32 waveform (44.1 kHz) -> i16 PCM.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};

use ort::{Session, Tensor};
use rand_distr::{Distribution, Normal};
use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;

/// Supported Supertonic 3 language codes. `na` = language-agnostic.
pub const AVAILABLE_LANGS: &[&str] = &[
    "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu",
    "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "na",
];

/// Preset voice styles shipped in the Supertonic 3 HuggingFace repo.
pub const SUPERTONIC_VOICES: &[&str] = &[
    "M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5",
];

const DEFAULT_TOTAL_STEP: usize = 8;
const DEFAULT_SPEED: f32 = 1.05;
const CHUNK_SILENCE_SECONDS: f32 = 0.3;
const REQUIRED_ONNX: &[&str] = &[
    "duration_predictor.onnx",
    "text_encoder.onnx",
    "vector_estimator.onnx",
    "vocoder.onnx",
    "tts.json",
    "unicode_indexer.json",
];

#[derive(Debug, Clone)]
pub struct SupertonicFiles {
    pub base_dir: PathBuf,
    pub onnx_dir: PathBuf,
    pub voice_styles_dir: PathBuf,
}

pub fn supertonic_models_root() -> PathBuf {
    super::asr::models_root().join("supertonic")
}

fn onnx_dir_ready(onnx_dir: &Path) -> bool {
    REQUIRED_ONNX
        .iter()
        .all(|name| onnx_dir.join(name).is_file())
}

/// True when every selectable voice style JSON is present in `dir`.
fn voice_styles_ready(dir: &Path) -> bool {
    SUPERTONIC_VOICES
        .iter()
        .all(|voice| dir.join(format!("{voice}.json")).is_file())
}

/// Locates a ready Supertonic install under any known speech models root.
pub fn discover_supertonic() -> Option<SupertonicFiles> {
    for root in super::asr::models_search_roots() {
        let base = root.join("supertonic");
        // Support both `<root>/supertonic/onnx` and a flat `<root>/supertonic`.
        for onnx_dir in [base.join("onnx"), base.clone()] {
            if !onnx_dir_ready(&onnx_dir) {
                continue;
            }
            let voice_styles_dir = if base.join("voice_styles").is_dir() {
                base.join("voice_styles")
            } else {
                onnx_dir.clone()
            };
            // Require the voice styles too: the ONNX models are downloaded
            // before the voice styles, so an interrupted download could leave
            // the models present while the styles are still missing. Treating
            // that as "ready" would let synthesis fail later with a confusing
            // "voice style not found" error.
            if !voice_styles_ready(&voice_styles_dir) {
                continue;
            }
            return Some(SupertonicFiles {
                base_dir: base,
                onnx_dir,
                voice_styles_dir,
            });
        }
    }
    None
}

pub fn supertonic_ready() -> bool {
    discover_supertonic().is_some()
}

pub fn voice_style_path(files: &SupertonicFiles, voice: &str) -> PathBuf {
    files.voice_styles_dir.join(format!("{voice}.json"))
}

pub fn normalize_voice(voice: &str) -> String {
    let trimmed = voice.trim();
    if trimmed.is_empty() {
        return "M1".to_string();
    }
    let upper = trimmed.to_uppercase();
    if SUPERTONIC_VOICES.contains(&upper.as_str()) {
        upper
    } else {
        trimmed.to_string()
    }
}

pub fn normalize_lang(lang: Option<&str>) -> String {
    let raw = lang.unwrap_or("na").trim().to_lowercase();
    let base = raw.split(['-', '_']).next().unwrap_or("na");
    if AVAILABLE_LANGS.contains(&base) {
        base.to_string()
    } else {
        "na".to_string()
    }
}

// ---------------------------------------------------------------------------
// Config + voice style JSON
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct Config {
    ae: AeConfig,
    ttl: TtlConfig,
}

#[derive(Debug, Clone, Deserialize)]
struct AeConfig {
    sample_rate: i32,
    base_chunk_size: i32,
}

#[derive(Debug, Clone, Deserialize)]
struct TtlConfig {
    chunk_compress_factor: i32,
    latent_dim: i32,
}

#[derive(Debug, Clone, Deserialize)]
struct VoiceStyleData {
    style_ttl: StyleComponent,
    style_dp: StyleComponent,
}

#[derive(Debug, Clone, Deserialize)]
struct StyleComponent {
    data: Vec<Vec<Vec<f32>>>,
    dims: Vec<i64>,
}

struct Style {
    ttl_shape: Vec<i64>,
    ttl_data: Vec<f32>,
    dp_shape: Vec<i64>,
    dp_data: Vec<f32>,
}

fn flatten_style(component: &StyleComponent) -> (Vec<i64>, Vec<f32>) {
    let mut flat = Vec::new();
    for batch in &component.data {
        for row in batch {
            flat.extend_from_slice(row);
        }
    }
    // dims are (1, d1, d2) for a single preset style.
    let shape = if component.dims.len() == 3 {
        component.dims.clone()
    } else {
        vec![1, component.dims.first().copied().unwrap_or(1), flat.len() as i64]
    };
    (shape, flat)
}

fn load_style(path: &Path) -> Result<Style, String> {
    let file = std::fs::File::open(path)
        .map_err(|error| format!("Voice style '{}' not found: {error}", path.display()))?;
    let data: VoiceStyleData = serde_json::from_reader(std::io::BufReader::new(file))
        .map_err(|error| format!("Invalid voice style '{}': {error}", path.display()))?;
    let (ttl_shape, ttl_data) = flatten_style(&data.style_ttl);
    let (dp_shape, dp_data) = flatten_style(&data.style_dp);
    Ok(Style {
        ttl_shape,
        ttl_data,
        dp_shape,
        dp_data,
    })
}

// ---------------------------------------------------------------------------
// Text preprocessing (ported from helper.rs::preprocess_text)
// ---------------------------------------------------------------------------

fn is_valid_lang(lang: &str) -> bool {
    AVAILABLE_LANGS.contains(&lang)
}

fn preprocess_text(text: &str, lang: &str) -> Result<String, String> {
    use regex::Regex;

    let mut text: String = text.nfkd().collect();

    let emoji_pattern = Regex::new(
        r"[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F700}-\x{1F77F}\x{1F780}-\x{1F7FF}\x{1F800}-\x{1F8FF}\x{1F900}-\x{1F9FF}\x{1FA00}-\x{1FA6F}\x{1FA70}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}\x{1F1E6}-\x{1F1FF}]+",
    )
    .map_err(|error| error.to_string())?;
    text = emoji_pattern.replace_all(&text, "").to_string();

    let replacements = [
        ("\u{2013}", "-"),
        ("\u{2011}", "-"),
        ("\u{2014}", "-"),
        ("_", " "),
        ("\u{201C}", "\""),
        ("\u{201D}", "\""),
        ("\u{2018}", "'"),
        ("\u{2019}", "'"),
        ("\u{00B4}", "'"),
        ("`", "'"),
        ("[", " "),
        ("]", " "),
        ("|", " "),
        ("/", " "),
        ("#", " "),
        ("\u{2192}", " "),
        ("\u{2190}", " "),
    ];
    for (from, to) in &replacements {
        text = text.replace(from, to);
    }

    for symbol in ["\u{2665}", "\u{2606}", "\u{2661}", "\u{00A9}", "\\"] {
        text = text.replace(symbol, "");
    }

    for (from, to) in [("@", " at "), ("e.g.,", "for example, "), ("i.e.,", "that is, ")] {
        text = text.replace(from, to);
    }

    for (pattern, replacement) in [
        (r" ,", ","),
        (r" \.", "."),
        (r" !", "!"),
        (r" \?", "?"),
        (r" ;", ";"),
        (r" :", ":"),
        (r" '", "'"),
    ] {
        let re = Regex::new(pattern).map_err(|error| error.to_string())?;
        text = re.replace_all(&text, replacement).to_string();
    }

    while text.contains("\"\"") {
        text = text.replace("\"\"", "\"");
    }
    while text.contains("''") {
        text = text.replace("''", "'");
    }
    while text.contains("``") {
        text = text.replace("``", "`");
    }

    let ws = Regex::new(r"\s+").map_err(|error| error.to_string())?;
    text = ws.replace_all(&text, " ").to_string();
    text = text.trim().to_string();

    if !text.is_empty() {
        let ends_with_punct =
            Regex::new(r#"[.!?;:,'"\u{201C}\u{201D}\u{2018}\u{2019})\]}\u{2026}\u{3002}\u{300D}\u{300F}\u{3011}\u{3009}\u{300B}\u{203A}\u{00BB}]$"#)
                .map_err(|error| error.to_string())?;
        if !ends_with_punct.is_match(&text) {
            text.push('.');
        }
    }

    if !is_valid_lang(lang) {
        return Err(format!("Invalid language: {lang}"));
    }

    Ok(format!("<{lang}>{text}</{lang}>"))
}

// ---------------------------------------------------------------------------
// Text chunking (ported from helper.rs::chunk_text)
// ---------------------------------------------------------------------------

const ABBREVIATIONS: &[&str] = &[
    "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Sr.", "Jr.", "St.", "Ave.", "Rd.", "Blvd.", "Dept.",
    "Inc.", "Ltd.", "Co.", "Corp.", "etc.", "vs.", "i.e.", "e.g.", "Ph.D.",
];

fn split_sentences(text: &str) -> Vec<String> {
    use regex::Regex;
    let re = match Regex::new(r"([.!?])\s+") {
        Ok(re) => re,
        Err(_) => return vec![text.to_string()],
    };
    let matches: Vec<_> = re.find_iter(text).collect();
    if matches.is_empty() {
        return vec![text.to_string()];
    }

    let mut sentences = Vec::new();
    let mut last_end = 0;
    for m in matches {
        let before_punc = &text[last_end..m.start()];
        let mut is_abbrev = false;
        for abbrev in ABBREVIATIONS {
            let combined = format!("{}{}", before_punc.trim(), &text[m.start()..m.start() + 1]);
            if combined.ends_with(abbrev) {
                is_abbrev = true;
                break;
            }
        }
        if !is_abbrev {
            sentences.push(text[last_end..m.end()].to_string());
            last_end = m.end();
        }
    }
    if last_end < text.len() {
        sentences.push(text[last_end..].to_string());
    }
    if sentences.is_empty() {
        vec![text.to_string()]
    } else {
        sentences
    }
}

fn chunk_text(text: &str, max_len: usize) -> Vec<String> {
    use regex::Regex;
    let text = text.trim();
    if text.is_empty() {
        return vec![String::new()];
    }

    let para_re = match Regex::new(r"\n\s*\n") {
        Ok(re) => re,
        Err(_) => return vec![text.to_string()],
    };
    let paragraphs: Vec<&str> = para_re.split(text).collect();
    let mut chunks = Vec::new();

    for para in paragraphs {
        let para = para.trim();
        if para.is_empty() {
            continue;
        }
        if para.len() <= max_len {
            chunks.push(para.to_string());
            continue;
        }

        let sentences = split_sentences(para);
        let mut current = String::new();
        let mut current_len = 0usize;

        for sentence in sentences {
            let sentence = sentence.trim();
            if sentence.is_empty() {
                continue;
            }
            let sentence_len = sentence.len();
            if sentence_len > max_len {
                if !current.is_empty() {
                    chunks.push(current.trim().to_string());
                    current.clear();
                    current_len = 0;
                }
                for part in sentence.split(',') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    let part_len = part.len();
                    if part_len > max_len {
                        let mut word_chunk = String::new();
                        let mut word_chunk_len = 0usize;
                        for word in part.split_whitespace() {
                            let word_len = word.len();
                            if word_chunk_len + word_len + 1 > max_len && !word_chunk.is_empty() {
                                chunks.push(word_chunk.trim().to_string());
                                word_chunk.clear();
                                word_chunk_len = 0;
                            }
                            if !word_chunk.is_empty() {
                                word_chunk.push(' ');
                                word_chunk_len += 1;
                            }
                            word_chunk.push_str(word);
                            word_chunk_len += word_len;
                        }
                        if !word_chunk.is_empty() {
                            chunks.push(word_chunk.trim().to_string());
                        }
                    } else {
                        if current_len + part_len + 1 > max_len && !current.is_empty() {
                            chunks.push(current.trim().to_string());
                            current.clear();
                            current_len = 0;
                        }
                        if !current.is_empty() {
                            current.push_str(", ");
                            current_len += 2;
                        }
                        current.push_str(part);
                        current_len += part_len;
                    }
                }
                continue;
            }

            if current_len + sentence_len + 1 > max_len && !current.is_empty() {
                chunks.push(current.trim().to_string());
                current.clear();
                current_len = 0;
            }
            if !current.is_empty() {
                current.push(' ');
                current_len += 1;
            }
            current.push_str(sentence);
            current_len += sentence_len;
        }
        if !current.is_empty() {
            chunks.push(current.trim().to_string());
        }
    }

    if chunks.is_empty() {
        vec![String::new()]
    } else {
        chunks
    }
}

// ---------------------------------------------------------------------------
// ONNX Runtime dylib resolution + session cache
// ---------------------------------------------------------------------------

fn ort_dylib_names() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["onnxruntime.dll"]
    }
    #[cfg(target_os = "macos")]
    {
        &["libonnxruntime.dylib", "libonnxruntime.1.dylib"]
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        &["libonnxruntime.so", "libonnxruntime.so.1"]
    }
}

/// Points `ort` (load-dynamic) at the onnxruntime shared library that is staged
/// alongside the executable for sherpa-onnx, so we never load a second runtime.
fn ensure_ort_dylib() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        if std::env::var_os("ORT_DYLIB_PATH").is_some() {
            return;
        }
        let mut dirs: Vec<PathBuf> = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                dirs.push(dir.to_path_buf());
                dirs.push(dir.join("bin"));
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            dirs.push(cwd.join("src-tauri").join("bin"));
            dirs.push(cwd.join("bin"));
            dirs.push(cwd);
        }
        for dir in dirs {
            for name in ort_dylib_names() {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    std::env::set_var("ORT_DYLIB_PATH", &candidate);
                    return;
                }
            }
        }
    });
}

struct CachedEngine {
    onnx_dir: PathBuf,
    sample_rate: i32,
    base_chunk_size: i32,
    chunk_compress: i32,
    latent_dim: i32,
    indexer: Vec<i64>,
    dp: Session,
    text_enc: Session,
    vector_est: Session,
    vocoder: Session,
}

static ENGINE: Mutex<Option<CachedEngine>> = Mutex::new(None);

fn load_indexer(onnx_dir: &Path) -> Result<Vec<i64>, String> {
    let path = onnx_dir.join("unicode_indexer.json");
    let file = std::fs::File::open(&path)
        .map_err(|error| format!("unicode_indexer.json missing: {error}"))?;
    serde_json::from_reader(std::io::BufReader::new(file))
        .map_err(|error| format!("Invalid unicode_indexer.json: {error}"))
}

fn load_config(onnx_dir: &Path) -> Result<Config, String> {
    let path = onnx_dir.join("tts.json");
    let file =
        std::fs::File::open(&path).map_err(|error| format!("tts.json missing: {error}"))?;
    serde_json::from_reader(std::io::BufReader::new(file))
        .map_err(|error| format!("Invalid tts.json: {error}"))
}

fn build_session(path: &Path) -> Result<Session, String> {
    Session::builder()
        .map_err(|error| format!("ONNX session builder failed: {error}"))?
        .commit_from_file(path)
        .map_err(|error| format!("Failed to load {}: {error}", path.display()))
}

fn ensure_engine(files: &SupertonicFiles) -> Result<(), String> {
    ensure_ort_dylib();
    let mut slot = ENGINE
        .lock()
        .map_err(|_| "Supertonic engine lock poisoned.".to_string())?;
    if slot.as_ref().is_some_and(|engine| engine.onnx_dir == files.onnx_dir) {
        return Ok(());
    }

    let config = load_config(&files.onnx_dir)?;
    let indexer = load_indexer(&files.onnx_dir)?;
    let dp = build_session(&files.onnx_dir.join("duration_predictor.onnx"))?;
    let text_enc = build_session(&files.onnx_dir.join("text_encoder.onnx"))?;
    let vector_est = build_session(&files.onnx_dir.join("vector_estimator.onnx"))?;
    let vocoder = build_session(&files.onnx_dir.join("vocoder.onnx"))?;

    *slot = Some(CachedEngine {
        onnx_dir: files.onnx_dir.clone(),
        sample_rate: config.ae.sample_rate,
        base_chunk_size: config.ae.base_chunk_size,
        chunk_compress: config.ttl.chunk_compress_factor,
        latent_dim: config.ttl.latent_dim,
        indexer,
        dp,
        text_enc,
        vector_est,
        vocoder,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Tensor helpers
// ---------------------------------------------------------------------------

fn f32_tensor(shape: Vec<i64>, data: Vec<f32>) -> Result<Tensor<f32>, String> {
    Tensor::from_array((shape, data)).map_err(|error| format!("Failed to build f32 tensor: {error}"))
}

fn i64_tensor(shape: Vec<i64>, data: Vec<i64>) -> Result<Tensor<i64>, String> {
    Tensor::from_array((shape, data)).map_err(|error| format!("Failed to build i64 tensor: {error}"))
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

impl CachedEngine {
    fn text_ids(&self, processed: &str) -> Vec<i64> {
        processed
            .chars()
            .map(|c| {
                let idx = c as usize;
                if idx < self.indexer.len() {
                    self.indexer[idx]
                } else {
                    -1
                }
            })
            .collect()
    }

    fn infer(
        &mut self,
        style: &Style,
        processed: &str,
        total_step: usize,
        speed: f32,
    ) -> Result<(Vec<f32>, f32), String> {
        let ids = self.text_ids(processed);
        let seq_len = ids.len();
        if seq_len == 0 {
            return Ok((Vec::new(), 0.0));
        }
        let text_mask_shape = vec![1, 1, seq_len as i64];

        // Duration prediction.
        let dp_text_ids = i64_tensor(vec![1, seq_len as i64], ids.clone())?;
        let dp_style = f32_tensor(style.dp_shape.clone(), style.dp_data.clone())?;
        let dp_mask = f32_tensor(text_mask_shape.clone(), vec![1.0f32; seq_len])?;
        let dp_inputs = ort::inputs! {
            "text_ids" => dp_text_ids,
            "style_dp" => dp_style,
            "text_mask" => dp_mask,
        }
        .map_err(|error| format!("duration inputs failed: {error}"))?;
        let duration = {
            let dp_outputs = self
                .dp
                .run(dp_inputs)
                .map_err(|error| format!("duration_predictor failed: {error}"))?;
            let (_, duration_data) = dp_outputs["duration"]
                .try_extract_raw_tensor::<f32>()
                .map_err(|error| format!("duration extract failed: {error}"))?;
            let mut value = duration_data.first().copied().unwrap_or(0.0);
            if speed > 0.0 {
                value /= speed;
            }
            value
        };
        if !(duration.is_finite() && duration > 0.0) {
            return Ok((Vec::new(), 0.0));
        }

        // Text encoding.
        let enc_text_ids = i64_tensor(vec![1, seq_len as i64], ids.clone())?;
        let enc_style = f32_tensor(style.ttl_shape.clone(), style.ttl_data.clone())?;
        let enc_mask = f32_tensor(text_mask_shape.clone(), vec![1.0f32; seq_len])?;
        let enc_inputs = ort::inputs! {
            "text_ids" => enc_text_ids,
            "style_ttl" => enc_style,
            "text_mask" => enc_mask,
        }
        .map_err(|error| format!("text_encoder inputs failed: {error}"))?;
        let (emb_shape, emb_data) = {
            let enc_outputs = self
                .text_enc
                .run(enc_inputs)
                .map_err(|error| format!("text_encoder failed: {error}"))?;
            let (shape, data) = enc_outputs["text_emb"]
                .try_extract_raw_tensor::<f32>()
                .map_err(|error| format!("text_emb extract failed: {error}"))?;
            (shape, data.to_vec())
        };

        // Latent flow-matching (denoising loop).
        let (mut xt, xt_shape, latent_mask, latent_mask_shape) = self.sample_noisy_latent(duration);
        for step in 0..total_step {
            let est_noisy = f32_tensor(xt_shape.clone(), xt.clone())?;
            let est_emb = f32_tensor(emb_shape.clone(), emb_data.clone())?;
            let est_style = f32_tensor(style.ttl_shape.clone(), style.ttl_data.clone())?;
            let est_latent_mask = f32_tensor(latent_mask_shape.clone(), latent_mask.clone())?;
            let est_text_mask = f32_tensor(text_mask_shape.clone(), vec![1.0f32; seq_len])?;
            let est_current = f32_tensor(vec![1], vec![step as f32])?;
            let est_total = f32_tensor(vec![1], vec![total_step as f32])?;
            let est_inputs = ort::inputs! {
                "noisy_latent" => est_noisy,
                "text_emb" => est_emb,
                "style_ttl" => est_style,
                "latent_mask" => est_latent_mask,
                "text_mask" => est_text_mask,
                "current_step" => est_current,
                "total_step" => est_total,
            }
            .map_err(|error| format!("vector_estimator inputs failed: {error}"))?;
            let est_outputs = self
                .vector_est
                .run(est_inputs)
                .map_err(|error| format!("vector_estimator failed: {error}"))?;
            let (_, denoised) = est_outputs["denoised_latent"]
                .try_extract_raw_tensor::<f32>()
                .map_err(|error| format!("denoised_latent extract failed: {error}"))?;
            xt = denoised.to_vec();
        }

        // Vocoder.
        let voc_latent = f32_tensor(xt_shape.clone(), xt)?;
        let voc_inputs = ort::inputs! {
            "latent" => voc_latent,
        }
        .map_err(|error| format!("vocoder inputs failed: {error}"))?;
        let voc_outputs = self
            .vocoder
            .run(voc_inputs)
            .map_err(|error| format!("vocoder failed: {error}"))?;
        let (_, wav_data) = voc_outputs["wav_tts"]
            .try_extract_raw_tensor::<f32>()
            .map_err(|error| format!("wav_tts extract failed: {error}"))?;

        Ok((wav_data.to_vec(), duration))
    }

    fn sample_noisy_latent(&self, duration: f32) -> (Vec<f32>, Vec<i64>, Vec<f32>, Vec<i64>) {
        let wav_len = (duration * self.sample_rate as f32) as usize;
        let chunk_size = (self.base_chunk_size * self.chunk_compress).max(1) as usize;
        let latent_len = wav_len.div_ceil(chunk_size).max(1);
        let latent_dim_val = (self.latent_dim * self.chunk_compress).max(1) as usize;

        let normal = Normal::new(0.0f32, 1.0f32).expect("valid normal distribution");
        let mut rng = rand::thread_rng();
        let mut noisy = vec![0.0f32; latent_dim_val * latent_len];
        // For a single utterance the mask covers the whole latent length, so
        // every element is active.
        for value in noisy.iter_mut() {
            *value = normal.sample(&mut rng);
        }

        let xt_shape = vec![1, latent_dim_val as i64, latent_len as i64];
        let latent_mask = vec![1.0f32; latent_len];
        let latent_mask_shape = vec![1, 1, latent_len as i64];
        (noisy, xt_shape, latent_mask, latent_mask_shape)
    }
}

pub fn synthesize_supertonic(
    text: &str,
    voice: &str,
    lang: Option<&str>,
    rate: Option<f32>,
) -> Result<(Vec<i16>, u32), String> {
    let trimmed = text.trim();
    let files = discover_supertonic().ok_or_else(|| {
        format!(
            "Supertonic models not found. {}",
            download_hint_for_supertonic()
        )
    })?;
    let voice = normalize_voice(voice);
    let lang = normalize_lang(lang);
    let style = load_style(&voice_style_path(&files, &voice))?;
    let speed = rate.map(|value| value.clamp(0.7, 2.0)).unwrap_or(DEFAULT_SPEED);

    ensure_engine(&files)?;
    let mut slot = ENGINE
        .lock()
        .map_err(|_| "Supertonic engine lock poisoned.".to_string())?;
    let engine = slot
        .as_mut()
        .ok_or_else(|| "Supertonic engine not initialized.".to_string())?;

    let sample_rate = engine.sample_rate.max(1) as u32;
    if trimmed.is_empty() {
        return Ok((Vec::new(), sample_rate));
    }

    let max_len = if lang == "ko" || lang == "ja" { 120 } else { 300 };
    let chunks = chunk_text(trimmed, max_len);
    let silence_len = (CHUNK_SILENCE_SECONDS * sample_rate as f32) as usize;

    let mut wav_cat: Vec<f32> = Vec::new();
    for chunk in chunks.iter() {
        let processed = match preprocess_text(chunk, &lang) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let (wav, duration) = engine.infer(&style, &processed, DEFAULT_TOTAL_STEP, speed)?;
        if wav.is_empty() {
            continue;
        }
        let wanted = (sample_rate as f32 * duration) as usize;
        let slice = &wav[..wanted.min(wav.len())];
        if !wav_cat.is_empty() {
            wav_cat.extend(std::iter::repeat_n(0.0f32, silence_len));
        }
        wav_cat.extend_from_slice(slice);
    }

    let pcm = pcm_f32_to_i16(&wav_cat);
    Ok((pcm, sample_rate))
}

fn pcm_f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|sample| {
            let clamped = sample.clamp(-1.0, 1.0);
            (clamped * i16::MAX as f32) as i16
        })
        .collect()
}

pub fn download_hint_for_supertonic() -> String {
    "Download the Supertonic 3 model in Settings (models/speech/supertonic/).".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_lang_falls_back_to_na() {
        assert_eq!(normalize_lang(Some("de-DE")), "de");
        assert_eq!(normalize_lang(Some("EN")), "en");
        assert_eq!(normalize_lang(Some("xx")), "na");
        assert_eq!(normalize_lang(None), "na");
    }

    #[test]
    fn normalize_voice_uppercases_known_voices() {
        assert_eq!(normalize_voice("m1"), "M1");
        assert_eq!(normalize_voice(""), "M1");
        assert_eq!(normalize_voice("Custom"), "Custom");
    }

    #[test]
    fn preprocess_wraps_with_language_tags() {
        let out = preprocess_text("Hallo Welt", "de").unwrap();
        assert!(out.starts_with("<de>"));
        assert!(out.ends_with("</de>"));
        assert!(out.contains("Hallo Welt."));
    }

    #[test]
    fn chunk_text_keeps_short_text() {
        let chunks = chunk_text("Kurzer Satz.", 300);
        assert_eq!(chunks, vec!["Kurzer Satz.".to_string()]);
    }
}
