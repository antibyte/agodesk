use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::access_policy::{clamp_read_bytes, clamp_write_bytes, resolve_authorized_file_roots};
use super::access::{canonicalize_path, resolve_file_path, resolve_file_path_for_write, validate_parent_directory};
use super::types::{
    FileAccessRootInput, FileListEntry, FileListResult, FilePermission, FileReadResult,
    FileWriteArgs, FileWriteResult, root_has_permission,
};

const MAX_LIST_ENTRIES: usize = 500;
const MAX_LIST_DEPTH: usize = 8;

#[tauri::command]
pub fn file_list(
    app: AppHandle,
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    path: String,
    recursive: bool,
) -> Result<FileListResult, String> {
    let roots = resolve_authorized_file_roots(&app, &roots)?;
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
    app: AppHandle,
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    path: String,
    max_bytes: u64,
    encoding: Option<String>,
) -> Result<FileReadResult, String> {
    let max_bytes = clamp_read_bytes(&app, max_bytes)?;
    let roots = resolve_authorized_file_roots(&app, &roots)?;
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
    let mode = normalize_read_encoding(encoding.as_deref());
    let (content, encoding_label) = encode_file_content(&bytes, mode)?;

    Ok(FileReadResult {
        root_id: resolved.root_id,
        path: resolved.relative_path,
        encoding: encoding_label,
        content,
        size,
        truncated: false,
    })
}

fn normalize_read_encoding(raw: Option<&str>) -> &str {
    match raw.unwrap_or("auto").trim().to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" => "utf-8",
        "base64" => "base64",
        _ => "auto",
    }
}

fn encode_file_content(bytes: &[u8], mode: &str) -> Result<(String, String), String> {
    match mode {
        "base64" => Ok((STANDARD.encode(bytes), "base64".to_string())),
        "utf-8" => decode_utf8_text(bytes).map(|text| (text, "utf-8".to_string())),
        _ if looks_like_text(bytes) => {
            decode_utf8_text(bytes).map(|text| (text, "utf-8".to_string()))
        }
        _ => Ok((STANDARD.encode(bytes), "base64".to_string())),
    }
}

fn looks_like_text(bytes: &[u8]) -> bool {
    String::from_utf8(bytes.to_vec()).is_ok_and(|text| {
        text.chars()
            .all(|ch| !ch.is_control() || matches!(ch, '\n' | '\r' | '\t'))
    })
}

fn decode_utf8_text(bytes: &[u8]) -> Result<String, String> {
    let text = String::from_utf8(bytes.to_vec()).map_err(|_| "FILE_NOT_TEXT".to_string())?;
    if looks_like_text(bytes) {
        Ok(text)
    } else {
        Err("FILE_NOT_TEXT".to_string())
    }
}

