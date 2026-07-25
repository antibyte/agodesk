//! Native WebSocket transport for Mistral Voxtral realtime transcription.
//! Browser WebViews cannot set `Authorization` headers on WebSocket; this
//! module connects from Rust with the stored API key and relays JSON events.

use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, connect_async_tls_with_config, Connector};

use crate::commands::get_mistral_api_key;

const EVENT_MESSAGE: &str = "mistral-realtime:message";
const EVENT_STATE: &str = "mistral-realtime:state";
const EVENT_ERROR: &str = "mistral-realtime:error";
const DEFAULT_MODEL: &str = "voxtral-mini-transcribe-realtime-2602";
const DEFAULT_STREAMING_DELAY_MS: u32 = 480;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StateEvent {
    state: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageEvent {
    data: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    message: String,
}

#[derive(serde::Serialize)]
struct SessionUpdateMessage {
    #[serde(rename = "type")]
    msg_type: &'static str,
    session: SessionUpdateBody,
}

#[derive(serde::Serialize)]
struct SessionUpdateBody {
    audio_format: AudioFormat,
    target_streaming_delay_ms: u32,
}

#[derive(serde::Serialize)]
struct AudioFormat {
    encoding: &'static str,
    sample_rate: u32,
}

pub struct MistralRealtimeState {
    cancel: Arc<AtomicBool>,
    task: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    outbound: tokio::sync::Mutex<Option<mpsc::UnboundedSender<String>>>,
}

impl Default for MistralRealtimeState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(true)),
            task: tokio::sync::Mutex::new(None),
            outbound: tokio::sync::Mutex::new(None),
        }
    }
}

fn emit_state(app: &AppHandle, state: &str) {
    let _ = app.emit(
        EVENT_STATE,
        StateEvent {
            state: state.to_string(),
        },
    );
}

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(
        EVENT_ERROR,
        ErrorEvent {
            message: message.into(),
        },
    );
}

fn emit_message(app: &AppHandle, data: String) {
    let _ = app.emit(EVENT_MESSAGE, MessageEvent { data });
}

