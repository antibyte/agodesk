use std::path::{Path, PathBuf};
use std::sync::Mutex;

static REGISTERED_MODEL_ROOTS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Adds a directory to ASR/TTS model discovery (e.g. app data dir).
pub fn register_models_search_root(path: PathBuf) {
    if let Ok(mut roots) = REGISTERED_MODEL_ROOTS.lock() {
        if !roots.iter().any(|existing| existing == &path) {
            roots.push(path);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AsrModelKind {
    SenseVoiceInt8,
    WhisperSmallDe,
}

#[derive(Debug, Clone)]
pub enum AsrModelLayout {
    SenseVoice {
        model_path: PathBuf,
        tokens_path: PathBuf,
    },
    Whisper {
        encoder_path: PathBuf,
        decoder_path: PathBuf,
        tokens_path: PathBuf,
    },
}

#[derive(Debug, Clone)]
pub struct AsrModelFiles {
    pub kind: AsrModelKind,
    pub layout: AsrModelLayout,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AsrStatus {
    pub model_id: String,
    pub ready: bool,
    pub model_path: Option<String>,
    pub tokens_path: Option<String>,
    pub models_root: String,
    pub download_hint: String,
}

pub fn models_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut push_root = |path: PathBuf| {
        if seen.insert(path.clone()) {
            roots.push(path);
        }
    };

    if let Ok(custom) = std::env::var("AGODESK_SPEECH_MODELS") {
        push_root(PathBuf::from(custom));
    }
    if let Ok(registered) = REGISTERED_MODEL_ROOTS.lock() {
        for path in registered.iter() {
            push_root(path.clone());
        }
    }
    push_root(PathBuf::from("models/speech"));
    if let Ok(cwd) = std::env::current_dir() {
        push_root(cwd.join("models/speech"));
        push_root(cwd.join("..").join("models/speech"));
        let mut dir = cwd;
        for _ in 0..8 {
            if !dir.pop() {
                break;
            }
            push_root(dir.join("models/speech"));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(mut dir) = exe.parent().map(|p| p.to_path_buf()) {
            for _ in 0..10 {
                push_root(dir.join("models/speech"));
                if !dir.pop() {
                    break;
                }
            }
        }
    }
    roots
}

const SENSE_VOICE_EXTRACTED_DIRS: &[&str] = &[
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09",
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
];
const SENSE_VOICE_TARGET_DIR: &str = "sense-voice-int8";

/// Renames legacy extracted ASR folders to the canonical layout.
pub fn normalize_legacy_model_layouts() {
    for root in models_search_roots() {
        for extracted_dir in SENSE_VOICE_EXTRACTED_DIRS {
            let legacy = root.join(extracted_dir);
            let target = root.join(SENSE_VOICE_TARGET_DIR);
            if legacy.is_dir() && !target.exists() {
                let _ = std::fs::rename(&legacy, &target);
            }
        }
    }
}

pub fn models_root() -> PathBuf {
    models_search_roots()
        .into_iter()
        .find(|root| {
            root.join(SENSE_VOICE_TARGET_DIR).exists() || root.join("whisper-small-de").exists()
        })
        .or_else(|| {
            models_search_roots()
                .into_iter()
                .find(|path| path.is_dir())
        })
        .unwrap_or_else(|| PathBuf::from("models/speech"))
}

fn file_exists(path: &Path) -> bool {
    path.is_file()
}

pub fn default_asr_model_for_language(language: Option<&str>) -> String {
    if prefers_sense_voice_for_language(language) {
        "sense_voice_int8".to_string()
    } else {
        "whisper_small_de".to_string()
    }
}

pub fn normalize_model_id(model_id: Option<&str>) -> String {
    match model_id.unwrap_or("whisper_small_de") {
        "whisper_small_de" => "whisper_small_de".to_string(),
        "sense_voice_int8" => "sense_voice_int8".to_string(),
        "omnilingual_ctc_int8" => "sense_voice_int8".to_string(),
        other => other.to_string(),
    }
}

pub fn resolve_asr_model_id(model_id: Option<&str>, _language: Option<&str>) -> String {
    normalize_model_id(model_id)
}

pub fn prefers_sense_voice_for_language(language: Option<&str>) -> bool {
    language
        .map(|value| {
            let lower = value.to_lowercase();
            lower.starts_with("ja") || lower.starts_with("zh")
        })
        .unwrap_or(false)
}

pub fn parse_model_kind(model_id: Option<&str>) -> AsrModelKind {
    match normalize_model_id(model_id).as_str() {
        "whisper_small_de" => AsrModelKind::WhisperSmallDe,
        _ => AsrModelKind::SenseVoiceInt8,
    }
}

pub fn discover_asr_model(model_id: Option<&str>) -> Option<AsrModelFiles> {
    let kind = parse_model_kind(model_id);
    for root in models_search_roots() {
        if let Some(files) = discover_in_root(&root, kind) {
            return Some(files);
        }
    }
    None
}

fn discover_in_root(root: &Path, kind: AsrModelKind) -> Option<AsrModelFiles> {
    if !root.exists() {
        return None;
    }

    match kind {
        AsrModelKind::SenseVoiceInt8 => discover_sense_voice(root),
        AsrModelKind::WhisperSmallDe => discover_whisper_small(root),
    }
}

fn discover_sense_voice(root: &Path) -> Option<AsrModelFiles> {
    let mut candidates = vec![root.join(SENSE_VOICE_TARGET_DIR)];
    for extracted_dir in SENSE_VOICE_EXTRACTED_DIRS {
        candidates.push(root.join(extracted_dir));
    }

    for dir in candidates {
        let model_path = dir.join("model.int8.onnx");
        let tokens_path = dir.join("tokens.txt");
        if file_exists(&model_path) && file_exists(&tokens_path) {
            return Some(AsrModelFiles {
                kind: AsrModelKind::SenseVoiceInt8,
                layout: AsrModelLayout::SenseVoice {
                    model_path,
                    tokens_path,
                },
            });
        }
    }

    None
}

fn discover_whisper_small(root: &Path) -> Option<AsrModelFiles> {
    let candidates = [
        root.join("whisper-small-de"),
        root.join("sherpa-onnx-whisper-small"),
    ];
    for dir in candidates {
        if let Some(files) = whisper_files_in_dir(&dir) {
            return Some(files);
        }
    }
    None
}

fn whisper_files_in_dir(dir: &Path) -> Option<AsrModelFiles> {
    if !dir.is_dir() {
        return None;
    }

    let int8_encoder = dir.join("small-encoder.int8.onnx");
    let int8_decoder = dir.join("small-decoder.int8.onnx");
    let int8_tokens = dir.join("small-tokens.txt");
    if file_exists(&int8_encoder) && file_exists(&int8_decoder) && file_exists(&int8_tokens) {
        return Some(AsrModelFiles {
            kind: AsrModelKind::WhisperSmallDe,
            layout: AsrModelLayout::Whisper {
                encoder_path: int8_encoder,
                decoder_path: int8_decoder,
                tokens_path: int8_tokens,
            },
        });
    }

    let encoder = dir.join("small-encoder.onnx");
    let decoder = dir.join("small-decoder.onnx");
    let tokens = dir.join("small-tokens.txt");
    if file_exists(&encoder) && file_exists(&decoder) && file_exists(&tokens) {
        return Some(AsrModelFiles {
            kind: AsrModelKind::WhisperSmallDe,
            layout: AsrModelLayout::Whisper {
                encoder_path: encoder,
                decoder_path: decoder,
                tokens_path: tokens,
            },
        });
    }

    None
}

pub fn asr_model_ready(model_id: Option<&str>) -> bool {
    #[cfg(feature = "speech-asr")]
    {
        super::asr_sherpa::probe_asr_model(model_id)
    }
    #[cfg(not(feature = "speech-asr"))]
    {
        discover_asr_model(model_id).is_some()
    }
}

pub fn asr_status(model_id: Option<&str>) -> AsrStatus {
    let model_key = normalize_model_id(model_id);
    let root = models_root();
    let discovered = discover_asr_model(Some(&model_key));
    let (model_path, tokens_path) = match discovered.as_ref().map(|files| &files.layout) {
        Some(AsrModelLayout::SenseVoice {
            model_path,
            tokens_path,
        }) => (
            Some(model_path.to_string_lossy().to_string()),
            Some(tokens_path.to_string_lossy().to_string()),
        ),
        Some(AsrModelLayout::Whisper {
            encoder_path,
            tokens_path,
            ..
        }) => (
            Some(encoder_path.to_string_lossy().to_string()),
            Some(tokens_path.to_string_lossy().to_string()),
        ),
        None => (None, None),
    };
    AsrStatus {
        ready: asr_model_ready(Some(&model_key)),
        model_path,
        tokens_path,
        models_root: root.to_string_lossy().to_string(),
        model_id: model_key.clone(),
        download_hint: download_hint_for(&model_key),
    }
}

pub fn download_hint_for(model_id: &str) -> String {
    match normalize_model_id(Some(model_id)).as_str() {
        "whisper_small_de" => {
            "Select Whisper in settings to download the model (~610 MB).".to_string()
        }
        _ => "Select SenseVoice in settings to download the model (~160 MB).".to_string(),
    }
}

pub fn map_sense_voice_language(language: Option<&str>) -> String {
    match language {
        Some(value) if value.starts_with("ja") => "ja".to_string(),
        Some(value) if value.starts_with("zh") => "zh".to_string(),
        Some(value) if value.starts_with("ko") => "ko".to_string(),
        Some(value) if value.starts_with("en") => "en".to_string(),
        Some(value) if !value.trim().is_empty() => "auto".to_string(),
        _ => "auto".to_string(),
    }
}

pub fn map_whisper_language(language: Option<&str>) -> String {
    match language {
        Some(value) if value.starts_with("de") => "de".to_string(),
        Some(value) if value.starts_with("en") => "en".to_string(),
        Some(value) if value.starts_with("fr") => "fr".to_string(),
        Some(value) if value.starts_with("es") => "es".to_string(),
        Some(value) if value.starts_with("it") => "it".to_string(),
        Some(value) if value.len() >= 2 => value[..2.min(value.len())].to_string(),
        _ => "de".to_string(),
    }
}

#[cfg(feature = "speech-asr")]
pub fn transcribe_pcm(
    samples: &[i16],
    sample_rate: u32,
    language: Option<&str>,
    model_id: Option<&str>,
) -> Result<(String, String), String> {
    super::asr_sherpa::transcribe_pcm(samples, sample_rate, language, model_id)
}

#[cfg(not(feature = "speech-asr"))]
pub fn transcribe_pcm(
    _samples: &[i16],
    _sample_rate: u32,
    _language: Option<&str>,
    _model_id: Option<&str>,
) -> Result<(String, String), String> {
    Err("Speech ASR feature not enabled. Rebuild with --features speech-asr.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_model_prefers_whisper_for_german() {
        assert_eq!(
            default_asr_model_for_language(Some("de-DE")),
            "whisper_small_de"
        );
    }

    #[test]
    fn default_model_prefers_sense_voice_for_japanese_and_chinese() {
        assert_eq!(
            default_asr_model_for_language(Some("ja-JP")),
            "sense_voice_int8"
        );
        assert_eq!(
            default_asr_model_for_language(Some("zh-CN")),
            "sense_voice_int8"
        );
    }

    #[test]
    fn legacy_omnilingual_id_maps_to_sense_voice() {
        assert_eq!(
            normalize_model_id(Some("omnilingual_ctc_int8")),
            "sense_voice_int8"
        );
    }
}
