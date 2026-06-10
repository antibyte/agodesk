use std::path::{Component, Path, PathBuf};

use super::types::{FileAccessRootInput, ResolvedFilePath};

const MAX_RELATIVE_PATH_LEN: usize = 4096;

pub fn resolve_file_path(
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    requested_path: &str,
) -> Result<ResolvedFilePath, String> {
    resolve_internal(roots, root_id, requested_path, true)
}

pub fn resolve_file_path_for_write(
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    requested_path: &str,
) -> Result<ResolvedFilePath, String> {
    resolve_internal(roots, root_id, requested_path, false)
}

fn resolve_internal(
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    requested_path: &str,
    target_must_exist: bool,
) -> Result<ResolvedFilePath, String> {
    if requested_path.len() > MAX_RELATIVE_PATH_LEN {
        return Err("FILE_PATH_DENIED".to_string());
    }

    let trimmed = requested_path.trim();
    if trimmed.is_empty() {
        if target_must_exist {
            return resolve_directory(roots, root_id, ".");
        }
        return Err("FILE_PATH_DENIED".to_string());
    }

    if trimmed == "." {
        return resolve_directory(roots, root_id, ".");
    }

    if trimmed.contains('\0') {
        return Err("FILE_PATH_DENIED".to_string());
    }

    if has_traversal(trimmed) {
        return Err("FILE_PATH_DENIED".to_string());
    }

    if Path::new(trimmed).is_absolute() {
        return resolve_absolute_path(roots, trimmed);
    }

    let root = select_root(roots, root_id)?;
    let root_canonical = canonicalize_existing(Path::new(&root.canonical_path))?;
    let joined = root_canonical.join(normalize_relative(trimmed));
    let target = if target_must_exist {
        match canonicalize_path(&joined, true) {
            Ok(path) => path,
            Err(_) => resolve_relative_by_walking(&root_canonical, trimmed)?,
        }
    } else {
        resolve_write_target(&root_canonical, &joined)?
    };
    ensure_within_root(&root_canonical, &target)?;

    Ok(ResolvedFilePath {
        root_id: root.root_id.clone(),
        relative_path: relative_to_root(&root_canonical, &target),
        absolute_path: target,
    })
}

pub fn resolve_directory(
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    requested_path: &str,
) -> Result<ResolvedFilePath, String> {
    let root = select_root(roots, root_id)?;
    let root_canonical = canonicalize_existing(Path::new(&root.canonical_path))?;
    let joined = if requested_path == "." {
        root_canonical.clone()
    } else {
        root_canonical.join(normalize_relative(requested_path))
    };
    let target = canonicalize_path(&joined, true)?;
    ensure_within_root(&root_canonical, &target)?;
    Ok(ResolvedFilePath {
        root_id: root.root_id.clone(),
        relative_path: relative_to_root(&root_canonical, &target),
        absolute_path: target,
    })
}

fn resolve_write_target(root: &Path, joined: &Path) -> Result<PathBuf, String> {
    if joined.exists() {
        return canonicalize_path(joined, true);
    }

    let parent = joined
        .parent()
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
    let file_name = joined
        .file_name()
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;

    let canonical_parent: PathBuf = if parent.as_os_str().is_empty() {
        root.to_path_buf()
    } else if parent.exists() {
        canonicalize_path(parent, true)?
    } else {
        return Err("FILE_NOT_FOUND".to_string());
    };

    ensure_within_root(root, canonical_parent.as_path())?;
    Ok(canonical_parent.join(file_name))
}

fn resolve_absolute_path(
    roots: &[FileAccessRootInput],
    absolute_path: &str,
) -> Result<ResolvedFilePath, String> {
    let target = canonicalize_path(Path::new(absolute_path), true)?;

    for root in roots {
        let root_canonical = match canonicalize_existing(Path::new(&root.canonical_path)) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if is_within_root(&root_canonical, &target) {
            return Ok(ResolvedFilePath {
                root_id: root.root_id.clone(),
                relative_path: relative_to_root(&root_canonical, &target),
                absolute_path: target,
            });
        }
    }

    Err("FILE_PATH_DENIED".to_string())
}

