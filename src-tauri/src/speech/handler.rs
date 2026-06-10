use base64::Engine;
use serde_json::{json, Value};

use super::asr::{asr_model_ready, asr_status, models_root, transcribe_pcm};
use super::tts::{piper_voice_ready, synthesize_piper, tts_status};
use super::tts_edge::synthesize_edge_tts;
use super::types::{
    SpeechSidecarRequest, SpeechSidecarResponse, SynthesizeParams, TranscribeParams,
    SPEECH_SIDECAR_VERSION,
};

fn dev_mode_enabled() -> bool {
    std::env::var("AGODESK_SPEECH_DEV")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn decode_pcm_i16(params: &TranscribeParams) -> Result<Vec<i16>, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(params.pcm_base64.trim())
        .map_err(|error| format!("Invalid pcm_base64: {error}"))?;
    if bytes.len() % 2 != 0 {
        return Err("PCM byte length must be even (16-bit samples).".to_string());
    }
    let mut samples = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        samples.push(i16::from_le_bytes([chunk[0], chunk[1]]));
    }
    Ok(samples)
}

fn pcm_duration_ms(sample_count: usize, sample_rate: u32) -> u32 {
    if sample_rate == 0 {
        return 0;
    }
    ((sample_count as f64 / sample_rate as f64) * 1000.0) as u32
}

fn synthesize_placeholder_pcm(text: &str, sample_rate: u32) -> Vec<i16> {
    let words = text.split_whitespace().count().max(1);
    let duration_secs = (words as f64 * 0.18).clamp(0.35, 8.0);
    let sample_count = (duration_secs * sample_rate as f64) as usize;
    let freq = 220.0;
    let mut out = Vec::with_capacity(sample_count);
    for index in 0..sample_count {
        let t = index as f64 / sample_rate as f64;
        let envelope = if t < 0.02 {
            t / 0.02
        } else if t > duration_secs - 0.04 {
            (duration_secs - t) / 0.04
        } else {
            1.0
        };
        let sample = (f64::sin(2.0 * std::f64::consts::PI * freq * t) * envelope * 0.22 * i16::MAX as f64)
            as i16;
        out.push(sample);
    }
    out
}

fn encode_pcm_i16(samples: &[i16]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn handle_speech_request(request: SpeechSidecarRequest) -> SpeechSidecarResponse {
    match request.op.as_str() {
        "ping" => SpeechSidecarResponse::success(
            request.id,
            json!({
                "version": SPEECH_SIDECAR_VERSION,
                "dev_mode": dev_mode_enabled(),
                "models_root": models_root().to_string_lossy(),
                "asr_ready": asr_model_ready(None),
                "capabilities": ["ping", "list_voices", "transcribe", "synthesize", "asr_status", "tts_status"],
            }),
        ),
        "asr_status" => {
            let model_id = request
                .params
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string);
            let status = asr_status(model_id.as_deref());
            SpeechSidecarResponse::success(
                request.id,
                serde_json::to_value(status).unwrap_or(json!({})),
            )
        }
        "tts_status" => {
            let voice_id = request
                .params
                .get("voice")
                .and_then(Value::as_str)
                .map(str::to_string);
            let status = tts_status(voice_id.as_deref());
            SpeechSidecarResponse::success(
                request.id,
                serde_json::to_value(status).unwrap_or(json!({})),
            )
        }
        "list_voices" => handle_list_voices(request.id, &request.params),
        "transcribe" => match serde_json::from_value::<TranscribeParams>(request.params) {
            Ok(params) => handle_transcribe(request.id, params),
            Err(error) => SpeechSidecarResponse::failure(
                request.id,
                format!("Invalid transcribe params: {error}"),
            ),
        },
        "synthesize" => match serde_json::from_value::<SynthesizeParams>(request.params) {
            Ok(params) => handle_synthesize(request.id, params),
            Err(error) => SpeechSidecarResponse::failure(
                request.id,
                format!("Invalid synthesize params: {error}"),
            ),
        },
        other => SpeechSidecarResponse::failure(request.id, format!("Unknown op: {other}")),
    }
}

fn handle_list_voices(id: String, params: &Value) -> SpeechSidecarResponse {
    let backend = params
        .get("backend")
        .and_then(Value::as_str)
        .unwrap_or("piper");
    let voices = match backend {
        "edge_tts" => vec![
            json!({ "id": "de-DE-KatjaNeural", "label": "Katja (DE)" }),
            json!({ "id": "de-DE-ConradNeural", "label": "Conrad (DE)" }),
        ],
        _ => vec![
            json!({ "id": "de_DE-thorsten-high", "label": "Thorsten (DE, Piper)", "ready": piper_voice_ready("de_DE-thorsten-high") }),
            json!({ "id": "de_DE-kerstin-low", "label": "Kerstin (DE, Piper)", "ready": piper_voice_ready("de_DE-kerstin-low") }),
        ],
    };
    SpeechSidecarResponse::success(id, json!({ "voices": voices }))
}

