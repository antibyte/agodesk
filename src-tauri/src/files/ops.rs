use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

use super::access::{canonicalize_path, resolve_file_path, resolve_file_path_for_write, validate_parent_directory};
use super::types::{
    FileAccessRootInput, FileListEntry, FileListResult, FilePermission, FileReadResult,
    FileWriteResult, root_has_permission,
};

const MAX_LIST_ENTRIES: usize = 500;
const MAX_LIST_DEPTH: usize = 8;

#[tauri::command]
pub fn file_list(
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    path: String,
    recursive: bool,
) -> Result<FileListResult, String> {
    let resolved = resolve_file_path(&roots, root_id.as_deref(), &path)?;
    ensure_permission(&roots, &resolved.root_id, FilePermission::Read)?;

    if !resolved.absolute_path.is_dir() {
        return Err("FILE_NOT_FOUND".to_string());
    }

    let mut entries = Vec::new();
    collect_entries(
        &resolved.absolute_path,
        &resolved.absolute_path,
        recursive,
        0,
        &mut entries,
    )?;

    Ok(FileListResult {
        root_id: resolved.root_id,
        path: if resolved.relative_path.is_empty() {
            ".".to_string()
        } else {
            resolved.relative_path.clone()
        },
        entries,
    })
}

fn collect_entries(
    base: &Path,
    current: &Path,
    recursive: bool,
    depth: usize,
    entries: &mut Vec<FileListEntry>,
) -> Result<(), String> {
    if entries.len() >= MAX_LIST_ENTRIES {
        return Ok(());
    }
    if depth > MAX_LIST_DEPTH {
        return Ok(());
    }

    let read_dir = fs::read_dir(current).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    for entry in read_dir {
        if entries.len() >= MAX_LIST_ENTRIES {
            break;
        }
        let entry = entry.map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        let file_type = entry.file_type().map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        let metadata = entry.metadata().map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        let absolute = entry.path();
        let relative = absolute
            .strip_prefix(base)
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| entry.file_name().to_string_lossy().replace('\\', "/"));

        entries.push(FileListEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: relative,
            kind: if file_type.is_dir() {
                "dir".to_string()
            } else {
                "file".to_string()
            },
            size: metadata.len(),
            modified: metadata.modified().ok().and_then(format_system_time),
        });

        if recursive && file_type.is_dir() {
            collect_entries(base, &absolute, true, depth + 1, entries)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn file_read(
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    path: String,
    max_bytes: u64,
) -> Result<FileReadResult, String> {
    if max_bytes == 0 {
        return Err("FILE_TOO_LARGE".to_string());
    }

    let resolved = resolve_file_path(&roots, root_id.as_deref(), &path)?;
    ensure_permission(&roots, &resolved.root_id, FilePermission::Read)?;

    if !resolved.absolute_path.is_file() {
        return Err("FILE_NOT_FOUND".to_string());
    }

    let metadata = fs::metadata(&resolved.absolute_path)
        .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    if metadata.len() > max_bytes {
        return Err("FILE_TOO_LARGE".to_string());
    }

    let bytes = fs::read(&resolved.absolute_path).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    let size = bytes.len() as u64;
    let content = String::from_utf8(bytes).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;

    Ok(FileReadResult {
        root_id: resolved.root_id,
        path: resolved.relative_path,
        encoding: "utf-8".to_string(),
        content,
        size,
        truncated: false,
    })
}

#[tauri::command]
pub fn file_write(
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    path: String,
    content: String,
    max_bytes: u64,
    expected_hash: Option<String>,
    create_only: bool,
) -> Result<FileWriteResult, String> {
    let bytes = content.as_bytes();
    if bytes.len() as u64 > max_bytes {
        return Err("FILE_TOO_LARGE".to_string());
    }

    let resolved = resolve_file_path_for_write(&roots, root_id.as_deref(), &path)?;
    ensure_permission(&roots, &resolved.root_id, FilePermission::Write)?;
    validate_parent_directory(&resolved.absolute_path)?;

    if create_only && resolved.absolute_path.exists() {
        return Err("FILE_CONFLICT".to_string());
    }

    if let Some(expected) = expected_hash {
        if resolved.absolute_path.exists() {
            let existing = fs::read(&resolved.absolute_path)
                .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
            let hash = hex::encode(Sha256::digest(&existing));
            if hash != expected.trim().to_lowercase() {
                return Err("FILE_CONFLICT".to_string());
            }
        } else {
            return Err("FILE_CONFLICT".to_string());
        }
    }

    atomic_write(&resolved.absolute_path, bytes)?;

    Ok(FileWriteResult {
        root_id: resolved.root_id,
        path: resolved.relative_path,
        bytes_written: bytes.len() as u64,
    })
}

fn atomic_write(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
    let temp_name = format!(
        ".agodesk-write-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    );
    let temp_path: PathBuf = parent.join(temp_name);

    let mut temp_file =
        fs::File::create(&temp_path).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    temp_file
        .write_all(bytes)
        .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    temp_file.sync_all().map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    drop(temp_file);

    if fs::rename(&temp_path, target).is_err() {
        let _ = fs::remove_file(&temp_path);
        return Err("FILE_ACCESS_DENIED".to_string());
    }

    Ok(())
}

fn ensure_permission(
    roots: &[FileAccessRootInput],
    root_id: &str,
    permission: FilePermission,
) -> Result<(), String> {
    let root = roots
        .iter()
        .find(|entry| entry.root_id == root_id)
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
    if root_has_permission(root, permission) {
        Ok(())
    } else {
        Err("FILE_ACCESS_DENIED".to_string())
    }
}

fn format_system_time(time: std::time::SystemTime) -> Option<String> {
    let datetime: DateTime<Utc> = time.into();
    Some(datetime.to_rfc3339())
}

#[tauri::command]
pub fn pick_folder_path() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    Ok(folder.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn canonicalize_folder_path(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Pfad ist leer.".to_string());
    }
    canonicalize_path(Path::new(trimmed), true)
        .map(|value| value.to_string_lossy().to_string())
}