fn select_root<'a>(
    roots: &'a [FileAccessRootInput],
    root_id: Option<&str>,
) -> Result<&'a FileAccessRootInput, String> {
    if roots.is_empty() {
        return Err("FILE_ACCESS_DISABLED".to_string());
    }

    if let Some(id) = root_id {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("FILE_PATH_DENIED".to_string());
        }
        return roots
            .iter()
            .find(|root| root.root_id == trimmed)
            .ok_or_else(|| "FILE_PATH_DENIED".to_string());
    }

    if roots.len() == 1 {
        return Ok(&roots[0]);
    }

    Err("FILE_PATH_DENIED".to_string())
}

fn has_traversal(path: &str) -> bool {
    Path::new(path.replace('\\', "/").as_str())
        .components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn normalize_relative(path: &str) -> PathBuf {
    let mut output = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => output.push(part),
            Component::RootDir | Component::Prefix(_) | Component::ParentDir => {}
        }
    }
    output
}

fn split_relative_components(relative: &str) -> Vec<std::ffi::OsString> {
    relative
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .map(|part| std::ffi::OsString::from(part))
        .collect()
}

/// Walks from `root` matching each path segment against directory entries.
/// Fixes Windows/OneDrive cases where `join` + `canonicalize` fails despite the file
/// being visible in `read_dir` (unicode form, reparse points, long paths).
fn resolve_relative_by_walking(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let parts = split_relative_components(relative);
    if parts.is_empty() {
        return canonicalize_path(root, true);
    }

    let mut current = root.to_path_buf();
    for part in parts {
        current = find_child_in_directory(&current, &part)?;
    }
    canonicalize_path(&current, true)
}

fn find_child_in_directory(parent: &Path, name: &std::ffi::OsString) -> Result<PathBuf, String> {
    let direct = parent.join(name);
    if direct.exists() {
        return Ok(direct);
    }

    let read_dir = std::fs::read_dir(parent).map_err(|_| "FILE_NOT_FOUND".to_string())?;
    for entry in read_dir {
        let entry = entry.map_err(|_| "FILE_NOT_FOUND".to_string())?;
        if file_names_match(&entry.file_name(), name) {
            return Ok(entry.path());
        }
    }

    Err("FILE_NOT_FOUND".to_string())
}

fn file_names_match(left: &std::ffi::OsStr, right: &std::ffi::OsStr) -> bool {
    if left == right {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let left: Vec<u16> = left.encode_wide().collect();
        let right: Vec<u16> = right.encode_wide().collect();
        if left.len() != right.len() {
            return false;
        }
        return left
            .iter()
            .zip(right.iter())
            .all(|(a, b)| wide_chars_match_case_insensitive(*a, *b));
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn wide_chars_match_case_insensitive(a: u16, b: u16) -> bool {
    if a == b {
        return true;
    }
    if a <= 0x7F && b <= 0x7F {
        return (a as u8).eq_ignore_ascii_case(&(b as u8));
    }
    false
}

fn canonicalize_existing(path: &Path) -> Result<PathBuf, String> {
    let input = normalize_path_input(path.to_string_lossy().as_ref());
    canonicalize_path_buf(&input, true)
}

pub fn canonicalize_path(path: &Path, must_exist: bool) -> Result<PathBuf, String> {
    let input = normalize_path_input(path.to_string_lossy().as_ref());
    canonicalize_path_buf(&input, must_exist)
}

fn canonicalize_path_buf(path: &Path, must_exist: bool) -> Result<PathBuf, String> {
    if must_exist {
        std::fs::canonicalize(path).map_err(|_| "FILE_NOT_FOUND".to_string())
    } else {
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(|parent| canonicalize_path_buf(parent, true))
            .transpose()?;

        let file_name = path
            .file_name()
            .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;

        Ok(match parent {
            Some(parent) => parent.join(file_name),
            None => PathBuf::from(file_name),
        })
    }
}

/// Normalizes user/agent path strings before canonicalization.
/// Handles Windows extended paths (`\\?\`, `//?/`) and forward slashes.
pub fn normalize_path_input(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return PathBuf::new();
    }

    #[cfg(windows)]
    {
        if let Some(rest) = trimmed
            .strip_prefix("//?/")
            .or_else(|| trimmed.strip_prefix("//?\\"))
        {
            let body = rest.replace('/', "\\");
            return PathBuf::from(format!(r"\\?\{}", body.trim_start_matches('\\')));
        }
        if trimmed.starts_with(r"\\?\") {
            return PathBuf::from(trimmed.replace('/', "\\"));
        }
        return PathBuf::from(trimmed.replace('/', "\\"));
    }

    #[cfg(not(windows))]
    {
        PathBuf::from(trimmed)
    }
}

fn ensure_within_root(root: &Path, target: &Path) -> Result<(), String> {
    if is_within_root(root, target) {
        Ok(())
    } else {
        Err("FILE_PATH_DENIED".to_string())
    }
}

pub fn is_within_root(root: &Path, target: &Path) -> bool {
    let root = normalize_for_prefix(root);
    let target = normalize_for_prefix(target);
    target.starts_with(&root)
}

fn normalize_for_prefix(path: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => output.push(prefix.as_os_str()),
            Component::RootDir => output.push(Component::RootDir.as_os_str()),
            Component::Normal(part) => output.push(part),
            Component::CurDir => {}
            Component::ParentDir => return PathBuf::new(),
        }
    }
    output
}

