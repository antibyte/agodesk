use super::super::types::{
    CaptureResult, CaptureScreenOptions, DisplayInfo, InputEvent, WindowInfo,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, ExtendedColorType, ImageEncoder};
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors,
    GetDC, GetDIBits, GetMonitorInfoW, MonitorFromWindow, ReleaseDC, SelectObject, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HMONITOR, MONITORINFOEXW,
    MONITOR_DEFAULTTONEAREST, SRCCOPY, HGDIOBJ,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY, VK_BACK, VK_DOWN, VK_END,
    VK_ESCAPE, VK_HOME, VK_LEFT, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SPACE, VK_TAB, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetSystemMetrics, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, IsWindowVisible, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN,
};

struct RawMonitor {
    handle: HMONITOR,
    device: String,
    rect: RECT,
    primary: bool,
}

struct WindowEnumState<'a> {
    displays: &'a [DisplayInfo],
    collected: &'a mut Vec<WindowInfo>,
}

pub fn screen_capture_available() -> bool {
    true
}

pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    let mut raw_monitors: Vec<RawMonitor> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor_proc),
            LPARAM(&mut raw_monitors as *mut _ as isize),
        );
    }

    raw_monitors.sort_by(|left, right| {
        (left.rect.top, left.rect.left).cmp(&(right.rect.top, right.rect.left))
    });

    Ok(raw_monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let width = (monitor.rect.right - monitor.rect.left).max(0) as u32;
            let height = (monitor.rect.bottom - monitor.rect.top).max(0) as u32;
            DisplayInfo {
                id: format!("display-{index}"),
                index: index as u32,
                name: monitor.device,
                width,
                height,
                x: monitor.rect.left,
                y: monitor.rect.top,
                primary: monitor.primary,
                scale_factor: monitor_scale_factor(monitor.handle),
            }
        })
        .collect())
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let displays = list_displays()?;
    let mut windows: Vec<WindowInfo> = Vec::new();
    let mut state = WindowEnumState {
        displays: &displays,
        collected: &mut windows,
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_window_proc),
            LPARAM(&mut state as *mut _ as isize),
        );
    }

    windows.sort_by(|left, right| {
        left.monitor_index
            .cmp(&right.monitor_index)
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(windows)
}

pub fn capture_screen(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    if options.window_id.is_some() {
        capture_window(options)
    } else {
        capture_display(options)
    }
}

pub fn inject_input(event: InputEvent) -> Result<(), String> {
    if event.kind.is_empty() {
        return Err("Missing input event kind.".to_string());
    }

    match event.kind.as_str() {
        "mouse_move" => inject_mouse_move(&event),
        "mouse_click" => inject_mouse_click(&event),
        "key_down" => inject_key(&event, false),
        "key_up" => inject_key(&event, true),
        "text" => inject_text(&event),
        other => Err(format!("Unsupported input kind: {other}")),
    }
}

unsafe extern "system" fn collect_monitor_proc(
    monitor: HMONITOR,
    _: HDC,
    _: *mut RECT,
    state: LPARAM,
) -> BOOL {
    let monitors = &mut *(state.0 as *mut Vec<RawMonitor>);
    let mut info: MONITORINFOEXW = zeroed();
    info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
    if !GetMonitorInfoW(monitor, &mut info.monitorInfo).as_bool() {
        return TRUE;
    }

    monitors.push(RawMonitor {
        handle: monitor,
        device: wide_to_string(&info.szDevice),
        rect: info.monitorInfo.rcMonitor,
        primary: info.monitorInfo.dwFlags & 1 != 0,
    });
    TRUE
}

unsafe extern "system" fn enum_window_proc(window: HWND, state: LPARAM) -> BOOL {
    let ctx = &mut *(state.0 as *mut WindowEnumState);
    if !IsWindowVisible(window).as_bool() {
        return TRUE;
    }

    let title_len = GetWindowTextLengthW(window);
    if title_len <= 0 {
        return TRUE;
    }

    let mut title_buf = vec![0u16; (title_len + 1) as usize];
    let read = GetWindowTextW(window, &mut title_buf);
    if read <= 0 {
        return TRUE;
    }

    let mut class_buf = [0u16; 256];
    let class_len = GetClassNameW(window, &mut class_buf);
    if class_len <= 0 {
        return TRUE;
    }

    let mut rect = RECT::default();
    if GetWindowRect(window, &mut rect).is_err() {
        return TRUE;
    }

    let width = (rect.right - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top).max(0) as u32;
    if width == 0 || height == 0 {
        return TRUE;
    }

    let (display_id, display_name, monitor_index) =
        display_for_window(window, &rect, ctx.displays).unwrap_or_else(|| {
            (
                "display-unknown".to_string(),
                "Unknown".to_string(),
                u32::MAX,
            )
        });

    ctx.collected.push(WindowInfo {
        id: window_id_from_hwnd(window),
        title: wide_to_string(&title_buf),
        class_name: wide_to_string(&class_buf[..class_len as usize + 1]),
        width,
        height,
        x: rect.left,
        y: rect.top,
        visible: true,
        display_id,
        display_name,
        monitor_index,
    });
    TRUE
}

fn monitor_scale_factor(monitor: HMONITOR) -> f64 {
    unsafe {
        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        if GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_ok() {
            return dpi_x as f64 / 96.0;
        }
    }
    1.0
}

fn display_for_window(
    hwnd: HWND,
    rect: &RECT,
    displays: &[DisplayInfo],
) -> Option<(String, String, u32)> {
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFOEXW = zeroed();
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(monitor, &mut info.monitorInfo).as_bool() {
            let device = wide_to_string(&info.szDevice);
            let monitor_rect = info.monitorInfo.rcMonitor;
            if let Some(display) = find_display(displays, &device, &monitor_rect) {
                return Some((
                    display.id.clone(),
                    display.name.clone(),
                    display.index,
                ));
            }
        }
    }

    display_for_rect(displays, rect)
}

