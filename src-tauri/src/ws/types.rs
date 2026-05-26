use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientErrorCode {
    TlsUntrustedCertificate,
    CertificatePinMismatch,
    CertificateExpired,
    WebSocketUpgradeFailed,
    PairingRequired,
    AuthFailed,
    ConnectionFailed,
}

impl ClientErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TlsUntrustedCertificate => "TLS_UNTRUSTED_CERTIFICATE",
            Self::CertificatePinMismatch => "CERTIFICATE_PIN_MISMATCH",
            Self::CertificateExpired => "CERTIFICATE_EXPIRED",
            Self::WebSocketUpgradeFailed => "WEBSOCKET_UPGRADE_FAILED",
            Self::PairingRequired => "PAIRING_REQUIRED",
            Self::AuthFailed => "AUTH_FAILED",
            Self::ConnectionFailed => "CONNECTION_FAILED",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TlsMode {
    System,
    PinnedSelfSignedDev,
    InsecureLoopbackDev,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectConfig {
    pub server_url: String,
    #[serde(default)]
    pub tls_mode: Option<TlsMode>,
    #[serde(default)]
    pub pinned_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStateEvent {
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientErrorEvent {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateProbeResult {
    pub origin: String,
    pub subject: String,
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    pub san: Vec<String>,
    pub sha256_fingerprint: String,
    pub trusted_by_os: bool,
    #[serde(default)]
    pub validation_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedCertificateEntry {
    pub sha256_fingerprint: String,
    pub trusted_at: String,
    pub subject: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrustedCertificateStore {
    pub trusted_certificates: std::collections::HashMap<String, TrustedCertificateEntry>,
}

#[derive(Debug, Clone)]
pub struct ParsedWsUrl {
    pub origin: String,
    pub host: String,
    pub port: u16,
    pub is_loopback: bool,
    pub insecure_loopback_requested: bool,
}
