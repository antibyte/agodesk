use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use bzip2::read::BzDecoder;
use serde::Serialize;
use tar::Archive;
use tauri::{AppHandle, Emitter};

use super::asr::{discover_asr_model, models_search_roots, register_models_search_root};
use tauri::Manager;

static DOWNLOAD_LOCK: Mutex<()> = Mutex::new(());

const EVENT: &str = "agodesk:speech-model-download";

#[derive(Debug, Clone, Serialize)]
pub struct ModelDownloadProgress {
    pub model_id: String,
    pub phase: String,
    pub progress: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

struct ModelSpec {
    model_id: &'static str,
    archive_name: &'static str,
    url: &'static str,
    extracted_dir: &'static str,
    target_dir: &'static str,
    archive_bytes_hint: u64,
}

fn spec_for(model_id: &str) -> Result<ModelSpec, String> {
    match super::asr::normalize_model_id(Some(model_id)).as_str() {
        "omnilingual_ctc_int8" => Ok(ModelSpec {
            model_id: "omnilingual_ctc_int8",
            archive_name: "sherpa-onnx-omnilingual-asr-300M-int8.tar.bz2",
            url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12.tar.bz2",
            extracted_dir: "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12",
            target_dir: "omnilingual-ctc-int8",
            archive_bytes_hint: 150_000_000,
        }),
        "whisper_small_de" => Ok(ModelSpec {
            model_id: "whisper_small_de",
            archive_name: "sherpa-onnx-whisper-small.tar.bz2",
            url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2",
            extracted_dir: "sherpa-onnx-whisper-small",
            target_dir: "whisper-small-de",
            archive_bytes_hint: 639_000_000,
        }),
        other => Err(format!("Unknown ASR model: {other}")),
    }
}

fn emit(app: &AppHandle, model_id: &str, phase: &str, progress: f64, message: Option<&str>) {
    let _ = app.emit(
        EVENT,
        ModelDownloadProgress {
            model_id: model_id.to_string(),
            phase: phase.to_string(),
            progress: progress.clamp(0.0, 100.0),
            message: message.map(str::to_string),
        },
    );
}

fn try_prepare_writable_dir(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".agodesk-write-test");
    match File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn download_root_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();

    if let Ok(custom) = std::env::var("AGODESK_SPEECH_MODELS") {
        candidates.push(PathBuf::from(custom));
    }