fn find_display<'a>(
    displays: &'a [DisplayInfo],
    device: &str,
    rect: &RECT,
) -> Option<&'a DisplayInfo> {
    displays
        .iter()
        .find(|display| display.name == device)
        .or_else(|| {
            displays.iter().find(|display| {
                display.x == rect.left
                    && display.y == rect.top
                    && display.width == (rect.right - rect.left).max(0) as u32
                    && display.height == (rect.bottom - rect.top).max(0) as u32
            })
        })
}

fn display_for_rect(displays: &[DisplayInfo], rect: &RECT) -> Option<(String, String, u32)> {
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    displays
        .iter()
        .find(|display| point_in_display(center_x, center_y, display))
        .map(|display| (display.id.clone(), display.name.clone(), display.index))
}

fn point_in_display(x: i32, y: i32, display: &DisplayInfo) -> bool {
    x >= display.x
        && x < display.x + display.width as i32
        && y >= display.y
        && y < display.y + display.height as i32
}

fn capture_display(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    let displays = list_displays()?;
    if displays.is_empty() {
        return Err("No displays found.".to_string());
    }

    let requested = options.display_id.as_deref();
    let display = if let Some(id) = requested {
        displays
            .iter()
            .find(|display| display.id == id)
            .ok_or_else(|| {
                let available = displays
                    .iter()
                    .map(|display| display.id.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("Unknown display_id: {id}. Available: {available}")
            })?
    } else {
        displays
            .iter()
            .find(|display| display.primary)
            .unwrap_or(&displays[0])
    };

    let width = display.width as i32;
    let height = display.height as i32;
    if width <= 0 || height <= 0 {
        return Err("Display dimensions are invalid.".to_string());
    }

    unsafe {
        let screen_dc = GetDC(HWND::default());
        if screen_dc.is_invalid() {
            return Err("Failed to acquire screen device context.".to_string());
        }

        let result = capture_from_bitblt(
            screen_dc,
            display.x,
            display.y,
            width,
            height,
            &options,
            "display",
            Some(display.id.clone()),
            None,
            display.scale_factor,
        );
        ReleaseDC(HWND::default(), screen_dc);
        result
    }
}

fn capture_window(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    let window_id = options
        .window_id
        .as_deref()
        .ok_or_else(|| "window_id is required for window capture.".to_string())?;
    let hwnd = hwnd_from_id(window_id)?;
    let displays = list_displays()?;

    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return Err("Target window is not visible.".to_string());
        }

        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
        let width = (rect.right - rect.left).max(0) as i32;
        let height = (rect.bottom - rect.top).max(0) as i32;
        if width <= 0 || height <= 0 {
            return Err("Target window has invalid dimensions.".to_string());
        }

        let (display_id, scale_factor) = display_for_window(hwnd, &rect, &displays)
            .map(|(id, _, _)| {
                let scale = displays
                    .iter()
                    .find(|display| display.id == id)
                    .map(|display| display.scale_factor)
                    .unwrap_or(1.0);
                (Some(id), scale)
            })
            .unwrap_or((None, 1.0));

        let screen_dc = GetDC(HWND::default());
        if screen_dc.is_invalid() {
            return Err("Failed to acquire screen device context.".to_string());
        }

        let result = capture_from_bitblt(
            screen_dc,
            rect.left,
            rect.top,
            width,
            height,
            &options,
            "window",
            display_id,
            Some(window_id.to_string()),
            scale_factor,
        );
        ReleaseDC(HWND::default(), screen_dc);
        result
    }
}

