use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SPEECH_SIDECAR_VERSION: &str = "0.1.0";

#[derive(Debug, Deserialize, Serialize)]
pub struct SpeechSidecarRequest {
    pub id: String,
    pub op: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpeechSidecarResponse {
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SpeechSidecarResponse {
    pub fn success(id: String, data: Value) -> Self {
        Self {
            id,
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn failure(id: String, error: impl Into<String>) -> Self {
        Self {
            id,
            ok: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TranscribeParams {
    pub pcm_base64: String,
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    pub language: Option<String>,
    pub model: Option<String>,
}

fn default_sample_rate() -> u32 {
    16_000
}

#[derive(Debug, Deserialize)]
pub struct SynthesizeParams {
    pub text: String,
    pub voice: String,
    pub backend: String,
    pub rate: Option<f32>,
    pub pitch: Option<f32>,
}