fn handle_transcribe(id: String, params: TranscribeParams) -> SpeechSidecarResponse {
    let samples = match decode_pcm_i16(&params) {
        Ok(value) => value,
        Err(error) => return SpeechSidecarResponse::failure(id, error),
    };

    if samples.len() < params.sample_rate as usize / 10 {
        return SpeechSidecarResponse::success(
            id,
            json!({ "text": "", "language": params.language.unwrap_or_else(|| "de".to_string()) }),
        );
    }

    let model_id = params.model.as_deref();
    let model_ready = asr_model_ready(model_id);

    if model_ready {
        match transcribe_pcm(
            &samples,
            params.sample_rate,
            params.language.as_deref(),
            model_id,
        ) {
            Ok((text, language)) => {
                return SpeechSidecarResponse::success(
                    id,
                    json!({
                        "text": text,
                        "language": language,
                        "dev_mode": false,
                        "model_ready": true,
                    }),
                );
            }
            Err(error) => return SpeechSidecarResponse::failure(id, error),
        }
    }

    if dev_mode_enabled() {
        let duration = pcm_duration_ms(samples.len(), params.sample_rate);
        let status = asr_status(model_id);
        return SpeechSidecarResponse::success(
            id,
            json!({
                "text": format!("[Dev-ASR ~{duration}ms — sherpa-onnx Modell folgt]"),
                "language": params.language.unwrap_or_else(|| "de".to_string()),
                "dev_mode": true,
                "model_ready": false,
                "download_hint": status.download_hint,
            }),
        );
    }

    let status = asr_status(model_id);
    SpeechSidecarResponse::failure(
        id,
        format!(
            "ASR model not found under {}. {}",
            status.models_root, status.download_hint
        ),
    )
}

fn handle_synthesize(id: String, params: SynthesizeParams) -> SpeechSidecarResponse {
    let text = params.text.trim();
    if text.is_empty() {
        return SpeechSidecarResponse::failure(id, "text is required.");
    }

    if params.backend == "piper" {
        let voice_ready = piper_voice_ready(&params.voice);
        if voice_ready {
            match synthesize_piper(text, &params.voice, params.rate) {
                Ok((pcm, sample_rate)) => {
                    return SpeechSidecarResponse::success(
                        id,
                        json!({
                            "pcm_base64": encode_pcm_i16(&pcm),
                            "sample_rate": sample_rate,
                            "mime_type": format!("audio/pcm;rate={sample_rate}"),
                            "dev_mode": false,
                            "model_ready": true,
                            "voice": params.voice,
                            "backend": params.backend,
                        }),
                    );
                }
                Err(error) => return SpeechSidecarResponse::failure(id, error),
            }
        }

        if dev_mode_enabled() {
            let sample_rate = 22_050;
            let pcm = synthesize_placeholder_pcm(text, sample_rate);
            let status = tts_status(Some(&params.voice));
            return SpeechSidecarResponse::success(
                id,
                json!({
                    "pcm_base64": encode_pcm_i16(&pcm),
                    "sample_rate": sample_rate,
                    "mime_type": format!("audio/pcm;rate={sample_rate}"),
                    "dev_mode": true,
                    "voice": params.voice,
                    "backend": params.backend,
                    "download_hint": status.download_hint,
                }),
            );
        }

        let status = tts_status(Some(&params.voice));
        return SpeechSidecarResponse::failure(
            id,
            format!(
                "Piper voice '{}' not found under {}. {}",
                params.voice, status.models_root, status.download_hint
            ),
        );
    }

    if params.backend == "edge_tts" {
        match synthesize_edge_tts(text, &params.voice, params.rate, params.pitch) {
            Ok(audio) if !audio.is_empty() => {
                return SpeechSidecarResponse::success(
                    id,
                    json!({
                        "audio_base64": base64::engine::general_purpose::STANDARD.encode(&audio),
                        "mime_type": "audio/mpeg",
                        "sample_rate": 24_000,
                        "dev_mode": false,
                        "model_ready": true,
                        "voice": params.voice,
                        "backend": "edge_tts",
                    }),
                );
            }
            Ok(_) => {
                return SpeechSidecarResponse::failure(
                    id,
                    "Edge TTS synthesis returned empty audio.",
                );
            }
            Err(error) => {
                return SpeechSidecarResponse::failure(
                    id,
                    format!("Edge TTS synthesis failed: {error}"),
                );
            }
        }
    }

    let sample_rate = 22_050;
    let pcm = synthesize_placeholder_pcm(text, sample_rate);
    SpeechSidecarResponse::success(
        id,
        json!({
            "pcm_base64": encode_pcm_i16(&pcm),
            "sample_rate": sample_rate,
            "mime_type": format!("audio/pcm;rate={sample_rate}"),
            "dev_mode": true,
            "voice": params.voice,
            "backend": params.backend,
        }),
    )
}

pub use super::asr::AsrStatus;
pub use super::tts::TtsStatus;
