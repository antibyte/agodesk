use super::super::types::{
    CaptureResult, CaptureScreenOptions, DisplayInfo, InputEvent, WindowInfo,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{
    codecs::jpeg::JpegEncoder, codecs::png::PngEncoder, imageops::FilterType, ExtendedColorType,
    ImageBuffer, ImageEncoder, Rgb,
};

/// JPEG-Rohdaten vor Base64 — Screenshots werden zusätzlich auf max. Kantenlänge skaliert.
const WS_CAPTURE_MAX_LONG_EDGE: u32 = 1280;
const WS_CAPTURE_MAX_JPEG_BYTES: usize = 180_000;
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use windows::Win32::Foundation::{GetLastError, BOOL, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors,
    GetDC, GetDIBits, GetMonitorInfoW, MonitorFromWindow, ReleaseDC, SelectObject, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HMONITOR, MONITORINFOEXW,
    MONITOR_DEFAULTTONEAREST, SRCCOPY, HGDIOBJ,
};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, IsWindowVisible,
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

pub fn input_injection_available() -> bool {
    true
}

pub fn ui_automation_available() -> bool {
    crate::computer_use::platform::ui_automation_available()
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
    crate::computer_use::input::inject_input_enigo(&event)
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

fn get_window_rect_visual(hwnd: HWND) -> Result<RECT, String> {
    let mut rect = RECT::default();
    unsafe {
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut _,
            size_of::<RECT>() as u32,
        )
        .is_ok()
        {
            Ok(rect)
        } else {
            GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
            Ok(rect)
        }
    }
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

    let rect = match get_window_rect_visual(window) {
        Ok(r) => r,
        Err(_) => return TRUE,
    };

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
        class_name: wide_to_string(&class_buf[..class_len as usize]),
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

        let rect = get_window_rect_visual(hwnd)?;
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

fn win32_error_message(context: &str) -> String {
    unsafe {
        let code = GetLastError();
        if code.0 == 0 {
            return context.to_string();
        }
        format!("{context} (Win32 error {})", code.0)
    }
}

#[allow(clippy::too_many_arguments)]
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
        return Err(win32_error_message(
            "Failed to create compatible device context.",
        ));
    }

    let bitmap = CreateCompatibleBitmap(source_dc, width, height);
    if bitmap.is_invalid() {
        let _ = DeleteDC(memory_dc);
        return Err(win32_error_message(
            "Failed to create compatible bitmap.",
        ));
    }

    let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
    if BitBlt(memory_dc, 0, 0, width, height, source_dc, x, y, SRCCOPY).is_err() {
        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        return Err(win32_error_message("BitBlt screen capture failed."));
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

#[allow(clippy::too_many_arguments)]
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

fn bgra_to_rgb_image(
    bgra: &[u8],
    width: u32,
    height: u32,
) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>, String> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "Invalid capture dimensions.".to_string())?;
    if bgra.len() != expected {
        return Err(format!(
            "Unexpected pixel buffer size: got {}, expected {expected}",
            bgra.len()
        ));
    }

    let pixel_count = (width as usize) * (height as usize);
    let mut rgb = Vec::with_capacity(pixel_count * 3);
    for chunk in bgra.chunks_exact(4) {
        rgb.push(chunk[2]);
        rgb.push(chunk[1]);
        rgb.push(chunk[0]);
    }

    ImageBuffer::from_raw(width, height, rgb)
        .ok_or_else(|| "Failed to build RGB image.".to_string())
}

fn resize_for_ws_transport(
    image: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    width: u32,
    height: u32,
) -> (ImageBuffer<Rgb<u8>, Vec<u8>>, u32, u32) {
    let max_edge = width.max(height);
    if max_edge <= WS_CAPTURE_MAX_LONG_EDGE {
        return (image.clone(), width, height);
    }

    let scale = WS_CAPTURE_MAX_LONG_EDGE as f32 / max_edge as f32;
    let new_w = ((width as f32 * scale).round() as u32).max(1);
    let new_h = ((height as f32 * scale).round() as u32).max(1);
    let resized = image::imageops::resize(image, new_w, new_h, FilterType::Triangle);
    (resized, new_w, new_h)
}

fn encode_jpeg_rgb(
    rgb: &[u8],
    width: u32,
    height: u32,
    mut quality: u8,
) -> Result<EncodedImage, String> {
    quality = quality.clamp(40, 90);
    loop {
        let mut buffer = Vec::new();
        let encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
        encoder
            .write_image(rgb, width, height, ExtendedColorType::Rgb8)
            .map_err(|error| format!("JPEG encode failed: {error}"))?;
        if buffer.len() <= WS_CAPTURE_MAX_JPEG_BYTES || quality <= 40 {
            return Ok(EncodedImage {
                format: "jpeg".to_string(),
                mime: "image/jpeg".to_string(),
                data_base64: STANDARD.encode(buffer),
            });
        }
        quality = quality.saturating_sub(10);
    }
}

fn encode_png_rgb(rgb: &[u8], width: u32, height: u32) -> Result<EncodedImage, String> {
    let mut buffer = Vec::new();
    PngEncoder::new(&mut buffer)
        .write_image(rgb, width, height, ExtendedColorType::Rgb8)
        .map_err(|error| format!("PNG encode failed: {error}"))?;
    Ok(EncodedImage {
        format: "png".to_string(),
        mime: "image/png".to_string(),
        data_base64: STANDARD.encode(buffer),
    })
}

fn encode_pixels(
    bgra: &[u8],
    width: u32,
    height: u32,
    options: &CaptureScreenOptions,
) -> Result<EncodedImage, String> {
    let image = bgra_to_rgb_image(bgra, width, height)?;
    let (image, width, height) = resize_for_ws_transport(&image, width, height);
    let rgb = image.as_raw();

    let format = options
        .format
        .as_deref()
        .unwrap_or("jpeg")
        .to_ascii_lowercase();

    match format.as_str() {
        "jpeg" | "jpg" => {
            let quality = options.quality.unwrap_or(70).clamp(40, 90);
            encode_jpeg_rgb(rgb, width, height, quality)
        }
        "png" => encode_png_rgb(rgb, width, height),
        other => Err(format!("Unsupported capture format: {other}")),
    }
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