    for root in models_search_roots() {
        if !candidates.iter().any(|candidate| candidate == &root) {
            candidates.push(root);
        }
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("speech-models");
    if !candidates.iter().any(|candidate| candidate == &app_data) {
        candidates.push(app_data);
    }

    Ok(candidates)
}

fn ensure_models_root(app: &AppHandle) -> Result<PathBuf, String> {
    for root in models_search_roots() {
        if root.join("whisper-small-de").exists() || root.join("omnilingual-ctc-int8").exists() {
            return Ok(root);
        }
    }

    for root in download_root_candidates(app)? {
        if try_prepare_writable_dir(&root) {
            register_models_search_root(root.clone());
            return Ok(root);
        }
    }

    Err(
        "Kein beschreibbares Verzeichnis für Sprachmodelle gefunden. \
         Prüfe Schreibrechte oder setze AGODESK_SPEECH_MODELS."
            .to_string(),
    )
}

fn download_with_reqwest(
    url: &str,
    dest: &Path,
    total_hint: u64,
    app: &AppHandle,
    model_id: &str,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .use_native_tls()
        .build()
        .map_err(|error| error.to_string())?;

    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("Download failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(total_hint).max(1);
    let mut file = File::create(dest).map_err(|error| error.to_string())?;
    let mut downloaded = 0u64;
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("Download read failed: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        downloaded += read as u64;
        let pct = (downloaded as f64 / total as f64) * 88.0;
        emit(app, model_id, "downloading", pct, None);
    }

    Ok(())
}

#[cfg(windows)]
fn download_with_curl(
    url: &str,
    dest: &Path,
    total_hint: u64,
    app: &AppHandle,
    model_id: &str,
) -> Result<(), String> {
    let dest_str = dest.to_string_lossy();
    let status = Command::new("curl")
        .args([
            "-L",
            "--fail",
            "--ssl-no-revoke",
            "--retry",
            "3",
            "-o",
            &dest_str,
            url,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| format!("curl not available: {error}"))?;

    if !status.success() {
        return Err("curl download failed".to_string());
    }

    let meta = fs::metadata(dest).map_err(|error| error.to_string())?;
    let pct = (meta.len() as f64 / total_hint as f64) * 88.0;
    emit(app, model_id, "downloading", pct, None);
    Ok(())
}

#[cfg(not(windows))]
fn download_with_curl(
    _url: &str,
    _dest: &Path,
    _total_hint: u64,
    _app: &AppHandle,
    _model_id: &str,
) -> Result<(), String> {
    Err("curl fallback unavailable".to_string())
}

fn download_archive(
    url: &str,
    dest: &Path,
    total_hint: u64,
    app: &AppHandle,
    model_id: &str,
) -> Result<(), String> {
    emit(app, model_id, "downloading", 0.0, None);
    match download_with_reqwest(url, dest, total_hint, app, model_id) {
        Ok(()) => Ok(()),
        Err(reqwest_error) => {
            eprintln!("reqwest download failed ({reqwest_error}), trying curl…");
            if dest.exists() {
                let _ = fs::remove_file(dest);
            }
            download_with_curl(url, dest, total_hint, app, model_id)
        }
    }
}

fn extract_archive(archive_path: &Path, dest_root: &Path, app: &AppHandle, model_id: &str) -> Result<(), String> {
    emit(app, model_id, "extracting", 90.0, None);
    let file = File::open(archive_path).map_err(|error| error.to_string())?;
    let decoder = BzDecoder::new(file);
    let mut archive = Archive::new(decoder);
    archive
        .unpack(dest_root)
        .map_err(|error| format!("Extract failed: {error}"))?;
    emit(app, model_id, "extracting", 98.0, None);
    Ok(())
}

fn ctc_model_ready(dir: &Path) -> bool {
    dir.join("model.int8.onnx").is_file() && dir.join("tokens.txt").is_file()
}

fn whisper_model_ready(dir: &Path) -> bool {
    dir.join("small-encoder.int8.onnx").is_file()
        && dir.join("small-decoder.int8.onnx").is_file()
        && dir.join("small-tokens.txt").is_file()
}

fn dir_has_model(model_id: &str, dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    match model_id {
        "whisper_small_de" => whisper_model_ready(dir),
        _ => ctc_model_ready(dir),
    }
}

fn model_files_present(models_root: &Path, spec: &ModelSpec) -> bool {
    let target = models_root.join(spec.target_dir);
    let extracted = models_root.join(spec.extracted_dir);
    dir_has_model(spec.model_id, &target) || dir_has_model(spec.model_id, &extracted)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    if src == dst {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let dest_path = dst.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn remove_path_best_effort(path: &Path) {
    if !path.exists() {
        return;
    }
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    if let Err(error) = result {
        eprintln!("Cleanup skipped for {}: {error}", path.display());
    }
}

fn finalize_install(
    models_root: &Path,
    spec: &ModelSpec,
    archive_path: &Path,
) -> Result<(), String> {
    let extracted = models_root.join(spec.extracted_dir);
    let target = models_root.join(spec.target_dir);

    if dir_has_model(spec.model_id, &target) {
        if extracted.is_dir() && extracted != target {
            remove_path_best_effort(&extracted);
        }
        remove_path_best_effort(archive_path);
        return Ok(());
    }

    if !extracted.is_dir() {
        return Err(format!(
            "Expected extracted folder missing: {}",
            extracted.display()
        ));
    }

    if target.exists() {
        remove_path_best_effort(&target);
    }

    if fs::rename(&extracted, &target).is_err() {
        copy_dir_all(&extracted, &target)?;
        remove_path_best_effort(&extracted);
    }

    remove_path_best_effort(archive_path);

    if !dir_has_model(spec.model_id, &target) {
        return Err(format!(
            "Model files missing after install in {}",
            target.display()
        ));
    }

    Ok(())
}

fn model_ready(model_id: &str) -> bool {
    discover_asr_model(Some(model_id)).is_some()
}

pub fn download_asr_model(app: &AppHandle, model_id: &str) -> Result<(), String> {
    match download_asr_model_inner(app, model_id) {
        Ok(()) => Ok(()),
        Err(error) => {
            if model_ready(model_id) {
                #[cfg(feature = "speech-asr")]
                super::asr_sherpa::reset_recognizer_cache();
                emit(app, model_id, "complete", 100.0, None);
                return Ok(());
            }
            emit(app, model_id, "error", 0.0, Some(&error));
            Err(error)
        }
    }
}

fn download_asr_model_inner(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let _guard = DOWNLOAD_LOCK
        .lock()
        .map_err(|_| "Another model download is already running.".to_string())?;

    if model_ready(model_id) {
        emit(app, model_id, "complete", 100.0, None);
        return Ok(());
    }

    let spec = spec_for(model_id)?;
    let models_root = ensure_models_root(app)?;
    let archive_path = models_root.join(spec.archive_name);

    if !model_files_present(&models_root, &spec) {
        if !archive_path.exists() {
            download_archive(
                spec.url,
                &archive_path,
                spec.archive_bytes_hint,
                app,
                model_id,
            )?;
        } else {
            emit(app, model_id, "downloading", 88.0, None);
        }

        extract_archive(&archive_path, &models_root, app, model_id)?;
    } else {
        emit(app, model_id, "extracting", 95.0, None);
    }

    finalize_install(&models_root, &spec, &archive_path)?;

    if !model_ready(model_id) {
        return Err(format!(
            "Model files missing after install for {}",
            spec.target_dir
        ));
    }

    #[cfg(feature = "speech-asr")]
    super::asr_sherpa::reset_recognizer_cache();

    emit(app, model_id, "complete", 100.0, None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speech::asr::{parse_model_kind, AsrModelKind};

    #[test]
    fn specs_cover_both_models() {
        assert!(spec_for("omnilingual_ctc_int8").is_ok());
        assert!(spec_for("whisper_small_de").is_ok());
        assert!(parse_model_kind(Some("whisper_small_de")) == AsrModelKind::WhisperSmallDe);
        assert!(parse_model_kind(Some("sense_voice_int8")) == AsrModelKind::OmnilingualCtcInt8);
    }
}
