use std::path::PathBuf;
use std::process::Command;

use super::endpoint::BROWSER_UNAVAILABLE;

pub fn browser_profile_dir() -> PathBuf {
    #[cfg(windows)]
    {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        return PathBuf::from(base).join("agodesk").join("browser-profile");
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("agodesk")
                .join("browser-profile");
        }
        PathBuf::from(".agodesk/browser-profile")
    }
}

pub fn find_browser_binary() -> Option<PathBuf> {
    for candidate in browser_binary_candidates() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn browser_binary_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(windows)]
    {
        if let Ok(pf) = std::env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(&pf)
                    .join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
            candidates.push(
                PathBuf::from(&pf)
                    .join("Microsoft")
                    .join("Edge")
                    .join("Application")
                    .join("msedge.exe"),
            );
        }
        if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
            candidates.push(
                PathBuf::from(&pf86)
                    .join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
            candidates.push(
                PathBuf::from(&pf86)
                    .join("Microsoft")
                    .join("Edge")
                    .join("Application")
                    .join("msedge.exe"),
            );
        }
    }

    #[cfg(target_os = "linux")]
    {
        for name in [
            "google-chrome-stable",
            "google-chrome",
            "chromium-browser",
            "chromium",
            "microsoft-edge",
        ] {
            if let Some(path) = which_in_path(name) {
                candidates.push(path);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.extend(macos_browser_candidates());
    }

    candidates
}

#[cfg(target_os = "macos")]
fn macos_browser_candidates() -> Vec<PathBuf> {
    const APP_BUNDLES: &[&str] = &[
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];

    let mut candidates: Vec<PathBuf> = APP_BUNDLES.iter().map(PathBuf::from).collect();

    if let Ok(home) = std::env::var("HOME") {
        let home_apps = PathBuf::from(&home).join("Applications");
        for bundle in [
            "Google Chrome.app/Contents/MacOS/Google Chrome",
            "Chromium.app/Contents/MacOS/Chromium",
            "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "Brave Browser.app/Contents/MacOS/Brave Browser",
        ] {
            candidates.push(home_apps.join(bundle));
        }
    }

    candidates
}

#[cfg(target_os = "linux")]
fn which_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn spawn_browser(port: u16, start_url: Option<&str>) -> Result<(PathBuf, std::process::Child), String> {
    let binary = find_browser_binary().ok_or_else(|| {
        format!("{BROWSER_UNAVAILABLE}: Chrome or Edge binary not found on this system.")
    })?;
    let profile = browser_profile_dir();
    std::fs::create_dir_all(&profile).map_err(|error| {
        format!("{BROWSER_UNAVAILABLE}: Failed to create browser profile dir: {error}")
    })?;

    let mut command = Command::new(&binary);
    command
        .arg(format!("--remote-debugging-port={port}"))
        .arg("--remote-debugging-address=127.0.0.1")
        .arg(format!(
            "--user-data-dir={}",
            profile.to_string_lossy().as_ref()
        ))
        .arg("--no-first-run")
        .arg("--no-default-browser-check");

    if let Some(url) = start_url.filter(|value| !value.trim().is_empty()) {
        command.arg(url);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("{BROWSER_UNAVAILABLE}: Failed to launch browser: {error}"))?;

    Ok((binary, child))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_dir_is_under_agodesk() {
        let dir = browser_profile_dir();
        let joined = dir.to_string_lossy();
        assert!(joined.contains("agodesk"));
        assert!(joined.contains("browser-profile"));
    }

    #[test]
    fn windows_chrome_candidate_paths() {
        #[cfg(windows)]
        {
            let candidates = browser_binary_candidates();
            assert!(
                candidates
                    .iter()
                    .any(|path| path.to_string_lossy().contains("Chrome")),
                "expected a Chrome candidate path"
            );
        }
    }

    #[test]
    fn macos_browser_candidate_paths() {
        #[cfg(target_os = "macos")]
        {
            let candidates = browser_binary_candidates();
            assert!(
                candidates
                    .iter()
                    .any(|path| path.to_string_lossy().contains("Google Chrome")),
                "expected a Chrome candidate path"
            );
            assert!(
                candidates
                    .iter()
                    .any(|path| path.to_string_lossy().contains("Chromium")),
                "expected a Chromium candidate path"
            );
        }
    }
}
