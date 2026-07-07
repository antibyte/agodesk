import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DEFAULT_SETTINGS } from "../types/protocol";
import {
  clearLegacyOnboardingFlag,
  isOnboardingCompletedInSettings,
  resolveOnboardingInSettings,
  shouldShowOnboarding,
} from "./onboarding";

const ONBOARDING_KEY = "agodesk.onboarding.completed";
const hasLocalStorage = typeof localStorage !== "undefined";

beforeEach(() => {
  if (hasLocalStorage) {
    localStorage.removeItem(ONBOARDING_KEY);
  }
});

afterEach(() => {
  if (hasLocalStorage) {
    localStorage.removeItem(ONBOARDING_KEY);
  }
});

test("isOnboardingCompletedInSettings liest onboardingCompleted aus AppSettings", () => {
  assert.equal(isOnboardingCompletedInSettings(DEFAULT_SETTINGS), false);
  assert.equal(
    isOnboardingCompletedInSettings({ ...DEFAULT_SETTINGS, onboardingCompleted: true }),
    true,
  );
});

test("resolveOnboardingInSettings belässt bereits abgeschlossenes Onboarding", async () => {
  const completed = { ...DEFAULT_SETTINGS, onboardingCompleted: true };
  const resolved = await resolveOnboardingInSettings(completed);
  assert.equal(resolved, completed);
});

test("shouldShowOnboarding ist false wenn onboardingCompleted gesetzt ist", async () => {
  assert.equal(
    await shouldShowOnboarding({ ...DEFAULT_SETTINGS, onboardingCompleted: true }),
    false,
  );
});

test("shouldShowOnboarding ist true für frische Installation", async () => {
  assert.equal(await shouldShowOnboarding(DEFAULT_SETTINGS), true);
});

if (hasLocalStorage) {
  test("resolveOnboardingInSettings migriert legacy localStorage-Flag", async () => {
    localStorage.setItem(ONBOARDING_KEY, "1");

    const resolved = await resolveOnboardingInSettings(DEFAULT_SETTINGS);

    assert.equal(resolved.onboardingCompleted, true);
    assert.equal(localStorage.getItem(ONBOARDING_KEY), null);
  });

  test("clearLegacyOnboardingFlag entfernt localStorage-Eintrag", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    clearLegacyOnboardingFlag();
    assert.equal(localStorage.getItem(ONBOARDING_KEY), null);
  });
}
