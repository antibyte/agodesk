import type { AppSettings } from "../types/protocol";
import { loadDeviceId } from "./credentials";

const ONBOARDING_KEY = "agodesk.onboarding.completed";

function readLegacyOnboardingFlag(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

export function clearLegacyOnboardingFlag(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(ONBOARDING_KEY);
}

export function isOnboardingCompletedInSettings(appSettings: AppSettings): boolean {
  return appSettings.onboardingCompleted === true;
}

export async function resolveOnboardingInSettings(appSettings: AppSettings): Promise<AppSettings> {
  if (appSettings.onboardingCompleted) {
    return appSettings;
  }

  if (readLegacyOnboardingFlag()) {
    clearLegacyOnboardingFlag();
    return { ...appSettings, onboardingCompleted: true };
  }

  try {
    const deviceId = await loadDeviceId(appSettings.serverUrl);
    if (deviceId) {
      return { ...appSettings, onboardingCompleted: true };
    }
  } catch {
    // Pairing-Store nicht verfügbar (z. B. Tests) → Onboarding-Status unverändert.
  }

  return appSettings;
}

export async function shouldShowOnboarding(appSettings: AppSettings): Promise<boolean> {
  const resolved = await resolveOnboardingInSettings(appSettings);
  return !resolved.onboardingCompleted;
}
