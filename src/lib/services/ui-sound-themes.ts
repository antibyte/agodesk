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

const aurora: UiSoundThemeDefinition = {
  baseGain: 0.82,
  events: {
    send: [
      { freq: 880, type: "sine", startOffset: 0, attack: 0.003, decay: 0.05, peakGain: 0.1 },
      {
        freq: 1320,
        type: "sine",
        startOffset: 0.025,
        attack: 0.003,
        decay: 0.055,
        peakGain: 0.08,
        freqEnd: 990,
      },
    ],
    receive: [
      { freq: 660, type: "sine", startOffset: 0, attack: 0.004, decay: 0.07, peakGain: 0.11 },
      {
        freq: 990,
        type: "triangle",
        startOffset: 0.035,
        attack: 0.004,
        decay: 0.06,
        peakGain: 0.09,
      },
    ],
    success: [
      { freq: 523, type: "sine", startOffset: 0, attack: 0.003, decay: 0.045, peakGain: 0.09 },
      {
        freq: 784,
        type: "sine",
        startOffset: 0.04,
        attack: 0.003,
        decay: 0.065,
        peakGain: 0.1,
      },
      {
        freq: 988,
        type: "triangle",
        startOffset: 0.08,
        attack: 0.003,
        decay: 0.07,
        peakGain: 0.08,
      },
    ],
    error: [
      { freq: 280, type: "sine", startOffset: 0, attack: 0.003, decay: 0.08, peakGain: 0.11 },
    ],
    notice: [
      {
        freq: 740,
        type: "triangle",
        startOffset: 0,
        attack: 0.004,
        decay: 0.06,
        peakGain: 0.09,
        freqEnd: 880,
      },
    ],
  },
};

// ── Schlicht: sehr kurze, leise Sinus-Klicks ──
const minimal: UiSoundThemeDefinition = {
  baseGain: 0.5,
  events: {
    send: [
      { freq: 1000, type: "sine", startOffset: 0, attack: 0.001, decay: 0.02, peakGain: 0.06 },
    ],
    receive: [
      { freq: 720, type: "sine", startOffset: 0, attack: 0.001, decay: 0.022, peakGain: 0.06 },
    ],
    success: [
      { freq: 880, type: "sine", startOffset: 0, attack: 0.001, decay: 0.025, peakGain: 0.06 },
    ],
    error: [
      { freq: 320, type: "sine", startOffset: 0, attack: 0.001, decay: 0.03, peakGain: 0.07 },
    ],
    notice: [
      { freq: 600, type: "sine", startOffset: 0, attack: 0.001, decay: 0.02, peakGain: 0.05 },
    ],
  },
};

// ── Blossom: weiche Glockentöne, Dur-Terzen, Harfen-artige Arpeggios ──
const blossom: UiSoundThemeDefinition = {
  baseGain: 0.85,
  events: {
    send: [
      { freq: 1046, type: "sine", startOffset: 0, attack: 0.004, decay: 0.09, peakGain: 0.1 },
      { freq: 1568, type: "sine", startOffset: 0.05, attack: 0.004, decay: 0.11, peakGain: 0.07 },
    ],
    receive: [
      { freq: 784, type: "sine", startOffset: 0, attack: 0.005, decay: 0.1, peakGain: 0.1 },
      { freq: 988, type: "sine", startOffset: 0.06, attack: 0.005, decay: 0.11, peakGain: 0.08 },
    ],
    success: [
      { freq: 659, type: "sine", startOffset: 0, attack: 0.004, decay: 0.08, peakGain: 0.09 },
      { freq: 831, type: "sine", startOffset: 0.05, attack: 0.004, decay: 0.09, peakGain: 0.09 },
      { freq: 1046, type: "sine", startOffset: 0.1, attack: 0.004, decay: 0.11, peakGain: 0.08 },
    ],
    error: [
      { freq: 415, type: "triangle", startOffset: 0, attack: 0.005, decay: 0.11, peakGain: 0.1 },
      { freq: 349, type: "sine", startOffset: 0.06, attack: 0.005, decay: 0.11, peakGain: 0.08 },
    ],
    notice: [
      { freq: 880, type: "sine", startOffset: 0, attack: 0.005, decay: 0.09, peakGain: 0.08 },
      { freq: 1108, type: "sine", startOffset: 0.045, attack: 0.005, decay: 0.1, peakGain: 0.07 },
    ],
  },
};

