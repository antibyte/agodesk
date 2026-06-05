use std::process::Child;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use chromiumoxide::cdp::browser_protocol::target::TargetId;
use chromiumoxide::page::{Page, ScreenshotParams};
use chromiumoxide::Handler;
use futures_util::StreamExt;
use image::GenericImageView;
use image::ImageReader;
use tokio::task::JoinHandle;

use crate::computer_use::types::{
    BrowserActionParams, BrowserSessionInfo, BrowserSnapshotParams, BrowserSnapshotResult,
    BrowserTabInfo, BrowserTabListResult,
};

use super::endpoint::{ConnectPlan, ELEMENT_NOT_FOUND, INPUT_NOT_APPROVED};
use super::launch;
use super::state::BrowserState;

const MAX_HTML_BYTES: usize = 512 * 1024;
const ATTACH_RETRY_MS: u64 = 500;
const ATTACH_RETRY_COUNT: usize = 10;

pub struct CdpSession {
    #[allow(dead_code)]
    pub endpoint: String,
    #[allow(dead_code)]
    pub launched: bool,
    #[allow(dead_code)]
    pub auto_launch: bool,
    browser: Browser,
    page: Page,
    active_target_id: String,
    launched_child: Option<Child>,
    handler_task: JoinHandle<()>,
}

pub async fn connect(
    state: &BrowserState,
    plan: ConnectPlan,
) -> Result<BrowserSessionInfo, String> {
    disconnect_inner(state).await?;

    let mut launched = false;
    let mut launched_child = None;
    let (browser, handler_task) = match attach_browser(&plan.endpoint).await {
        Ok(pair) => pair,
        Err(first_error) if plan.auto_launch => {
            let (_binary, child) = launch::spawn_browser(plan.port, plan.url.as_deref())?;
            launched_child = Some(child);
            launched = true;
            attach_with_retry(&plan.endpoint).await.map_err(|_| first_error)?
        }
        Err(error) => return Err(error),
    };

    let mut browser = browser;
    browser
        .fetch_targets()
        .await
        .map_err(|error| map_connect_error(&plan.endpoint, error))?;
    tokio::time::sleep(Duration::from_millis(300)).await;

    let page = select_page(&browser, plan.url.as_deref()).await?;
    let active_target_id = page.target_id().as_ref().to_string();

    let info = BrowserSessionInfo {
        connected: true,
        endpoint: plan.endpoint.clone(),
        launched,
        auto_launch: plan.auto_launch,
        active_tab_id: Some(active_target_id.clone()),
    };

    let mut guard = state.session.lock().await;
    *guard = Some(CdpSession {
        endpoint: plan.endpoint,
        launched,
        auto_launch: plan.auto_launch,
        browser,
        page,
        active_target_id,
        launched_child,
        handler_task,
    });

    Ok(info)
}

pub async fn list_tabs(state: &BrowserState) -> Result<BrowserTabListResult, String> {
    let guard = state.session.lock().await;
    let session = session_ref(&guard)?;
    collect_tabs(session).await
}

pub async fn snapshot(
    state: &BrowserState,
    params: BrowserSnapshotParams,
) -> Result<BrowserSnapshotResult, String> {
    let guard = state.session.lock().await;
    let session = session_ref(&guard)?;
    let page = resolve_page(session, params.tab_id.as_deref()).await?;
    let tab_id = page.target_id().as_ref().to_string();

    let url = page
        .url()
        .await
        .map_err(map_page_error)?
        .unwrap_or_default();
    let title = page
        .get_title()
        .await
        .map_err(map_page_error)?
        .unwrap_or_default();

    let text = if let Some(selector) = params.selector.as_deref() {
        page.find_element(selector)
            .await
            .map_err(map_element_error)?
            .inner_text()
            .await
            .map_err(map_page_error)?
            .unwrap_or_default()
    } else {
        page.evaluate("document.body ? document.body.innerText : ''")
            .await
            .map_err(map_page_error)?
            .into_value()
            .map_err(map_page_error)?
    };

    let include_html = params.include_html.unwrap_or(false);
    let mut truncated = false;
    let html = if include_html {
        let raw: String = if let Some(selector) = params.selector.as_deref() {
            page.find_element(selector)
                .await
                .map_err(map_element_error)?
                .inner_html()
                .await
                .map_err(map_page_error)?
                .unwrap_or_default()
        } else {
            page.evaluate("document.documentElement ? document.documentElement.outerHTML : ''")
                .await
                .map_err(map_page_error)?
                .into_value()
                .map_err(map_page_error)?
        };
        Some(truncate_html(raw, &mut truncated))
    } else {
        None
    };

    let screenshot = if params.include_screenshot.unwrap_or(false) {
        Some(capture_page_screenshot(&page, &params).await?)
    } else {
        None
    };

    Ok(BrowserSnapshotResult {
        url,
        title,
        text,
        html,
        truncated,
        screenshot_base64: screenshot.as_ref().map(|value| value.base64.clone()),
        screenshot_mime: screenshot.as_ref().map(|value| value.mime.clone()),
        screenshot_width: screenshot.as_ref().map(|value| value.width),
        screenshot_height: screenshot.as_ref().map(|value| value.height),
        tab_id: Some(tab_id),
    })
}

