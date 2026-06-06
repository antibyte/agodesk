import type { AgentMoodMetadata } from "../types/protocol";

export interface MoodVoiceStyle {
  hint: string;
  tone: "precise" | "warm" | "serious";
}

const PRECISE_MOODS = new Set(["focused", "analytical", "cautious"]);
const WARM_MOODS = new Set(["curious", "creative", "playful"]);
const SERIOUS_MOODS = new Set(["concerned", "frustrated"]);

export function clampMoodScalar(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, value));
}

export function resolvePrimaryMoodLabel(mood: AgentMoodMetadata): string {
  const raw = mood.mood ?? mood.primary_mood ?? "";
  return raw.trim().toLowerCase();
}

export function buildMoodVoiceStyle(mood: AgentMoodMetadata): MoodVoiceStyle {
  const label = resolvePrimaryMoodLabel(mood);
  const styleHint = mood.recommended_response_style?.trim();

  if (SERIOUS_MOODS.has(label)) {
    return {
      tone: "serious",
      hint: styleHint
        ? `Sprich klar und direkt. Stilhinweis: ${styleHint}.`
        : "Sprich klar und direkt, ohne Spielereien. Sei verständlich und sachlich.",
    };
  }

  if (WARM_MOODS.has(label)) {
    return {
      tone: "warm",
      hint: styleHint
        ? `Sprich warm und lebendig. Stilhinweis: ${styleHint}.`
        : "Sprich warm, freundlich und etwas lebendiger, aber bleib präzise.",
    };
  }

  if (PRECISE_MOODS.has(label)) {
    return {
      tone: "precise",
      hint: styleHint
        ? `Sprich ruhig und präzise. Stilhinweis: ${styleHint}.`
        : "Sprich ruhig, präzise und sachlich. Halte Antworten klar und strukturiert.",
    };
  }

  return {
    tone: "precise",
    hint: styleHint
      ? `Passe deinen Sprechstil an: ${styleHint}.`
      : "Sprich natürlich, klar und verständlich.",
  };
}

export function buildAgentMoodInstructionBlock(mood: AgentMoodMetadata): string {
  const style = buildMoodVoiceStyle(mood);
  const valence = clampMoodScalar(mood.valence, -1, 1);
  const arousal = clampMoodScalar(mood.arousal, 0, 1);
  const confidence = clampMoodScalar(mood.confidence, 0, 1);

  const parts = [style.hint];
  const numericHints: string[] = [];
  if (valence !== undefined) {
    numericHints.push(valence >= 0 ? "leicht positiv" : "zurückhaltend");
  }
  if (arousal !== undefined) {
    numericHints.push(arousal >= 0.6 ? "etwas energischer" : "ruhig");
  }
  if (confidence !== undefined) {
    numericHints.push(confidence >= 0.6 ? "selbstsicher" : "vorsichtig");
  }
  if (numericHints.length > 0) {
    parts.push(`Tonfall: ${numericHints.join(", ")}.`);
  }

  return parts.join(" ");
}

export function appendAgentMoodHint(baseInstruction: string, mood?: AgentMoodMetadata | null): string {
  if (!mood) {
    return baseInstruction;
  }
  const block = buildAgentMoodInstructionBlock(mood);
  return `${baseInstruction.trim()}\n\nAktueller AuraGo-Stimmungshinweis (nicht vorlesen): ${block}`;
}
