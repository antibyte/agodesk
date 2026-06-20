use std::collections::HashMap;
use std::path::{Path, PathBuf};

use fff_search::{
    AiGrepConfig, FuzzySearchOptions, GrepMode, GrepSearchOptions, PaginationArgs, QueryParser,
};
use regex::RegexBuilder;
use tauri::{AppHandle, State};

use crate::access_policy::resolve_authorized_file_roots;
use crate::files::access::{is_within_root, resolve_directory, resolve_file_path};
use crate::files::search::format::{
    self, FileSearchMatch, find_data, grep_count_data, grep_recursive_count_data, matches_to_json,
};
use crate::files::search::index::FileSearchState;
use crate::files::types::{
    FileAccessRootInput, FilePermission, root_has_permission,
};

const MAX_PATTERN_LEN: usize = 256;
const MAX_GREP_RECURSIVE_MATCHES: usize = 500;
const MAX_FIND_FILES: usize = 1000;
const MAX_GREP_FILE_SIZE: u64 = 10 * 1024 * 1024;
const MAX_GREP_MATCHES_PER_FILE: usize = 10_000;

#[tauri::command]
pub fn file_search_sync_roots(
    app: AppHandle,
    state: State<'_, FileSearchState>,
    roots: Vec<FileAccessRootInput>,
) -> Result<(), String> {
    let roots = resolve_authorized_file_roots(&app, &roots)?;
    state.sync_roots(&roots)
}

#[tauri::command]
pub fn file_search_rescan(
    app: AppHandle,
    state: State<'_, FileSearchState>,
    roots: Vec<FileAccessRootInput>,
    root_id: String,
) -> Result<(), String> {
    let roots = resolve_authorized_file_roots(&app, &roots)?;
    state.rescan_root(&roots, root_id.trim())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn file_search(
    app: AppHandle,
    state: State<'_, FileSearchState>,
    roots: Vec<FileAccessRootInput>,
    root_id: Option<String>,
    operation: String,
    pattern: String,
    path: String,
    glob: Option<String>,
    output_mode: Option<String>,
) -> Result<String, String> {
    let roots = resolve_authorized_file_roots(&app, &roots)?;
    ensure_file_access_enabled(&roots)?;

    let op = operation.trim();
    let output_mode = output_mode
        .as_deref()
        .unwrap_or("content")
        .trim()
        .to_ascii_lowercase();

    match op {
        "grep" => execute_grep(
            &state,
            &roots,
            root_id.as_deref(),
            &pattern,
            &path,
            &output_mode,
        ),
        "grep_recursive" => execute_grep_recursive(
            &state,
            &roots,
            root_id.as_deref(),
            &pattern,
            &path,
            glob.as_deref(),
            &output_mode,
        ),
        "find" => execute_find(
            &state,
            &roots,
            root_id.as_deref(),
            &pattern,
            &path,
            glob.as_deref(),
        ),
        _ => Ok(format::encode_error(format!(
            "Unknown file_search operation '{op}'. Valid: grep, grep_recursive, find"
        ))),
    }
}

fn ensure_file_access_enabled(roots: &[FileAccessRootInput]) -> Result<(), String> {
    if roots.is_empty() {
        Err("FILE_ACCESS_DISABLED".to_string())
    } else {
        Ok(())
    }
}

fn ensure_read_permission(roots: &[FileAccessRootInput], root_id: &str) -> Result<(), String> {
    let root = roots
        .iter()
        .find(|entry| entry.root_id == root_id)
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
    if root_has_permission(root, FilePermission::Read) {
        Ok(())
    } else {
        Err("FILE_ACCESS_DENIED".to_string())
    }
}

fn validate_regex_pattern(pattern: &str) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("'pattern' is required".to_string());
    }
    if pattern.len() > MAX_PATTERN_LEN {
        return Err(format!(
            "regex pattern too long (max {MAX_PATTERN_LEN} characters)"
        ));
    }
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .build()
        .map_err(|error| format!("Invalid regex: {error}"))?;
    Ok(())
}

fn ensure_index_ready(
    state: &FileSearchState,
    roots: &[FileAccessRootInput],
    root_id: &str,
) -> Result<(), String> {
    state.ensure_root_ready(roots, root_id)
}

