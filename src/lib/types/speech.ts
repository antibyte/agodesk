export type SpeechStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "error";

export interface SpeechState {
  status: SpeechStatus;
  isActive: boolean;
  partialTranscript: string;
  errorMessage: string;
  agentMode: boolean;
  /** True while (re)loading the Silero VAD model on first use. */
  vadLoading: boolean;
  /** Error message from VAD initialization (e.g. network error on first Silero download). */
  vadError: string;
}

export const INITIAL_SPEECH_STATE: SpeechState = {
  status: "idle",
  isActive: false,
  partialTranscript: "",
  errorMessage: "",
  agentMode: false,
  vadLoading: false,
  vadError: "",
};

export interface SpeechAgentContext {
  connectionStatus: string;
  sessionStatus: string;
  remoteControlActive: boolean;
  remoteControlPending: boolean;
  canSendChat: boolean;
}

export const GEMINI_LIVE_WS_PATH =
  "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const GEMINI_LIVE_WS_PATH_ALPHA =
  "/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

export const GEMINI_LIVE_HOST = "generativelanguage.googleapis.com";

const LIVE_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-native-audio": "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-live-2.5-flash-native-audio": "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-live": "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3.1-flash-live": "gemini-3.1-flash-live-preview",
};

export const DEFAULT_GEMINI_LIVE_MODEL =
  "gemini-2.5-flash-native-audio-preview-12-2025";

export function buildGeminiLiveWsUrl(
  apiKey: string,
  apiVersion: "v1beta" | "v1alpha" = "v1beta",
): string {
  const params = new URLSearchParams({ key: apiKey.trim() });
  const path =
    apiVersion === "v1alpha" ? GEMINI_LIVE_WS_PATH_ALPHA : GEMINI_LIVE_WS_PATH;
  return `wss://${GEMINI_LIVE_HOST}${path}?${params.toString()}`;
}

export function normalizeModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return DEFAULT_GEMINI_LIVE_MODEL;
  }
  const withoutPrefix = trimmed.startsWith("models/")
    ? trimmed.slice("models/".length)
    : trimmed;
  return LIVE_MODEL_ALIASES[withoutPrefix] ?? withoutPrefix;
}

export function toGeminiModelPath(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  return normalized.startsWith("models/") ? normalized : `models/${normalized}`;
}

export type GeminiResponseModality = "TEXT" | "AUDIO";

export function isNativeAudioLiveModel(modelId: string): boolean {
  const id = normalizeModelId(modelId).toLowerCase();
  return (
    id.includes("native-audio") ||
    id.includes("flash-live") ||
    id.endsWith("-live-preview")
  );
}

export function resolveResponseModalities(
  modelId: string,
): GeminiResponseModality[] {
  // Native-Audio-Modelle: nur AUDIO; Text über input/outputAudioTranscription
  if (isNativeAudioLiveModel(modelId)) {
    return ["AUDIO"];
  }
  return ["TEXT"];
}

export function resolveLiveApiVersions(
  modelId: string,
): Array<"v1beta" | "v1alpha"> {
  return isNativeAudioLiveModel(modelId)
    ? ["v1alpha", "v1beta"]
    : ["v1beta", "v1alpha"];
}
