import { get } from "svelte/store";
import type { UiSoundEvent, UiSoundTheme } from "../types/protocol";
import { settings } from "../stores/settings";
import { UI_SOUND_THEME_DEFINITIONS, type ToneDef } from "./ui-sound-themes";

const DEBOUNCE_MS = 80;

let audioContext: AudioContext | null = null;
let unlockRegistered = false;
const lastPlayedAt: Partial<Record<UiSoundEvent, number>> = {};

export interface PlayUiSoundOverrides {
  theme?: UiSoundTheme;
  volume?: number;
  enabled?: boolean;
}

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  tone: ToneDef,
  masterGain: number,
): void {
  const start = context.currentTime + tone.startOffset;
  const duration = tone.attack + tone.decay;
  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(tone.peakGain * masterGain, start + tone.attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
  gainNode.connect(destination);

  if (tone.type === "noise") {
    const sampleCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = tone.freq;
    filter.Q.value = 10;
    source.connect(filter);
    filter.connect(gainNode);
    source.start(start);
    source.stop(start + duration + 0.01);
    return;
  }

  const oscillator = context.createOscillator();
  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.freq, start);
  if (tone.freqEnd && tone.freqEnd > 0) {
    oscillator.frequency.exponentialRampToValueAtTime(tone.freqEnd, start + duration);
  }
  oscillator.connect(gainNode);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

async function ensureContext(): Promise<AudioContext | null> {
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // Autoplay-Policy kann resume blockieren.
    }
  }

  return audioContext;
}

export function unlockUiAudioContext(): void {
  if (unlockRegistered) {
    void ensureContext();
    return;
  }

  unlockRegistered = true;
  const unlock = (): void => {
    void ensureContext();
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, passive: true });
}

function resolveOptions(overrides?: PlayUiSoundOverrides): {
  enabled: boolean;
  theme: UiSoundTheme;
  volume: number;
} {
  const current = get(settings).uiSounds;
  return {
    enabled: overrides?.enabled ?? current.enabled,
    theme: overrides?.theme ?? current.theme,
    volume: overrides?.volume ?? current.volume,
  };
}

export function playUiSound(event: UiSoundEvent, overrides?: PlayUiSoundOverrides): void {
  const { enabled, theme, volume } = resolveOptions(overrides);
  if (!enabled || volume <= 0) {
    return;
  }

  const now = Date.now();
  const last = lastPlayedAt[event];
  if (last !== undefined && now - last < DEBOUNCE_MS) {
    return;
  }
  lastPlayedAt[event] = now;

  void (async () => {
    const context = await ensureContext();
    if (!context) {
      return;
    }

    const definition = UI_SOUND_THEME_DEFINITIONS[theme];
    const masterGain = volume * definition.baseGain;
    const output = context.createGain();
    output.gain.value = 1;
    output.connect(context.destination);

    for (const tone of definition.events[event]) {
      scheduleTone(context, output, tone, masterGain);
    }
  })();
}

export function previewUiSoundTheme(theme: UiSoundTheme): void {
  playUiSound("receive", { theme, enabled: true });
}
