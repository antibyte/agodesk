use std::future::Future;
use std::process::Child;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chromiumoxide::browser::Browser;
use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use chromiumoxide::cdp::browser_protocol::target::TargetId;
use chromiumoxide::page::{Page, ScreenshotParams};
use chromiumoxide::Handler;
use futures_util::StreamExt;
use image::ImageReader;
use tokio::task::JoinHandle;

use crate::computer_use::types::{
    BrowserActionParams, BrowserSessionInfo, BrowserSnapshotParams, BrowserSnapshotResult,
    BrowserTabInfo, BrowserTabListResult,
};

use super::endpoint::{ConnectPlan, ELEMENT_NOT_FOUND, INPUT_NOT_APPROVED};
use super::launch;
use super::state::BrowserState;

const MAX_CONTENT_BYTES: usize = 512 * 1024;
const ATTACH_POLL_MS: u64 = 200;
const ATTACH_POLL_COUNT: usize = 50;
const CDP_OPERATION_TIMEOUT: Duration = Duration::from_secs(60);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_WAIT_MS: u64 = 30_000;

pub struct CdpSession {
    #[allow(dead_code)]
    pub endpoint: String,
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
            let (_binary, mut child) = launch::spawn_browser(plan.port, plan.url.as_deref())?;
            launched = true;
            match wait_and_attach(&plan.endpoint).await {
                Ok(pair) => {
                    launched_child = Some(child);
                    pair
                }
                Err(_) => {
                    terminate_launched_child(&mut child);
                    return Err(first_error);
                }
            }
        }
        Err(error) => return Err(error),
    };

    let mut browser = browser;
    browser
        .fetch_targets()
        .await
        .map_err(|error| map_connect_error(&plan.endpoint, error))?;

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
    ensure_session_alive(state).await?;
    let guard = state.session.lock().await;
    let session = session_ref(&guard)?;
    collect_tabs(&session.browser, &session.active_target_id).await
}

