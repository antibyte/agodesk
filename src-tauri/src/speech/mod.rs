pub mod asr;
#[cfg(feature = "speech-asr")]
pub mod asr_sherpa;
pub mod handler;
pub mod model_download;
pub mod runtime;
pub mod sidecar_client;
pub mod tts;
#[cfg(feature = "speech-asr")]
pub mod tts_sherpa;
#[cfg(feature = "speech-supertonic")]
pub mod tts_supertonic;
pub mod tts_edge;
pub mod types;

pub use handler::handle_speech_request;
pub use sidecar_client::send_speech_sidecar_request;
