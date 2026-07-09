use std::path::Path;
use std::sync::Mutex;

use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
    OfflineWhisperModelConfig, OnlineRecognizer, OnlineRecognizerConfig,
};

use super::asr::{
    discover_asr_model, map_kroko_language, map_sense_voice_language, map_whisper_language,
    normalize_model_id, parse_model_kind, AsrModelKind, AsrModelLayout,
};

enum RecognizerBackend {
    Offline(OfflineRecognizer),
    Online(OnlineRecognizer),
}

struct CachedRecognizer {
    key: String,
    backend: RecognizerBackend,
}

static RECOGNIZER: Mutex<Option<CachedRecognizer>> = Mutex::new(None);

fn cache_key(model_id: Option<&str>) -> String {
    normalize_model_id(model_id)
}

fn path_for_sherpa(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

fn pcm_i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|sample| *sample as f32 / 32768.0)
        .collect()
}

fn create_sense_voice_recognizer(
    model_path: &Path,
    tokens_path: &Path,
    language: &str,
) -> Result<OfflineRecognizer, String> {
    let model_path = path_for_sherpa(model_path);
    let tokens_path = path_for_sherpa(tokens_path);

    let mut config = OfflineRecognizerConfig::default();
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(model_path.clone()),
        language: Some(language.into()),
        use_itn: true,
    };
    config.model_config.tokens = Some(tokens_path);
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = 2;

    OfflineRecognizer::create(&config).ok_or_else(|| {
        format!(
            "Failed to load SenseVoice model at {model_path}. Ensure onnxruntime.dll and sherpa-onnx-c-api.dll are next to the app executable (run: npm run download:sherpa-onnx-libs, then restart via npm run tauri)."
        )
    })
}

fn create_whisper_recognizer(
    encoder_path: &Path,
    decoder_path: &Path,
    tokens_path: &Path,
    language: &str,
) -> Result<OfflineRecognizer, String> {
    let encoder_path = path_for_sherpa(encoder_path);
    let decoder_path = path_for_sherpa(decoder_path);
    let tokens_path = path_for_sherpa(tokens_path);

    let mut config = OfflineRecognizerConfig::default();
    config.model_config.whisper = OfflineWhisperModelConfig {
        encoder: Some(encoder_path.clone()),
        decoder: Some(decoder_path),
        language: Some(language.into()),
        task: Some("transcribe".into()),
        ..Default::default()
    };
    config.model_config.tokens = Some(tokens_path);
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = 2;

    OfflineRecognizer::create(&config).ok_or_else(|| {
        format!(
            "Failed to load Whisper model at {encoder_path}. Ensure sherpa-onnx runtime DLLs are available next to the app executable."
        )
    })
}

fn create_kroko_recognizer(
    encoder_path: &Path,
    decoder_path: &Path,
    joiner_path: &Path,
    tokens_path: &Path,
) -> Result<OnlineRecognizer, String> {
    let encoder = path_for_sherpa(encoder_path);
    let decoder = path_for_sherpa(decoder_path);
    let joiner = path_for_sherpa(joiner_path);
    let tokens = path_for_sherpa(tokens_path);

    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(encoder.clone());
    config.model_config.transducer.decoder = Some(decoder);
    config.model_config.transducer.joiner = Some(joiner);
    config.model_config.tokens = Some(tokens);
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = 2;
    config.decoding_method = Some("greedy_search".into());
    // Utterances are already segmented by the frontend VAD, so sherpa endpointing is off.
    config.enable_endpoint = false;

    OnlineRecognizer::create(&config).ok_or_else(|| {
        format!(
            "Failed to load Kroko model at {encoder}. Ensure onnxruntime.dll and sherpa-onnx-c-api.dll are next to the app executable (run: npm run download:sherpa-onnx-libs, then restart via npm run tauri)."
        )
    })
}

