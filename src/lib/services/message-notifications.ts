import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { getTranslateFn } from "../i18n/store";
import { isMainWindowVisible, showMainWindowFromTray } from "./tray";

const TOAST_BODY_MAX = 240;

let permissionChecked = false;
let permissionGranted = false;

export function formatNotificationPreview(text: string, maxLength = TOAST_BODY_MAX): string {
  const t = getTranslateFn();
  const collapsed = text
    .replace(/```[\s\S]*?```/g, t("notifications.preview.codePlaceholder"))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!collapsed) {
    return t("notifications.preview.empty");
  }
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionChecked) {
    return permissionGranted;
  }

  try {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }
  } catch {
    permissionGranted = false;
  }

  permissionChecked = true;
  return permissionGranted;
}

export async function notifyIncomingMessageIfHidden(text: string): Promise<void> {
  if (await isMainWindowVisible()) {
    return;
  }

  if (!(await ensureNotificationPermission())) {
    return;
  }

  const body = formatNotificationPreview(text);
  const t = getTranslateFn();

  try {
    const notification = new Notification(t("notifications.title"), {
      body,
      tag: "agodesk-incoming-message",
    });

    notification.onclick = () => {
      notification.close();
      void showMainWindowFromTray();
    };
  } catch {
    // Notification API nicht verfügbar.
  }
}