unsafe fn capture_from_bitblt(
    source_dc: HDC,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    options: &CaptureScreenOptions,
    source: &str,
    display_id: Option<String>,
    window_id: Option<String>,
    scale_factor: f64,
) -> Result<CaptureResult, String> {
    let memory_dc = CreateCompatibleDC(source_dc);
    if memory_dc.is_invalid() {
        return Err("Failed to create compatible device context.".to_string());
    }

    let bitmap = CreateCompatibleBitmap(source_dc, width, height);
    if bitmap.is_invalid() {
        let _ = DeleteDC(memory_dc);
        return Err("Failed to create compatible bitmap.".to_string());
    }

    let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
    if BitBlt(memory_dc, 0, 0, width, height, source_dc, x, y, SRCCOPY).is_err() {
        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        return Err("BitBlt screen capture failed.".to_string());
    }

    let result = encode_dc_bitmap(
        memory_dc,
        bitmap,
        width,
        height,
        options,
        source,
        display_id,
        window_id,
        scale_factor,
    );

    let _ = SelectObject(memory_dc, previous);
    let _ = DeleteObject(HGDIOBJ(bitmap.0));
    let _ = DeleteDC(memory_dc);
    result
}

unsafe fn encode_dc_bitmap(
    dc: HDC,
    bitmap: HBITMAP,
    width: i32,
    height: i32,
    options: &CaptureScreenOptions,
    source: &str,
    display_id: Option<String>,
    window_id: Option<String>,
    scale_factor: f64,
) -> Result<CaptureResult, String> {
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let byte_len = (width * height * 4) as usize;
    let mut pixels = vec![0u8; byte_len];
    let lines = GetDIBits(
        dc,
        bitmap,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    if lines == 0 {
        return Err("Failed to read bitmap pixels.".to_string());
    }

    let encoded = encode_pixels(&pixels, width as u32, height as u32, options)?;
    Ok(CaptureResult {
        source: source.to_string(),
        display_id,
        window_id,
        format: encoded.format,
        width: width as u32,
        height: height as u32,
        scale_factor,
        mime: encoded.mime,
        data_base64: encoded.data_base64,
    })
}

struct EncodedImage {
    format: String,
    mime: String,
    data_base64: String,
}

fn encode_pixels(
    bgra: &[u8],
    width: u32,
    height: u32,
    options: &CaptureScreenOptions,
) -> Result<EncodedImage, String> {
    let mut rgba = Vec::with_capacity(bgra.len());
    for chunk in bgra.chunks_exact(4) {
        rgba.push(chunk[2]);
        rgba.push(chunk[1]);
        rgba.push(chunk[0]);
        rgba.push(chunk[3]);
    }

    let format = options
        .format
        .as_deref()
        .unwrap_or("png")
        .to_ascii_lowercase();

    match format.as_str() {
        "jpeg" | "jpg" => {
            let quality = options.quality.unwrap_or(80).clamp(1, 100);
            let mut buffer = Vec::new();
            let encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
            encoder
                .write_image(&rgba, width, height, ExtendedColorType::Rgba8)
                .map_err(|error| error.to_string())?;
            Ok(EncodedImage {
                format: "jpeg".to_string(),
                mime: "image/jpeg".to_string(),
                data_base64: STANDARD.encode(buffer),
            })
        }
        "png" => {
            let mut buffer = Vec::new();
            image::codecs::png::PngEncoder::new(&mut buffer)
                .write_image(&rgba, width, height, ExtendedColorType::Rgba8)
                .map_err(|error| error.to_string())?;
            Ok(EncodedImage {
                format: "png".to_string(),
                mime: "image/png".to_string(),
                data_base64: STANDARD.encode(buffer),
            })
        }
        other => Err(format!("Unsupported capture format: {other}")),
    }
}

fn inject_mouse_move(event: &InputEvent) -> Result<(), String> {
    let payload = event.payload.as_ref().ok_or_else(|| "mouse_move requires payload.".to_string())?;
    let x = json_i32(payload, "x")?;
    let y = json_i32(payload, "y")?;
    let absolute = payload
        .get("absolute")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);

    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: if absolute { absolute_x(x)? } else { x },
                dy: if absolute { absolute_y(y)? } else { y },
                dwFlags: if absolute {
                    MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE
                } else {
                    MOUSEEVENTF_MOVE
                },
                ..Default::default()
            },
        },
    };
    send_inputs(&[input])
}

