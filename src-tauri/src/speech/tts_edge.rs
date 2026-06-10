use std::collections::BTreeMap;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chrono::Utc;
use edge_tts_rust::{
    build_ssml, normalize_voice, parse_binary_headers, parse_headers, split_text, Boundary,
    SpeakOptions,
};
use futures_util::{SinkExt, StreamExt};
use sha2::{Digest, Sha256};
use tokio_tungstenite::{
    connect_async_tls_with_config, tungstenite::client::IntoClientRequest, tungstenite::Message,
    Connector,
};
use uuid::Uuid;

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_MAJOR_VERSION: &str = "143";
const SEC_MS_GEC_VERSION: &str = "1-143.0.3650.75";
const TEXT_CHUNK_LIMIT: usize = 4096;
const OUTPUT_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";
const WINDOWS_EPOCH_OFFSET_SECONDS: u64 = 11_644_473_600;

fn runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("edge TTS tokio runtime")
    })
}

fn percent_from_multiplier(value: Option<f32>) -> String {
    match value {
        Some(rate) if rate.is_finite() && (rate - 1.0).abs() > f32::EPSILON => {
            let pct = ((rate - 1.0) * 100.0).round() as i32;
            if pct >= 0 {
                format!("+{pct}%")
            } else {
                format!("{pct}%")
            }
        }
        _ => "+0%".to_string(),
    }
}

fn percent_from_semitones(value: Option<f32>) -> String {
    match value {
        Some(pitch) if pitch.is_finite() && pitch.abs() > f32::EPSILON => {
            let hz = (pitch * 100.0).round() as i32;
            if hz >= 0 {
                format!("+{hz}Hz")
            } else {
                format!("{hz}Hz")
            }
        }
        _ => "+0Hz".to_string(),
    }
}

fn user_agent() -> String {
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/{CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 \
         Edg/{CHROMIUM_MAJOR_VERSION}.0.0.0"
    )
}

fn generate_connection_id() -> String {
    Uuid::new_v4().simple().to_string()
}

fn generate_muid() -> String {
    Uuid::new_v4().as_simple().to_string().to_uppercase()
}

fn generate_sec_ms_gec(now: SystemTime) -> String {
    let unix_seconds = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();
    let rounded = (unix_seconds + WINDOWS_EPOCH_OFFSET_SECONDS) / 300 * 300;
    let windows_ticks = rounded * 10_000_000;
    let mut hasher = Sha256::new();
    hasher.update(format!("{windows_ticks}{TRUSTED_CLIENT_TOKEN}").as_bytes());
    format!("{:X}", hasher.finalize())
}

fn javascript_timestamp() -> String {
    Utc::now()
        .format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)")
        .to_string()
}

fn websocket_url(connection_id: &str) -> String {
    let sec_ms_gec = generate_sec_ms_gec(SystemTime::now());
    format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1\
         ?TrustedClientToken={TRUSTED_CLIENT_TOKEN}\
         &ConnectionId={connection_id}\
         &Sec-MS-GEC={sec_ms_gec}\
         &Sec-MS-GEC-Version={SEC_MS_GEC_VERSION}"
    )
}

fn websocket_headers(muid: &str) -> [(&'static str, String); 8] {
    [
        ("Pragma", "no-cache".to_owned()),
        ("Cache-Control", "no-cache".to_owned()),
        (
            "Origin",
            "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold".to_owned(),
        ),
        ("Sec-WebSocket-Version", "13".to_owned()),
        ("User-Agent", user_agent()),
        ("Accept-Encoding", "gzip, deflate, br, zstd".to_owned()),
        ("Accept-Language", "en-US,en;q=0.9".to_owned()),
        ("Cookie", format!("muid={muid};")),
    ]
}

fn speech_config_message(boundary: Boundary) -> String {
    let (word, sentence) = match boundary {
        Boundary::Word => ("true", "false"),
        Boundary::Sentence => ("false", "true"),
    };
    let payload = serde_json::json!({
        "context": {
            "synthesis": {
                "audio": {
                    "metadataoptions": {
                        "sentenceBoundaryEnabled": sentence,
                        "wordBoundaryEnabled": word
                    },
                    "outputFormat": OUTPUT_FORMAT
                }
            }
        }
    });
    format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{}\r\n",
        javascript_timestamp(),
        payload
    )
}

fn ssml_message(options: &SpeakOptions, chunk: &str) -> Result<String, String> {
    let voice = normalize_voice(&options.voice).map_err(|error| error.to_string())?;
    Ok(format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{}",
        generate_connection_id(),
        javascript_timestamp(),
        build_ssml(
            &voice,
            &options.rate,
            &options.volume,
            &options.pitch,
            chunk,
        )
    ))
}