pub async fn snapshot(
    state: &BrowserState,
    params: BrowserSnapshotParams,
) -> Result<BrowserSnapshotResult, String> {
    ensure_session_alive(state).await?;
    let page = resolve_page_from_state(state, params.tab_id.as_deref()).await?;
    let tab_id = page.target_id().as_ref().to_string();

    let url = with_cdp_timeout(page.url())
        .await?
        .map_err(map_page_error)?
        .unwrap_or_default();
    let title = with_cdp_timeout(page.get_title())
        .await?
        .map_err(map_page_error)?
        .unwrap_or_default();

    let mut truncated = false;
    let raw_text = if let Some(selector) = params.selector.as_deref() {
        with_cdp_timeout(page.find_element(selector))
            .await?
            .map_err(map_element_error)?
            .inner_text()
            .await
            .map_err(map_page_error)?
            .unwrap_or_default()
    } else {
        with_cdp_timeout(page.evaluate("document.body ? document.body.innerText : ''"))
            .await?
            .map_err(map_page_error)?
            .into_value()
            .map_err(map_page_error)?
    };
    let text = truncate_to_byte_limit(raw_text, MAX_CONTENT_BYTES, &mut truncated);

    let include_html = params.include_html.unwrap_or(false);
    let html = if include_html {
        let raw: String = if let Some(selector) = params.selector.as_deref() {
            with_cdp_timeout(page.find_element(selector))
                .await?
                .map_err(map_element_error)?
                .inner_html()
                .await
                .map_err(map_page_error)?
                .unwrap_or_default()
        } else {
            with_cdp_timeout(
                page.evaluate("document.documentElement ? document.documentElement.outerHTML : ''"),
            )
            .await?
            .map_err(map_page_error)?
            .into_value()
            .map_err(map_page_error)?
        };
        Some(truncate_to_byte_limit(
            raw,
            MAX_CONTENT_BYTES,
            &mut truncated,
        ))
    } else {
        None
    };

    let screenshot = if params.include_screenshot.unwrap_or(false) {
        Some(with_cdp_timeout(async { capture_page_screenshot(&page, &params).await }).await??)
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
    if matches!(action.as_str(), "select_tab" | "close_tab")
        || (action == "new_tab" && !browser_action_requires_input_approval(&params))
    {
        return tab_action(state, params).await;
    }

    ensure_session_alive(state).await?;

    if matches!(action.as_str(), "wait_for_navigation" | "wait_for_selector") {
        return wait_action(state, params).await;
    }

    if browser_action_requires_input_approval(&params) {
        let approved = crate::desktop::is_input_approved()?;
        if !approved {
            return Err(format!(
                "{INPUT_NOT_APPROVED}: Browser actions require approved desktop input."
            ));
        }
    }

    if action == "new_tab" {
        return tab_action(state, params).await;
    }

    let page = resolve_page_from_state(state, params.tab_id.as_deref()).await?;

    match action.as_str() {
        "navigate" | "goto" => {
            let url = params
                .value
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Browser navigate requires value (URL).".to_string())?;
            with_cdp_timeout(page.goto(url.as_str()))
                .await?
                .map_err(map_page_error)?;
            Ok(serde_json::json!({
                "action": params.action,
                "url": url,
                "success": true,
            }))
        }
        "click" | "focus" | "fill" | "set_value" | "type" | "press" => {
            let selector = params
                .selector
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Browser DOM actions require selector.".to_string())?;

            match action.as_str() {
                "click" => {
                    with_cdp_timeout(page.find_element(&selector))
                        .await?
                        .map_err(map_element_error)?
                        .click()
                        .await
                        .map_err(map_page_error)?;
                }
                "focus" => {
                    with_cdp_timeout(page.find_element(&selector))
                        .await?
                        .map_err(map_element_error)?
                        .focus()
                        .await
                        .map_err(map_page_error)?;
                }
                "fill" | "set_value" => {
                    let value = params.value.clone().unwrap_or_default();
                    let element = with_cdp_timeout(page.find_element(&selector))
                        .await?
                        .map_err(map_element_error)?;
                    element.focus().await.map_err(map_page_error)?;
                    let script = format!(
                        "const el = document.querySelector({}); if (!el) throw new Error('missing'); el.focus(); el.value = {value_json}; el.dispatchEvent(new Event('input', {{ bubbles: true }})); el.dispatchEvent(new Event('change', {{ bubbles: true }}));",
                        serde_json::to_string(&selector).unwrap_or_else(|_| "\"\"".to_string()),
                        value_json =
                            serde_json::to_string(&value).unwrap_or_else(|_| "\"\"".to_string())
                    );
                    with_cdp_timeout(page.evaluate(script.as_str()))
                        .await?
                        .map_err(map_page_error)?;
                }
                "type" => {
                    let value = params.value.clone().unwrap_or_default();
                    with_cdp_timeout(page.find_element(&selector))
                        .await?
                        .map_err(map_element_error)?
                        .type_str(&value)
                        .await
                        .map_err(map_page_error)?;
                }
                "press" => {
                    let key = params.value.clone().unwrap_or_else(|| "Enter".to_string());
                    with_cdp_timeout(page.find_element(&selector))
                        .await?
                        .map_err(map_element_error)?
                        .focus()
                        .await
                        .map_err(map_page_error)?
                        .press_key(key.as_str())
                        .await
                        .map_err(map_page_error)?;
                }
                _ => unreachable!(),
            }

            Ok(serde_json::json!({
                "action": params.action,
                "selector": selector,
                "success": true,
            }))
        }
        other => Err(format!(
            "DESKTOP_OPERATION_UNSUPPORTED: Unknown browser action '{other}'."
        )),
    }
}

pub async fn disconnect(state: &BrowserState) -> Result<(), String> {
    disconnect_inner(state).await
}

async fn wait_action(
    state: &BrowserState,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    let action = params.action.to_ascii_lowercase();
    let timeout_ms = parse_timeout_ms(&params.value, DEFAULT_WAIT_MS);
    let page = resolve_page_from_state(state, params.tab_id.as_deref()).await?;

    match action.as_str() {
        "wait_for_navigation" => {
            with_cdp_timeout_duration(
                Duration::from_millis(timeout_ms),
                page.wait_for_navigation(),
            )
            .await?
            .map_err(map_page_error)?;
            Ok(serde_json::json!({
                "action": params.action,
                "success": true,
                "timeout_ms": timeout_ms,
            }))
        }
        "wait_for_selector" => {
            let selector = params
                .selector
                .clone()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "wait_for_selector requires selector.".to_string())?;
            wait_for_selector(&page, &selector, timeout_ms).await?;
            Ok(serde_json::json!({
                "action": params.action,
                "selector": selector,
                "success": true,
                "timeout_ms": timeout_ms,
            }))
        }
        other => Err(format!(
            "DESKTOP_OPERATION_UNSUPPORTED: Unknown browser action '{other}'."
        )),
    }
}

