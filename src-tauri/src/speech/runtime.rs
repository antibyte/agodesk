//! Ensures sherpa-onnx shared libraries are discoverable at runtime (Windows).

#[cfg(all(windows, feature = "speech-asr"))]
mod imp {
    use std::fs;
    use std::path::{Path, PathBuf};

    const SHERPA_VERSION: &str = "1.13.2";
    const SHERPA_DLLS: &[&str] = &[
        "onnxruntime.dll",
        "onnxruntime_providers_shared.dll",
        "sherpa-onnx-c-api.dll",
        "sherpa-onnx-cxx-api.dll",
    ];

    pub fn init_sherpa_runtime() {
        let Some(exe_dir) = current_exe_dir() else {
            return;
        };

        let source_dirs = sherpa_dll_source_dirs(&exe_dir);
        copy_missing_dlls(&source_dirs, &exe_dir);
    }

    fn current_exe_dir() -> Option<PathBuf> {
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
    }

    fn sherpa_dll_source_dirs(exe_dir: &Path) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Ok(custom) = std::env::var("SHERPA_ONNX_LIB_DIR") {
            dirs.push(PathBuf::from(custom));
        }

        dirs.push(exe_dir.to_path_buf());

        let vendor_suffix = PathBuf::from(format!(
            "vendor/sherpa-onnx/v{SHERPA_VERSION}/win-x64-shared/sherpa-onnx-v{SHERPA_VERSION}-win-x64-shared-MT-Release-lib/lib"
        ));

        let mut cursor = Some(exe_dir.to_path_buf());
        for _ in 0..10 {
            let Some(dir) = cursor else {
                break;
            };
            let candidate = dir.join(&vendor_suffix);
            if candidate.is_dir() {
                dirs.push(candidate);
            }
            cursor = dir.parent().map(|parent| parent.to_path_buf());
        }

        dirs.sort();
        dirs.dedup();
        dirs
    }

    fn copy_missing_dlls(source_dirs: &[PathBuf], exe_dir: &Path) {
        for dll in SHERPA_DLLS {
            let dest = exe_dir.join(dll);
            if dest.exists() {
                continue;
            }
            for source_dir in source_dirs {
                let source = source_dir.join(dll);
                if source.is_file() {
                    match fs::copy(&source, &dest) {
                        Ok(_) => eprintln!("Copied sherpa runtime DLL: {}", dest.display()),
                        Err(error) => {
                            eprintln!("Failed to copy {}: {error}", dest.display());
                        }
                    }
                    break;
                }
            }
        }
    }
}

#[cfg(all(windows, feature = "speech-asr"))]
pub use imp::init_sherpa_runtime;

#[cfg(not(all(windows, feature = "speech-asr")))]
pub fn init_sherpa_runtime() {}
