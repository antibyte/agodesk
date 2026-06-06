import { createSpeechAudioSampler, createIdleSpeechMetrics, type SpeechAudioMetrics } from "./speech-visualizer-audio";
import { getSpeechAudioAnalyser } from "./speech-flow";
import { createDefaultVAD, type VoiceActivityDetector } from "./speech-vad";

export interface BargeInDetectorOptions {
  onBargeIn: () => void;
  getIsAiSpeaking: () => boolean;
  /** Energy threshold for considering user speech a barge-in attempt while AI is speaking. */
  energyThreshold?: number;
  /** Minimum consecutive "speaking" samples before triggering (debounce). */
  minSpeakingSamples?: number;
  /** Optional: current playback (AI voice) energy to implement simple echo suppression. */
  getPlaybackEnergy?: () => number;
  /** Optional pre-initialized VAD (e.g. Silero). Falls back to internal if not provided. */
  vad?: VoiceActivityDetector;
}

export interface BargeInDetector {
  start(): void;
  stop(): void;
  /** Manually trigger a check (useful for testing). */
  checkOnce(): boolean;
  /** For direct low-latency path from audio processor (preferred during barge watch). */
  processRawAudio?(samples: Float32Array): void;
}

/**
 * Robust barge-in detector using a proper VoiceActivityDetector under the hood.
 * Supports both raf/analyser fallback and direct audio samples for low latency.
 *
 * It only acts when `getIsAiSpeaking()` returns true.
 */
export function createBargeInDetector(options: BargeInDetectorOptions): BargeInDetector {
  const energyThreshold = options.energyThreshold ?? 0.105;
  const minSpeakingSamples = options.minSpeakingSamples ?? 2;

  let rafId = 0;
  let sampler: ReturnType<typeof createSpeechAudioSampler> | null = null;
  let consecutiveSpeaking = 0;
  let triggeredThisTurn = false;

  // Use provided VAD (Silero preferred) or fallback to energy
  const vad: VoiceActivityDetector = options.vad ?? createDefaultVAD();

  function resolveSampler(): ReturnType<typeof createSpeechAudioSampler> | null {
    const analyser = getSpeechAudioAnalyser();
    if (!analyser) {
      sampler = null;
      return null;
    }
    if (!sampler) {
      sampler = createSpeechAudioSampler(analyser);
    }
    return sampler;
  }

  function checkAndRestart(): void {
    if (rafId || !options.getIsAiSpeaking()) return;
    rafId = requestAnimationFrame(tick);
  }

  function tick(): void {
    const isAiSpeaking = options.getIsAiSpeaking();
    if (!isAiSpeaking) {
      consecutiveSpeaking = 0;
      triggeredThisTurn = false;
      rafId = 0;
      vad.reset();
      setTimeout(checkAndRestart, 180);
      return;
    }

    rafId = requestAnimationFrame(tick);

    if (triggeredThisTurn) {
      return;
    }

    const samplerFn = resolveSampler();
    const metrics: SpeechAudioMetrics = samplerFn?.() ?? createIdleSpeechMetrics();

    const playbackEnergy = options.getPlaybackEnergy?.() ?? 0;
    const adaptiveThreshold = energyThreshold + Math.min(0.08, playbackEnergy * 0.6);

    // Use metrics for compatibility, but also feed VAD if possible
    const isSpeech = vad.process(metrics.waveform);

    if (isSpeech || (metrics.speaking && metrics.energy > adaptiveThreshold)) {
      consecutiveSpeaking += 1;
    } else {
      consecutiveSpeaking = 0;
    }

    if (consecutiveSpeaking >= minSpeakingSamples) {
      triggeredThisTurn = true;
      consecutiveSpeaking = 0;
      vad.reset();
      try {
        options.onBargeIn();
      } catch (err) {
        console.error("Barge-in callback error:", err);
      }
    }
  }

  // Direct low-latency path (called from audio processor)
  function processRawAudio(samples: Float32Array): void {
    if (!options.getIsAiSpeaking() || triggeredThisTurn) {
      return;
    }

    const playbackEnergy = options.getPlaybackEnergy?.() ?? 0;
    const adaptiveThreshold = energyThreshold + Math.min(0.08, playbackEnergy * 0.6);

    const isSpeech = vad.process(samples);

    // For raw path we use VAD + a simple energy check with adaptive threshold
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      energy += Math.abs(samples[i] ?? 0);
    }
    energy /= samples.length;

    if (isSpeech || energy > adaptiveThreshold) {
      consecutiveSpeaking += 1;
    } else {
      consecutiveSpeaking = Math.max(0, consecutiveSpeaking - 1);
    }

    if (consecutiveSpeaking >= minSpeakingSamples) {
      triggeredThisTurn = true;
      consecutiveSpeaking = 0;
      vad.reset();
      try {
        options.onBargeIn();
      } catch (err) {
        console.error("Barge-in callback error:", err);
      }
    }
  }

  function start(): void {
    if (rafId) {
      return;
    }
    consecutiveSpeaking = 0;
    triggeredThisTurn = false;
    vad.reset();

    if (options.getIsAiSpeaking()) {
      rafId = requestAnimationFrame(tick);
    } else {
      setTimeout(checkAndRestart, 120);
    }
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    sampler = null;
    consecutiveSpeaking = 0;
    triggeredThisTurn = false;
    vad.reset();
  }

  function checkOnce(): boolean {
    const samplerFn = resolveSampler();
    const metrics = samplerFn?.() ?? createIdleSpeechMetrics();
    const isAiSpeaking = options.getIsAiSpeaking();

    if (!isAiSpeaking) {
      return false;
    }

    const playbackEnergy = options.getPlaybackEnergy?.() ?? 0;
    const adaptiveThreshold = energyThreshold + Math.min(0.08, playbackEnergy * 0.6);

    const isSpeech = vad.process(metrics.waveform);

    if (isSpeech || (metrics.speaking && metrics.energy > adaptiveThreshold)) {
      consecutiveSpeaking += 1;
    } else {
      consecutiveSpeaking = Math.max(0, consecutiveSpeaking - 1);
    }

    if (consecutiveSpeaking >= minSpeakingSamples && !triggeredThisTurn) {
      triggeredThisTurn = true;
      options.onBargeIn();
      return true;
    }
    return false;
  }

  return {
    start,
    stop,
    checkOnce,
    processRawAudio,   // exposed for direct wiring
  };
}
