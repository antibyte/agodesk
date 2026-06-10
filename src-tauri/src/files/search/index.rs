use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use fff_search::{
    FFFMode, FilePicker, FilePickerOptions, FrecencyTracker, SharedFrecency, SharedFilePicker,
};

use crate::files::access::canonicalize_path;
use crate::files::types::{FileAccessRootInput, FilePermission, root_has_permission};

const SCAN_TIMEOUT: Duration = Duration::from_secs(10);

struct RootIndex {
    canonical_path: PathBuf,
    shared_picker: SharedFilePicker,
    #[allow(dead_code)]
    shared_frecency: SharedFrecency,
}

pub struct FileSearchIndexManager {
    roots: HashMap<String, RootIndex>,
}

impl FileSearchIndexManager {
    fn new() -> Self {
        Self {
            roots: HashMap::new(),
        }
    }

    fn sync_roots(&mut self, app_data: &Path, roots: &[FileAccessRootInput]) -> Result<(), String> {
        let read_roots: Vec<&FileAccessRootInput> = roots
            .iter()
            .filter(|root| root_has_permission(root, FilePermission::Read))
            .collect();

        let desired: HashSet<String> = read_roots.iter().map(|root| root.root_id.clone()).collect();
        self.roots.retain(|root_id, _| desired.contains(root_id));

        for root in read_roots {
            let canonical = canonicalize_path(Path::new(&root.canonical_path), true)?;
            if let Some(existing) = self.roots.get(&root.root_id) {
                if existing.canonical_path == canonical {
                    continue;
                }
            }

            self.roots.remove(&root.root_id);
            self.roots.insert(
                root.root_id.clone(),
                create_root_index(app_data, root, &canonical)?,
            );
        }

        Ok(())
    }

    fn rescan_root(&mut self, app_data: &Path, roots: &[FileAccessRootInput], root_id: &str) -> Result<(), String> {
        let root = roots
            .iter()
            .find(|entry| entry.root_id == root_id)
            .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
        if !root_has_permission(root, FilePermission::Read) {
            return Err("FILE_ACCESS_DENIED".to_string());
        }

        let canonical = canonicalize_path(Path::new(&root.canonical_path), true)?;
        self.roots.remove(root_id);
        self.roots.insert(
            root.root_id.clone(),
            create_root_index(app_data, root, &canonical)?,
        );
        Ok(())
    }

    fn has_root(&self, root_id: &str) -> bool {
        self.roots.contains_key(root_id)
    }

    fn wait_for_root(&self, root_id: &str) -> bool {
        let Some(index) = self.roots.get(root_id) else {
            return false;
        };
        index.shared_picker.wait_for_scan(SCAN_TIMEOUT)
    }

    fn with_picker<R>(
        &self,
        root_id: &str,
        callback: impl FnOnce(&FilePicker) -> R,
    ) -> Result<R, String> {
        let index = self
            .roots
            .get(root_id)
            .ok_or_else(|| "FILE_PATH_DENIED".to_string())?;
        let guard = index
            .shared_picker
            .read()
            .map_err(|error| error.to_string())?;
        let picker = guard
            .as_ref()
            .ok_or_else(|| "FILE_NOT_FOUND".to_string())?;
        Ok(callback(picker))
    }

    fn root_canonical(&self, root_id: &str) -> Option<PathBuf> {
        self.roots
            .get(root_id)
            .map(|entry| entry.canonical_path.clone())
    }
}

pub struct FileSearchState {
    manager: Mutex<FileSearchIndexManager>,
    app_data_dir: PathBuf,
}

