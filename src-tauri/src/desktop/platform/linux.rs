use super::super::types::{
    CaptureResult, CaptureScreenOptions, DisplayInfo, InputEvent, WindowInfo,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbaImage};
use xcap::{Monitor, Window};

const WS_CAPTURE_MAX_LONG_EDGE: u32 = 1280;
const WS_CAPTURE_MAX_JPEG_BYTES: usize = 180_000;

pub fn screen_capture_available() -> bool {
    Monitor::all().map(|monitors| !monitors.is_empty()).unwrap_or(false)
}

pub fn input_injection_available() -> bool {
    true
}

pub fn ui_automation_available() -> bool {
    crate::computer_use::platform::ui_automation_available()
}

pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    let monitors = Monitor::all().map_err(|error| error.to_string())?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| DisplayInfo {
            id: format!("display-{index}"),
            index: index as u32,
            name: monitor.name().unwrap_or_else(|_| format!("Monitor {index}")),
            width: monitor.width().unwrap_or(0),
            height: monitor.height().unwrap_or(0),
            x: monitor.x().unwrap_or(0),
            y: monitor.y().unwrap_or(0),
            primary: index == 0,
            scale_factor: monitor.scale_factor().unwrap_or(1.0) as f64,
        })
        .collect())
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let displays = list_displays()?;
    let windows = Window::all().map_err(|error| error.to_string())?;
    Ok(windows
        .into_iter()
        .enumerate()
        .filter_map(|(index, window)| {
            let title = window.title().ok()?;
            if title.trim().is_empty() {
                return None;
            }
            let width = window.width().ok()?;
            let height = window.height().ok()?;
            if width == 0 || height == 0 {
                return None;
            }
            let x = window.x().ok()?;
            let y = window.y().ok()?;
            let display_id = displays
                .iter()
                .find(|display| {
                    x >= display.x
                        && x < display.x + display.width as i32
                        && y >= display.y
                        && y < display.y + display.height as i32
                })
                .map(|display| display.id.clone())
                .unwrap_or_else(|| "display-0".to_string());
            let display_name = displays
                .iter()
                .find(|display| display.id == display_id)
                .map(|display| display.name.clone())
                .unwrap_or_else(|| "Unknown".to_string());
            Some(WindowInfo {
                id: format!("win-{index}"),
                title,
                class_name: window.app_name().unwrap_or_default(),
                width,
                height,
                x,
                y,
                visible: true,
                display_id: display_id.clone(),
                display_name,
                monitor_index: displays
                    .iter()
                    .position(|display| display.id == display_id)
                    .unwrap_or(0) as u32,
            })
        })
        .collect())
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

fn capture_display(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    let displays = list_displays()?;
    if displays.is_empty() {
        return Err("No displays found.".to_string());
    }

    let display = if let Some(id) = options.display_id.as_deref() {
        displays
            .iter()
            .find(|display| display.id == id)
            .ok_or_else(|| format!("Unknown display_id: {id}"))?
    } else {
        displays.first().expect("checked non-empty")
    };

    let index = display.index as usize;
    let monitors = Monitor::all().map_err(|error| error.to_string())?;
    let monitor = monitors
        .get(index)
        .ok_or_else(|| format!("Monitor index out of range: {index}"))?;
    let image = monitor.capture_image().map_err(|error| error.to_string())?;
    encode_rgba_image(
        &image,
        "display",
        Some(display.id.clone()),
        None,
        display.scale_factor,
        &options,
    )
}

fn capture_window(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    let window_id = options
        .window_id
        .as_deref()
        .ok_or_else(|| "window_id is required for window capture.".to_string())?;
    let index = window_id
        .strip_prefix("win-")
        .ok_or_else(|| format!("Invalid window_id: {window_id}"))?
        .parse::<usize>()
        .map_err(|_| format!("Invalid window_id index: {window_id}"))?;
    let windows = Window::all().map_err(|error| error.to_string())?;
    let window = windows
        .get(index)
        .ok_or_else(|| format!("Unknown window_id: {window_id}"))?;
    let image = window.capture_image().map_err(|error| error.to_string())?;
    encode_rgba_image(
        &image,
        "window",
        None,
        Some(window_id.to_string()),
        1.0,
        &options,
    )
}

fn encode_rgba_image(
    image: &RgbaImage,
    source: &str,
    display_id: Option<String>,
    window_id: Option<String>,
    scale_factor: f64,
    options: &CaptureScreenOptions,
) -> Result<CaptureResult, String> {
    let (width, height) = image.dimensions();
    let (image, width, height) = resize_for_ws_transport(image, width, height);
    let rgba = image.as_raw();
    let format = options
        .format
        .as_deref()
        .unwrap_or("jpeg")
        .to_ascii_lowercase();

    let (mime, format, data_base64) = match format.as_str() {
        "png" => {
            let mut buffer = Vec::new();
            PngEncoder::new(&mut buffer)
                .write_image(rgba, width, height, ExtendedColorType::Rgba8)
                .map_err(|error| format!("PNG encode failed: {error}"))?;
            (
                "image/png".to_string(),
                "png".to_string(),
                STANDARD.encode(buffer),
            )
        }
        _ => {
            let quality = options.quality.unwrap_or(70).clamp(40, 90);
            let mut buffer = Vec::new();
            let mut quality = quality;
            loop {
                buffer.clear();
                let encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
                encoder
                    .write_image(rgba, width, height, ExtendedColorType::Rgba8)
                    .map_err(|error| format!("JPEG encode failed: {error}"))?;
                if buffer.len() <= WS_CAPTURE_MAX_JPEG_BYTES || quality <= 40 {
                    break;
                }
                quality = quality.saturating_sub(10);
            }
            (
                "image/jpeg".to_string(),
                "jpeg".to_string(),
                STANDARD.encode(buffer),
            )
        }
    };

    Ok(CaptureResult {
        source: source.to_string(),
        display_id,
        window_id,
        format,
        width,
        height,
        scale_factor,
        mime,
        data_base64,
    })
}

fn resize_for_ws_transport(
    image: &RgbaImage,
    width: u32,
    height: u32,
) -> (RgbaImage, u32, u32) {
    let max_edge = width.max(height);
    if max_edge <= WS_CAPTURE_MAX_LONG_EDGE {
        return (image.clone(), width, height);
    }
    let scale = WS_CAPTURE_MAX_LONG_EDGE as f32 / max_edge as f32;
    let new_w = ((width as f32 * scale).round() as u32).max(1);
    let new_h = ((height as f32 * scale).round() as u32).max(1);
    (
        image::imageops::resize(image, new_w, new_h, image::imageops::FilterType::Triangle),
        new_w,
        new_h,
    )
}