pub async fn action(
    state: &BrowserState,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    let action = params.action.to_ascii_lowercase();
    if matches!(action.as_str(), "select_tab" | "new_tab" | "close_tab") {
        return tab_action(state, params).await;
    }

    let approved = crate::desktop::is_input_approved()?;
    if !approved {
        return Err(format!(
            "{INPUT_NOT_APPROVED}: Browser actions require approved desktop input."
        ));
    }

    let guard = state.session.lock().await;
    let session = session_ref(&guard)?;
    let page = resolve_page(session, params.tab_id.as_deref()).await?;
    let selector = params
        .selector
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Browser DOM actions require selector.".to_string())?;

    match action.as_str() {
        "click" => {
            page.find_element(&selector)
                .await
                .map_err(map_element_error)?
                .click()
                .await
                .map_err(map_page_error)?;
        }
        "focus" => {
            page.find_element(&selector)
                .await
                .map_err(map_element_error)?
                .click()
                .await
                .map_err(map_page_error)?;
        }
        "fill" | "set_value" => {
            let value = params.value.unwrap_or_default();
            let element = page
                .find_element(&selector)
                .await
                .map_err(map_element_error)?;
            element.click().await.map_err(map_page_error)?;
            let script = format!(
                "const el = document.querySelector({}); if (!el) throw new Error('missing'); el.focus(); el.value = {value_json}; el.dispatchEvent(new Event('input', {{ bubbles: true }})); el.dispatchEvent(new Event('change', {{ bubbles: true }}));",
                serde_json::to_string(&selector).unwrap_or_else(|_| "\"\"".to_string()),
                value_json = serde_json::to_string(&value).unwrap_or_else(|_| "\"\"".to_string())
            );
            page.evaluate(script.as_str())
                .await
                .map_err(map_page_error)?;
        }
        "type" => {
            let value = params.value.unwrap_or_default();
            page.find_element(&selector)
                .await
                .map_err(map_element_error)?
                .type_str(&value)
                .await
                .map_err(map_page_error)?;
        }
        "press" => {
            let key = params.value.unwrap_or_else(|| "Enter".to_string());
            page.find_element(&selector)
                .await
                .map_err(map_element_error)?
                .click()
                .await
                .map_err(map_page_error)?
                .press_key(key.as_str())
                .await
                .map_err(map_page_error)?;
        }
        other => {
            return Err(format!(
                "DESKTOP_OPERATION_UNSUPPORTED: Unknown browser action '{other}'."
            ));
        }
    }

    Ok(serde_json::json!({
        "action": params.action,
        "selector": selector,
        "success": true,
    }))
}

pub async fn disconnect(state: &BrowserState) -> Result<(), String> {
    disconnect_inner(state).await
}

async fn tab_action(
    state: &BrowserState,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    let action = params.action.to_ascii_lowercase();
    let mut guard = state.session.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| "DESKTOP_BROWSER_UNAVAILABLE: Browser is not connected.".to_string())?;

    match action.as_str() {
        "select_tab" => {
            let tab_id = resolve_tab_id(session, &params)?;
            let page = session
                .browser
                .get_page(TargetId::new(tab_id.clone()))
                .await
                .map_err(map_page_error)?;
            page.bring_to_front().await.map_err(map_page_error)?;
            session.page = page.clone();
            session.active_target_id = tab_id.clone();
            let info = tab_info_from_page(&page, true).await?;
            Ok(serde_json::json!({
                "action": params.action,
                "tab_id": tab_id,
                "tab": info,
                "success": true,
            }))
        }
        "new_tab" => {
            let url = params
                .value
                .or(params.selector)
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "about:blank".to_string());
            let page = session
                .browser
                .new_page(url.as_str())
                .await
                .map_err(|error| map_connect_error(&url, error))?;
            page.bring_to_front().await.map_err(map_page_error)?;
            let tab_id = page.target_id().as_ref().to_string();
            session.page = page.clone();
            session.active_target_id = tab_id.clone();
            let info = tab_info_from_page(&page, true).await?;
            Ok(serde_json::json!({
                "action": params.action,
                "tab_id": tab_id,
                "tab": info,
                "success": true,
            }))
        }
        "close_tab" => {
            let tab_id = resolve_tab_id(session, &params)?;
            let page = if tab_id == session.active_target_id {
                session.page.clone()
            } else {
                session
                    .browser
                    .get_page(TargetId::new(tab_id.clone()))
                    .await
                    .map_err(map_page_error)?
            };
            page.close().await.map_err(map_page_error)?;
            if tab_id == session.active_target_id {
                let pages = session
                    .browser
                    .pages()
                    .await
                    .map_err(|error| map_connect_error("browser", error))?;
                let Some(next) = pages.into_iter().last() else {
                    return Err(
                        "DESKTOP_BROWSER_UNAVAILABLE: No browser tabs remain open.".to_string(),
                    );
                };
                next.bring_to_front().await.map_err(map_page_error)?;
                session.active_target_id = next.target_id().as_ref().to_string();
                session.page = next;
            }
            Ok(serde_json::json!({
                "action": params.action,
                "tab_id": tab_id,
                "active_tab_id": session.active_target_id.clone(),
                "success": true,
            }))
        }
        other => Err(format!(
            "DESKTOP_OPERATION_UNSUPPORTED: Unknown browser action '{other}'."
        )),
    }
}

