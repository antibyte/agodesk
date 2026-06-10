use crate::ws::store::pinned_fingerprint_for_url;
use crate::ws::tls::{
    append_insecure_loopback_if_needed, build_tls_connector, determine_tls_mode, parse_ws_url,
    probe_with_fallback, verify_peer_fingerprint,
};
use crate::ws::types::{
    CertificateProbeResult, ClientErrorCode, ClientErrorEvent, ConnectConfig, ConnectionStateEvent,
    TrustedCertificateEntry, TrustedCertificateStore, TlsMode,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async, connect_async_tls_with_config, tungstenite::Message, Connector,
    MaybeTlsStream, WebSocketStream,
};
use tokio::net::TcpStream;

const RECONNECT_DELAYS_MS: [u64; 5] = [1000, 2000, 4000, 8000, 16000];
/// AuraGo `agodeskMaxMessageBytes` (16 MiB). Keep client send cap in sync with the server.
const AGODESK_MAX_MESSAGE_BYTES: usize = 16 * 1024 * 1024;
/// Leave headroom for WebSocket framing and JSON envelope fields around `data_base64`.
const AGODESK_SAFE_SEND_BYTES: usize = AGODESK_MAX_MESSAGE_BYTES - 64 * 1024;

pub struct WsTransportState {
    cancel: Arc<AtomicBool>,
    task: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    outbound: tokio::sync::Mutex<Option<mpsc::UnboundedSender<String>>>,
}

impl Default for WsTransportState {
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
        "agodesk:connection-state",
        ConnectionStateEvent {
            state: state.to_string(),
        },
    );
}

fn emit_error(
    app: &AppHandle,
    code: ClientErrorCode,
    message: impl Into<String>,
    origin: Option<String>,
) {
    let _ = app.emit(
        "agodesk:error",
        ClientErrorEvent {
            code: code.as_str().to_string(),
            message: message.into(),
            origin,
        },
    );
}

