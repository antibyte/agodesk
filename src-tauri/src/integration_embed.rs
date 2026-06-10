use crate::ws::tls::is_homelab_host;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use url::Url;

pub const EMBED_LABEL: &str = "integration-embed";

fn local_https_browser_args(url: &Url) -> Option<&'static str> {
    let host = url.host_str()?;
    if url.scheme() == "https" && is_homelab_host(host) {
        Some("--ignore-certificate-errors --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection")
    } else {
        None
    }
}

fn refocus_main_webview(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
}

fn compute_preview_geometry(
    main: &WebviewWindow,
) -> Result<(f64, f64, f64, f64), String> {
    let scale = main.scale_factor().map_err(|error| error.to_string())?;
    let inner_pos = main.inner_position().map_err(|error| error.to_string())?;
    let inner_size = main.inner_size().map_err(|error| error.to_string())?;

    let main_w = inner_size.width as f64 / scale;
    let main_h = inner_size.height as f64 / scale;
    let origin_x = inner_pos.x as f64 / scale;
    let origin_y = inner_pos.y as f64 / scale;

    let width = (main_w * 0.92).clamp(640.0, 1400.0);
    let height = (main_h * 0.88).clamp(480.0, 1000.0);
    let pos_x = origin_x + (main_w - width) / 2.0;
    let pos_y = origin_y + (main_h - height) / 2.0;

    Ok((pos_x, pos_y, width, height))
}

fn present_preview_window(
    window: &WebviewWindow,
    pos_x: f64,
    pos_y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    window
        .set_size(Size::Logical(LogicalSize { width, height }))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Logical(LogicalPosition { x: pos_x, y: pos_y }))
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn build_preview_window(
    app: &AppHandle,
    url: &Url,
    title: &str,
    pos_x: f64,
    pos_y: f64,
    width: f64,
    height: f64,
) -> Result<WebviewWindow, String> {
    let mut builder = WebviewWindowBuilder::new(
        app,
        EMBED_LABEL,
        WebviewUrl::External(url.clone()),
    )
    .title(title)
    .decorations(true)
    .visible(false)
    .always_on_top(true)
    .resizable(true)
    .inner_size(width, height)
    .min_inner_size(480.0, 360.0)
    .position(pos_x, pos_y);

    #[cfg(windows)]
    if let Some(args) = local_https_browser_args(url) {
        builder = builder.additional_browser_args(args);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    present_preview_window(&window, pos_x, pos_y, width, height)?;
    Ok(window)
}

fn destroy_preview_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(EMBED_LABEL) {
        let _ = window.close();
    }
}

pub fn integration_embed_shutdown(app: &AppHandle) {
    destroy_preview_window(app);
}

fn integration_embed_open_impl(
    app: &AppHandle,
    url: Url,
    title: Option<String>,
) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found.".to_string())?;
    let (pos_x, pos_y, width, height) = compute_preview_geometry(&main)?;

    let window_title = title
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Integration");

    let needs_homelab_args = local_https_browser_args(&url).is_some();

    if needs_homelab_args {
        destroy_preview_window(app);
        build_preview_window(app, &url, window_title, pos_x, pos_y, width, height)?;
        return Ok(());
    }

    if let Some(window) = app.get_webview_window(EMBED_LABEL) {
        window
            .set_title(window_title)
            .map_err(|error| error.to_string())?;
        window
            .navigate(url.clone())
            .map_err(|error| error.to_string())?;
        return present_preview_window(&window, pos_x, pos_y, width, height);
    }

    build_preview_window(app, &url, window_title, pos_x, pos_y, width, height)?;
    Ok(())
}

pub fn integration_embed_hide_impl(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(EMBED_LABEL) {
        let _ = window.set_always_on_top(false);
        window.hide().map_err(|error| error.to_string())?;
    }
    refocus_main_webview(app);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn integration_embed_open(
    app: AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|error| error.to_string())?;
    // Must run directly in the async command — WebView2 on Windows deadlocks when
    // creating windows from run_on_main_thread or sync commands.
    integration_embed_open_impl(&app, parsed, title)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn integration_embed_set_bounds(
    _app: AppHandle,
    _x: f64,
    _y: f64,
    _width: f64,
    _height: f64,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn integration_embed_close(app: AppHandle) -> Result<(), String> {
    integration_embed_hide_impl(&app)
}