fn scope_prefix(relative_path: &str) -> Option<String> {
    let trimmed = relative_path.trim().trim_matches('/');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.replace('\\', "/"))
    }
}

fn matches_scope(relative_path: &str, scope: Option<&str>) -> bool {
    let normalized = relative_path.replace('\\', "/");
    match scope {
        None => true,
        Some(prefix) => normalized == prefix || normalized.starts_with(&format!("{prefix}/")),
    }
}

fn absolute_for_relative(root_canonical: &Path, relative_path: &str) -> PathBuf {
    let relative = relative_path.replace('\\', "/");
    if relative.is_empty() || relative == "." {
        root_canonical.to_path_buf()
    } else {
        root_canonical.join(relative)
    }
}

fn post_filter_relative(
    root_canonical: &Path,
    relative_path: &str,
    scope: Option<&str>,
) -> Option<String> {
    let normalized = relative_path.replace('\\', "/");
    if !matches_scope(&normalized, scope) {
        return None;
    }
    let absolute = absolute_for_relative(root_canonical, &normalized);
    if is_within_root(root_canonical, &absolute) {
        Some(normalized)
    } else {
        None
    }
}

fn build_grep_query_string(
    pattern: &str,
    glob: Option<&str>,
    file_constraint: Option<&str>,
    scope: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(glob_value) = glob.map(str::trim).filter(|value| !value.is_empty()) {
        for token in glob_value.split(&[',', ';', '\n'][..]) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
        }
    }

    if let Some(prefix) = scope.filter(|value| !value.is_empty()) {
        parts.push(format!("/{prefix}/"));
    }

    if let Some(file) = file_constraint.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(file.to_string());
    }

    parts.push(pattern.to_string());
    parts.join(" ")
}

fn grep_options(page_limit: usize) -> GrepSearchOptions {
    GrepSearchOptions {
        max_file_size: MAX_GREP_FILE_SIZE,
        max_matches_per_file: MAX_GREP_MATCHES_PER_FILE,
        smart_case: true,
        file_offset: 0,
        page_limit,
        mode: GrepMode::Regex,
        time_budget_ms: 0,
        before_context: 0,
        after_context: 0,
        classify_definitions: false,
        trim_whitespace: false,
        abort_signal: None,
    }
}

fn normalize_search_path(path: &str) -> &str {
    let trimmed = path.trim();
    if trimmed.is_empty() { "." } else { trimmed }
}

fn execute_grep(
    state: &FileSearchState,
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    pattern: &str,
    path: &str,
    output_mode: &str,
) -> Result<String, String> {
    if path.trim().is_empty() {
        return Ok(format::encode_error(
            "'path' is required for grep (single file). Use grep_recursive for directories.",
        ));
    }
    validate_regex_pattern(pattern)?;

    let resolved = resolve_file_path(roots, root_id, path)?;
    ensure_read_permission(roots, &resolved.root_id)?;
    if !resolved.absolute_path.is_file() {
        return Ok(format::encode_error("FILE_NOT_FOUND"));
    }
    ensure_index_ready(state, roots, &resolved.root_id)?;

    let display_path = if resolved.relative_path.is_empty() {
        path.trim().replace('\\', "/")
    } else {
        resolved.relative_path.clone()
    };

    let query_string = build_grep_query_string(
        pattern,
        None,
        Some(&display_path),
        None,
    );
    let query = QueryParser::new(AiGrepConfig).parse(&query_string);

    let root_canonical = state
        .root_canonical(&resolved.root_id)
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;

    let matches = state.with_picker(&resolved.root_id, |picker| {
        let grep_result = picker.grep(&query, &grep_options(MAX_GREP_RECURSIVE_MATCHES));
        grep_result
            .matches
            .into_iter()
            .filter_map(|entry| {
                let file_item = grep_result.files.get(entry.file_index)?;
                let relative = file_item.relative_path(picker);
                post_filter_relative(&root_canonical, &relative, None).map(|file| FileSearchMatch {
                    file,
                    line: entry.line_number,
                    content: entry.line_content,
                })
            })
            .collect::<Vec<_>>()
    })?;

    if output_mode == "count" {
        return Ok(format::encode_success(grep_count_data(
            matches.len(),
            &display_path,
        )));
    }

    Ok(format::encode_success(matches_to_json(matches)))
}

