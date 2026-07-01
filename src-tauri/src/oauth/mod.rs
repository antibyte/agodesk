use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{Mutex, oneshot};

#[derive(Default)]
pub struct OAuthListenerState {
    inner: Mutex<Option<OAuthListenerHandle>>,
}

struct OAuthListenerHandle {
    shutdown: oneshot::Sender<()>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResult {
    pub redirect_uri: String,
    pub port: u16,
    pub path: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCallbackPayload {
    pub redirect_url: String,
    pub provider_id: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ParsedOAuthRedirect {
    pub path: String,
    pub query: Option<String>,
}

pub fn parse_oauth_request_target(raw: &[u8]) -> Option<ParsedOAuthRedirect> {
    let header_end = raw.windows(4).position(|window| window == b"\r\n\r\n")?;
    let header = std::str::from_utf8(&raw[..header_end]).ok()?;
    let request_line = header.lines().next()?;
    let line = request_line.trim_end_matches('\r');
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    if !method.eq_ignore_ascii_case("GET") {
        return None;
    }
    let target = parts.next()?;
    let mut path_query = target.splitn(2, '?');
    let path = path_query.next()?.to_string();
    let query = path_query.next().map(str::to_string);
    Some(ParsedOAuthRedirect { path, query })
}

pub fn build_redirect_url(port: u16, parsed: &ParsedOAuthRedirect) -> String {
    match parsed.query.as_deref() {
        Some(query) if !query.is_empty() => {
            format!(
                "http://127.0.0.1:{port}{path}?{query}",
                path = parsed.path,
                query = query
            )
        }
        _ => format!("http://127.0.0.1:{port}{}", parsed.path),
    }
}

fn normalize_callback_path(path: Option<String>) -> String {
    let trimmed = path.unwrap_or_else(|| "/oauth/callback".to_string());
    if trimmed.starts_with('/') {
        trimmed
    } else {
        format!("/{trimmed}")
    }
}

#[tauri::command]
pub async fn oauth_start_listener(
    app: AppHandle,
    state: State<'_, OAuthListenerState>,
    port: Option<u16>,
    path: Option<String>,
    provider_id: Option<String>,
) -> Result<OAuthStartResult, String> {
    oauth_stop_listener(state.clone()).await?;

    let callback_path = normalize_callback_path(path);
    let preferred_port = port.unwrap_or(8765);
    let listener = bind_loopback(preferred_port)
        .await
        .map_err(|error| format!("OAuth loopback bind failed: {error}"))?;
    let bound_port = listener
        .local_addr()
        .map_err(|error| format!("OAuth loopback address failed: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{bound_port}{callback_path}");

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    {
        let mut guard = state.inner.lock().await;
        *guard = Some(OAuthListenerHandle {
            shutdown: shutdown_tx,
        });
    }

    let expected_path = callback_path.clone();
    let provider = provider_id.clone();
    tauri::async_runtime::spawn(async move {
        if run_oauth_listener(app, listener, expected_path, provider, shutdown_rx)
            .await
            .is_err()
        {
            // listener errors are surfaced to the frontend via timeout/cancel
        }
    });

    Ok(OAuthStartResult {
        redirect_uri,
        port: bound_port,
        path: callback_path,
    })
}

#[tauri::command]
pub async fn oauth_stop_listener(state: State<'_, OAuthListenerState>) -> Result<(), String> {
    let handle = {
        let mut guard = state.inner.lock().await;
        guard.take()
    };
    if let Some(handle) = handle {
        let _ = handle.shutdown.send(());
    }
    Ok(())
}

async fn bind_loopback(preferred_port: u16) -> std::io::Result<TcpListener> {
    match TcpListener::bind(("127.0.0.1", preferred_port)).await {
        Ok(listener) => Ok(listener),
        Err(_) => TcpListener::bind(("127.0.0.1", 0)).await,
    }
}

async fn run_oauth_listener(
    app: AppHandle,
    listener: TcpListener,
    expected_path: String,
    provider_id: Option<String>,
    mut shutdown_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                break;
            }
            accepted = listener.accept() => {
                let (mut stream, _) = accepted.map_err(|error| format!("OAuth accept failed: {error}"))?;
                let mut buffer = vec![0_u8; 16 * 1024];
                let read = stream
                    .read(&mut buffer)
                    .await
                    .map_err(|error| format!("OAuth read failed: {error}"))?;
                buffer.truncate(read);

                let port = listener
                    .local_addr()
                    .map_err(|error| format!("OAuth local address failed: {error}"))?
                    .port();

                if let Some(parsed) = parse_oauth_request_target(&buffer) {
                    if parsed.path == expected_path {
                        let redirect_url = build_redirect_url(port, &parsed);
                        let _ = app.emit(
                            "agodesk:oauth-callback",
                            OAuthCallbackPayload {
                                redirect_url,
                                provider_id: provider_id.clone(),
                            },
                        );
                        let body = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>AgoDesk OAuth</title></head><body><p>Authorization complete. You can close this tab and return to AgoDesk.</p></body></html>";
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                        let _ = stream.shutdown().await;
                        break;
                    }
                }

                let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.shutdown().await;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_oauth_request_target_reads_path_and_query() {
        let raw = b"GET /oauth/callback?code=abc&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        let parsed = parse_oauth_request_target(raw).expect("parsed");
        assert_eq!(parsed.path, "/oauth/callback");
        assert_eq!(parsed.query.as_deref(), Some("code=abc&state=xyz"));
    }

    #[test]
    fn build_redirect_url_includes_query() {
        let parsed = ParsedOAuthRedirect {
            path: "/oauth/callback".to_string(),
            query: Some("code=abc".to_string()),
        };
        assert_eq!(
            build_redirect_url(8765, &parsed),
            "http://127.0.0.1:8765/oauth/callback?code=abc"
        );
    }

    #[test]
    fn build_redirect_url_without_query() {
        let parsed = ParsedOAuthRedirect {
            path: "/oauth/callback".to_string(),
            query: None,
        };
        assert_eq!(
            build_redirect_url(8765, &parsed),
            "http://127.0.0.1:8765/oauth/callback"
        );
    }
}
