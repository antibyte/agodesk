use std::fs;
use std::path::{Path, PathBuf};

use crate::openpets::protocol::{
    OpenPetsClientError, OpenPetsDiscoveryFile, OPENPETS_IPC_PROTOCOL, OPENPETS_IPC_VERSION,
    MAX_IPC_MESSAGE_BYTES,
};

#[derive(Debug, Clone)]
pub enum ParsedEndpoint {
    Path { path: String },
    Tcp { host: String, port: u16 },
}

pub fn discovery_file_path() -> PathBuf {
    if let Ok(custom) = std::env::var("OPENPETS_DISCOVERY_FILE") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            return home
                .join("Library")
                .join("Application Support")
                .join("OpenPets")
                .join("runtime")
                .join("ipc.json");
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            return PathBuf::from(app_data)
                .join("OpenPets")
                .join("runtime")
                .join("ipc.json");
        }
        if let Some(home) = dirs::home_dir() {
            return home
                .join("AppData")
                .join("Roaming")
                .join("OpenPets")
                .join("runtime")
                .join("ipc.json");
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(xdg) = secure_xdg_runtime_dir() {
            return xdg.join("openpets").join("ipc.json");
        }
        if let Ok(config_home) = std::env::var("XDG_CONFIG_HOME") {
            if !config_home.trim().is_empty() {
                return PathBuf::from(config_home)
                    .join("OpenPets")
                    .join("runtime")
                    .join("ipc.json");
            }
        }
        if let Some(home) = dirs::home_dir() {
            return home
                .join(".config")
                .join("OpenPets")
                .join("runtime")
                .join("ipc.json");
        }
    }

    PathBuf::from("OpenPets/runtime/ipc.json")
}

pub fn read_discovery_file(path: Option<&Path>) -> Result<OpenPetsDiscoveryFile, OpenPetsClientError> {
    let default_path = discovery_file_path();
    let path = path.unwrap_or(&default_path);
    let metadata = fs::metadata(path).map_err(|error| OpenPetsClientError {
        code: "unavailable".to_string(),
        message: format!("OpenPets discovery file is unavailable: {error}"),
    })?;
    if !metadata.is_file() {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "OpenPets discovery path is not a file.".to_string(),
        });
    }
    if metadata.len() as usize > MAX_IPC_MESSAGE_BYTES {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "OpenPets discovery file is too large.".to_string(),
        });
    }

    let raw = fs::read_to_string(path).map_err(|error| OpenPetsClientError {
        code: "unavailable".to_string(),
        message: format!("OpenPets discovery file is unavailable: {error}"),
    })?;
    if raw.len() > MAX_IPC_MESSAGE_BYTES {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "OpenPets discovery file is too large.".to_string(),
        });
    }

    let parsed: OpenPetsDiscoveryFile = serde_json::from_str(&raw).map_err(|_| {
        OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "OpenPets discovery file is malformed JSON.".to_string(),
        }
    })?;
    validate_discovery(&parsed)?;
    Ok(parsed)
}

pub fn validate_discovery(value: &OpenPetsDiscoveryFile) -> Result<(), OpenPetsClientError> {
    if value.protocol != OPENPETS_IPC_PROTOCOL {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery protocol is invalid.".to_string(),
        });
    }
    if value.protocol_version != OPENPETS_IPC_VERSION {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery protocol version is invalid.".to_string(),
        });
    }
    if value.endpoint.is_empty() || value.endpoint.len() > 240 {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery endpoint is invalid.".to_string(),
        });
    }
    if value.token.len() < 16 || value.token.len() > 256 {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery token is invalid.".to_string(),
        });
    }
    if value.app_version.is_empty() {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery app version is invalid.".to_string(),
        });
    }
    if value.pid <= 0 {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery pid is invalid.".to_string(),
        });
    }
    if !matches!(value.platform.as_str(), "darwin" | "linux" | "win32") {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery platform is invalid.".to_string(),
        });
    }

    let endpoint = parse_ipc_endpoint(&value.endpoint)?;
    let current_platform = current_platform_name();
    if value.platform != current_platform && !allows_cross_platform_discovery(&value.platform, &endpoint)
    {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery platform does not match this client.".to_string(),
        });
    }

    let _ = endpoint;
    Ok(())
}

pub fn parse_ipc_endpoint(endpoint: &str) -> Result<ParsedEndpoint, OpenPetsClientError> {
    if endpoint.contains('\0') {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery endpoint contains NUL.".to_string(),
        });
    }

    if endpoint.starts_with("tcp://") {
        return parse_tcp_endpoint(endpoint);
    }

    #[cfg(windows)]
    {
        if !endpoint.starts_with(r"\\.\pipe\openpets-") || endpoint.contains('/') {
            return Err(OpenPetsClientError {
                code: "invalid_discovery".to_string(),
                message: "Discovery endpoint is not an OpenPets named pipe.".to_string(),
            });
        }
        Ok(ParsedEndpoint::Path {
            path: endpoint.to_string(),
        })
    }

    #[cfg(unix)]
    {
        if !endpoint.starts_with('/') || endpoint.contains("://") || endpoint.contains("..") {
            return Err(OpenPetsClientError {
                code: "invalid_discovery".to_string(),
                message: "Discovery endpoint is not an absolute Unix socket path.".to_string(),
            });
        }
        let file_name = Path::new(endpoint)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        if !file_name.starts_with("openpets-") || !file_name.ends_with(".sock") {
            return Err(OpenPetsClientError {
                code: "invalid_discovery".to_string(),
                message: "Discovery endpoint filename is not an OpenPets socket.".to_string(),
            });
        }
        Ok(ParsedEndpoint::Path {
            path: endpoint.to_string(),
        })
    }

    #[cfg(not(any(windows, unix)))]
    {
        let _ = endpoint;
        Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Unsupported platform for OpenPets IPC.".to_string(),
        })
    }
}