fn execute_grep_recursive(
    state: &FileSearchState,
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    pattern: &str,
    path: &str,
    glob: Option<&str>,
    output_mode: &str,
) -> Result<String, String> {
    let path = normalize_search_path(path);
    validate_regex_pattern(pattern)?;

    let resolved = resolve_directory(roots, root_id, path)?;
    ensure_read_permission(roots, &resolved.root_id)?;
    if !resolved.absolute_path.is_dir() {
        return Ok(format::encode_error("FILE_NOT_FOUND"));
    }
    ensure_index_ready(state, roots, &resolved.root_id)?;

    let scope = scope_prefix(&resolved.relative_path);
    let glob_value = glob
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("*");

    let query_string = build_grep_query_string(pattern, Some(glob_value), None, scope.as_deref());
    let query = QueryParser::new(AiGrepConfig).parse(&query_string);
    let root_canonical = state
        .root_canonical(&resolved.root_id)
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;

    let mut matches = state.with_picker(&resolved.root_id, |picker| {
        let grep_result = picker.grep(&query, &grep_options(MAX_GREP_RECURSIVE_MATCHES));
        grep_result
            .matches
            .into_iter()
            .filter_map(|entry| {
                let file_item = grep_result.files.get(entry.file_index)?;
                let relative = file_item.relative_path(picker);
                post_filter_relative(&root_canonical, &relative, scope.as_deref()).map(|file| {
                    FileSearchMatch {
                        file,
                        line: entry.line_number,
                        content: entry.line_content,
                    }
                })
            })
            .collect::<Vec<_>>()
    })?;

    if matches.len() > MAX_GREP_RECURSIVE_MATCHES {
        matches.truncate(MAX_GREP_RECURSIVE_MATCHES);
    }

    if output_mode == "count" {
        let mut counts: HashMap<String, usize> = HashMap::new();
        for entry in &matches {
            *counts.entry(entry.file.clone()).or_default() += 1;
        }
        let by_file = counts.into_iter().collect::<Vec<_>>();
        return Ok(format::encode_success(grep_recursive_count_data(
            matches.len(),
            &by_file,
        )));
    }

    Ok(format::encode_success(matches_to_json(matches)))
}

