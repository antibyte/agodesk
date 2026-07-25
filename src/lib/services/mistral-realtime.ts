import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { parseMistralRealtimeEvent } from "./mistral-realtime-protocol";

export async function connectMistralRealtime(options: {
  model: string;
  targetStreamingDelayMs?: number;
}): Promise<void> {
  await invoke("mistral_realtime_connect", {
    model: options.model,
    targetStreamingDelayMs: options.targetStreamingDelayMs,
  });
}

export async function sendMistralRealtimeJson(payload: object): Promise<void> {
  await invoke("mistral_realtime_send", { data: JSON.stringify(payload) });
}

export async function disconnectMistralRealtime(): Promise<void> {
  await invoke("mistral_realtime_disconnect");
}

export async function subscribeMistralRealtime(handlers: {
  onMessage?: (raw: unknown) => void;
  onState?: (state: string) => void;
  onError?: (message: string) => void;
}): Promise<UnlistenFn[]> {
  const un: UnlistenFn[] = [];
  un.push(
    await listen<{ data: string }>("mistral-realtime:message", (event) => {
      try {
        handlers.onMessage?.(JSON.parse(event.payload.data));
      } catch {
        handlers.onMessage?.(event.payload.data);
      }
    }),
  );
  un.push(
    await listen<{ state: string }>("mistral-realtime:state", (event) => {
      handlers.onState?.(event.payload.state);
    }),
  );
  un.push(
    await listen<{ message: string }>("mistral-realtime:error", (event) => {
      handlers.onError?.(event.payload.message);
    }),
  );
  return un;
}

export function appendAudioMessage(pcmBase64: string) {
  return { type: "input_audio.append", audio: pcmBase64 };
}

export function flushAudioMessage() {
  return { type: "input_audio.flush" };
}

export function endAudioMessage() {
  return { type: "input_audio.end" };
}

export { parseMistralRealtimeEvent };
