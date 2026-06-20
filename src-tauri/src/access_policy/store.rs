use std::fs;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

const STORE_FILE: &str = "settings.json";

const DEFAULT_MAX_READ_BYTES: u64 = 8_388_608;
const DEFAULT_MAX_WRITE_BYTES: u64 = 8_388_608;
const DEFAULT_MAX_COMMAND_CHARS: usize = 4_000;
const DEFAULT_MAX_OUTPUT_BYTES: usize = 1_048_576;
const DEFAULT_MAX_TIMEOUT_MS: u64 = 120_000;

#[derive(Debug, Clone)]
pub struct FileAccessPolicy {
    pub enabled: bool,
    pub max_read_bytes: u64,
    pub max_write_bytes: u64,
    pub roots: Vec<FileAccessRootPolicy>,
}

#[derive(Debug, Clone)]
pub struct FileAccessRootPolicy {
    pub root_id: String,
    pub canonical_path: String,
    pub read_enabled: bool,
    pub write_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct ShellAccessPolicy {
    pub enabled: bool,
    pub allowed_cwds: Vec<ShellCwdPolicy>,
    pub shells: Vec<String>,
    pub selected_shell: String,
    pub max_command_chars: usize,
    pub max_output_bytes: usize,
    pub max_timeout_ms: u64,
}

#[derive(Debug, Clone)]
pub struct ShellCwdPolicy {
    #[allow(dead_code)]
    pub cwd_id: String,
    pub canonical_path: String,
}

#[derive(Debug, Default, Deserialize)]
struct StoreEnvelope {
    #[serde(default, rename = "app_settings")]
    app_settings: Option<AppSettingsRecord>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettingsRecord {
    #[serde(default)]
    file_access: FileAccessRecord,
    #[serde(default)]
    shell_access: ShellAccessRecord,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileAccessRecord {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    max_read_bytes: u64,
    #[serde(default)]
    max_write_bytes: u64,
    #[serde(default)]
    roots: Vec<FileAccessRootRecord>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileAccessRootRecord {
    #[serde(default)]
    root_id: String,
    #[serde(default)]
    canonical_path: String,
    #[serde(default)]
    read_enabled: bool,
    #[serde(default)]
    write_enabled: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellAccessRecord {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    allowed_cwds: Vec<ShellCwdRecord>,
    #[serde(default)]
    shells: Vec<String>,
    #[serde(default)]
    selected_shell: String,
    #[serde(default)]
    max_command_chars: usize,
    #[serde(default)]
    max_output_bytes: usize,
    #[serde(default)]
    max_timeout_ms: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellCwdRecord {
    #[serde(default)]
    cwd_id: String,
    #[serde(default)]
    canonical_path: String,
}

pub fn settings_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(dir.join(STORE_FILE))
}

pub fn load_file_access_policy(app: &AppHandle) -> FileAccessPolicy {
    load_app_settings(app)
        .map(|settings| normalize_file_access(settings.file_access))
        .unwrap_or_default()
}

pub fn load_shell_access_policy(app: &AppHandle) -> ShellAccessPolicy {
    load_app_settings(app)
        .map(|settings| normalize_shell_access(settings.shell_access))
        .unwrap_or_default()
}

fn load_app_settings(app: &AppHandle) -> Result<AppSettingsRecord, String> {
    let path = settings_store_path(app)?;
    if !path.exists() {
        return Ok(AppSettingsRecord::default());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let envelope: StoreEnvelope = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(envelope.app_settings.unwrap_or_default())
}

fn normalize_file_access(record: FileAccessRecord) -> FileAccessPolicy {
    let roots = record
        .roots
        .into_iter()
        .filter_map(|root| {
            let root_id = root.root_id.trim().to_string();
            let canonical_path = root.canonical_path.trim().to_string();
            if root_id.is_empty() || canonical_path.is_empty() {
                return None;
            }
            if !root.read_enabled && !root.write_enabled {
                return None;
            }
            Some(FileAccessRootPolicy {
                root_id,
                canonical_path,
                read_enabled: root.read_enabled,
                write_enabled: root.write_enabled,
            })
        })
        .collect();

    FileAccessPolicy {
        enabled: record.enabled,
        max_read_bytes: positive_u64(record.max_read_bytes, DEFAULT_MAX_READ_BYTES),
        max_write_bytes: positive_u64(record.max_write_bytes, DEFAULT_MAX_WRITE_BYTES),
        roots,
    }
}

fn normalize_shell_access(record: ShellAccessRecord) -> ShellAccessPolicy {
    let allowed_cwds = record
        .allowed_cwds
        .into_iter()
        .filter_map(|cwd| {
            let cwd_id = cwd.cwd_id.trim().to_string();
            let canonical_path = cwd.canonical_path.trim().to_string();
            if cwd_id.is_empty() || canonical_path.is_empty() {
                return None;
            }
            Some(ShellCwdPolicy { cwd_id, canonical_path })
        })
        .collect();

    let shells = record
        .shells
        .into_iter()
        .map(|shell| shell.trim().to_ascii_lowercase())
        .filter(|shell| !shell.is_empty())
        .collect();

    let selected_shell = record.selected_shell.trim().to_ascii_lowercase();

    ShellAccessPolicy {
        enabled: record.enabled,
        allowed_cwds,
        shells,
        selected_shell,
        max_command_chars: positive_usize(record.max_command_chars, DEFAULT_MAX_COMMAND_CHARS),
        max_output_bytes: positive_usize(record.max_output_bytes, DEFAULT_MAX_OUTPUT_BYTES),
        max_timeout_ms: positive_u64(record.max_timeout_ms, DEFAULT_MAX_TIMEOUT_MS),
    }
}

fn positive_u64(value: u64, fallback: u64) -> u64 {
    if value > 0 {
        value
    } else {
        fallback
    }
}

fn positive_usize(value: usize, fallback: usize) -> usize {
    if value > 0 {
        value
    } else {
        fallback
    }
}

impl Default for FileAccessPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            max_read_bytes: DEFAULT_MAX_READ_BYTES,
            max_write_bytes: DEFAULT_MAX_WRITE_BYTES,
            roots: Vec::new(),
        }
    }
}

impl Default for ShellAccessPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            allowed_cwds: Vec::new(),
            shells: Vec::new(),
            selected_shell: String::new(),
            max_command_chars: DEFAULT_MAX_COMMAND_CHARS,
            max_output_bytes: DEFAULT_MAX_OUTPUT_BYTES,
            max_timeout_ms: DEFAULT_MAX_TIMEOUT_MS,
        }
    }
}

impl FileAccessPolicy {
    pub fn is_configured(&self) -> bool {
        self.enabled && !self.roots.is_empty()
    }
}

impl ShellAccessPolicy {
    pub fn is_configured(&self) -> bool {
        self.enabled && !self.allowed_cwds.is_empty()
    }
}
