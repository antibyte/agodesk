import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  configureSpeechAnalyser,
  createIdleSpeechMetrics,
  createSpeechAudioSampler,
} from "./speech-visualizer-audio.ts";

describe("speech-visualizer-audio", () => {
  it("erkennt Sprech-Aktivität aus Analyser-Daten", () => {
    const analyser = {
      frequencyBinCount: 256,
      fftSize: 512,
      smoothingTimeConstant: 0.68,
      minDecibels: -88,
      maxDecibels: -12,
      getByteTimeDomainData(array: Uint8Array): void {
        for (let index = 0; index < array.length; index += 1) {
          const wave = Math.sin(index * 0.22) * 48;
          array[index] = 128 + wave;
        }
      },
      getByteFrequencyData(array: Uint8Array): void {
        for (let index = 0; index < array.length; index += 1) {
          array[index] = index < 40 ? 180 : 20;
        }
      },
    } as AnalyserNode;

    configureSpeechAnalyser(analyser);
    const sample = createSpeechAudioSampler(analyser);
    const metrics = sample();

    assert.equal(metrics.speaking, true);
    assert.ok(metrics.energy > 0.08);
    assert.ok(metrics.waveform.some((value) => Math.abs(value) > 0.05));
    assert.ok(metrics.spectrum[4] > metrics.spectrum[40]);
  });

  it("bleibt in Stille ruhig", () => {
    const analyser = {
      frequencyBinCount: 256,
      fftSize: 512,
      smoothingTimeConstant: 0.68,
      minDecibels: -88,
      maxDecibels: -12,
      getByteTimeDomainData(array: Uint8Array): void {
        array.fill(128);
      },
      getByteFrequencyData(array: Uint8Array): void {
        array.fill(4);
      },
    } as AnalyserNode;

    const sample = createSpeechAudioSampler(analyser);
    let metrics = sample();
    for (let index = 0; index < 8; index += 1) {
      metrics = sample();
    }

    assert.equal(metrics.speaking, false);
    assert.ok(metrics.energy < 0.08);
  });

  it("liefert leere Idle-Metriken", () => {
    const metrics = createIdleSpeechMetrics();
    assert.equal(metrics.speaking, false);
    assert.equal(metrics.energy, 0);
    assert.equal(metrics.waveform.length, 128);
    assert.equal(metrics.spectrum.length, 64);
  });
});
