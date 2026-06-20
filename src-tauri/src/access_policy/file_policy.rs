use crate::access_policy::store::{FileAccessPolicy, load_file_access_policy};
use crate::files::access::canonicalize_path;
use crate::files::types::FileAccessRootInput;
use tauri::AppHandle;

pub fn resolve_authorized_file_roots(
    app: &AppHandle,
    client_roots: &[FileAccessRootInput],
) -> Result<Vec<FileAccessRootInput>, String> {
    let policy = load_file_access_policy(app);
    if !policy.is_configured() {
        return Err("FILE_ACCESS_DISABLED".to_string());
    }

    let authorized = policy_to_invoke_roots(&policy);
    if authorized.is_empty() {
        return Err("FILE_ACCESS_DISABLED".to_string());
    }

    if !client_roots.is_empty() && !client_roots_match(&authorized, client_roots) {
        return Err("FILE_ACCESS_DENIED".to_string());
    }

    Ok(authorized)
}

pub fn clamp_read_bytes(app: &AppHandle, requested: u64) -> Result<u64, String> {
    let policy = load_file_access_policy(app);
    if !policy.is_configured() {
        return Err("FILE_ACCESS_DISABLED".to_string());
    }
    if requested == 0 {
        return Err("FILE_TOO_LARGE".to_string());
    }
    Ok(requested.min(policy.max_read_bytes))
}

pub fn clamp_write_bytes(app: &AppHandle, requested: u64) -> Result<u64, String> {
    let policy = load_file_access_policy(app);
    if !policy.is_configured() {
        return Err("FILE_ACCESS_DISABLED".to_string());
    }
    if requested == 0 {
        return Err("FILE_TOO_LARGE".to_string());
    }
    Ok(requested.min(policy.max_write_bytes))
}

fn policy_to_invoke_roots(policy: &FileAccessPolicy) -> Vec<FileAccessRootInput> {
    policy
        .roots
        .iter()
        .filter_map(|root| {
            let permissions = [
                root.read_enabled.then_some("read".to_string()),
                root.write_enabled.then_some("write".to_string()),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
            if permissions.is_empty() {
                return None;
            }
            Some(FileAccessRootInput {
                root_id: root.root_id.clone(),
                canonical_path: root.canonical_path.clone(),
                permissions,
            })
        })
        .collect()
}

fn client_roots_match(
    authorized: &[FileAccessRootInput],
    client_roots: &[FileAccessRootInput],
) -> bool {
    if client_roots.len() != authorized.len() {
        return false;
    }

    client_roots.iter().all(|client| {
        authorized.iter().any(|allowed| {
            allowed.root_id == client.root_id
                && paths_equivalent(&allowed.canonical_path, &client.canonical_path)
                && permissions_equivalent(&allowed.permissions, &client.permissions)
        })
    })
}

fn permissions_equivalent(left: &[String], right: &[String]) -> bool {
    let mut left = left.iter().map(|entry| entry.as_str()).collect::<Vec<_>>();
    let mut right = right.iter().map(|entry| entry.as_str()).collect::<Vec<_>>();
    left.sort_unstable();
    right.sort_unstable();
    left == right
}

fn paths_equivalent(left: &str, right: &str) -> bool {
    match (
        canonicalize_path(std::path::Path::new(left.trim()), true),
        canonicalize_path(std::path::Path::new(right.trim()), true),
    ) {
        (Ok(left_path), Ok(right_path)) => left_path == right_path,
        _ => normalize_path_compare(left) == normalize_path_compare(right),
    }
}

fn normalize_path_compare(path: &str) -> String {
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_roots_match_requires_same_ids_paths_and_permissions() {
        let authorized = vec![FileAccessRootInput {
            root_id: "root-a".to_string(),
            canonical_path: "C:/workspace".to_string(),
            permissions: vec!["read".to_string(), "write".to_string()],
        }];
        let matching = vec![FileAccessRootInput {
            root_id: "root-a".to_string(),
            canonical_path: "C:/workspace".to_string(),
            permissions: vec!["write".to_string(), "read".to_string()],
        }];
        let tampered = vec![FileAccessRootInput {
            root_id: "root-a".to_string(),
            canonical_path: "C:/other".to_string(),
            permissions: vec!["read".to_string()],
        }];

        assert!(client_roots_match(&authorized, &matching));
        assert!(!client_roots_match(&authorized, &tampered));
    }
}
