use std::path::{Path, PathBuf};

pub const DEFAULT_PIPER_VOICES: &[&str] = &["de_DE-thorsten-high", "de_DE-kerstin-low"];

#[derive(Debug, Clone)]
pub struct PiperVoiceFiles {
    pub voice_id: String,
    pub model_path: PathBuf,
    pub tokens_path: PathBuf,
    pub data_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TtsStatus {
    pub voice_id: String,
    pub ready: bool,
    pub model_path: Option<String>,
    pub tokens_path: Option<String>,
    pub models_root: String,
    pub download_hint: String,
}

pub fn piper_models_root() -> PathBuf {
    super::asr::models_root().join("piper")
}

pub fn discover_piper_voice(voice_id: &str) -> Option<PiperVoiceFiles> {
    let speech_roots = super::asr::models_search_roots();
    let dir_names = [
        voice_id.to_string(),
        format!("vits-piper-{voice_id}"),
    ];

    for speech_root in &speech_roots {
        for dir_name in &dir_names {
            let direct = speech_root.join("piper").join(dir_name);
            if let Some(files) = piper_files_in_dir(&direct, voice_id) {
                return Some(files);
            }
            let nested = speech_root.join(dir_name);
            if let Some(files) = piper_files_in_dir(&nested, voice_id) {
                return Some(files);
            }
        }
    }

    None
}

fn piper_files_in_dir(dir: &Path, voice_id: &str) -> Option<PiperVoiceFiles> {
    if !dir.is_dir() {
        return None;
    }

    let model_candidates = [
        dir.join(format!("{voice_id}.onnx")),
        dir.join("model.onnx"),
    ];
    let model_path = model_candidates
        .into_iter()
        .find(|path| path.is_file())?;

    let tokens_path = dir.join("tokens.txt");
    if !tokens_path.is_file() {
        return None;
    }

    let data_dir = dir.join("espeak-ng-data");
    Some(PiperVoiceFiles {
        voice_id: voice_id.to_string(),
        model_path,
        tokens_path,
        data_dir: data_dir.is_dir().then_some(data_dir),
    })
}

pub fn piper_voice_ready(voice_id: &str) -> bool {
    discover_piper_voice(voice_id).is_some()
}

pub fn tts_status(voice_id: Option<&str>) -> TtsStatus {
    let voice = voice_id.unwrap_or(DEFAULT_PIPER_VOICES[0]).to_string();
    let root = piper_models_root();
    let discovered = discover_piper_voice(&voice);
    TtsStatus {
        ready: discovered.is_some(),
        model_path: discovered
            .as_ref()
            .map(|files| files.model_path.to_string_lossy().to_string()),
        tokens_path: discovered
            .as_ref()
            .map(|files| files.tokens_path.to_string_lossy().to_string()),
        models_root: root.to_string_lossy().to_string(),
        voice_id: voice,
        download_hint: download_hint_for_piper(),
    }
}

pub fn download_hint_for_piper() -> String {
    "Run: npm run download:speech-tts (Piper voices into models/speech/piper/)".to_string()
}

#[cfg(feature = "speech-asr")]
pub fn synthesize_piper(
    text: &str,
    voice_id: &str,
    rate: Option<f32>,
) -> Result<(Vec<i16>, u32), String> {
    super::tts_sherpa::synthesize_piper(text, voice_id, rate)
}

#[cfg(not(feature = "speech-asr"))]
pub fn synthesize_piper(
    _text: &str,
    _voice_id: &str,
    _rate: Option<f32>,
) -> Result<(Vec<i16>, u32), String> {
    Err("Speech TTS feature not enabled. Rebuild with --features speech-asr.".to_string())
}
