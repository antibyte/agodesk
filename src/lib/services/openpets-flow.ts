import { invoke } from "@tauri-apps/api/core";
import { isChatPlanPanelVisible } from "../stores/chat-plan";

export const OPENPETS_REACTIONS = [
  "idle",
  "thinking",
  "working",
  "editing",
  "running",
  "testing",
  "waiting",
  "waving",
  "success",
  "error",
  "celebrating",
] as const;

export type OpenPetsReaction = (typeof OPENPETS_REACTIONS)[number];

export interface OpenPetsStatusResult {
  reachable: boolean;
  enabled: boolean;
  appVersion?: string | null;
  petId?: string | null;
  petName?: string | null;
  fallbackReason?: string | null;
  unavailableReason?: string | null;
}

export interface OpenPetsPetListItem {
  id: string;
  displayName: string;
  builtIn: boolean;
  broken: boolean;
}

export interface OpenPetsPetListResult {
  reachable: boolean;
  defaultPetId?: string | null;
  pets: OpenPetsPetListItem[];
  unavailableReason?: string | null;
}

export interface OpenPetsActionResult {
  ok: boolean;
  unavailableReason?: string | null;
}

export interface OpenPetsLifecycleInput {
  enabled: boolean;
  requestInFlight: boolean;
  hasActivePlan: boolean;
  remoteOperation: string;
  speechActive: boolean;
  reactToSpeech: boolean;
  connectionError: boolean;
  sessionError: boolean;
  requestJustFinished: boolean;
  requestFailed: boolean;
  showMessages: boolean;
}

export function deriveOpenPetsReaction(input: OpenPetsLifecycleInput): OpenPetsReaction {
  if (!input.enabled) {
    return "idle";
  }
  if (input.sessionError || input.connectionError || input.requestFailed) {
    return "error";
  }
  if (input.requestJustFinished) {
    return "success";
  }
  if (input.reactToSpeech && input.speechActive) {
    return "waving";
  }
  if (input.remoteOperation) {
    const operation = input.remoteOperation.toLowerCase();
    if (operation.includes("shell") || operation.includes("exec") || operation.includes("browser")) {
      return "running";
    }
    if (operation.includes("test")) {
      return "testing";
    }
    return "editing";
  }
  if (input.hasActivePlan && input.requestInFlight) {
    return "working";
  }
  if (input.requestInFlight) {
    return "thinking";
  }
  return "idle";
}

export function deriveOpenPetsStatusMessage(
  reaction: OpenPetsReaction,
  input: OpenPetsLifecycleInput,
): string | null {
  if (!input.enabled || !input.showMessages) {
    return null;
  }
  switch (reaction) {
    case "thinking":
      return "Agent denkt nach";
    case "working":
      return "Agent arbeitet";
    case "editing":
      return "Dateien werden bearbeitet";
    case "running":
      return "Befehl wird ausgefuehrt";
    case "testing":
      return "Tests laufen";
    case "success":
      return "Aufgabe erledigt";
    case "error":
      return "Etwas ist schiefgelaufen";
    case "waving":
      return "Sprachmodus aktiv";
    default:
      return null;
  }
}

export function hasActiveChatPlan(plan: Parameters<typeof isChatPlanPanelVisible>[0]): boolean {
  return isChatPlanPanelVisible(plan);
}

export async function fetchOpenPetsStatus(): Promise<OpenPetsStatusResult> {
  return invoke<OpenPetsStatusResult>("openpets_status");
}

export async function fetchOpenPetsPets(): Promise<OpenPetsPetListResult> {
  return invoke<OpenPetsPetListResult>("openpets_list_pets");
}

export async function setOpenPetsEnabled(
  enabled: boolean,
  petId: string | null,
): Promise<OpenPetsActionResult> {
  return invoke<OpenPetsActionResult>("openpets_set_enabled", {
    enabled,
    petId: petId && petId.trim().length > 0 ? petId.trim() : null,
  });
}

export async function sendOpenPetsReaction(reaction: OpenPetsReaction): Promise<OpenPetsActionResult> {
  return invoke<OpenPetsActionResult>("openpets_react", { reaction });
}

export async function sendOpenPetsMessage(
  message: string,
  reaction?: OpenPetsReaction,
): Promise<OpenPetsActionResult> {
  return invoke<OpenPetsActionResult>("openpets_say", { message, reaction });
}

export async function applyOpenPetsSettings(openPets: {
  enabled: boolean;
  petId: string | null;
}): Promise<void> {
  try {
    await setOpenPetsEnabled(openPets.enabled, openPets.petId);
  } catch {
    // OpenPets ist optional
  }
}

const REACTION_THROTTLE_MS = 350;
let lastReactionSent = "";
let lastReactionAt = 0;
let pendingReactionTimer: ReturnType<typeof setTimeout> | null = null;

export async function publishOpenPetsLifecycle(
  reaction: OpenPetsReaction,
  message: string | null,
): Promise<void> {
  const now = Date.now();
  if (reaction === lastReactionSent && now - lastReactionAt < REACTION_THROTTLE_MS) {
    return;
  }

  if (pendingReactionTimer) {
    clearTimeout(pendingReactionTimer);
    pendingReactionTimer = null;
  }

  pendingReactionTimer = setTimeout(() => {
    pendingReactionTimer = null;
    void (async () => {
      try {
        const result = await sendOpenPetsReaction(reaction);
        if (!result.ok) {
          return;
        }
        lastReactionSent = reaction;
        lastReactionAt = Date.now();
        if (message) {
          await sendOpenPetsMessage(message, reaction);
        }
      } catch {
        // OpenPets ist optional — Fehler still ignorieren
      }
    })();
  }, REACTION_THROTTLE_MS);
}

export function resetOpenPetsLifecyclePublisher(): void {
  lastReactionSent = "";
  lastReactionAt = 0;
  if (pendingReactionTimer) {
    clearTimeout(pendingReactionTimer);
    pendingReactionTimer = null;
  }
}