fn insert_header(
    request: &mut http::Request<()>,
    name: &str,
    value: &str,
) -> Result<(), String> {
    request.headers_mut().insert(
        http::HeaderName::from_bytes(name.as_bytes())
            .map_err(|error| format!("invalid header name {name}: {error}"))?,
        http::HeaderValue::from_str(value)
            .map_err(|error| format!("invalid header value for {name}: {error}"))?,
    );
    Ok(())
}

async fn connect_edge_websocket() -> Result<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    String,
> {
    let connection_id = generate_connection_id();
    let muid = generate_muid();
    let url = websocket_url(&connection_id);
    let connector = native_tls::TlsConnector::new().map_err(|error| error.to_string())?;

    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|error| error.to_string())?;
    for (name, value) in websocket_headers(&muid) {
        insert_header(&mut request, name, &value)?;
    }

    let (stream, response) = tokio::time::timeout(
        Duration::from_secs(15),
        connect_async_tls_with_config(
            request,
            None,
            false,
            Some(Connector::NativeTls(connector)),
        ),
    )
    .await
    .map_err(|_| "Edge TTS websocket connect timeout".to_string())?
    .map_err(|error| format!("Edge TTS websocket connect failed: {error}"))?;

    if response.status().as_u16() != 101 {
        return Err(format!(
            "Edge TTS websocket upgrade failed with HTTP {}",
            response.status()
        ));
    }

    Ok(stream)
}

async fn synthesize_chunk(options: &SpeakOptions, chunk: &str) -> Result<Vec<u8>, String> {
    let mut websocket = connect_edge_websocket().await?;

    websocket
        .send(Message::Text(
            speech_config_message(options.boundary).into(),
        ))
        .await
        .map_err(|error| format!("Edge TTS config send failed: {error}"))?;

    websocket
        .send(Message::Text(ssml_message(options, chunk)?.into()))
        .await
        .map_err(|error| format!("Edge TTS ssml send failed: {error}"))?;

    let mut audio = Vec::new();
    loop {
        let next = tokio::time::timeout(Duration::from_secs(60), websocket.next())
            .await
            .map_err(|_| "Edge TTS websocket receive timeout".to_string())?
            .ok_or_else(|| "Edge TTS websocket closed before turn end".to_string())?
            .map_err(|error| format!("Edge TTS websocket read failed: {error}"))?;

        match next {
            Message::Binary(frame) => {
                if frame.len() < 2 {
                    continue;
                }
                let header_length = u16::from_be_bytes([frame[0], frame[1]]) as usize;
                let (headers, payload) =
                    parse_binary_headers(&frame, header_length).map_err(|error| error.to_string())?;
                if headers.get("Path").map(String::as_str) != Some("audio") {
                    continue;
                }
                if headers.get("Content-Type").map(String::as_str) == Some("audio/mpeg")
                    && !payload.is_empty()
                {
                    audio.extend_from_slice(payload);
                }
            }
            Message::Text(text_frame) => {
                let data = text_frame.as_bytes();
                let header_end = data
                    .windows(4)
                    .position(|window| window == b"\r\n\r\n")
                    .ok_or_else(|| "Edge TTS text frame missing headers".to_string())?;
                let (headers, _payload): (BTreeMap<String, String>, _) =
                    parse_headers(data, header_end).map_err(|error| error.to_string())?;
                if headers.get("Path").map(String::as_str) == Some("turn.end") {
                    break;
                }
            }
            Message::Close(_) => {
                return Err("Edge TTS websocket closed before turn end".to_string());
            }
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => {}
        }
    }

    if audio.is_empty() {
        return Err("Edge TTS returned no audio".to_string());
    }

    Ok(audio)
}

async fn synthesize_edge_tts_async(
    text: &str,
    voice: &str,
    rate: Option<f32>,
    pitch: Option<f32>,
) -> Result<Vec<u8>, String> {
    let voice_id = normalize_voice(voice).map_err(|error| error.to_string())?;
    let options = SpeakOptions {
        voice: voice_id,
        rate: percent_from_multiplier(rate),
        pitch: percent_from_semitones(pitch),
        ..SpeakOptions::default()
    };
    options.validate().map_err(|error| error.to_string())?;

    let chunks = split_text(text, TEXT_CHUNK_LIMIT).map_err(|error| error.to_string())?;
    let mut audio = Vec::new();
    for chunk in &chunks {
        let part = synthesize_chunk(&options, chunk).await?;
        audio.extend(part);
    }
    Ok(audio)
}

pub fn synthesize_edge_tts(
    text: &str,
    voice: &str,
    rate: Option<f32>,
    pitch: Option<f32>,
) -> Result<Vec<u8>, String> {
    runtime().block_on(synthesize_edge_tts_async(text, voice, rate, pitch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_from_multiplier_formats_edge_rate() {
        assert_eq!(percent_from_multiplier(None), "+0%");
        assert_eq!(percent_from_multiplier(Some(1.0)), "+0%");
        assert_eq!(percent_from_multiplier(Some(1.1)), "+10%");
        assert_eq!(percent_from_multiplier(Some(0.9)), "-10%");
    }
}