fn execute_find(
    state: &FileSearchState,
    roots: &[FileAccessRootInput],
    root_id: Option<&str>,
    pattern: &str,
    path: &str,
    glob: Option<&str>,
) -> Result<String, String> {
    let path = normalize_search_path(path);

    let resolved = resolve_directory(roots, root_id, path)?;
    ensure_read_permission(roots, &resolved.root_id)?;
    if !resolved.absolute_path.is_dir() {
        return Ok(format::encode_error("FILE_NOT_FOUND"));
    }
    ensure_index_ready(state, roots, &resolved.root_id)?;

    let glob_raw = glob.map(str::trim).unwrap_or("");
    let pattern_trimmed = pattern.trim();
    let effective_glob = if !pattern_trimmed.is_empty() && (glob_raw.is_empty() || glob_raw == "**/*") {
        pattern_trimmed
    } else {
        glob_raw
    };

    if effective_glob.is_empty() {
        return Ok(format::encode_error(
            "'glob' is required for find (used as the pattern)",
        ));
    }

    let scope = scope_prefix(&resolved.relative_path);
    let root_canonical = state
        .root_canonical(&resolved.root_id)
        .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;

    let mut files = state.with_picker(&resolved.root_id, |picker| {
        let result = picker.glob(
            effective_glob,
            FuzzySearchOptions {
                max_threads: 0,
                current_file: None,
                project_path: None,
                combo_boost_score_multiplier: 0,
                min_combo_count: 0,
                pagination: PaginationArgs {
                    offset: 0,
                    limit: MAX_FIND_FILES,
                },
            },
        );

        result
            .items
            .into_iter()
            .filter_map(|item| {
                let relative = item.relative_path(picker);
                post_filter_relative(&root_canonical, &relative, scope.as_deref())
            })
            .collect::<Vec<_>>()
    })?;

    if files.len() > MAX_FIND_FILES {
        files.truncate(MAX_FIND_FILES);
    }

    Ok(format::encode_success(find_data(files.len(), files)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    fn temp_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agodesk-{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read_root(dir: &Path) -> FileAccessRootInput {
        FileAccessRootInput {
            root_id: "root-a".to_string(),
            canonical_path: dir.to_string_lossy().into_owned(),
            permissions: vec!["read".to_string()],
        }
    }

    fn setup_search(dir: &Path) -> (FileSearchState, Vec<FileAccessRootInput>) {
        let app_data = temp_dir("search-app-data");
        let state = FileSearchState::new(app_data);
        let roots = vec![read_root(dir)];
        state.sync_roots(&roots).unwrap();
        assert!(state.wait_for_root("root-a"));
        (state, roots)
    }

    #[test]
    fn search_lazy_syncs_missing_index() {
        let dir = temp_dir("search-lazy");
        fs::write(dir.join("findme.txt"), b"lazy-marker\n").unwrap();
        let app_data = temp_dir("search-lazy-app");
        let state = FileSearchState::new(app_data);
        let roots = vec![read_root(&dir)];

        let json = execute_grep(
            &state,
            &roots,
            Some("root-a"),
            "lazy-marker",
            "findme.txt",
            "content",
        )
        .unwrap();

        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains("lazy-marker"));
    }

    #[test]
    fn find_lists_matching_files() {
        let dir = temp_dir("search-find");
        fs::write(dir.join("alpha.txt"), b"one").unwrap();
        fs::write(dir.join("beta.rs"), b"two").unwrap();
        let (state, roots) = setup_search(&dir);

        let json = execute_find(
            &state,
            &roots,
            Some("root-a"),
            "",
            ".",
            Some("*.txt"),
        )
        .unwrap();

        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains("alpha.txt"));
        assert!(!json.contains("beta.rs"));
    }

    #[test]
    fn grep_finds_line_in_file() {
        let dir = temp_dir("search-grep");
        fs::write(dir.join("sample.txt"), b"hello world\nneedle here\n").unwrap();
        let (state, roots) = setup_search(&dir);

        let json = execute_grep(
            &state,
            &roots,
            Some("root-a"),
            "needle",
            "sample.txt",
            "content",
        )
        .unwrap();

        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains("needle here"));
    }

    #[test]
    fn grep_recursive_filters_by_glob_extension() {
        let dir = temp_dir("search-grep-glob");
        fs::write(dir.join("hit.rs"), b"marker-here").unwrap();
        fs::write(dir.join("miss.txt"), b"marker-here").unwrap();
        let (state, roots) = setup_search(&dir);

        let json = execute_grep_recursive(
            &state,
            &roots,
            Some("root-a"),
            "marker",
            ".",
            Some("*.rs"),
            "content",
        )
        .unwrap();

        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains("hit.rs"));
        assert!(!json.contains("miss.txt"));
    }

    #[test]
    fn grep_recursive_respects_scope_and_limit() {
        let dir = temp_dir("search-grep-recursive");
        fs::create_dir_all(dir.join("nested")).unwrap();
        fs::write(dir.join("one.txt"), b"match-one").unwrap();
        fs::write(dir.join("nested/two.txt"), b"match-two").unwrap();
        let (state, roots) = setup_search(&dir);

        let json = execute_grep_recursive(
            &state,
            &roots,
            Some("root-a"),
            "match",
            "nested",
            Some("*.txt"),
            "content",
        )
        .unwrap();

        assert!(json.contains(r#""status":"success""#));
        assert!(json.contains("match-two"));
        assert!(!json.contains("match-one"));
    }

    #[test]
    fn denied_path_outside_root_returns_error_json() {
        let dir = temp_dir("search-denied");
        let outside = temp_dir("search-outside");
        fs::write(dir.join("inside.txt"), b"x").unwrap();
        let (_state, roots) = setup_search(&dir);

        let outside_path = outside.join("secret.txt");
        fs::write(&outside_path, b"secret").unwrap();

        let result = resolve_file_path(
            &roots,
            Some("root-a"),
            &outside_path.to_string_lossy(),
        );
        assert_eq!(result.unwrap_err(), "FILE_PATH_DENIED");
    }

    #[test]
    fn sync_roots_removes_stale_index_entry() {
        let dir = temp_dir("search-sync-drop");
        let app_data = temp_dir("search-sync-app-data");
        let state = FileSearchState::new(app_data);
        state.sync_roots(&[read_root(&dir)]).unwrap();
        state.sync_roots(&[]).unwrap();
    }
}
