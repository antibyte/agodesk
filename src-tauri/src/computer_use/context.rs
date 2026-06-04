use super::types::ActiveWindowInfo;
use crate::desktop::{list_displays, list_windows};

pub fn get_active_window() -> Result<ActiveWindowInfo, String> {
    let active = active_win_pos_rs::get_active_window()
        .map_err(|_| "Failed to read active window.".to_string())?;

    let title = active.title.trim().to_string();
    let process_path = active
        .process_path
        .to_str()
        .unwrap_or("")
        .to_string();
    let process_name = active
        .app_name
        .trim()
        .to_string()
        .if_empty_then(|| {
            std::path::Path::new(&process_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

    let x = active.position.x as i32;
    let y = active.position.y as i32;
    let width = active.position.width.max(0.0) as u32;
    let height = active.position.height.max(0.0) as u32;

    let windows = list_windows().unwrap_or_default();
    let matched = windows.iter().find(|window| {
        window.title == title
            && (width == 0 || window.width == width)
            && (height == 0 || window.height == height)
    });

    let id = matched
        .map(|window| window.id.clone())
        .unwrap_or_else(|| format!("active-{}", hash_label(&title)));

    let display_id = matched
        .map(|window| window.display_id.clone())
        .unwrap_or_else(|| resolve_display_id(x, y, width, height));

    Ok(ActiveWindowInfo {
        id,
        title: if title.is_empty() {
            "Untitled".to_string()
        } else {
            title
        },
        process_name,
        process_path,
        x: matched.map(|window| window.x).unwrap_or(x),
        y: matched.map(|window| window.y).unwrap_or(y),
        width: matched.map(|window| window.width).unwrap_or(width),
        height: matched.map(|window| window.height).unwrap_or(height),
        display_id,
    })
}

fn resolve_display_id(x: i32, y: i32, width: u32, height: u32) -> String {
    let center_x = x + (width as i32 / 2);
    let center_y = y + (height as i32 / 2);
    if let Ok(displays) = list_displays() {
        for display in &displays {
            if center_x >= display.x
                && center_x < display.x + display.width as i32
                && center_y >= display.y
                && center_y < display.y + display.height as i32
            {
                return display.id.clone();
            }
        }
        if let Some(primary) = displays.iter().find(|display| display.primary) {
            return primary.id.clone();
        }
        if let Some(first) = displays.first() {
            return first.id.clone();
        }
    }
    "display-unknown".to_string()
}

fn hash_label(label: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(label.as_bytes());
    hex::encode(&digest[..6])
}

trait IfEmpty {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String;
}

impl IfEmpty for String {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String {
        if self.is_empty() {
            fallback()
        } else {
            self
        }
    }
}

#[cfg(test)]
mod tests {
    use super::hash_label;

    #[test]
    fn hash_label_is_stable() {
        assert_eq!(hash_label("VS Code"), hash_label("VS Code"));
    }
}