async fn disconnect_inner(state: &BrowserState) -> Result<(), String> {
    let mut guard = state.session.lock().await;
    if let Some(mut session) = guard.take() {
        let _ = session.browser.close().await;
        session.handler_task.abort();
        if let Some(mut child) = session.launched_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    Ok(())
}

async fn attach_browser(endpoint: &str) -> Result<(Browser, JoinHandle<()>), String> {
    let (browser, handler) = Browser::connect(endpoint)
        .await
        .map_err(|error| map_connect_error(endpoint, error))?;
    Ok((browser, spawn_handler(handler)))
}

async fn attach_with_retry(endpoint: &str) -> Result<(Browser, JoinHandle<()>), String> {
    let mut last_error = String::from("DESKTOP_BROWSER_UNAVAILABLE: Attach failed.");
    for _ in 0..ATTACH_RETRY_COUNT {
        tokio::time::sleep(Duration::from_millis(ATTACH_RETRY_MS)).await;
        match attach_browser(endpoint).await {
            Ok(pair) => return Ok(pair),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

fn spawn_handler(mut handler: Handler) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(event) = handler.next().await {
            if event.is_err() {
                break;
            }
        }
    })
}

async fn select_page(browser: &Browser, start_url: Option<&str>) -> Result<Page, String> {
    let pages = browser
        .pages()
        .await
        .map_err(|error| map_connect_error("browser", error))?;

    if let Some(url) = start_url.filter(|value| !value.trim().is_empty()) {
        for page in &pages {
            if page
                .url()
                .await
                .ok()
                .flatten()
                .is_some_and(|current| urls_match(&current, url))
            {
                let _ = page.bring_to_front().await;
                return Ok(page.clone());
            }
        }
    }

    if let Some(page) = pages.into_iter().last() {
        return Ok(page);
    }

    if let Some(url) = start_url.filter(|value| !value.trim().is_empty()) {
        return browser
            .new_page(url)
            .await
            .map_err(|error| map_connect_error(url, error));
    }

    browser
        .new_page("about:blank")
        .await
        .map_err(|error| map_connect_error("about:blank", error))
}

async fn resolve_page(session: &CdpSession, tab_id: Option<&str>) -> Result<Page, String> {
    match tab_id {
        None => Ok(session.page.clone()),
        Some(id) if id == session.active_target_id => Ok(session.page.clone()),
        Some(id) => session
            .browser
            .get_page(TargetId::new(id.to_string()))
            .await
            .map_err(map_page_error),
    }
}

async fn collect_tabs(session: &CdpSession) -> Result<BrowserTabListResult, String> {
    let active = session.active_target_id.clone();
    let mut tabs = Vec::new();
    for page in session
        .browser
        .pages()
        .await
        .map_err(|error| map_connect_error("browser", error))?
    {
        let id = page.target_id().as_ref().to_string();
        tabs.push(tab_info_from_page(&page, id == active).await?);
    }
    Ok(BrowserTabListResult {
        tabs,
        active_tab_id: active,
    })
}

async fn tab_info_from_page(page: &Page, active: bool) -> Result<BrowserTabInfo, String> {
    Ok(BrowserTabInfo {
        id: page.target_id().as_ref().to_string(),
        url: page
            .url()
            .await
            .map_err(map_page_error)?
            .unwrap_or_default(),
        title: page
            .get_title()
            .await
            .map_err(map_page_error)?
            .unwrap_or_default(),
        active,
    })
}

struct EncodedScreenshot {
    base64: String,
    mime: String,
    width: u32,
    height: u32,
}

async fn capture_page_screenshot(
    page: &Page,
    params: &BrowserSnapshotParams,
) -> Result<EncodedScreenshot, String> {
    let format = screenshot_format(params.screenshot_format.as_deref());
    let quality = params.quality.unwrap_or(75).clamp(40, 90) as i64;
    let full_page = params.full_page.unwrap_or(false);
    let mime = match format {
        CaptureScreenshotFormat::Jpeg => "image/jpeg",
        CaptureScreenshotFormat::Png => "image/png",
        CaptureScreenshotFormat::Webp => "image/webp",
    };

    let bytes = if let Some(selector) = params.selector.as_deref() {
        page.find_element(selector)
            .await
            .map_err(map_element_error)?
            .screenshot(format.clone())
            .await
            .map_err(map_page_error)?
    } else {
        let mut builder = ScreenshotParams::builder()
            .format(format.clone())
            .full_page(full_page);
        if format == CaptureScreenshotFormat::Jpeg {
            builder = builder.quality(quality);
        }
        page.screenshot(builder.build())
            .await
            .map_err(map_page_error)?
    };

    let (width, height) = image_dimensions(&bytes)?;

    Ok(EncodedScreenshot {
        base64: STANDARD.encode(bytes),
        mime: mime.to_string(),
        width,
        height,
    })
}

fn image_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    let reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("DESKTOP_BROWSER_UNAVAILABLE: Invalid screenshot: {error}"))?;
    let image = reader
        .decode()
        .map_err(|error| format!("DESKTOP_BROWSER_UNAVAILABLE: Invalid screenshot: {error}"))?;
    Ok(image.dimensions())
}

