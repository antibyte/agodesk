export interface SpeechAudioMetrics {
  volume: number;
  energy: number;
  speaking: boolean;
  bass: number;
  mid: number;
  treble: number;
  waveform: Float32Array;
  spectrum: Float32Array;
}

const WAVEFORM_POINTS = 128;
const SPECTRUM_BARS = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function averageRange(data: Uint8Array, start: number, end: number): number {
  if (end <= start) {
    return 0;
  }
  let sum = 0;
  for (let index = start; index < end; index += 1) {
    sum += data[index] ?? 0;
  }
  return sum / ((end - start) * 255);
}

export function configureSpeechAnalyser(analyser: AnalyserNode): void {
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.68;
  analyser.minDecibels = -88;
  analyser.maxDecibels = -12;
}

export function createSpeechAudioSampler(analyser: AnalyserNode) {
  const timeData = new Uint8Array(analyser.frequencyBinCount);
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Float32Array(WAVEFORM_POINTS);
  const spectrum = new Float32Array(SPECTRUM_BARS);
  const barSmoothing = new Float32Array(SPECTRUM_BARS);

  let smoothedEnergy = 0.02;
  let speaking = false;

  return function sampleSpeechAudio(): SpeechAudioMetrics {
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    let sumSquares = 0;
    for (let index = 0; index < timeData.length; index += 1) {
      const sample = (timeData[index] - 128) / 128;
      sumSquares += sample * sample;
    }
    const volume = Math.sqrt(sumSquares / timeData.length);

    const binCount = freqData.length;
    const bassEnd = Math.max(2, Math.floor(binCount * 0.08));
    const midEnd = Math.max(bassEnd + 1, Math.floor(binCount * 0.38));
    const bass = averageRange(freqData, 0, bassEnd);
    const mid = averageRange(freqData, bassEnd, midEnd);
    const treble = averageRange(freqData, midEnd, binCount);

    const speechBand = averageRange(
      freqData,
      Math.floor(binCount * 0.04),
      Math.floor(binCount * 0.55),
    );
    const instantEnergy = clamp(volume * 2.4 + speechBand * 0.85, 0, 1);

    const attack = speaking ? 0.42 : 0.28;
    const release = speaking ? 0.1 : 0.07;
    const blend = instantEnergy > smoothedEnergy ? attack : release;
    smoothedEnergy += (instantEnergy - smoothedEnergy) * blend;

    const speakThreshold = speaking ? 0.055 : 0.075;
    speaking = smoothedEnergy > speakThreshold;

    for (let index = 0; index < WAVEFORM_POINTS; index += 1) {
      const sourceIndex = Math.floor((index / (WAVEFORM_POINTS - 1)) * (timeData.length - 1));
      waveform[index] = (timeData[sourceIndex] - 128) / 128;
    }

    for (let bar = 0; bar < SPECTRUM_BARS; bar += 1) {
      const start = Math.floor((bar / SPECTRUM_BARS) * binCount);
      const end = Math.max(start + 1, Math.floor(((bar + 1) / SPECTRUM_BARS) * binCount));
      let bandSum = 0;
      for (let index = start; index < end; index += 1) {
        bandSum += freqData[index] ?? 0;
      }
      const target = bandSum / ((end - start) * 255);
      const barBlend = target > barSmoothing[bar] ? 0.55 : 0.18;
      barSmoothing[bar] += (target - barSmoothing[bar]) * barBlend;
      spectrum[bar] = barSmoothing[bar];
    }

    return {
      volume,
      energy: smoothedEnergy,
      speaking,
      bass,
      mid,
      treble,
      waveform,
      spectrum,
    };
  };
}

export function createIdleSpeechMetrics(): SpeechAudioMetrics {
  return {
    volume: 0,
    energy: 0,
    speaking: false,
    bass: 0,
    mid: 0,
    treble: 0,
    waveform: new Float32Array(WAVEFORM_POINTS),
    spectrum: new Float32Array(SPECTRUM_BARS),
  };
}