async fn tab_action(
    state: &BrowserState,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    ensure_session_alive(state).await?;
    let action = params.action.to_ascii_lowercase();
    let mut guard = state.session.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| "DESKTOP_BROWSER_UNAVAILABLE: Browser is not connected.".to_string())?;

    match action.as_str() {
        "select_tab" => {
            let tab_id = resolve_tab_id(session, &params)?;
            let page = with_cdp_timeout(session.browser.get_page(TargetId::new(tab_id.clone())))
                .await?
                .map_err(map_page_error)?;
            with_cdp_timeout(page.bring_to_front())
                .await?
                .map_err(map_page_error)?;
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
                .clone()
                .or_else(|| params.selector.clone())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "about:blank".to_string());
            let page = with_cdp_timeout(session.browser.new_page(url.as_str()))
                .await?
                .map_err(|error| map_connect_error(&url, error))?;
            with_cdp_timeout(page.bring_to_front())
                .await?
                .map_err(map_page_error)?;
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
                with_cdp_timeout(session.browser.get_page(TargetId::new(tab_id.clone())))
                    .await?
                    .map_err(map_page_error)?
            };
            with_cdp_timeout(page.close())
                .await?
                .map_err(map_page_error)?;
            if tab_id == session.active_target_id {
                let pages = user_pages(&session.browser).await?;
                let Some(next) = pick_best_page(pages, None) else {
                    return Err(
                        "DESKTOP_BROWSER_UNAVAILABLE: No browser tabs remain open.".to_string()
                    );
                };
                with_cdp_timeout(next.bring_to_front())
                    .await?
                    .map_err(map_page_error)?;
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
        if session.launched {
            let _ = session.browser.close().await;
            if let Some(mut child) = session.launched_child.take() {
                terminate_launched_child(&mut child);
            }
        }
        session.handler_task.abort();
    }
    Ok(())
}

async fn ensure_session_alive(state: &BrowserState) -> Result<(), String> {
    let page = {
        let guard = state.session.lock().await;
        let session = session_ref(&guard)?;
        session.page.clone()
    };

    match tokio::time::timeout(HEALTH_CHECK_TIMEOUT, page.url()).await {
        Ok(Ok(_)) => Ok(()),
        _ => {
            disconnect_inner(state).await?;
            Err("DESKTOP_BROWSER_UNAVAILABLE: Browser session is no longer alive.".to_string())
        }
    }
}

async fn attach_browser(endpoint: &str) -> Result<(Browser, JoinHandle<()>), String> {
    let (browser, handler) = Browser::connect(endpoint)
        .await
        .map_err(|error| map_connect_error(endpoint, error))?;
    Ok((browser, spawn_handler(handler)))
}

async fn wait_and_attach(endpoint: &str) -> Result<(Browser, JoinHandle<()>), String> {
    let mut last_error = String::from("DESKTOP_BROWSER_UNAVAILABLE: Attach failed.");
    for _ in 0..ATTACH_POLL_COUNT {
        if debugger_endpoint_ready(endpoint).await {
            match attach_browser(endpoint).await {
                Ok(pair) => return Ok(pair),
                Err(error) => last_error = error,
            }
        }
        tokio::time::sleep(Duration::from_millis(ATTACH_POLL_MS)).await;
    }
    Err(last_error)
}

