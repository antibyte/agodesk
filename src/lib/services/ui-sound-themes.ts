import type { UiSoundEvent, UiSoundTheme } from "../types/protocol";

export type ToneWaveform = OscillatorType | "noise";

export interface ToneDef {
  freq: number;
  type: ToneWaveform;
  startOffset: number;
  attack: number;
  decay: number;
  peakGain: number;
  freqEnd?: number;
}

export interface UiSoundThemeDefinition {
  baseGain: number;
  events: Record<UiSoundEvent, ToneDef[]>;
}

const soft: UiSoundThemeDefinition = {
  baseGain: 0.85,
  events: {
    send: [
      { freq: 880, type: "sine", startOffset: 0, attack: 0.004, decay: 0.055, peakGain: 0.12 },
    ],
    receive: [
      { freq: 660, type: "sine", startOffset: 0, attack: 0.005, decay: 0.075, peakGain: 0.14 },
    ],
    success: [
      { freq: 523, type: "sine", startOffset: 0, attack: 0.004, decay: 0.05, peakGain: 0.1 },
      { freq: 784, type: "sine", startOffset: 0.04, attack: 0.004, decay: 0.06, peakGain: 0.11 },
    ],
    error: [
      { freq: 220, type: "sine", startOffset: 0, attack: 0.003, decay: 0.09, peakGain: 0.13 },
    ],
    notice: [
      { freq: 440, type: "triangle", startOffset: 0, attack: 0.005, decay: 0.07, peakGain: 0.11 },
    ],
  },
};

const classic: UiSoundThemeDefinition = {
  baseGain: 0.9,
  events: {
    send: [
      { freq: 1046, type: "sine", startOffset: 0, attack: 0.003, decay: 0.05, peakGain: 0.11 },
    ],
    receive: [
      { freq: 880, type: "sine", startOffset: 0, attack: 0.003, decay: 0.045, peakGain: 0.1 },
      { freq: 1174, type: "sine", startOffset: 0.035, attack: 0.003, decay: 0.055, peakGain: 0.1 },
    ],
    success: [
      { freq: 659, type: "sine", startOffset: 0, attack: 0.003, decay: 0.05, peakGain: 0.1 },
      { freq: 988, type: "sine", startOffset: 0.045, attack: 0.003, decay: 0.065, peakGain: 0.1 },
    ],
    error: [
      { freq: 311, type: "sine", startOffset: 0, attack: 0.003, decay: 0.06, peakGain: 0.1 },
      { freq: 233, type: "sine", startOffset: 0.05, attack: 0.003, decay: 0.07, peakGain: 0.09 },
    ],
    notice: [
      { freq: 740, type: "sine", startOffset: 0, attack: 0.003, decay: 0.04, peakGain: 0.09 },
      { freq: 880, type: "sine", startOffset: 0.03, attack: 0.003, decay: 0.05, peakGain: 0.09 },
    ],
  },
};

const modern: UiSoundThemeDefinition = {
  baseGain: 0.75,
  events: {
    send: [
      { freq: 2400, type: "noise", startOffset: 0, attack: 0.001, decay: 0.025, peakGain: 0.08 },
      {
        freq: 1200,
        type: "sine",
        startOffset: 0.008,
        attack: 0.002,
        decay: 0.04,
        peakGain: 0.07,
        freqEnd: 900,
      },
    ],
    receive: [
      { freq: 1800, type: "noise", startOffset: 0, attack: 0.001, decay: 0.02, peakGain: 0.06 },
      {
        freq: 900,
        type: "sine",
        startOffset: 0.01,
        attack: 0.003,
        decay: 0.05,
        peakGain: 0.09,
        freqEnd: 650,
      },
    ],
    success: [
      {
        freq: 1000,
        type: "sine",
        startOffset: 0,
        attack: 0.002,
        decay: 0.06,
        peakGain: 0.1,
        freqEnd: 1400,
      },
    ],
    error: [
      {
        freq: 1600,
        type: "sine",
        startOffset: 0,
        attack: 0.002,
        decay: 0.07,
        peakGain: 0.09,
        freqEnd: 400,
      },
    ],
    notice: [
      { freq: 3200, type: "noise", startOffset: 0, attack: 0.001, decay: 0.018, peakGain: 0.05 },
      {
        freq: 800,
        type: "square",
        startOffset: 0.012,
        attack: 0.002,
        decay: 0.035,
        peakGain: 0.04,
      },
    ],
  },
};

const warm: UiSoundThemeDefinition = {
  baseGain: 0.95,
  events: {
    send: [
      { freq: 392, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.06, peakGain: 0.11 },
    ],
    receive: [
      { freq: 440, type: "triangle", startOffset: 0, attack: 0.005, decay: 0.055, peakGain: 0.1 },
      {
        freq: 554,
        type: "triangle",
        startOffset: 0.04,
        attack: 0.005,
        decay: 0.065,
        peakGain: 0.1,
      },
    ],
    success: [
      { freq: 349, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.05, peakGain: 0.1 },
      {
        freq: 523,
        type: "triangle",
        startOffset: 0.045,
        attack: 0.005,
        decay: 0.07,
        peakGain: 0.1,
      },
    ],
    error: [
      { freq: 196, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.085, peakGain: 0.12 },
    ],
    notice: [
      { freq: 494, type: "triangle", startOffset: 0, attack: 0.005, decay: 0.075, peakGain: 0.1 },
    ],
  },
};

export const UI_SOUND_THEME_DEFINITIONS: Record<UiSoundTheme, UiSoundThemeDefinition> = {
  soft,
  classic,
  modern,
  warm,
};
