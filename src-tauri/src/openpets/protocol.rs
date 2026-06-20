use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const OPENPETS_IPC_PROTOCOL: &str = "openpets-ipc";
pub const OPENPETS_IPC_VERSION: u8 = 1;
pub const MAX_IPC_MESSAGE_BYTES: usize = 16 * 1024;
pub const CONNECT_TIMEOUT_MS: u64 = 2_000;
pub const RESPONSE_TIMEOUT_MS: u64 = 3_000;
pub const INSTALL_RESPONSE_TIMEOUT_MS: u64 = 60_000;

pub const ALLOWED_REACTIONS: &[&str] = &[
    "idle",
    "thinking",
    "working",
    "editing",
    "running",
    "testing",
    "waiting",
    "waving",
    "success",
    "error",
    "celebrating",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPetsDiscoveryFile {
    pub protocol_version: u8,
    pub protocol: String,
    pub endpoint: String,
    pub token: String,
    pub app_version: String,
    pub pid: i64,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenPetsIpcRequest {
    pub id: String,
    pub version: u8,
    pub token: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenPetsIpcOkResponse {
    pub id: Option<String>,
    pub ok: bool,
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenPetsIpcErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum OpenPetsIpcResponse {
    Ok {
        id: Option<String>,
        ok: bool,
        result: Value,
    },
    Err {
        id: Option<String>,
        ok: bool,
        error: OpenPetsIpcErrorBody,
    },
}

#[derive(Debug, Clone)]
pub struct OpenPetsClientError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for OpenPetsClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for OpenPetsClientError {}

pub fn validate_reaction(value: &str) -> Result<String, OpenPetsClientError> {
    if ALLOWED_REACTIONS.contains(&value) {
        Ok(value.to_string())
    } else {
        Err(OpenPetsClientError {
            code: "invalid_reaction".to_string(),
            message: "Invalid OpenPets reaction.".to_string(),
        })
    }
}

pub fn validate_pet_id(value: &str) -> Result<String, OpenPetsClientError> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value != "builtin"
        && value
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_');
    if valid {
        Ok(value.to_string())
    } else {
        Err(OpenPetsClientError {
            code: "invalid_pet_id".to_string(),
            message: "Invalid OpenPets pet id.".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_pet_id, validate_reaction};

    #[test]
    fn validate_reaction_accepts_known_values() {
        assert_eq!(validate_reaction("thinking").unwrap(), "thinking");
    }

    #[test]
    fn validate_reaction_rejects_unknown_values() {
        assert!(validate_reaction("dancing").is_err());
    }

    #[test]
    fn validate_pet_id_rejects_builtin() {
        assert!(validate_pet_id("builtin").is_err());
    }

    #[test]
    fn validate_pet_id_accepts_slug() {
        assert_eq!(validate_pet_id("cloud-puff").unwrap(), "cloud-puff");
    }
}
