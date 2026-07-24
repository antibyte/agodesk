import { get } from "svelte/store";
import { settings } from "../../stores/settings";
import { invokePageAgentDisable, invokePageAgentEnable } from "./inject";
import { startPageAgentBridge, stopPageAgentBridge } from "./bridge";

let active = false;

export function pageAgentActive(): boolean {
  return active;
}

/**
 * page-agent may run only when the user opted in AND the prerequisite desktop +
 * browser control toggles are on (the injection rides on the CDP session).
 */
export function pageAgentConfigured(): boolean {
  const appSettings = get(settings);
  return (
    appSettings.pageAgentEnabled === true &&
    appSettings.browserControlEnabled &&
    appSettings.desktopControlEnabled
  );
}

/** Starts the LLM bridge and injects page-agent into the active tab. */
export async function enablePageAgent(): Promise<void> {
  if (active) {
    return;
  }
  const appSettings = get(settings);
  await startPageAgentBridge();
  try {
    await invokePageAgentEnable({
      locale: appSettings.locale,
    });
    active = true;
  } catch (error) {
    stopPageAgentBridge();
    throw error;
  }
}

/** Removes the in-page instance and stops the bridge. */
export async function disablePageAgent(): Promise<void> {
  if (!active) {
    stopPageAgentBridge();
    return;
  }
  active = false;
  try {
    await invokePageAgentDisable();
  } finally {
    stopPageAgentBridge();
  }
}

/**
 * User-initiated entry point (chat button): launches/attaches a browser tab over
 * CDP and injects page-agent into it, independent of any AuraGo-driven connect.
 * Start URL comes from settings (defaults to about:blank).
 */
export async function openPageAgentBrowserTab(): Promise<void> {
  const { browserConnect } = await import("../desktop");
  const { normalizePageAgentStartUrl } = await import("../../types/protocol");
  const startUrl = normalizePageAgentStartUrl(get(settings).pageAgentStartUrl);
  await browserConnect({ auto_launch: true, url: startUrl });
  // A fresh CDP session drops any previous injection, so force (re)install.
  active = false;
  await enablePageAgent();
}

/** Called after a successful CDP connect: enables page-agent when configured. */
export async function syncPageAgentAfterBrowserConnect(): Promise<void> {
  if (pageAgentConfigured()) {
    await enablePageAgent();
  }
}

/** Called before a CDP disconnect: tears page-agent down if running. */
export async function syncPageAgentBeforeBrowserDisconnect(): Promise<void> {
  await disablePageAgent();
}
