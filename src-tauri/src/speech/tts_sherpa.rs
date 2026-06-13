use std::sync::Mutex;

use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig, OfflineTtsVitsModelConfig,
};

use super::tts::{discover_piper_voice, download_hint_for_piper};

struct CachedTts {
    key: String,
    engine: OfflineTts,
    sample_rate: u32,
}

static TTS: Mutex<Option<CachedTts>> = Mutex::new(None);

fn length_scale_from_rate(rate: Option<f32>) -> f32 {
    let speed = rate.unwrap_or(1.0).clamp(0.5, 2.0);
    1.0 / speed
}

fn create_piper_tts(files: &super::tts::PiperVoiceFiles, rate: Option<f32>) -> Result<OfflineTts, String> {
    let config = OfflineTtsConfig {
        model: OfflineTtsModelConfig {
            vits: OfflineTtsVitsModelConfig {
                model: Some(files.model_path.to_string_lossy().to_string()),
                tokens: Some(files.tokens_path.to_string_lossy().to_string()),
                data_dir: files
                    .data_dir
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string()),
                length_scale: length_scale_from_rate(rate),
                ..Default::default()
            },
            num_threads: 2,
            provider: Some("cpu".into()),
            ..Default::default()
        },
        ..Default::default()
    };

    OfflineTts::create(&config).ok_or_else(|| {
        format!(
            "Failed to load Piper voice {} at {}",
            files.voice_id,
            files.model_path.display()
        )
    })
}

fn ensure_tts(voice_id: &str, rate: Option<f32>) -> Result<(), String> {
    let rate_key = format!("{:.2}", rate.unwrap_or(1.0).clamp(0.5, 2.0));
    let key = format!("{voice_id}:{rate_key}");
    let mut slot = TTS
        .lock()
        .map_err(|_| "TTS engine lock poisoned.".to_string())?;

    if slot.as_ref().is_some_and(|entry| entry.key == key) {
        return Ok(());
    }

    let files = discover_piper_voice(voice_id).ok_or_else(|| {
        format!(
            "Piper voice '{voice_id}' not found. {}",
            download_hint_for_piper()
        )
    })?;

    let engine = create_piper_tts(&files, rate)?;
    let sample_rate = engine.sample_rate().max(1) as u32;
    *slot = Some(CachedTts {
        key,
        engine,
        sample_rate,
    });
    Ok(())
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

pub fn synthesize_piper(
    text: &str,
    voice_id: &str,
    rate: Option<f32>,
) -> Result<(Vec<i16>, u32), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok((Vec::new(), 22_050));
    }

    ensure_tts(voice_id, rate)?;

    let mut slot = TTS
        .lock()
        .map_err(|_| "TTS engine lock poisoned.".to_string())?;
    let entry = slot
        .as_mut()
        .ok_or_else(|| "TTS engine not initialized.".to_string())?;

    let audio = entry
        .engine
        .generate_with_config(
            trimmed,
            &GenerationConfig::default(),
            None::<fn(&[f32], f32) -> bool>,
        )
        .ok_or_else(|| format!("Piper synthesis failed for voice {voice_id}"))?;

    Ok((pcm_f32_to_i16(audio.samples()), entry.sample_rate))
}
