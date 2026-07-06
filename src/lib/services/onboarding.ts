const ONBOARDING_KEY = "agodesk.onboarding.completed";

export function isOnboardingCompleted(): boolean {
  if (typeof localStorage === "undefined") {
    return true;
  }
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

export function markOnboardingCompleted(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(ONBOARDING_KEY, "1");
}

export function resetOnboardingCompleted(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(ONBOARDING_KEY);
}