fn inject_mouse_click(event: &InputEvent) -> Result<(), String> {
    let payload = event
        .payload
        .as_ref()
        .ok_or_else(|| "mouse_click requires payload.".to_string())?;
    let x = json_i32(payload, "x")?;
    let y = json_i32(payload, "y")?;
    let button = payload
        .get("button")
        .and_then(|value| value.as_str())
        .unwrap_or("left");
    let action = payload
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("click");

    let mut sequence = Vec::new();
    sequence.push(build_mouse_move(x, y)?);

    let (down_flag, up_flag) = mouse_button_flags(button)?;
    match action {
        "down" => sequence.push(build_mouse_button(down_flag)),
        "up" => sequence.push(build_mouse_button(up_flag)),
        "click" => {
            sequence.push(build_mouse_button(down_flag));
            sequence.push(build_mouse_button(up_flag));
        }
        other => return Err(format!("Unsupported mouse action: {other}")),
    }

    send_inputs(&sequence)
}

fn inject_key(event: &InputEvent, key_up: bool) -> Result<(), String> {
    let payload = event
        .payload
        .as_ref()
        .ok_or_else(|| "key event requires payload.".to_string())?;
    let vk = resolve_virtual_key(payload)?;
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                dwFlags: if key_up { KEYEVENTF_KEYUP } else { Default::default() },
                ..Default::default()
            },
        },
    };
    send_inputs(&[input])
}

fn inject_text(event: &InputEvent) -> Result<(), String> {
    let payload = event
        .payload
        .as_ref()
        .ok_or_else(|| "text event requires payload.".to_string())?;
    let text = payload
        .get("text")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "text payload requires text.".to_string())?;

    let mut inputs = Vec::new();
    for unit in text.encode_utf16() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    ..Default::default()
                },
            },
        });
    }
    send_inputs(&inputs)
}

fn build_mouse_move(x: i32, y: i32) -> Result<INPUT, String> {
    Ok(INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: absolute_x(x)?,
                dy: absolute_y(y)?,
                dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                ..Default::default()
            },
        },
    })
}

fn build_mouse_button(flag: MOUSE_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: flag,
                ..Default::default()
            },
        },
    }
}

fn mouse_button_flags(button: &str) -> Result<(MOUSE_EVENT_FLAGS, MOUSE_EVENT_FLAGS), String> {
    match button {
        "left" => Ok((MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)),
        "right" => Ok((MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)),
        "middle" => Ok((MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP)),
        other => Err(format!("Unsupported mouse button: {other}")),
    }
}

fn send_inputs(inputs: &[INPUT]) -> Result<(), String> {
    if inputs.is_empty() {
        return Ok(());
    }
    unsafe {
        let sent = SendInput(inputs, size_of::<INPUT>() as i32);
        if sent == 0 {
            return Err("SendInput failed.".to_string());
        }
    }
    Ok(())
}