fn parse_tcp_endpoint(endpoint: &str) -> Result<ParsedEndpoint, OpenPetsClientError> {
    let without_scheme = endpoint
        .strip_prefix("tcp://")
        .ok_or_else(|| OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery TCP endpoint is invalid.".to_string(),
        })?;
    let (host, port_str) = without_scheme.rsplit_once(':').ok_or_else(|| {
        OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery TCP endpoint is invalid.".to_string(),
        }
    })?;
    if host.is_empty() || host == "0.0.0.0" || host.contains('/') {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery TCP endpoint host is invalid.".to_string(),
        });
    }
    if host.chars().any(|c| c.is_ascii_alphabetic()) {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery TCP endpoint host must be an IPv4 address.".to_string(),
        });
    }
    if !is_private_or_local_ipv4(host) {
        return Err(OpenPetsClientError {
            code: "invalid_discovery".to_string(),
            message: "Discovery TCP endpoint host is not a private/local IPv4 address.".to_string(),
        });
    }
    let port: u16 = port_str.parse().map_err(|_| OpenPetsClientError {
        code: "invalid_discovery".to_string(),
        message: "Discovery TCP endpoint port is invalid.".to_string(),
    })?;
    Ok(ParsedEndpoint::Tcp {
        host: host.to_string(),
        port,
    })
}

fn is_private_or_local_ipv4(host: &str) -> bool {
    let parts: Vec<u8> = host
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect();
    if parts.len() != 4 {
        return false;
    }
    match parts[0] {
        127 => true,
        10 => true,
        172 if (16..=31).contains(&parts[1]) => true,
        192 if parts[1] == 168 => true,
        169 if parts[1] == 254 => true,
        _ => false,
    }
}

fn allows_cross_platform_discovery(platform: &str, endpoint: &ParsedEndpoint) -> bool {
    platform == "win32"
        && cfg!(target_os = "linux")
        && matches!(endpoint, ParsedEndpoint::Tcp { host, .. } if is_private_or_local_ipv4(host))
}

fn current_platform_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "darwin"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(target_os = "windows")]
    {
        "win32"
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "unknown"
    }
}

#[cfg(target_os = "linux")]
fn secure_xdg_runtime_dir() -> Option<PathBuf> {
    let dir = std::env::var_os("XDG_RUNTIME_DIR")?;
    let path = PathBuf::from(dir);
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_dir() {
        return None;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != unsafe { libc::getuid() } {
            return None;
        }
        if metadata.mode() & 0o777 != 0o700 {
            return None;
        }
    }
    Some(path)
}

mod dirs {
    use std::path::PathBuf;

    pub fn home_dir() -> Option<PathBuf> {
        std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openpets::protocol::OpenPetsDiscoveryFile;

    fn sample_discovery(platform: &str, endpoint: &str) -> OpenPetsDiscoveryFile {
        OpenPetsDiscoveryFile {
            protocol_version: 1,
            protocol: "openpets-ipc".to_string(),
            endpoint: endpoint.to_string(),
            token: "0123456789abcdef".to_string(),
            app_version: "2.0.0".to_string(),
            pid: 4242,
            platform: platform.to_string(),
        }
    }

    #[test]
    fn validate_discovery_accepts_matching_platform() {
        #[cfg(windows)]
        let endpoint = r"\\.\pipe\openpets-test-123";
        #[cfg(unix)]
        let endpoint = "/tmp/openpets-user/openpets-test-123.sock";

        #[cfg(windows)]
        let platform = "win32";
        #[cfg(target_os = "macos")]
        let platform = "darwin";
        #[cfg(all(unix, not(target_os = "macos")))]
        let platform = "linux";

        let discovery = sample_discovery(platform, endpoint);
        assert!(validate_discovery(&discovery).is_ok());
    }

    #[test]
    fn validate_discovery_rejects_short_token() {
        let mut discovery = sample_discovery("win32", r"\\.\pipe\openpets-test-123");
        discovery.token = "short".to_string();
        assert!(validate_discovery(&discovery).is_err());
    }

    #[test]
    fn parse_tcp_endpoint_accepts_private_ipv4() {
        let endpoint = parse_ipc_endpoint("tcp://192.168.1.10:54321").unwrap();
        match endpoint {
            ParsedEndpoint::Tcp { host, port } => {
                assert_eq!(host, "192.168.1.10");
                assert_eq!(port, 54321);
            }
            ParsedEndpoint::Path { .. } => panic!("expected tcp endpoint"),
        }
    }

    #[test]
    fn parse_tcp_endpoint_rejects_public_ipv4() {
        assert!(parse_ipc_endpoint("tcp://8.8.8.8:1234").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn parse_named_pipe_endpoint() {
        let endpoint = parse_ipc_endpoint(r"\\.\pipe\openpets-test-123").unwrap();
        match endpoint {
            ParsedEndpoint::Path { path } => {
                assert_eq!(path, r"\\.\pipe\openpets-test-123");
            }
            ParsedEndpoint::Tcp { .. } => panic!("expected named pipe endpoint"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn parse_unix_socket_endpoint() {
        let endpoint = parse_ipc_endpoint("/tmp/openpets-user/openpets-test.sock").unwrap();
        match endpoint {
            ParsedEndpoint::Path { path } => {
                assert_eq!(path, "/tmp/openpets-user/openpets-test.sock");
            }
            ParsedEndpoint::Tcp { .. } => panic!("expected unix socket endpoint"),
        }
    }
}