fn screenshot_format(raw: Option<&str>) -> CaptureScreenshotFormat {
    match raw.unwrap_or("jpeg").to_ascii_lowercase().as_str() {
        "png" => CaptureScreenshotFormat::Png,
        "webp" => CaptureScreenshotFormat::Webp,
        _ => CaptureScreenshotFormat::Jpeg,
    }
}

fn resolve_tab_id(session: &CdpSession, params: &BrowserActionParams) -> Result<String, String> {
    params
        .tab_id
        .clone()
        .or(params.value.clone())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            params
                .selector
                .clone()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| Some(session.active_target_id.clone()))
        .ok_or_else(|| "DESKTOP_ELEMENT_NOT_FOUND: tab_id is required.".to_string())
}

fn session_ref<'a>(
    guard: &'a tokio::sync::MutexGuard<'a, Option<CdpSession>>,
) -> Result<&'a CdpSession, String> {
    guard
        .as_ref()
        .ok_or_else(|| "DESKTOP_BROWSER_UNAVAILABLE: Browser is not connected.".to_string())
}

fn urls_match(current: &str, expected: &str) -> bool {
    current == expected || current.starts_with(expected)
}

fn truncate_html(mut html: String, truncated: &mut bool) -> String {
    if html.len() <= MAX_HTML_BYTES {
        return html;
    }
    html.truncate(MAX_HTML_BYTES);
    *truncated = true;
    html
}

fn map_connect_error(endpoint: &str, error: impl std::fmt::Display) -> String {
    format!("DESKTOP_BROWSER_UNAVAILABLE: Failed to connect to {endpoint}: {error}")
}

fn map_page_error(error: impl std::fmt::Display) -> String {
    format!("DESKTOP_BROWSER_UNAVAILABLE: Browser page error: {error}")
}

fn map_element_error(error: impl std::fmt::Display) -> String {
    format!("{ELEMENT_NOT_FOUND}: {error}")
}

#[allow(dead_code)]
pub async fn launch_and_connect(endpoint: &str, port: u16) -> Result<(Browser, JoinHandle<()>), String> {
    let config = BrowserConfig::builder()
        .arg(format!("--remote-debugging-port={port}"))
        .build()
        .map_err(|error| map_connect_error(endpoint, error))?;
    let (browser, handler) = Browser::launch(config)
        .await
        .map_err(|error| map_connect_error(endpoint, error))?;
    Ok((browser, spawn_handler(handler)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_match_allows_prefix() {
        assert!(urls_match("https://example.com/path", "https://example.com"));
        assert!(urls_match("https://example.com", "https://example.com"));
        assert!(!urls_match("https://other.com", "https://example.com"));
    }

    #[test]
    fn screenshot_format_defaults_to_jpeg() {
        assert_eq!(
            screenshot_format(None),
            CaptureScreenshotFormat::Jpeg
        );
        assert_eq!(
            screenshot_format(Some("png")),
            CaptureScreenshotFormat::Png
        );
    }
}
