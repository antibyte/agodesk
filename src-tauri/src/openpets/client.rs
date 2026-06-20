use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::timeout;
use uuid::Uuid;

use crate::openpets::discovery::{parse_ipc_endpoint, read_discovery_file, ParsedEndpoint};
use crate::openpets::protocol::{
    map_ipc_response, OpenPetsClientError, OpenPetsDiscoveryFile, OpenPetsIpcRequest,
    CONNECT_TIMEOUT_MS, MAX_IPC_MESSAGE_BYTES, OPENPETS_IPC_VERSION, RESPONSE_TIMEOUT_MS,
};

pub struct SendRequestOptions {
    pub connect_timeout_ms: u64,
    pub response_timeout_ms: u64,
}

impl Default for SendRequestOptions {
    fn default() -> Self {
        Self {
            connect_timeout_ms: CONNECT_TIMEOUT_MS,
            response_timeout_ms: RESPONSE_TIMEOUT_MS,
        }
    }
}

pub async fn send_request(
    discovery: &OpenPetsDiscoveryFile,
    method: &str,
    params: Value,
    options: SendRequestOptions,
) -> Result<Value, OpenPetsClientError> {
    let request = OpenPetsIpcRequest {
        id: Uuid::new_v4().to_string(),
        version: OPENPETS_IPC_VERSION,
        token: discovery.token.clone(),
        method: method.to_string(),
        params: Some(params),
    };
    let request_line = format!("{}\n", serde_json::to_string(&request).map_err(|error| {
        OpenPetsClientError {
            code: "request_invalid".to_string(),
            message: error.to_string(),
        }
    })?);
    if request_line.len() > MAX_IPC_MESSAGE_BYTES {
        return Err(OpenPetsClientError {
            code: "request_too_large".to_string(),
            message: "OpenPets IPC request is too large.".to_string(),
        });
    }

    let endpoint = parse_ipc_endpoint(&discovery.endpoint)?;
    let mut stream = connect(endpoint, options.connect_timeout_ms).await?;
    timeout(
        Duration::from_millis(options.response_timeout_ms),
        exchange(&mut stream, request_line),
    )
    .await
    .map_err(|_| OpenPetsClientError {
        code: "response_timeout".to_string(),
        message: "Timed out waiting for OpenPets response.".to_string(),
    })?
}

pub async fn send_discovered_request(
    method: &str,
    params: Value,
    options: SendRequestOptions,
) -> Result<Value, OpenPetsClientError> {
    let discovery = read_discovery_file(None)?;
    send_request(&discovery, method, params, options).await
}

async fn connect(
    endpoint: ParsedEndpoint,
    connect_timeout_ms: u64,
) -> Result<ConnectedStream, OpenPetsClientError> {
    timeout(Duration::from_millis(connect_timeout_ms), connect_inner(endpoint))
        .await
        .map_err(|_| OpenPetsClientError {
            code: "connect_timeout".to_string(),
            message: "Timed out connecting to OpenPets.".to_string(),
        })?
}

enum ConnectedStream {
    Tcp(tokio::net::TcpStream),
    #[cfg(unix)]
    Unix(tokio::net::UnixStream),
    #[cfg(windows)]
    NamedPipe(tokio::net::windows::named_pipe::NamedPipeClient),
}

async fn connect_inner(endpoint: ParsedEndpoint) -> Result<ConnectedStream, OpenPetsClientError> {
    match endpoint {
        ParsedEndpoint::Tcp { host, port } => {
            let stream = tokio::net::TcpStream::connect((host.as_str(), port))
                .await
                .map_err(map_connect_error)?;
            Ok(ConnectedStream::Tcp(stream))
        }
        ParsedEndpoint::Path { path } => connect_path(&path).await,
    }
}

async fn connect_path(path: &str) -> Result<ConnectedStream, OpenPetsClientError> {
    #[cfg(unix)]
    {
        let stream = tokio::net::UnixStream::connect(path)
            .await
            .map_err(map_connect_error)?;
        Ok(ConnectedStream::Unix(stream))
    }

    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ClientOptions;
        let client = ClientOptions::new()
            .open(path)
            .map_err(map_connect_error)?;
        Ok(ConnectedStream::NamedPipe(client))
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = path;
        Err(OpenPetsClientError {
            code: "unavailable".to_string(),
            message: "OpenPets IPC is unavailable on this platform.".to_string(),
        })
    }
}

async fn exchange(stream: &mut ConnectedStream, request_line: String) -> Result<Value, OpenPetsClientError> {
    write_all(stream, request_line.as_bytes()).await?;
    let response_line = read_line(stream).await?;
    if response_line.len() > MAX_IPC_MESSAGE_BYTES {
        return Err(OpenPetsClientError {
            code: "response_too_large".to_string(),
            message: "OpenPets IPC response is too large.".to_string(),
        });
    }
    map_ipc_response(&response_line)
}

async fn write_all(stream: &mut ConnectedStream, bytes: &[u8]) -> Result<(), OpenPetsClientError> {
    match stream {
        ConnectedStream::Tcp(stream) => stream
            .write_all(bytes)
            .await
            .map_err(map_io_error)?,
        #[cfg(unix)]
        ConnectedStream::Unix(stream) => stream
            .write_all(bytes)
            .await
            .map_err(map_io_error)?,
        #[cfg(windows)]
        ConnectedStream::NamedPipe(stream) => stream
            .write_all(bytes)
            .await
            .map_err(map_io_error)?,
    }
    Ok(())
}

async fn read_line(stream: &mut ConnectedStream) -> Result<String, OpenPetsClientError> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 512];
    loop {
        let read = match stream {
            ConnectedStream::Tcp(stream) => stream.read(&mut chunk).await.map_err(map_io_error)?,
            #[cfg(unix)]
            ConnectedStream::Unix(stream) => stream.read(&mut chunk).await.map_err(map_io_error)?,
            #[cfg(windows)]
            ConnectedStream::NamedPipe(stream) => stream.read(&mut chunk).await.map_err(map_io_error)?,
        };
        if read == 0 {
            return Err(OpenPetsClientError {
                code: "connection_closed".to_string(),
                message: "OpenPets closed the IPC connection before responding.".to_string(),
            });
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_IPC_MESSAGE_BYTES {
            return Err(OpenPetsClientError {
                code: "response_too_large".to_string(),
                message: "OpenPets IPC response is too large.".to_string(),
            });
        }
        if let Some(index) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = String::from_utf8_lossy(&buffer[..index]).to_string();
            return Ok(line);
        }
    }
}

fn map_connect_error(error: std::io::Error) -> OpenPetsClientError {
    OpenPetsClientError {
        code: "unavailable".to_string(),
        message: error.to_string(),
    }
}

fn map_io_error(error: std::io::Error) -> OpenPetsClientError {
    OpenPetsClientError {
        code: "io_error".to_string(),
        message: error.to_string(),
    }
}