async fn debugger_endpoint_ready(endpoint: &str) -> bool {
    let url = format!("{}/json/version", endpoint.trim_end_matches('/'));
    tokio::task::spawn_blocking(move || {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(500))
            .build()
            .ok()
            .and_then(|client| client.get(&url).send().ok())
            .is_some_and(|response| response.status().is_success())
    })
    .await
    .unwrap_or(false)
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
    let pages = user_pages(browser).await?;

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

    if let Some(page) = pick_best_page(pages, None) {
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

async fn user_pages(browser: &Browser) -> Result<Vec<Page>, String> {
    let pages = with_cdp_timeout(browser.pages())
        .await?
        .map_err(|error| map_connect_error("browser", error))?;
    let mut filtered = Vec::new();
    for page in pages {
        let url = with_cdp_timeout(page.url())
            .await
            .ok()
            .and_then(|result| result.ok())
            .flatten()
            .unwrap_or_default();
        if is_user_page_url(&url) {
            filtered.push(page);
        }
    }
    Ok(filtered)
}

fn is_user_page_url(url: &str) -> bool {
    !url.starts_with("devtools://")
        && !url.starts_with("chrome://")
        && !url.starts_with("chrome-extension://")
        && !url.starts_with("edge://")
        && !url.starts_with("about:devtools")
}

fn pick_best_page(pages: Vec<Page>, prefer_url: Option<&str>) -> Option<Page> {
    if let Some(url) = prefer_url.filter(|value| !value.trim().is_empty()) {
        // Caller already matched by URL; keep last matching page semantics.
        let _ = url;
    }
    pages.into_iter().last()
}

async fn resolve_page_from_state(
    state: &BrowserState,
    tab_id: Option<&str>,
) -> Result<Page, String> {
    let guard = state.session.lock().await;
    let session = session_ref(&guard)?;
    match tab_id {
        None => Ok(session.page.clone()),
        Some(id) if id == session.active_target_id => Ok(session.page.clone()),
        Some(id) => with_cdp_timeout(session.browser.get_page(TargetId::new(id.to_string())))
            .await?
            .map_err(map_page_error),
    }
}

async fn collect_tabs(browser: &Browser, active: &str) -> Result<BrowserTabListResult, String> {
    let mut tabs = Vec::new();
    for page in user_pages(browser).await? {
        let id = page.target_id().as_ref().to_string();
        tabs.push(tab_info_from_page(&page, id == active).await?);
    }
    Ok(BrowserTabListResult {
        tabs,
        active_tab_id: active.to_string(),
    })
}

async fn tab_info_from_page(page: &Page, active: bool) -> Result<BrowserTabInfo, String> {
    Ok(BrowserTabInfo {
        id: page.target_id().as_ref().to_string(),
        url: with_cdp_timeout(page.url())
            .await?
            .map_err(map_page_error)?
            .unwrap_or_default(),
        title: with_cdp_timeout(page.get_title())
            .await?
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
    reader
        .into_dimensions()
        .map_err(|error| format!("DESKTOP_BROWSER_UNAVAILABLE: Invalid screenshot: {error}"))
}

fn screenshot_format(raw: Option<&str>) -> CaptureScreenshotFormat {
    match raw.unwrap_or("jpeg").to_ascii_lowercase().as_str() {
        "png" => CaptureScreenshotFormat::Png,
        "webp" => CaptureScreenshotFormat::Webp,
        _ => CaptureScreenshotFormat::Jpeg,
    }
}

fn resolve_tab_id(session: &CdpSession, params: &BrowserActionParams) -> Result<String, String> {
    Ok(resolve_tab_id_from_params(
        &session.active_target_id,
        params,
    ))
}

fn browser_action_requires_input_approval(params: &BrowserActionParams) -> bool {
    match params.action.to_ascii_lowercase().as_str() {
        "select_tab" | "close_tab" | "wait_for_selector" | "wait_for_navigation" => false,
        "new_tab" => new_tab_target(params).is_some_and(|target| !is_blank_tab_target(target)),
        _ => true,
    }
}

fn new_tab_target(params: &BrowserActionParams) -> Option<&str> {
    params
        .value
        .as_deref()
        .or(params.selector.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn is_blank_tab_target(target: &str) -> bool {
    target.eq_ignore_ascii_case("about:blank")
}

fn resolve_tab_id_from_params(active_target_id: &str, params: &BrowserActionParams) -> String {
    params
        .tab_id
        .clone()
        .or_else(|| params.value.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| active_target_id.to_string())
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

fn truncate_to_byte_limit(mut content: String, max_bytes: usize, truncated: &mut bool) -> String {
    if content.len() <= max_bytes {
        return content;
    }
    let mut end = max_bytes;
    while end > 0 && !content.is_char_boundary(end) {
        end -= 1;
    }
    content.truncate(end);
    *truncated = true;
    content
}

fn parse_timeout_ms(value: &Option<String>, default: u64) -> u64 {
    value
        .as_ref()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .unwrap_or(default)
        .clamp(100, 120_000)
}

async fn wait_for_selector(page: &Page, selector: &str, timeout_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        if page.find_element(selector).await.is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "{ELEMENT_NOT_FOUND}: Timed out waiting for selector after {timeout_ms} ms."
            ));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn with_cdp_timeout<T, F>(future: F) -> Result<T, String>
where
    F: Future<Output = T>,
{
    tokio::time::timeout(CDP_OPERATION_TIMEOUT, future)
        .await
        .map_err(|_| "DESKTOP_BROWSER_UNAVAILABLE: Browser operation timed out.".to_string())
}

async fn with_cdp_timeout_duration<T, F>(duration: Duration, future: F) -> Result<T, String>
where
    F: Future<Output = T>,
{
    tokio::time::timeout(duration, future).await.map_err(|_| {
        format!(
            "DESKTOP_BROWSER_UNAVAILABLE: Browser operation timed out after {} ms.",
            duration.as_millis()
        )
    })
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

fn terminate_launched_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_match_allows_prefix() {
        assert!(urls_match(
            "https://example.com/path",
            "https://example.com"
        ));
        assert!(urls_match("https://example.com", "https://example.com"));
        assert!(!urls_match("https://other.com", "https://example.com"));
    }

    #[test]
    fn screenshot_format_defaults_to_jpeg() {
        assert_eq!(screenshot_format(None), CaptureScreenshotFormat::Jpeg);
        assert_eq!(screenshot_format(Some("png")), CaptureScreenshotFormat::Png);
    }

    #[test]
    fn truncate_respects_utf8_char_boundary() {
        let input = "ä".repeat(300_000);
        let mut truncated = false;
        let output = truncate_to_byte_limit(input, MAX_CONTENT_BYTES, &mut truncated);
        assert!(truncated);
        assert!(output.len() <= MAX_CONTENT_BYTES);
        assert!(std::str::from_utf8(output.as_bytes()).is_ok());
    }

    #[test]
    fn is_user_page_url_filters_internal_schemes() {
        assert!(!is_user_page_url(
            "devtools://devtools/bundled/inspector.html"
        ));
        assert!(!is_user_page_url("chrome://newtab/"));
        assert!(is_user_page_url("https://example.com"));
    }

    #[test]
    fn parse_timeout_ms_clamps_and_defaults() {
        assert_eq!(parse_timeout_ms(&None, 5_000), 5_000);
        assert_eq!(
            parse_timeout_ms(&Some("999999".to_string()), 5_000),
            120_000
        );
        assert_eq!(parse_timeout_ms(&Some("1500".to_string()), 5_000), 1_500);
    }

    #[test]
    fn resolve_tab_id_ignores_selector() {
        let params = BrowserActionParams {
            action: "select_tab".to_string(),
            selector: Some("#not-a-tab".to_string()),
            tab_id: Some("tab-123".to_string()),
            value: None,
        };
        assert_eq!(resolve_tab_id_from_params("tab-active", &params), "tab-123");

        let fallback = BrowserActionParams {
            action: "close_tab".to_string(),
            selector: Some("#still-not-a-tab".to_string()),
            tab_id: None,
            value: None,
        };
        assert_eq!(
            resolve_tab_id_from_params("tab-active", &fallback),
            "tab-active"
        );
    }

    #[test]
    fn new_tab_with_url_requires_input_approval() {
        let blank_tab = BrowserActionParams {
            action: "new_tab".to_string(),
            selector: None,
            tab_id: None,
            value: None,
        };
        assert!(!browser_action_requires_input_approval(&blank_tab));

        let url_tab = BrowserActionParams {
            action: "new_tab".to_string(),
            selector: None,
            tab_id: None,
            value: Some("https://example.com".to_string()),
        };
        assert!(browser_action_requires_input_approval(&url_tab));

        let explicit_blank_tab = BrowserActionParams {
            action: "new_tab".to_string(),
            selector: None,
            tab_id: None,
            value: Some("about:blank".to_string()),
        };
        assert!(!browser_action_requires_input_approval(&explicit_blank_tab));
    }

    #[test]
    fn terminate_launched_child_stops_child_process() {
        let mut child = spawn_sleeping_child();
        terminate_launched_child(&mut child);
        assert!(child.try_wait().expect("child status").is_some());
    }

    #[cfg(windows)]
    fn spawn_sleeping_child() -> Child {
        std::process::Command::new("cmd")
            .args(["/C", "ping -n 30 127.0.0.1 > NUL"])
            .spawn()
            .expect("sleeping child")
    }

    #[cfg(not(windows))]
    fn spawn_sleeping_child() -> Child {
        std::process::Command::new("sh")
            .args(["-c", "sleep 30"])
            .spawn()
            .expect("sleeping child")
    }
}
