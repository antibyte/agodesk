<script lang="ts">
  import { onDestroy } from "svelte";
  import { getSpeechAudioAnalyser } from "../services/speech-flow";
  import {
    createIdleSpeechMetrics,
    createSpeechAudioSampler,
    type SpeechAudioMetrics,
  } from "../services/speech-visualizer-audio";
  import type { SpeechStatus } from "../types/speech";

  interface Props {
    active?: boolean;
    status?: SpeechStatus;
  }

  let { active = false, status = "idle" }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>();
  let wrapEl = $state<HTMLDivElement>();
  let animationFrameId = 0;
  let resizeObserver: ResizeObserver | undefined;
  let fadeStopTimer: ReturnType<typeof setTimeout> | undefined;

  function readThemeColors(): { accent: string; danger: string; bg: string } {
    const style = getComputedStyle(document.documentElement);
    return {
      accent: style.getPropertyValue("--color-accent").trim() || "#2563eb",
      danger: style.getPropertyValue("--color-danger").trim() || "#dc2626",
      bg: style.getPropertyValue("--color-bg-elevated").trim() || "#f8fafc",
    };
  }

  function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace("#", "");
    if (normalized.length === 3) {
      const r = parseInt(normalized[0] + normalized[0], 16);
      const g = parseInt(normalized[1] + normalized[1], 16);
      const b = parseInt(normalized[2] + normalized[2], 16);
      return [r, g, b];
    }
    const value = parseInt(normalized.slice(0, 6), 16);
    if (Number.isNaN(value)) {
      return [37, 99, 235];
    }
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function rgba(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function resizeCanvas(): void {
    if (!canvasEl || !wrapEl) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wrapEl.getBoundingClientRect();
    canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
    canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
  }

  function updateSpeechCssVars(metrics: SpeechAudioMetrics): void {
    if (!wrapEl) {
      return;
    }
    const drive = metrics.speaking ? metrics.energy : metrics.energy * 0.35;
    wrapEl.style.setProperty("--speech-energy", drive.toFixed(3));
    wrapEl.style.setProperty("--speech-mid", metrics.mid.toFixed(3));
    wrapEl.style.setProperty("--speech-speaking", metrics.speaking ? "1" : "0");
  }

  function stopVisualization(): void {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    wrapEl?.style.setProperty("--speech-energy", "0");
    wrapEl?.style.setProperty("--speech-mid", "0");
    wrapEl?.style.setProperty("--speech-speaking", "0");
  }

  function drawVoiceWaveform(
    ctx: CanvasRenderingContext2D,
    metrics: SpeechAudioMetrics,
    width: number,
    height: number,
    centerY: number,
    color: string,
    alpha: number,
    amplitudeScale: number,
    lineWidth: number,
    offset: number,
  ): void {
    const { waveform, energy, speaking } = metrics;
    const amplitude = height * amplitudeScale * (speaking ? 0.35 + energy * 0.75 : 0.04 + energy * 0.12);

    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.shadowBlur = speaking ? 10 + energy * 18 : 4;
    ctx.shadowColor = rgba(color, alpha * 0.8);

    for (let x = 0; x <= width; x += 2) {
      const position = x / width;
      const sampleIndex = Math.min(
        waveform.length - 1,
        Math.floor(position * (waveform.length - 1)),
      );
      const sample = waveform[sampleIndex] ?? 0;
      const neighbor =
        waveform[Math.min(waveform.length - 1, sampleIndex + 1)] ?? sample;
      const smooth = sample * 0.65 + neighbor * 0.35;
      const envelope = Math.sin(position * Math.PI);
      const y = centerY + offset + smooth * amplitude * envelope;

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function startVisualization(): void {
    if (animationFrameId || !canvasEl || !wrapEl) {
      return;
    }

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      return;
    }

    resizeCanvas();

    const analyser = getSpeechAudioAnalyser();
    const sampleSpeech = analyser ? createSpeechAudioSampler(analyser) : null;

    let fade = 0;
    let pulseRing = 0;
    let pulseStrength = 0;
    let lastEnergy = 0;

    const particles = Array.from({ length: 24 }, (_, index) => ({
      angle: (index / 24) * Math.PI * 2,
      radius: 0.16 + (index % 5) * 0.05,
      size: 1 + (index % 4) * 0.6,
      wobble: index * 0.41,
    }));

    function renderFrame(): void {
      if (!canvasEl || !wrapEl || !ctx) {
        return;
      }

      animationFrameId = requestAnimationFrame(renderFrame);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = wrapEl.clientWidth;
      const height = wrapEl.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const targetFade = active ? 1 : 0;
      fade += (targetFade - fade) * 0.08;
      if (fade < 0.01 && !active) {
        fade = 0;
        stopVisualization();
        return;
      }

      const metrics = sampleSpeech ? sampleSpeech() : createIdleSpeechMetrics();
      updateSpeechCssVars(metrics);

      const { energy, speaking, bass, mid, treble, spectrum } = metrics;
      const colors = readThemeColors();
      const accent = colors.accent;
      const listening = status === "listening";
      const processing = status === "processing";
      const danger = listening ? colors.danger : accent;
      const secondary = processing ? colors.danger : accent;

      if (speaking && energy > lastEnergy + 0.09) {
        pulseStrength = Math.max(pulseStrength, energy);
        pulseRing = 0;
      }
      lastEnergy = energy;
      pulseRing += 0.012 + energy * (speaking ? 0.045 : 0.01);
      pulseStrength *= speaking ? 0.955 : 0.88;

      const centerX = width * 0.5;
      const centerY = height * 0.46;
      const voiceDrive = speaking ? energy : energy * 0.25;
      const globalAlpha = fade * (0.35 + voiceDrive * 0.55);

      const blobs = [
        { x: 0.24, y: 0.3, color: accent, band: bass },
        { x: 0.74, y: 0.36, color: secondary, band: mid },
        { x: 0.48, y: 0.7, color: danger, band: mid * 0.7 + bass * 0.3 },
        { x: 0.36, y: 0.56, color: accent, band: treble },
      ];

      for (const blob of blobs) {
        const bandPush = speaking ? blob.band * 0.14 : blob.band * 0.03;
        const bx = blob.x * width + (metrics.waveform[8] ?? 0) * width * 0.035;
        const by = blob.y * height + (metrics.waveform[24] ?? 0) * height * 0.04;
        const radius =
          Math.max(width, height) * (0.28 + bandPush + voiceDrive * 0.14);

        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
        gradient.addColorStop(0, rgba(blob.color, (0.1 + blob.band * 0.18) * globalAlpha));
        gradient.addColorStop(0.5, rgba(blob.color, (0.04 + blob.band * 0.08) * globalAlpha));
        gradient.addColorStop(1, rgba(blob.color, 0));

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      const barCount = spectrum.length;
      const barWidth = width / barCount;
      for (let index = 0; index < barCount; index += 1) {
        const raw = spectrum[index] ?? 0;
        const barEnergy = raw * (speaking ? 0.55 + energy * 0.85 : 0.08 + energy * 0.2);
        const barHeight = barEnergy * height * 0.32;
        const x = index * barWidth + barWidth * 0.12;

        const bottomGradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        bottomGradient.addColorStop(0, rgba(accent, 0));
        bottomGradient.addColorStop(0.4, rgba(accent, 0.08 * globalAlpha));
        bottomGradient.addColorStop(1, rgba(danger, (0.12 + raw * 0.28) * globalAlpha));
        ctx.fillStyle = bottomGradient;
        ctx.fillRect(x, height - barHeight, barWidth * 0.76, barHeight);

        const topHeight = barHeight * (0.45 + treble * 0.35);
        const topGradient = ctx.createLinearGradient(0, 0, 0, topHeight);
        topGradient.addColorStop(0, rgba(secondary, (0.08 + raw * 0.22) * globalAlpha));
        topGradient.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = topGradient;
        ctx.fillRect(x, 0, barWidth * 0.76, topHeight);
      }

      drawVoiceWaveform(ctx, metrics, width, height, centerY, danger, 0.42 * globalAlpha, 0.22, 3.2, 0);
      drawVoiceWaveform(
        ctx,
        metrics,
        width,
        height,
        centerY * 0.72,
        accent,
        0.24 * globalAlpha,
        0.12,
        2,
        (metrics.waveform[40] ?? 0) * height * 0.01,
      );
      drawVoiceWaveform(
        ctx,
        metrics,
        width,
        height,
        centerY * 1.22,
        secondary,
        0.2 * globalAlpha,
        0.1,
        1.6,
        (metrics.waveform[64] ?? 0) * height * 0.012,
      );

      for (const particle of particles) {
        const motion = speaking ? 0.004 + mid * 0.018 + treble * 0.012 : 0.0008;
        particle.angle +=
          motion *
          (1 +
            (metrics.waveform[Math.floor(particle.wobble) % metrics.waveform.length] ?? 0));
        const orbitRadius =
          Math.min(width, height) *
          (particle.radius + bass * (speaking ? 0.08 : 0.015) + energy * (speaking ? 0.05 : 0.01));
        const px = centerX + Math.cos(particle.angle) * orbitRadius;
        const py =
          centerY +
          Math.sin(particle.angle * 1.12 + particle.wobble) * orbitRadius * 0.68;
        const size = particle.size + voiceDrive * (speaking ? 5 : 1.2);

        const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 3.5);
        glow.addColorStop(0, rgba(danger, (0.2 + mid * 0.45) * globalAlpha));
        glow.addColorStop(0.4, rgba(accent, (0.08 + treble * 0.18) * globalAlpha));
        glow.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, size * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (pulseStrength > 0.06 && speaking) {
        const ringRadius = pulseRing * Math.min(width, height) * 0.48;
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(danger, pulseStrength * 0.32 * globalAlpha);
        ctx.lineWidth = 1.5 + pulseStrength * 2.5;
        ctx.stroke();
      }

      const vignette = ctx.createRadialGradient(
        centerX,
        centerY,
        Math.min(width, height) * 0.14,
        centerX,
        centerY,
        Math.max(width, height) * 0.76,
      );
      vignette.addColorStop(0, rgba(colors.bg, 0));
      vignette.addColorStop(0.55, rgba(colors.bg, 0.06 * fade));
      vignette.addColorStop(1, rgba(colors.bg, 0.4 * fade));
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    renderFrame();
  }

  $effect(() => {
    void active;
    void status;

    if (!wrapEl) {
      return;
    }

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(wrapEl);

    clearTimeout(fadeStopTimer);

    if (active) {
      const timer = setTimeout(() => {
        startVisualization();
      }, 30);
      return () => {
        clearTimeout(timer);
        resizeObserver?.disconnect();
      };
    }

    fadeStopTimer = setTimeout(() => {
      stopVisualization();
    }, 620);

    return () => {
      clearTimeout(fadeStopTimer);
      resizeObserver?.disconnect();
    };
  });

  onDestroy(() => {
    clearTimeout(fadeStopTimer);
    stopVisualization();
    resizeObserver?.disconnect();
  });
</script>

<div
  bind:this={wrapEl}
  class="speech-bg"
  class:visible={active}
  class:speaking={active}
  aria-hidden="true"
>
  <canvas bind:this={canvasEl} class="speech-bg-canvas"></canvas>
  <div class="speech-bg-shimmer"></div>
</div>

<style>
  .speech-bg {
    --speech-energy: 0;
    --speech-mid: 0;
    --speech-speaking: 0;
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.55s ease;
  }

  .speech-bg.visible {
    opacity: 1;
  }

  .speech-bg-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .speech-bg-shimmer {
    position: absolute;
    inset: -40% -20%;
    background: conic-gradient(
      from 0deg at 50% 50%,
      transparent 0deg,
      color-mix(in srgb, var(--color-accent) 16%, transparent) 70deg,
      transparent 140deg,
      color-mix(in srgb, var(--color-danger) 12%, transparent) 210deg,
      transparent 280deg,
      color-mix(in srgb, var(--color-accent) 10%, transparent) 330deg,
      transparent 360deg
    );
    opacity: calc(0.08 + var(--speech-energy) * 0.42);
    mix-blend-mode: screen;
    animation: aurora-spin calc(24s - var(--speech-energy) * 14s) linear infinite;
    transform: scale(calc(1 + var(--speech-mid) * 0.08));
    mask-image: radial-gradient(circle at 50% 45%, black 10%, transparent 72%);
    transition:
      opacity 0.12s linear,
      transform 0.12s linear;
  }

  .speech-bg.speaking .speech-bg-shimmer {
    animation-duration: calc(18s - var(--speech-energy) * 12s);
  }

  @keyframes aurora-spin {
    to {
      transform: scale(calc(1 + var(--speech-mid) * 0.08)) rotate(360deg);
    }
  }
</style>