async fn reset_transport(state: &MistralRealtimeState) {
    state.cancel.store(true, Ordering::SeqCst);
    {
        let mut outbound = state.outbound.lock().await;
        *outbound = None;
    }
    let handle = {
        let mut task = state.task.lock().await;
        task.take()
    };
    if let Some(handle) = handle {
        handle.abort();
        let _ = handle.await;
    }
    state.cancel.store(false, Ordering::SeqCst);
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mistral_realtime_connect(
    app: AppHandle,
    state: State<'_, MistralRealtimeState>,
    model: Option<String>,
    target_streaming_delay_ms: Option<u32>,
) -> Result<(), String> {
    reset_transport(&state).await;

    let api_key = get_mistral_api_key(app.clone())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    let model = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
        .to_string();

    let streaming_delay_ms = target_streaming_delay_ms
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_STREAMING_DELAY_MS);

    let url = format!(
        "wss://api.mistral.ai/v1/audio/transcriptions/realtime?model={}",
        urlencoding_simple(&model)
    );

    let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<String>();
    *state.outbound.lock().await = Some(outbound_tx);

    let cancel = Arc::clone(&state.cancel);
    cancel.store(false, Ordering::SeqCst);
    emit_state(&app, "connecting");

    let app_handle = app.clone();
    let handle = tokio::spawn(async move {
        match connect_mistral_ws(&url, &api_key).await {
            Ok(ws_stream) => {
                emit_state(&app_handle, "open");
                if let Err(error) = run_ws_loop(
                    &app_handle,
                    ws_stream,
                    &mut outbound_rx,
                    cancel.clone(),
                    streaming_delay_ms,
                )
                .await
                {
                    if !cancel.load(Ordering::SeqCst) {
                        emit_error(&app_handle, error);
                    }
                }
            }
            Err(error) => {
                emit_error(&app_handle, error);
            }
        }
        emit_state(&app_handle, "closed");
    });

    *state.task.lock().await = Some(handle);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mistral_realtime_send(
    state: State<'_, MistralRealtimeState>,
    data: String,
) -> Result<(), String> {
    let outbound = state.outbound.lock().await;
    let sender = outbound
        .as_ref()
        .ok_or_else(|| "Mistral realtime WebSocket is not connected.".to_string())?;
    sender
        .send(data)
        .map_err(|_| "Failed to queue Mistral realtime message.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mistral_realtime_disconnect(
    state: State<'_, MistralRealtimeState>,
) -> Result<(), String> {
    reset_transport(&state).await;
    Ok(())
}

async fn connect_mistral_ws(
    url: &str,
    api_key: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    let mut request = url
        .into_client_request()
        .map_err(|error| format!("Invalid Mistral realtime WebSocket URL: {error}"))?;

    let auth = format!("Bearer {api_key}");
    let auth_value = HeaderValue::from_str(&auth)
        .map_err(|error| format!("Invalid Authorization header: {error}"))?;
    request.headers_mut().insert("Authorization", auth_value);

    let connect_result = if url.starts_with("wss://") {
        let connector = native_tls::TlsConnector::new()
            .map_err(|error| format!("TLS connector error: {error}"))?;
        connect_async_tls_with_config(request, None, false, Some(Connector::NativeTls(connector)))
            .await
    } else {
        connect_async(request).await
    };

    let (ws_stream, response) = connect_result
        .map_err(|error| map_mistral_connect_error(&error.to_string()))?;

    let status = response.status().as_u16();
    if status != 101 {
        return Err(map_mistral_http_error(
            status,
            "",
            "Mistral realtime WebSocket upgrade",
        ));
    }

    Ok(ws_stream)
}

fn map_mistral_connect_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("429") || lower.contains("too many requests") {
        return "Mistral Rate-Limit (HTTP 429). Bitte einige Minuten warten.".to_string();
    }
    if lower.contains("401") || lower.contains("unauthorized") {
        return "Mistral Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder abgelaufen."
            .to_string();
    }
    if lower.contains("403") || lower.contains("forbidden") {
        return "Mistral Zugriff verweigert (HTTP 403): Kein Zugriff auf Realtime-Transcription."
            .to_string();
    }
    format!("Mistral realtime WebSocket connect failed: {raw}")
}

fn map_mistral_http_error(status: u16, body: &str, context: &str) -> String {
    let snippet: String = body.chars().take(200).collect();
    match status {
        429 => "Mistral Rate-Limit (HTTP 429). Bitte einige Minuten warten.".to_string(),
        401 => "Mistral Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder abgelaufen."
            .to_string(),
        403 => "Mistral Zugriff verweigert (HTTP 403): Kein Zugriff auf Realtime-Transcription."
            .to_string(),
        _ if !snippet.is_empty() => format!("{context} failed (HTTP {status}): {snippet}"),
        _ => format!("{context} failed (HTTP {status})."),
    }
}

fn build_session_update(streaming_delay_ms: u32) -> Result<String, String> {
    let message = SessionUpdateMessage {
        msg_type: "session.update",
        session: SessionUpdateBody {
            audio_format: AudioFormat {
                encoding: "pcm_s16le",
                sample_rate: 16_000,
            },
            target_streaming_delay_ms: streaming_delay_ms,
        },
    };
    serde_json::to_string(&message)
        .map_err(|error| format!("Failed to build session.update: {error}"))
}

fn is_session_created(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| value.get("type").and_then(|t| t.as_str()).map(|s| s == "session.created"))
        .unwrap_or(false)
}

async fn run_ws_loop(
    app: &AppHandle,
    ws_stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    outbound_rx: &mut mpsc::UnboundedReceiver<String>,
    cancel: Arc<AtomicBool>,
    streaming_delay_ms: u32,
) -> Result<(), String> {
    let (mut write, mut read) = ws_stream.split();
    let mut session_update_sent = false;

    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = write.close().await;
            break;
        }

        tokio::select! {
            outbound = outbound_rx.recv() => {
                match outbound {
                    Some(payload) => {
                        if write.send(Message::Text(payload.into())).await.is_err() {
                            return Err("Failed to send message to Mistral realtime.".to_string());
                        }
                    }
                    None => {
                        let _ = write.close().await;
                        break;
                    }
                }
            }
            inbound = read.next() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        if !session_update_sent && is_session_created(&text) {
                            let update = build_session_update(streaming_delay_ms)?;
                            if write.send(Message::Text(update.into())).await.is_err() {
                                return Err("Failed to send session.update to Mistral realtime.".to_string());
                            }
                            session_update_sent = true;
                        }
                        emit_message(app, text.to_string());
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                            if !session_update_sent && is_session_created(&text) {
                                let update = build_session_update(streaming_delay_ms)?;
                                if write.send(Message::Text(update.into())).await.is_err() {
                                    return Err("Failed to send session.update to Mistral realtime.".to_string());
                                }
                                session_update_sent = true;
                            }
                            emit_message(app, text);
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Some(Ok(Message::Pong(_))) | Some(Ok(Message::Frame(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        break;
                    }
                    Some(Err(error)) => {
                        return Err(format!("Mistral realtime WebSocket read error: {error}"));
                    }
                    None => break,
                }
            }
        }
    }

    Ok(())
}

fn urlencoding_simple(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => out.push(ch),
            _ => {
                for byte in ch.to_string().as_bytes() {
                    out.push_str(&format!("%{byte:02X}"));
                }
            }
        }
    }
    out
}
