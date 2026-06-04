use crate::desktop::InputEvent;
use enigo::{
    Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};

pub fn inject_input_enigo(event: &InputEvent) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|error| error.to_string())?;
    let payload = event
        .payload
        .as_ref()
        .ok_or_else(|| format!("{} requires payload.", event.kind))?;

    match event.kind.as_str() {
        "mouse_move" => {
            let x = json_i32(payload, "x")?;
            let y = json_i32(payload, "y")?;
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|error| error.to_string())?;
        }
        "mouse_click" => {
            let x = json_i32(payload, "x")?;
            let y = json_i32(payload, "y")?;
            let button = map_mouse_button(
                payload
                    .get("button")
                    .and_then(|value| value.as_str())
                    .unwrap_or("left"),
            )?;
            let action = payload
                .get("action")
                .and_then(|value| value.as_str())
                .unwrap_or("click");
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|error| error.to_string())?;
            match action {
                "down" => enigo
                    .button(button, Direction::Press)
                    .map_err(|error| error.to_string())?,
                "up" => enigo
                    .button(button, Direction::Release)
                    .map_err(|error| error.to_string())?,
                "click" => enigo
                    .button(button, Direction::Click)
                    .map_err(|error| error.to_string())?,
                other => return Err(format!("Unsupported mouse action: {other}")),
            }
        }
        "mouse_scroll" => {
            if let (Some(x), Some(y)) = (
                payload.get("x").and_then(|value| value.as_i64()).map(|v| v as i32),
                payload.get("y").and_then(|value| value.as_i64()).map(|v| v as i32),
            ) {
                enigo
                    .move_mouse(x, y, Coordinate::Abs)
                    .map_err(|error| error.to_string())?;
            }
            // Support documented delta_x/delta_y (and camelCase fallbacks) from remote,
            // as well as legacy single "delta" + "direction".
            // Pass signed value directly to enigo.scroll (positive/negative controls direction per axis).
            let delta_x = payload
                .get("delta_x")
                .and_then(|value| value.as_i64())
                .or_else(|| payload.get("deltaX").and_then(|value| value.as_i64()))
                .map(|v| v as i32);
            let delta_y = payload
                .get("delta_y")
                .and_then(|value| value.as_i64())
                .or_else(|| payload.get("deltaY").and_then(|value| value.as_i64()))
                .map(|v| v as i32);
            let (scroll_amount, axis) = if let Some(dx) = delta_x {
                if dx != 0 {
                    (dx, Axis::Horizontal)
                } else if let Some(dy) = delta_y {
                    (dy, Axis::Vertical)
                } else {
                    (dx, Axis::Horizontal)
                }
            } else if let Some(dy) = delta_y {
                (dy, Axis::Vertical)
            } else {
                // legacy fallback
                let d = payload
                    .get("delta")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(120) as i32;
                let dir = payload
                    .get("direction")
                    .and_then(|value| value.as_str())
                    .unwrap_or(if d >= 0 { "up" } else { "down" });
                let ax = if dir == "left" || dir == "right" {
                    Axis::Horizontal
                } else {
                    Axis::Vertical
                };
                (d, ax)
            };
            enigo
                .scroll(scroll_amount, axis)
                .map_err(|error| error.to_string())?;
        }
        "mouse_drag" => {
            let from_x = json_i32(payload, "from_x")?;
            let from_y = json_i32(payload, "from_y")?;
            let to_x = json_i32(payload, "to_x")?;
            let to_y = json_i32(payload, "to_y")?;
            let button = map_mouse_button(
                payload
                    .get("button")
                    .and_then(|value| value.as_str())
                    .unwrap_or("left"),
            )?;
            enigo
                .move_mouse(from_x, from_y, Coordinate::Abs)
                .map_err(|error| error.to_string())?;
            enigo
                .button(button, Direction::Press)
                .map_err(|error| error.to_string())?;
            enigo
                .move_mouse(to_x, to_y, Coordinate::Abs)
                .map_err(|error| error.to_string())?;
            enigo
                .button(button, Direction::Release)
                .map_err(|error| error.to_string())?;
        }
        "key_down" | "key_up" => {
            let key = map_key(payload)?;
            let direction = if event.kind == "key_up" {
                Direction::Release
            } else {
                Direction::Press
            };
            enigo
                .key(key, direction)
                .map_err(|error| error.to_string())?;
        }
        "key_combo" => {
            let keys = payload
                .get("keys")
                .and_then(|value| value.as_array())
                .ok_or_else(|| "key_combo requires keys array.".to_string())?;
            let mapped = keys
                .iter()
                .filter_map(|value| value.as_str())
                .map(map_key_name)
                .collect::<Result<Vec<Key>, String>>()?;
            for key in &mapped {
                enigo
                    .key(*key, Direction::Press)
                    .map_err(|error| error.to_string())?;
            }
            for key in mapped.iter().rev() {
                enigo
                    .key(*key, Direction::Release)
                    .map_err(|error| error.to_string())?;
            }
        }
        "text" => {
            let text = payload
                .get("text")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "text payload requires text.".to_string())?;
            for ch in text.chars() {
                enigo
                    .key(Key::Unicode(ch), Direction::Click)
                    .map_err(|error| error.to_string())?;
            }
        }
        other => return Err(format!("Unsupported input kind: {other}")),
    }

    Ok(())
}

fn map_mouse_button(button: &str) -> Result<Button, String> {
    match button {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        other => Err(format!("Unsupported mouse button: {other}")),
    }
}

fn map_key(payload: &serde_json::Value) -> Result<Key, String> {
    if let Some(code) = payload.get("code").and_then(|value| value.as_u64()) {
        return Ok(Key::Other(code as u32));
    }
    let key = payload
        .get("key")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "key event requires key or code.".to_string())?;
    map_key_name(key)
}

fn map_key_name(key: &str) -> Result<Key, String> {
    let normalized = key.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "enter" | "return" => Ok(Key::Return),
        "escape" | "esc" => Ok(Key::Escape),
        "tab" => Ok(Key::Tab),
        "space" | " " => Ok(Key::Space),
        "backspace" => Ok(Key::Backspace),
        "arrowup" | "up" => Ok(Key::UpArrow),
        "arrowdown" | "down" => Ok(Key::DownArrow),
        "arrowleft" | "left" => Ok(Key::LeftArrow),
        "arrowright" | "right" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "shift" => Ok(Key::Shift),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "meta" | "win" | "os" => Ok(Key::Meta),
        single if single.len() == 1 => {
            let ch = single.chars().next().unwrap();
            Ok(Key::Unicode(ch))
        }
        _ => Err(format!("Unsupported key: {key}")),
    }
}

fn json_i32(payload: &serde_json::Value, field: &str) -> Result<i32, String> {
    payload
        .get(field)
        .and_then(|value| value.as_i64())
        .ok_or_else(|| format!("Missing or invalid `{field}`."))
        .map(|value| value as i32)
}
