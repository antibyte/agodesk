export interface ParsedRealtimeEvent {
  type: string;
  text?: string;
  errorMessage?: string;
  raw: unknown;
}

export function parseMistralRealtimeEvent(raw: unknown): ParsedRealtimeEvent {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", raw };
  }
  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";
  const text =
    typeof record.text === "string"
      ? record.text
      : typeof (record as { delta?: unknown }).delta === "string"
        ? ((record as { delta: string }).delta)
        : undefined;
  let errorMessage: string | undefined;
  if (type === "error") {
    const err = record.error;
    if (typeof err === "string") errorMessage = err;
    else if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
      errorMessage = (err as { message: string }).message;
    }
  }
  return { type, text, errorMessage, raw };
}

export function accumulateRealtimeTranscript(
  prev: string,
  event: ParsedRealtimeEvent,
): string {
  if (event.type === "transcription.text.delta" && event.text) {
    return prev + event.text;
  }
  if (event.type === "transcription.done" && event.text && event.text.trim()) {
    return event.text;
  }
  return prev;
}

export function parseMistralTtsSseBlock(
  block: string,
): { event: string; audioBase64?: string } | null {
  const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const json = JSON.parse(data) as { audio_data?: string; audioData?: string };
    const audioBase64 = json.audio_data ?? json.audioData;
    return { event, audioBase64 };
  } catch {
    return { event };
  }
}