// ── Cyberpunk: Sägezahn-Sweeps, Bit-Noise, tiefe Fehler-Buzzer ──
const cyberpunk: UiSoundThemeDefinition = {
  baseGain: 0.8,
  events: {
    send: [
      {
        freq: 420,
        type: "sawtooth",
        startOffset: 0,
        attack: 0.002,
        decay: 0.06,
        peakGain: 0.09,
        freqEnd: 1400,
      },
      { freq: 5000, type: "noise", startOffset: 0, attack: 0.001, decay: 0.02, peakGain: 0.05 },
    ],
    receive: [
      {
        freq: 1600,
        type: "sawtooth",
        startOffset: 0,
        attack: 0.002,
        decay: 0.07,
        peakGain: 0.08,
        freqEnd: 500,
      },
      { freq: 3000, type: "noise", startOffset: 0.01, attack: 0.001, decay: 0.02, peakGain: 0.04 },
    ],
    success: [
      {
        freq: 660,
        type: "square",
        startOffset: 0,
        attack: 0.002,
        decay: 0.05,
        peakGain: 0.08,
        freqEnd: 990,
      },
      {
        freq: 1320,
        type: "sawtooth",
        startOffset: 0.05,
        attack: 0.002,
        decay: 0.08,
        peakGain: 0.08,
        freqEnd: 1980,
      },
    ],
    error: [
      {
        freq: 180,
        type: "sawtooth",
        startOffset: 0,
        attack: 0.002,
        decay: 0.115,
        peakGain: 0.12,
        freqEnd: 90,
      },
      { freq: 220, type: "square", startOffset: 0.02, attack: 0.002, decay: 0.11, peakGain: 0.07 },
    ],
    notice: [
      {
        freq: 900,
        type: "square",
        startOffset: 0,
        attack: 0.002,
        decay: 0.045,
        peakGain: 0.07,
        freqEnd: 1200,
      },
    ],
  },
};

// ── Papyrus: gedämpfte Holz-Klänge, Feder-Kratzen für send ──
const papyrus: UiSoundThemeDefinition = {
  baseGain: 0.9,
  events: {
    send: [
      { freq: 2200, type: "noise", startOffset: 0, attack: 0.002, decay: 0.06, peakGain: 0.06 },
      {
        freq: 320,
        type: "triangle",
        startOffset: 0.02,
        attack: 0.004,
        decay: 0.05,
        peakGain: 0.06,
      },
    ],
    receive: [
      { freq: 260, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.07, peakGain: 0.1 },
      { freq: 390, type: "sine", startOffset: 0.03, attack: 0.004, decay: 0.06, peakGain: 0.07 },
    ],
    success: [
      { freq: 294, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.06, peakGain: 0.09 },
      {
        freq: 440,
        type: "triangle",
        startOffset: 0.05,
        attack: 0.004,
        decay: 0.08,
        peakGain: 0.09,
      },
    ],
    error: [
      { freq: 165, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.1, peakGain: 0.11 },
      { freq: 900, type: "noise", startOffset: 0.01, attack: 0.002, decay: 0.05, peakGain: 0.04 },
    ],
    notice: [
      { freq: 349, type: "triangle", startOffset: 0, attack: 0.004, decay: 0.065, peakGain: 0.08 },
    ],
  },
};

// ── Chaos: mehrstimmige Sweeps, zufällig wirkende Sprünge, laut & verspielt ──
const chaos: UiSoundThemeDefinition = {
  baseGain: 1,
  events: {
    send: [
      {
        freq: 600,
        type: "sawtooth",
        startOffset: 0,
        attack: 0.002,
        decay: 0.09,
        peakGain: 0.1,
        freqEnd: 1800,
      },
      { freq: 1500, type: "square", startOffset: 0.03, attack: 0.002, decay: 0.06, peakGain: 0.08 },
      { freq: 4000, type: "noise", startOffset: 0.01, attack: 0.001, decay: 0.03, peakGain: 0.06 },
    ],
    receive: [
      {
        freq: 300,
        type: "triangle",
        startOffset: 0,
        attack: 0.003,
        decay: 0.1,
        peakGain: 0.1,
        freqEnd: 1200,
      },
      {
        freq: 950,
        type: "sawtooth",
        startOffset: 0.05,
        attack: 0.002,
        decay: 0.08,
        peakGain: 0.08,
      },
    ],
    success: [
      { freq: 523, type: "square", startOffset: 0, attack: 0.002, decay: 0.06, peakGain: 0.09 },
      {
        freq: 784,
        type: "sawtooth",
        startOffset: 0.05,
        attack: 0.002,
        decay: 0.07,
        peakGain: 0.09,
      },
      {
        freq: 1046,
        type: "square",
        startOffset: 0.1,
        attack: 0.002,
        decay: 0.1,
        peakGain: 0.09,
        freqEnd: 1568,
      },
    ],
    error: [
      {
        freq: 1400,
        type: "sawtooth",
        startOffset: 0,
        attack: 0.002,
        decay: 0.115,
        peakGain: 0.11,
        freqEnd: 130,
      },
      { freq: 200, type: "square", startOffset: 0.04, attack: 0.002, decay: 0.115, peakGain: 0.09 },
    ],
    notice: [
      {
        freq: 700,
        type: "square",
        startOffset: 0,
        attack: 0.002,
        decay: 0.05,
        peakGain: 0.08,
        freqEnd: 1300,
      },
      {
        freq: 2000,
        type: "sawtooth",
        startOffset: 0.03,
        attack: 0.002,
        decay: 0.06,
        peakGain: 0.06,
      },
    ],
  },
};

export const UI_SOUND_THEME_DEFINITIONS: Record<UiSoundTheme, UiSoundThemeDefinition> = {
  soft,
  classic,
  modern,
  warm,
  aurora,
  minimal,
  blossom,
  cyberpunk,
  papyrus,
  chaos,
};