fn ensure_recognizer(model_id: Option<&str>, language: &str, kind: AsrModelKind) -> Result<(), String> {
    let key = format!("{}:{}", cache_key(model_id), language);
    let mut slot = RECOGNIZER
        .lock()
        .map_err(|_| "ASR recognizer lock poisoned.".to_string())?;

    if slot.as_ref().is_some_and(|entry| entry.key == key) {
        return Ok(());
    }

    let files = discover_asr_model(model_id).ok_or_else(|| {
        let hint = match kind {
            AsrModelKind::WhisperSmallDe => "Select Whisper in settings to download the model.",
            AsrModelKind::SenseVoiceInt8 => {
                "Select SenseVoice in settings to download the model."
            }
            AsrModelKind::KrokoZipformer => {
                "Select the matching Kroko model in settings to download it."
            }
        };
        format!("ASR model files not found. {hint}")
    })?;

    let backend = match files.layout {
        AsrModelLayout::SenseVoice {
            model_path,
            tokens_path,
        } => RecognizerBackend::Offline(create_sense_voice_recognizer(
            &model_path,
            &tokens_path,
            language,
        )?),
        AsrModelLayout::Whisper {
            encoder_path,
            decoder_path,
            tokens_path,
        } => RecognizerBackend::Offline(create_whisper_recognizer(
            &encoder_path,
            &decoder_path,
            &tokens_path,
            language,
        )?),
        AsrModelLayout::KrokoTransducer {
            encoder_path,
            decoder_path,
            joiner_path,
            tokens_path,
        } => RecognizerBackend::Online(create_kroko_recognizer(
            &encoder_path,
            &decoder_path,
            &joiner_path,
            &tokens_path,
        )?),
    };

    *slot = Some(CachedRecognizer { key, backend });
    Ok(())
}

pub fn probe_asr_model(model_id: Option<&str>) -> bool {
    if discover_asr_model(model_id).is_none() {
        return false;
    }

    let kind = parse_model_kind(model_id);
    let language = match kind {
        AsrModelKind::WhisperSmallDe => map_whisper_language(Some("de-DE")),
        AsrModelKind::SenseVoiceInt8 => map_sense_voice_language(Some("ja-JP")),
        AsrModelKind::KrokoZipformer => map_kroko_language(model_id),
    };

    ensure_recognizer(model_id, &language, kind).is_ok()
}

/// Feeds a segmented utterance through a streaming recognizer and returns the final text.
fn decode_online_utterance(
    recognizer: &OnlineRecognizer,
    sample_rate: u32,
    samples: &[f32],
) -> String {
    const CHUNK: usize = 3200;
    let stream = recognizer.create_stream();
    for chunk in samples.chunks(CHUNK) {
        stream.accept_waveform(sample_rate as i32, chunk);
        while recognizer.is_ready(&stream) {
            recognizer.decode(&stream);
        }
    }

    // Streaming Zipformer transducers only emit output once enough frames are
    // buffered to flush the encoder's look-ahead (T ~= 1.4 s, chunk ~= 1.28 s).
    // A short fixed tail leaves brief utterances (a few words) completely
    // undecoded, so the recognizer returns empty text. Pad with trailing silence
    // so the total reaches at least ~2.5 s and always includes ~2 s after the
    // speech, which reliably flushes even very short utterances.
    let sr = sample_rate as usize;
    let target_total = (sr * 5 / 2).max(samples.len() + sr * 2);
    let tail_len = target_total.saturating_sub(samples.len());
    let tail = vec![0.0f32; tail_len];
    stream.accept_waveform(sample_rate as i32, &tail);
    stream.input_finished();
    while recognizer.is_ready(&stream) {
        recognizer.decode(&stream);
    }

    recognizer
        .get_result(&stream)
        .map(|result| result.text.trim().to_string())
        .unwrap_or_default()
}

pub fn transcribe_pcm(
    samples: &[i16],
    sample_rate: u32,
    language: Option<&str>,
    model_id: Option<&str>,
) -> Result<(String, String), String> {
    let effective_model = super::asr::resolve_asr_model_id(model_id, language);
    let kind = parse_model_kind(Some(&effective_model));
    let language_tag = match kind {
        AsrModelKind::WhisperSmallDe => map_whisper_language(language),
        AsrModelKind::SenseVoiceInt8 => map_sense_voice_language(language),
        AsrModelKind::KrokoZipformer => map_kroko_language(Some(&effective_model)),
    };

    ensure_recognizer(Some(&effective_model), &language_tag, kind)?;

    let float_samples = pcm_i16_to_f32(samples);
    if float_samples.is_empty() {
        return Ok((String::new(), language_tag));
    }

    let mut slot = RECOGNIZER
        .lock()
        .map_err(|_| "ASR recognizer lock poisoned.".to_string())?;
    let entry = slot
        .as_mut()
        .ok_or_else(|| "ASR recognizer not initialized.".to_string())?;

    let text = match &entry.backend {
        RecognizerBackend::Offline(recognizer) => {
            let stream = recognizer.create_stream();
            stream.accept_waveform(sample_rate as i32, &float_samples);
            recognizer.decode(&stream);
            stream
                .get_result()
                .map(|result| result.text.trim().to_string())
                .unwrap_or_default()
        }
        RecognizerBackend::Online(recognizer) => {
            decode_online_utterance(recognizer, sample_rate, &float_samples)
        }
    };

    Ok((text, language_tag))
}

pub fn reset_recognizer_cache() {
    if let Ok(mut slot) = RECOGNIZER.lock() {
        *slot = None;
    }
}
