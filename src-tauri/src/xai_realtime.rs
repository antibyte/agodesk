//! Native WebSocket transport for xAI Grok Voice Agent API.
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

use crate::commands::get_xai_api_key;

const EVENT_MESSAGE: &str = "xai-realtime:message";
const EVENT_STATE: &str = "xai-realtime:state";
const EVENT_ERROR: &str = "xai-realtime:error";
const DEFAULT_MODEL: &str = "grok-voice-latest";

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

pub struct XaiRealtimeState {
    cancel: Arc<AtomicBool>,
    task: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    outbound: tokio::sync::Mutex<Option<mpsc::UnboundedSender<String>>>,
}

impl Default for XaiRealtimeState {
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

async fn reset_transport(state: &XaiRealtimeState) {
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
pub async fn xai_realtime_connect(
    app: AppHandle,
    state: State<'_, XaiRealtimeState>,
    model: Option<String>,
) -> Result<(), String> {
    reset_transport(&state).await;

    let api_key = get_xai_api_key(app.clone())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "xAI API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    let model = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
        .to_string();

    let url = format!("wss://api.x.ai/v1/realtime?model={}", urlencoding_simple(&model));

    let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<String>();
    *state.outbound.lock().await = Some(outbound_tx);

    let cancel = Arc::clone(&state.cancel);
    cancel.store(false, Ordering::SeqCst);
    emit_state(&app, "connecting");

    let app_handle = app.clone();
    let handle = tokio::spawn(async move {
        match connect_xai_ws(&url, &api_key).await {
            Ok(ws_stream) => {
                emit_state(&app_handle, "open");
                if let Err(error) =
                    run_ws_loop(&app_handle, ws_stream, &mut outbound_rx, cancel.clone()).await
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
pub async fn xai_realtime_send(
    state: State<'_, XaiRealtimeState>,
    payload: String,
) -> Result<(), String> {
    let outbound = state.outbound.lock().await;
    let sender = outbound
        .as_ref()
        .ok_or_else(|| "Grok Voice WebSocket is not connected.".to_string())?;
    sender
        .send(payload)
        .map_err(|_| "Failed to queue Grok Voice message.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn xai_realtime_disconnect(state: State<'_, XaiRealtimeState>) -> Result<(), String> {
    reset_transport(&state).await;
    Ok(())
}

/// Backward-compatible alias used by older frontends. Prefer `test_xai_api_key`.
#[tauri::command(rename_all = "camelCase")]
pub async fn test_xai_realtime_connection(
    app: AppHandle,
    _model: Option<String>,
) -> Result<String, String> {
    // Local-only by default — does not burn rate limits.
    tokio::task::spawn_blocking(move || crate::commands::test_xai_api_key(app, Some(false)))
        .await
        .map_err(|error| format!("xAI API key test task failed: {error}"))?
}

/// Connect exactly as documented by xAI:
/// `wss://api.x.ai/v1/realtime?model=…` + `Authorization: Bearer <API_KEY>`
/// (no OpenAI-Beta header; xAI docs do not require it).
/// Do NOT retry on 429 — that burns more of the Voice rate budget.
async fn connect_xai_ws(
    url: &str,
    api_key: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    let mut request = url
        .into_client_request()
        .map_err(|error| format!("Invalid Grok Voice WebSocket URL: {error}"))?;

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
        .map_err(|error| map_xai_connect_error(&error.to_string()))?;

    let status = response.status().as_u16();
    if status != 101 {
        return Err(map_xai_http_error(
            status,
            "",
            "Grok Voice WebSocket upgrade",
        ));
    }

    Ok(ws_stream)
}

fn map_xai_connect_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("429") || lower.contains("too many requests") {
        return concat!(
            "xAI Voice Rate-Limit (HTTP 429). ",
            "Endpoint/Auth sind korrekt (wss://api.x.ai/v1/realtime + Bearer). ",
            "Voice-Limits sind team-weit und getrennt von Text-Modellen. ",
            "Bitte 5–15 Minuten warten, Console Rate Limits prüfen, ",
            "oder sales@x.ai für höhere Voice-Limits kontaktieren. ",
            "Nicht erneut spammen — jeder Versuch zählt gegen das Limit."
        )
        .to_string();
    }
    if lower.contains("401") || lower.contains("unauthorized") {
        return "xAI Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder ohne Voice-Berechtigung.".to_string();
    }
    if lower.contains("403") || lower.contains("forbidden") {
        return "xAI Zugriff verweigert (HTTP 403): Kein Zugriff auf Grok Voice für diesen Key/Account.".to_string();
    }
    format!("Grok Voice WebSocket connect failed: {raw}")
}

fn map_xai_http_error(status: u16, body: &str, context: &str) -> String {
    let snippet: String = body.chars().take(200).collect();
    match status {
        429 => concat!(
            "xAI Rate-Limit (HTTP 429). ",
            "Bitte mehrere Minuten warten. Voice/TTS-Limits sind team-weit; ",
            "Console: https://console.x.ai/team/default/rate-limits"
        )
        .to_string(),
        401 => "xAI Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder abgelaufen.".to_string(),
        403 => "xAI Zugriff verweigert (HTTP 403): Kein Zugriff auf Grok Voice für diesen Key/Account.".to_string(),
        _ if !snippet.is_empty() => format!("{context} failed (HTTP {status}): {snippet}"),
        _ => format!("{context} failed (HTTP {status})."),
    }
}

async fn run_ws_loop(
    app: &AppHandle,
    ws_stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    outbound_rx: &mut mpsc::UnboundedReceiver<String>,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let (mut write, mut read) = ws_stream.split();

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
                            return Err("Failed to send message to Grok Voice.".to_string());
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
                        emit_message(app, text.to_string());
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
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
                        return Err(format!("Grok Voice WebSocket read error: {error}"));
                    }
                    None => break,
                }
            }
        }
    }

    Ok(())
}

fn urlencoding_simple(value: &str) -> String {
    // Model ids are alphanumeric + dash/dot/underscore; encode only unsafe chars.
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