#[tauri::command]
pub fn file_write(
    app: AppHandle,
    roots: Vec<FileAccessRootInput>,
    args: FileWriteArgs,
) -> Result<FileWriteResult, String> {
    let FileWriteArgs {
        root_id,
        path,
        content,
        max_bytes,
        expected_hash,
        create_only,
    } = args;
    let max_bytes = clamp_write_bytes(&app, max_bytes)?;
    let bytes = content.as_bytes();
    if bytes.len() as u64 > max_bytes {
        return Err("FILE_TOO_LARGE".to_string());
    }

    let roots = resolve_authorized_file_roots(&app, &roots)?;
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
                return Err("FILE_HASH_MISMATCH".to_string());
            }
        } else {
            return Err("FILE_HASH_MISMATCH".to_string());
        }
    }

    atomic_write(&resolved.absolute_path, bytes)?;

    Ok(FileWriteResult {
        root_id: resolved.root_id,
        path: resolved.relative_path,
        bytes_written: bytes.len() as u64,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct FilePatchHunk {
    pub old_text: String,
    pub new_text: String,
    pub expected_occurrences: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FilePatchArgs {
    pub root_id: Option<String>,
    pub path: String,
    pub expected_sha256: Option<String>,
    pub patches: Vec<FilePatchHunk>,
    pub dry_run: bool,
    pub max_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FilePatchResult {
    pub root_id: String,
    pub path: String,
    pub dry_run: bool,
    pub applied: bool,
    pub diff: String,
    pub sha256_before: String,
    pub sha256_after: String,
    pub replacements: u32,
}

#[tauri::command]
pub fn file_patch(
    app: AppHandle,
    roots: Vec<FileAccessRootInput>,
    args: FilePatchArgs,
) -> Result<FilePatchResult, String> {
    let FilePatchArgs {
        root_id,
        path,
        expected_sha256,
        patches,
        dry_run,
        max_bytes,
    } = args;

    if patches.is_empty() {
        return Err("FILE_COMMAND_INVALID: patches must not be empty".to_string());
    }

    let max_bytes = clamp_write_bytes(&app, max_bytes)?;
    let roots = resolve_authorized_file_roots(&app, &roots)?;
    let resolved = resolve_file_path_for_write(&roots, root_id.as_deref(), &path)?;
    ensure_permission(&roots, &resolved.root_id, FilePermission::Write)?;

    if !resolved.absolute_path.exists() {
        return Err("FILE_NOT_FOUND".to_string());
    }

    let existing = fs::read(&resolved.absolute_path).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    if existing.len() as u64 > max_bytes {
        return Err("FILE_TOO_LARGE".to_string());
    }

    let sha_before = hex::encode(Sha256::digest(&existing));
    if let Some(expected) = expected_sha256 {
        if sha_before != expected.trim().to_lowercase() {
            return Err("FILE_HASH_MISMATCH".to_string());
        }
    }

    let original = decode_utf8_text(&existing)?;
    let mut updated = original.clone();
    let mut replacements: u32 = 0;

    for hunk in &patches {
        if hunk.old_text.is_empty() {
            return Err("FILE_COMMAND_INVALID: old_text must not be empty".to_string());
        }
        let expected = hunk.expected_occurrences.unwrap_or(1);
        let count = updated.matches(&hunk.old_text).count() as u32;
        if count != expected {
            return Err(format!(
                "FILE_PATCH_MISMATCH: expected {expected} occurrence(s) of old_text, found {count}"
            ));
        }
        updated = updated.replacen(&hunk.old_text, &hunk.new_text, expected as usize);
        replacements += expected;
    }

    let diff = build_simple_diff(&original, &updated);
    let sha_after = hex::encode(Sha256::digest(updated.as_bytes()));

    if !dry_run {
        if updated.len() as u64 > max_bytes {
            return Err("FILE_TOO_LARGE".to_string());
        }
        validate_parent_directory(&resolved.absolute_path)?;
        atomic_write(&resolved.absolute_path, updated.as_bytes())?;
    }

    Ok(FilePatchResult {
        root_id: resolved.root_id,
        path: resolved.relative_path,
        dry_run,
        applied: !dry_run,
        diff,
        sha256_before: sha_before,
        sha256_after: sha_after,
        replacements,
    })
}

fn build_simple_diff(before: &str, after: &str) -> String {
    if before == after {
        return String::new();
    }
    let before_lines: Vec<&str> = before.lines().collect();
    let after_lines: Vec<&str> = after.lines().collect();
    let mut out = String::new();
    let max = before_lines.len().max(after_lines.len());
    for index in 0..max {
        let left = before_lines.get(index).copied();
        let right = after_lines.get(index).copied();
        match (left, right) {
            (Some(a), Some(b)) if a == b => {}
            (Some(a), Some(b)) => {
                out.push_str(&format!("-{a}\n+{b}\n"));
            }
            (Some(a), None) => out.push_str(&format!("-{a}\n")),
            (None, Some(b)) => out.push_str(&format!("+{b}\n")),
            (None, None) => {}
        }
    }
    out
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_file_content_auto_uses_base64_for_binary_docx_like_bytes() {
        let bytes = b"PK\x03\x04fake-docx";
        let (content, encoding) = encode_file_content(bytes, "auto").expect("auto read");
        assert_eq!(encoding, "base64");
        assert_eq!(STANDARD.decode(content.as_bytes()).expect("valid base64"), bytes);
    }

    #[test]
    fn encode_file_content_auto_keeps_plain_text_utf8() {
        let bytes = b"Hello Johannes";
        let (content, encoding) = encode_file_content(bytes, "auto").expect("auto read");
        assert_eq!(encoding, "utf-8");
        assert_eq!(content, "Hello Johannes");
    }

    #[test]
    fn encode_file_content_utf8_rejects_binary() {
        let bytes = b"PK\x03\x04";
        let error = encode_file_content(bytes, "utf-8").expect_err("binary utf-8");
        assert_eq!(error, "FILE_NOT_TEXT");
    }
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
