export const GROK_VOICE_WS_HOST = "api.x.ai";
export const GROK_VOICE_WS_PATH = "/v1/realtime";

export const DEFAULT_GROK_VOICE_MODEL = "grok-voice-latest";
export const DEFAULT_GROK_VOICE_NAME = "eve";

/**
 * Built-in xAI voices (Voice Agent + TTS).
 * Original five + flagship roster from xAI (Jul 2026+). Full catalog may grow —
 * prefer GET /v1/tts/voices when a key is available.
 * @see https://x.ai/news/new-flagship-voices
 */
export const GROK_VOICE_OPTIONS = [
  // Original five
  "eve",
  "ara",
  "rex",
  "sal",
  "leo",
  // Flagship / expanded catalog (API accepts same IDs for realtime voice)
  "lumen",
  "castor",
  "naksh",
  "atlas",
  "carina",
  "zagan",
  "helix",
  "orion",
  "luna",
  "wellness",
  "support",
  // Additional common console names (safe to list; unknown IDs rejected by API)
  "nova",
  "sage",
  "vibe",
  "spark",
  "echo",
  "bloom",
  "haven",
  "river",
  "sol",
  "mira",
  "jade",
  "ash",
  "vale",
  "crow",
  "pine",
] as const;

export type GrokBuiltInVoice = (typeof GROK_VOICE_OPTIONS)[number];

export interface GrokVoiceOption {
  voiceId: string;
  name: string;
  language?: string | null;
  custom?: boolean;
}

export function grokVoiceOptionLabel(voice: GrokVoiceOption): string {
  const id = voice.voiceId.trim();
  const name = voice.name.trim();
  if (!name || name.toLowerCase() === id.toLowerCase()) {
    return id;
  }
  return `${name} (${id})`;
}

export function mergeGrokVoiceOptions(
  remote: GrokVoiceOption[],
  selectedVoiceId?: string,
): GrokVoiceOption[] {
  const byId = new Map<string, GrokVoiceOption>();
  for (const id of GROK_VOICE_OPTIONS) {
    byId.set(id, { voiceId: id, name: id.charAt(0).toUpperCase() + id.slice(1) });
  }
  for (const voice of remote) {
    const id = voice.voiceId.trim().toLowerCase();
    if (!id) continue;
    byId.set(id, {
      voiceId: id,
      name: voice.name.trim() || id,
      language: voice.language ?? null,
      custom: voice.custom === true,
    });
  }
  const selected = selectedVoiceId?.trim().toLowerCase();
  if (selected && !byId.has(selected)) {
    byId.set(selected, { voiceId: selected, name: selected, custom: true });
  }
  return [...byId.values()].sort((a, b) => {
    if (Boolean(a.custom) !== Boolean(b.custom)) {
      return a.custom ? 1 : -1;
    }
    return a.voiceId.localeCompare(b.voiceId);
  });
}

const GROK_MODEL_ALIASES: Record<string, string> = {
  "grok-voice": DEFAULT_GROK_VOICE_MODEL,
  "grok-voice-agent": DEFAULT_GROK_VOICE_MODEL,
  "grok-voice-think-fast": "grok-voice-think-fast-1.0",
  "grok-voice-think-fast-1": "grok-voice-think-fast-1.0",
};

export const GROK_INPUT_SAMPLE_RATE = 16_000;
export const GROK_OUTPUT_SAMPLE_RATE = 24_000;

export function normalizeGrokVoiceModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return DEFAULT_GROK_VOICE_MODEL;
  }
  return GROK_MODEL_ALIASES[trimmed] ?? trimmed;
}

export function buildGrokVoiceWsUrl(modelId: string): string {
  const model = encodeURIComponent(normalizeGrokVoiceModelId(modelId));
  return `wss://${GROK_VOICE_WS_HOST}${GROK_VOICE_WS_PATH}?model=${model}`;
}

export function redactGrokVoiceWsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}?model=${parsed.searchParams.get("model") ?? ""}`;
  } catch {
    return "[invalid-grok-ws-url]";
  }
}

/**
 * Map app BCP-47 speech language to a Grok language_hint.
 * Spanish/Portuguese require a regional variant; bare "es"/"pt" are ignored by xAI.
 */
export function toGrokLanguageHint(language: string): string | undefined {
  const raw = language.trim();
  if (!raw) {
    return undefined;
  }
  const lower = raw.toLowerCase();
  if (lower === "es" || lower.startsWith("es-")) {
    if (lower === "es-mx" || lower.startsWith("es-mx")) return "es-MX";
    return "es-ES";
  }
  if (lower === "pt" || lower.startsWith("pt-")) {
    if (lower === "pt-pt" || lower.startsWith("pt-pt")) return "pt-PT";
    return "pt-BR";
  }
  // Prefer primary subtag for most languages (de-DE → de, ja-JP → ja).
  const primary = lower.split("-")[0] ?? lower;
  if (primary === "zh") return "zh";
  if (primary.length >= 2) return primary;
  return undefined;
}

export function normalizeGrokVoiceName(voiceName: string): string {
  const trimmed = voiceName.trim();
  if (!trimmed) {
    return DEFAULT_GROK_VOICE_NAME;
  }
  return trimmed.toLowerCase();
}
