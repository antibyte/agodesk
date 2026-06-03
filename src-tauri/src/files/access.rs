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
        canonicalize_path(&joined, true)?
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

fn resolve_directory(
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

fn canonicalize_existing(path: &Path) -> Result<PathBuf, String> {
    canonicalize_path(path, true)
}

pub fn canonicalize_path(path: &Path, must_exist: bool) -> Result<PathBuf, String> {
    if must_exist {
        std::fs::canonicalize(path).map_err(|_| "FILE_NOT_FOUND".to_string())
    } else {
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(canonicalize_existing)
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

fn ensure_within_root(root: &Path, target: &Path) -> Result<(), String> {
    if is_within_root(root, target) {
        Ok(())
    } else {
        Err("FILE_PATH_DENIED".to_string())
    }
}

fn is_within_root(root: &Path, target: &Path) -> bool {
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