fn relative_to_root(root: &Path, target: &Path) -> String {
    let root = normalize_for_prefix(root);
    let target = normalize_for_prefix(target);
    target
        .strip_prefix(&root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| target.to_string_lossy().replace('\\', "/"))
}

pub fn validate_parent_directory(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
    if !parent.exists() {
        return Err("FILE_NOT_FOUND".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::types::FileAccessRootInput;

    #[test]
    fn normalize_path_input_converts_extended_forward_slashes_on_windows() {
        let normalized = normalize_path_input("//?/C:/Users/andre/OneDrive/BAFÖG");
        let text = normalized.to_string_lossy();
        #[cfg(windows)]
        {
            assert!(text.starts_with(r"\\?\"));
            assert!(text.contains("OneDrive"));
        }
        #[cfg(not(windows))]
        {
            assert_eq!(text, "//?/C:/Users/andre/OneDrive/BAFÖG");
        }
    }

    #[test]
    fn resolve_file_path_allows_empty_path_for_root_listing() {
        let temp = std::env::temp_dir().join(format!(
            "agodesk-access-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp).unwrap();
        let roots = vec![FileAccessRootInput {
            root_id: "root".to_string(),
            canonical_path: temp.to_string_lossy().into_owned(),
            permissions: vec!["read".to_string()],
        }];
        let resolved = resolve_file_path(&roots, Some("root"), "").expect("empty path");
        assert!(resolved.absolute_path.is_dir());
        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn resolve_file_path_finds_nested_file_via_directory_walk() {
        let temp = std::env::temp_dir().join(format!(
            "agodesk-access-nested-{}",
            uuid::Uuid::new_v4()
        ));
        let nested = temp.join("Bafög_Johannes_08.2019");
        std::fs::create_dir_all(&nested).unwrap();
        let file = nested.join("01_Bafög_Bewilligungsbescheid.pdf");
        std::fs::write(&file, b"%PDF-1.4 test").unwrap();

        let roots = vec![FileAccessRootInput {
            root_id: "root".to_string(),
            canonical_path: temp.to_string_lossy().into_owned(),
            permissions: vec!["read".to_string()],
        }];
        let relative = "Bafög_Johannes_08.2019/01_Bafög_Bewilligungsbescheid.pdf";
        let resolved =
            resolve_file_path(&roots, Some("root"), relative).expect("nested unicode path");
        assert!(resolved.absolute_path.is_file());

        let _ = std::fs::remove_dir_all(temp);
    }
}