fn is_fatal_tls_code(code: &ClientErrorCode) -> bool {
    matches!(
        code,
        ClientErrorCode::TlsUntrustedCertificate
            | ClientErrorCode::CertificatePinMismatch
            | ClientErrorCode::CertificateExpired
            | ClientErrorCode::WebSocketUpgradeFailed
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_server_asset(
    app: AppHandle,
    server_url: String,
    asset_url: String,
    pinned_fingerprint: Option<String>,
    device_id: Option<String>,
    session_id: Option<String>,
) -> Result<crate::ws::asset_fetch::FetchedAsset, String> {
    if server_url.trim().is_empty() {
        return Err("serverUrl is required.".to_string());
    }
    if asset_url.trim().is_empty() {
        return Err("assetUrl is required.".to_string());
    }
    tokio::task::spawn_blocking(move || {
        crate::ws::asset_fetch::fetch_server_asset_impl(
            &app,
            &server_url,
            &asset_url,
            pinned_fingerprint.as_deref(),
            device_id.as_deref(),
            session_id.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Asset fetch task failed: {error}"))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn probe_server_certificate(
    server_url: String,
) -> Result<CertificateProbeResult, String> {
    if server_url.trim().is_empty() {
        return Err("serverUrl is required.".to_string());
    }
    let parsed = parse_ws_url(&server_url)?;
    if !server_url.starts_with("wss://") {
        return Err("Certificate probe requires a wss:// URL.".to_string());
    }
    let host = parsed.host.clone();
    let port = parsed.port;
    let origin = parsed.origin.clone();
    tokio::task::spawn_blocking(move || probe_with_fallback(&host, port, &origin))
        .await
        .map_err(|error| format!("Certificate probe task failed: {error}"))?
}

#[tauri::command]
pub async fn save_trusted_certificate(
    app: AppHandle,
    origin: String,
    entry: TrustedCertificateEntry,
) -> Result<(), String> {
    crate::ws::store::save_trusted_certificate(&app, origin, entry)
}

#[tauri::command]
pub async fn get_trusted_certificates(
    app: AppHandle,
) -> Result<TrustedCertificateStore, String> {
    crate::ws::store::load_store(&app)
}

async fn reset_transport(state: &WsTransportState) {
    state.cancel.store(true, Ordering::SeqCst);
    if let Some(sender) = state.outbound.lock().await.take() {
        drop(sender);
    }
    if let Some(task) = state.task.lock().await.take() {
        task.abort();
    }
}

#[tauri::command]
pub async fn agodesk_connect(
    app: AppHandle,
    state: State<'_, WsTransportState>,
    config: ConnectConfig,
) -> Result<(), String> {
    reset_transport(&state).await;

    if config.server_url.trim().is_empty() {
        return Err("serverUrl is required.".to_string());
    }

    let server_url = if config.server_url.contains("insecure_loopback=1") {
        config.server_url.clone()
    } else {
        append_insecure_loopback_if_needed(&config.server_url)?
    };

    let parsed = parse_ws_url(&server_url)?;
    let pinned = config
        .pinned_fingerprint
        .or(pinned_fingerprint_for_url(&app, &server_url)?);
    let tls_mode = determine_tls_mode(&parsed, pinned.as_deref(), config.tls_mode);
    let tls_mode_label = format!("{tls_mode:?}");

    state.cancel.store(false, Ordering::SeqCst);
    emit_state(&app, "connecting");

    let (outbound_tx, outbound_rx) = mpsc::unbounded_channel::<String>();
    *state.outbound.lock().await = Some(outbound_tx);

    let app_handle = app.clone();
    let cancel = state.cancel.clone();
    let mut outbound_rx = outbound_rx;

    let handle = tokio::spawn(async move {
        let mut reconnect_attempt = 0usize;
        while !cancel.load(Ordering::SeqCst) {
            match connect_and_run(
                &app_handle,
                &server_url,
                &parsed,
                &tls_mode,
                &tls_mode_label,
                pinned.clone(),
                &mut outbound_rx,
                cancel.clone(),
            )
            .await
            {
                Ok(()) => {
                    if cancel.load(Ordering::SeqCst) {
                        emit_state(&app_handle, "disconnected");
                        break;
                    }
                    // Session was established; reset backoff for the next drop.
                    reconnect_attempt = 0;
                }
                Err((code, message)) => {
                    emit_error(
                        &app_handle,
                        code.clone(),
                        message,
                        Some(parsed.origin.clone()),
                    );
                    if is_fatal_tls_code(&code) {
                        emit_state(&app_handle, "error");
                        break;
                    }
                }
            }

            if cancel.load(Ordering::SeqCst) {
                emit_state(&app_handle, "disconnected");
                break;
            }

            if reconnect_attempt >= RECONNECT_DELAYS_MS.len() {
                emit_state(&app_handle, "disconnected");
                break;
            }

            let delay = RECONNECT_DELAYS_MS[reconnect_attempt];
            reconnect_attempt += 1;
            emit_state(&app_handle, "connecting");
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }
    });

    *state.task.lock().await = Some(handle);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn connect_and_run(
    app: &AppHandle,
    server_url: &str,
    parsed: &crate::ws::types::ParsedWsUrl,
    tls_mode: &TlsMode,
    tls_mode_label: &str,
    pinned: Option<String>,
    outbound_rx: &mut mpsc::UnboundedReceiver<String>,
    cancel: Arc<AtomicBool>,
) -> Result<(), (ClientErrorCode, String)> {
    if tls_mode == &TlsMode::InsecureLoopbackDev && !parsed.is_loopback {
        return Err((
            ClientErrorCode::TlsUntrustedCertificate,
            "insecure_loopback_dev is only allowed for localhost.".to_string(),
        ));
    }

    if server_url.starts_with("wss://") {
        let connector = build_tls_connector(tls_mode).map_err(|error| {
            (
                ClientErrorCode::TlsUntrustedCertificate,
                format!("TLS connector ({tls_mode_label}): {error}"),
            )
        })?;
        let (ws_stream, response) = connect_async_tls_with_config(
            server_url,
            None,
            false,
            Some(Connector::NativeTls(connector)),
        )
        .await
        .map_err(|error| map_wss_connect_error(error, tls_mode_label))?;

        if response.status().as_u16() != 101 {
            return Err((
                ClientErrorCode::WebSocketUpgradeFailed,
                format!(
                    "Expected HTTP 101 Switching Protocols, got {} ({tls_mode_label}).",
                    response.status()
                ),
            ));
        }

        if tls_mode == &TlsMode::PinnedSelfSignedDev {
            verify_pinned_ws_stream(&ws_stream, pinned.as_deref()).map_err(|(code, message)| {
                (
                    code,
                    format!("{message} ({tls_mode_label})"),
                )
            })?;
        }

        emit_state(app, "connected");
        return run_ws_loop(app, ws_stream, outbound_rx, cancel).await;
    }

    let (ws_stream, response) = connect_async(server_url)
        .await
        .map_err(|error| {
            (
                ClientErrorCode::WebSocketUpgradeFailed,
                error.to_string(),
            )
        })?;
    if response.status().as_u16() != 101 {
        return Err((
            ClientErrorCode::WebSocketUpgradeFailed,
            format!("Expected HTTP 101 Switching Protocols, got {}.", response.status()),
        ));
    }
    emit_state(app, "connected");
    run_ws_loop(app, ws_stream, outbound_rx, cancel).await
}

fn map_wss_connect_error(
    error: tokio_tungstenite::tungstenite::Error,
    tls_mode_label: &str,
) -> (ClientErrorCode, String) {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    let code = if message.contains("CertificateExpired") {
        ClientErrorCode::CertificateExpired
    } else if lower.contains("certificate") || lower.contains("handshake") {
        ClientErrorCode::TlsUntrustedCertificate
    } else {
        ClientErrorCode::WebSocketUpgradeFailed
    };
    (
        code,
        format!("WSS connect failed ({tls_mode_label}): {message}"),
    )
}

fn verify_pinned_ws_stream(
    ws_stream: &WebSocketStream<MaybeTlsStream<TcpStream>>,
    expected: Option<&str>,
) -> Result<(), (ClientErrorCode, String)> {
    let expected = expected.ok_or((
        ClientErrorCode::TlsUntrustedCertificate,
        "Missing certificate pin.".to_string(),
    ))?;
    let der = match ws_stream.get_ref() {
        MaybeTlsStream::NativeTls(tls) => tls
            .get_ref()
            .peer_certificate()
            .map_err(|error| {
                (
                    ClientErrorCode::TlsUntrustedCertificate,
                    error.to_string(),
                )
            })?
            .ok_or((
                ClientErrorCode::TlsUntrustedCertificate,
                "Server did not provide a certificate.".to_string(),
            ))?
            .to_der()
            .map_err(|error| {
                (
                    ClientErrorCode::TlsUntrustedCertificate,
                    error.to_string(),
                )
            })?,
        _ => {
            return Err((
                ClientErrorCode::TlsUntrustedCertificate,
                "Expected a TLS WebSocket stream.".to_string(),
            ))
        }
    };

    verify_peer_fingerprint(&der, expected, true).map_err(|error| {
        if error == ClientErrorCode::CertificateExpired.as_str() {
            (ClientErrorCode::CertificateExpired, error)
        } else if error == ClientErrorCode::CertificatePinMismatch.as_str() {
            (ClientErrorCode::CertificatePinMismatch, error)
        } else {
            (ClientErrorCode::TlsUntrustedCertificate, error)
        }
    })
}

async fn run_ws_loop<S>(
    app: &AppHandle,
    mut ws_stream: WebSocketStream<S>,
    outbound_rx: &mut mpsc::UnboundedReceiver<String>,
    cancel: Arc<AtomicBool>,
) -> Result<(), (ClientErrorCode, String)>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = ws_stream.close(None).await;
            return Ok(());
        }

        tokio::select! {
            outbound = outbound_rx.recv() => {
                match outbound {
                    Some(payload) => {
                        ws_stream.send(Message::Text(payload.into())).await.map_err(|error| (ClientErrorCode::ConnectionFailed, error.to_string()))?;
                    }
                    None => return Ok(()),
                }
            }
            incoming = ws_stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let _ = app.emit("agodesk:message", text.to_string());
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        ws_stream.send(Message::Pong(payload)).await.map_err(|error| (ClientErrorCode::ConnectionFailed, error.to_string()))?;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        return Err((ClientErrorCode::ConnectionFailed, "Connection closed.".to_string()));
                    }
                    Some(Err(error)) => {
                        return Err((ClientErrorCode::ConnectionFailed, error.to_string()));
                    }
                    _ => {}
                }
            }
        }
    }
}

#[tauri::command]
pub async fn agodesk_send(
    state: State<'_, WsTransportState>,
    envelope: String,
) -> Result<(), String> {
    if envelope.len() > AGODESK_SAFE_SEND_BYTES {
        return Err(format!(
            "Message too large ({} bytes, limit {} bytes).",
            envelope.len(),
            AGODESK_SAFE_SEND_BYTES
        ));
    }

    let sender = state
        .outbound
        .lock()
        .await
        .clone()
        .ok_or_else(|| "WebSocket is not connected.".to_string())?;
    sender
        .send(envelope)
        .map_err(|_| "Failed to queue WebSocket message.".to_string())
}

#[tauri::command]
pub async fn agodesk_disconnect(state: State<'_, WsTransportState>) -> Result<(), String> {
    reset_transport(&state).await;
    Ok(())
}