fn absolute_x(x: i32) -> Result<i32, String> {
    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(1);
    Ok((((x - left) as i64 * 65_535) / width as i64) as i32)
}

fn absolute_y(y: i32) -> Result<i32, String> {
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(1);
    Ok((((y - top) as i64 * 65_535) / height as i64) as i32)
}

fn resolve_virtual_key(payload: &serde_json::Value) -> Result<VIRTUAL_KEY, String> {
    if let Some(code) = payload.get("code").and_then(|value| value.as_u64()) {
        return Ok(VIRTUAL_KEY(code as u16));
    }

    let key = payload
        .get("key")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "key event requires key or code.".to_string())?;

    map_key_name(key).ok_or_else(|| format!("Unsupported key: {key}"))
}

fn map_key_name(key: &str) -> Option<VIRTUAL_KEY> {
    let normalized = key.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "enter" | "return" => Some(VK_RETURN),
        "escape" | "esc" => Some(VK_ESCAPE),
        "tab" => Some(VK_TAB),
        "space" | " " => Some(VK_SPACE),
        "backspace" => Some(VK_BACK),
        "arrowup" | "up" => Some(VK_UP),
        "arrowdown" | "down" => Some(VK_DOWN),
        "arrowleft" | "left" => Some(VK_LEFT),
        "arrowright" | "right" => Some(VK_RIGHT),
        "home" => Some(VK_HOME),
        "end" => Some(VK_END),
        "pageup" => Some(VK_PRIOR),
        "pagedown" => Some(VK_NEXT),
        single if single.len() == 1 => {
            let ch = single.chars().next()?;
            if ch.is_ascii_alphanumeric() {
                Some(VIRTUAL_KEY(ch.to_ascii_uppercase() as u16))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn json_i32(payload: &serde_json::Value, field: &str) -> Result<i32, String> {
    payload
        .get(field)
        .and_then(|value| value.as_i64())
        .ok_or_else(|| format!("Missing or invalid `{field}`."))
        .map(|value| value as i32)
}

fn wide_to_string(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|&unit| unit == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

fn window_id_from_hwnd(hwnd: HWND) -> String {
    format!("win-{}", hwnd.0 as isize)
}

fn hwnd_from_id(window_id: &str) -> Result<HWND, String> {
    let raw = window_id
        .strip_prefix("win-")
        .ok_or_else(|| format!("Invalid window_id format: {window_id}"))?;
    let handle = raw
        .parse::<isize>()
        .map_err(|_| format!("Invalid window_id handle: {window_id}"))?;
    Ok(HWND(handle as *mut c_void))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_keys() {
        assert_eq!(map_key_name("enter"), Some(VK_RETURN));
        assert_eq!(map_key_name("a"), Some(VIRTUAL_KEY(b'A' as u16)));
    }

    #[test]
    fn parses_window_ids() {
        assert_eq!(hwnd_from_id("win-123").unwrap().0, 123 as *mut c_void);
    }

    #[test]
    fn resolves_display_from_rect_center() {
        let displays = vec![
            DisplayInfo {
                id: "display-0".to_string(),
                index: 0,
                name: "Left".to_string(),
                width: 1920,
                height: 1080,
                x: 0,
                y: 0,
                primary: true,
                scale_factor: 1.0,
            },
            DisplayInfo {
                id: "display-1".to_string(),
                index: 1,
                name: "Right".to_string(),
                width: 1920,
                height: 1080,
                x: 1920,
                y: 0,
                primary: false,
                scale_factor: 1.0,
            },
        ];

        let rect = RECT {
            left: 2000,
            top: 100,
            right: 2600,
            bottom: 700,
        };

        let resolved = display_for_rect(&displays, &rect).expect("display");
        assert_eq!(resolved.0, "display-1");
        assert_eq!(resolved.2, 1);
    }

    #[test]
    fn point_in_display_respects_bounds() {
        let display = DisplayInfo {
            id: "display-0".to_string(),
            index: 0,
            name: "Main".to_string(),
            width: 100,
            height: 100,
            x: 10,
            y: 20,
            primary: true,
            scale_factor: 1.0,
        };
        assert!(point_in_display(50, 50, &display));
        assert!(!point_in_display(5, 50, &display));
    }
}