impl FileSearchState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            manager: Mutex::new(FileSearchIndexManager::new()),
            app_data_dir,
        }
    }

    pub fn sync_roots(&self, roots: &[FileAccessRootInput]) -> Result<(), String> {
        let mut manager = self
            .manager
            .lock()
            .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        manager.sync_roots(&self.app_data_dir, roots)
    }

    pub fn rescan_root(&self, roots: &[FileAccessRootInput], root_id: &str) -> Result<(), String> {
        let mut manager = self
            .manager
            .lock()
            .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        manager.rescan_root(&self.app_data_dir, roots, root_id)
    }

    pub fn has_root(&self, root_id: &str) -> bool {
        self.manager
            .lock()
            .map(|manager| manager.has_root(root_id))
            .unwrap_or(false)
    }

    pub fn wait_for_root(&self, root_id: &str) -> bool {
        self.manager
            .lock()
            .map(|manager| manager.wait_for_root(root_id))
            .unwrap_or(false)
    }

    /// Ensures a read-root index exists (lazy sync) and waits for the initial scan.
    pub fn ensure_root_ready(
        &self,
        roots: &[FileAccessRootInput],
        root_id: &str,
    ) -> Result<(), String> {
        if !self.has_root(root_id) {
            self.sync_roots(roots)?;
        }
        if self.wait_for_root(root_id) {
            return Ok(());
        }
        if !self.has_root(root_id) {
            Err("FILE_PATH_DENIED".to_string())
        } else {
            Err("FILE_SEARCH_INDEX_TIMEOUT".to_string())
        }
    }

    pub fn with_picker<R>(
        &self,
        root_id: &str,
        callback: impl FnOnce(&FilePicker) -> R,
    ) -> Result<R, String> {
        let manager = self
            .manager
            .lock()
            .map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
        manager.with_picker(root_id, callback)
    }

    pub fn root_canonical(&self, root_id: &str) -> Option<PathBuf> {
        self.manager
            .lock()
            .ok()
            .and_then(|manager| manager.root_canonical(root_id))
    }
}

fn create_root_index(
    app_data: &Path,
    root: &FileAccessRootInput,
    canonical: &Path,
) -> Result<RootIndex, String> {
    let shared_picker = SharedFilePicker::default();
    let shared_frecency = SharedFrecency::default();

    let frecency_dir = app_data.join("fff").join(&root.root_id);
    std::fs::create_dir_all(&frecency_dir).map_err(|_| "FILE_ACCESS_DENIED".to_string())?;
    if let Ok(frecency) = FrecencyTracker::open(frecency_dir.join("frecency")) {
        let _ = shared_frecency.init(frecency);
    }

    FilePicker::new_with_shared_state(
        shared_picker.clone(),
        shared_frecency.clone(),
        FilePickerOptions {
            base_path: canonical.to_string_lossy().into_owned(),
            mode: FFFMode::Ai,
            watch: true,
            ..Default::default()
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(RootIndex {
        canonical_path: canonical.to_path_buf(),
        shared_picker,
        shared_frecency,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use uuid::Uuid;

    fn temp_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agodesk-{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read_root(dir: &Path) -> FileAccessRootInput {
        FileAccessRootInput {
            root_id: "test-root".to_string(),
            canonical_path: dir.to_string_lossy().into_owned(),
            permissions: vec!["read".to_string()],
        }
    }

    #[test]
    fn sync_roots_builds_index_for_read_root() {
        let temp = temp_dir("index-sync");
        let app_data = temp_dir("index-app-data");
        fs::write(temp.join("alpha.txt"), b"hello").unwrap();

        let mut manager = FileSearchIndexManager::new();
        manager
            .sync_roots(&app_data, &[read_root(&temp)])
            .unwrap();

        assert!(manager.roots.contains_key("test-root"));
        assert!(manager.wait_for_root("test-root"));
    }

    #[test]
    fn rescan_root_rebuilds_index() {
        let temp = temp_dir("index-rescan");
        let app_data = temp_dir("index-rescan-app-data");
        fs::write(temp.join("one.txt"), b"one").unwrap();

        let roots = vec![read_root(&temp)];
        let mut manager = FileSearchIndexManager::new();
        manager.sync_roots(&app_data, &roots).unwrap();
        assert!(manager.wait_for_root("test-root"));

        {
            let mut file = fs::File::create(temp.join("two.txt")).unwrap();
            writeln!(file, "two").unwrap();
        }

        manager.rescan_root(&app_data, &roots, "test-root").unwrap();
        assert!(manager.wait_for_root("test-root"));
    }

    #[test]
    fn sync_roots_drops_removed_root() {
        let temp = temp_dir("index-drop");
        let app_data = temp_dir("index-drop-app-data");
        let mut manager = FileSearchIndexManager::new();
        manager
            .sync_roots(&app_data, &[read_root(&temp)])
            .unwrap();
        manager.sync_roots(&app_data, &[]).unwrap();
        assert!(manager.roots.is_empty());
    }
}
