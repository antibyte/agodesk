use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct FileAccessRootInput {
    pub root_id: String,
    pub canonical_path: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileListEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileListResult {
    pub root_id: String,
    pub path: String,
    pub entries: Vec<FileListEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileReadResult {
    pub root_id: String,
    pub path: String,
    pub encoding: String,
    pub content: String,
    pub size: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileWriteResult {
    pub root_id: String,
    pub path: String,
    pub bytes_written: u64,
}

#[derive(Debug, Clone)]
pub struct ResolvedFilePath {
    pub root_id: String,
    pub relative_path: String,
    pub absolute_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilePermission {
    Read,
    Write,
}

pub fn root_has_permission(root: &FileAccessRootInput, permission: FilePermission) -> bool {
    let needle = match permission {
        FilePermission::Read => "read",
        FilePermission::Write => "write",
    };
    root.permissions.iter().any(|entry| entry == needle)
}
