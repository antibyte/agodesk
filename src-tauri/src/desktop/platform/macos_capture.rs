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

pub fn ui_automation_available() -> bool {
    false
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
                .first()
                .map(|display| display.id.clone())
                .unwrap_or_else(|| "display-0".to_string());
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
                display_name: displays
                    .first()
                    .map(|display| display.name.clone())
                    .unwrap_or_else(|| "Unknown".to_string()),
                monitor_index: 0,
            })
        })
        .collect())
}

pub fn capture_screen(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    let displays = list_displays()?;
    if displays.is_empty() {
        return Err("No displays found.".to_string());
    }
    let monitor = Monitor::all()
        .map_err(|error| error.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "No monitors available.".to_string())?;
    let image = monitor.capture_image().map_err(|error| error.to_string())?;
    encode_rgba_image(
        &image,
        "display",
        Some("display-0".to_string()),
        options.window_id.clone(),
        1.0,
        &options,
    )
}

pub fn inject_input(event: InputEvent) -> Result<(), String> {
    crate::computer_use::input::inject_input_enigo(&event)
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
    let format = options
        .format
        .as_deref()
        .unwrap_or("jpeg")
        .to_ascii_lowercase();
    let rgba = image.as_raw();
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
            let encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
            encoder
                .write_image(rgba, width, height, ExtendedColorType::Rgba8)
                .map_err(|error| format!("JPEG encode failed: {error}"))?;
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
