use std::path::Path;
use std::sync::Mutex;

use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
    OfflineWhisperModelConfig,
};

use super::asr::{
    discover_asr_model, map_sense_voice_language, map_whisper_language, normalize_model_id,
    parse_model_kind, AsrModelKind, AsrModelLayout,
};

struct CachedRecognizer {
    key: String,
    recognizer: OfflineRecognizer,
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

fn ensure_recognizer(model_id: Option<&str>, language: &str, kind: AsrModelKind) -> Result<(), String> {
    let key = match kind {
        AsrModelKind::SenseVoiceInt8 => format!("{}:{}", cache_key(model_id), language),
        AsrModelKind::WhisperSmallDe => format!("{}:{}", cache_key(model_id), language),
    };
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
        };
        format!("ASR model files not found. {hint}")
    })?;

    let recognizer = match files.layout {
        AsrModelLayout::SenseVoice {
            model_path,
            tokens_path,
        } => create_sense_voice_recognizer(&model_path, &tokens_path, language)?,
        AsrModelLayout::Whisper {
            encoder_path,
            decoder_path,
            tokens_path,
        } => create_whisper_recognizer(
            &encoder_path,
            &decoder_path,
            &tokens_path,
            language,
        )?,
    };

    *slot = Some(CachedRecognizer { key, recognizer });
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
    };

    ensure_recognizer(model_id, &language, kind).is_ok()
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

    let stream = entry.recognizer.create_stream();
    stream.accept_waveform(sample_rate as i32, &float_samples);
    entry.recognizer.decode(&stream);

    let text = stream
        .get_result()
        .map(|result| result.text.trim().to_string())
        .unwrap_or_default();

    Ok((text, language_tag))
}

pub fn reset_recognizer_cache() {
    if let Ok(mut slot) = RECOGNIZER.lock() {
        *slot = None;
    }
}
