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
    const amplitude =
      height * amplitudeScale * (speaking ? 0.5 + energy * 1.0 : 0.03 + energy * 0.08);

    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.shadowBlur = speaking ? 12 + energy * 20 : 5;
    ctx.shadowColor = rgba(color, alpha * 0.85);

    // Smoother curve using quadratic segments for organic voice look
    const step = Math.max(3, Math.floor(width / 90));
    let prevX = 0;
    let prevY = centerY + offset;

    for (let x = 0; x <= width; x += step) {
      const position = x / width;
      const sampleIndex = Math.min(
        waveform.length - 1,
        Math.floor(position * (waveform.length - 1)),
      );
      const sample = waveform[sampleIndex] ?? 0;
      const neighbor = waveform[Math.min(waveform.length - 1, sampleIndex + 1)] ?? sample;
      const smooth = sample * 0.6 + neighbor * 0.4;
      const envelope = Math.sin(position * Math.PI) * (0.92 + Math.sin(position * 6) * 0.08);
      const y = centerY + offset + smooth * amplitude * envelope;

      if (x === 0) {
        ctx.moveTo(x, y);
        prevX = x;
        prevY = y;
      } else {
        const cx = (prevX + x) / 2;
        const cy = (prevY + y) / 2;
        ctx.quadraticCurveTo(prevX, prevY, cx, cy);
        prevX = x;
        prevY = y;
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

    let sampleSpeech: (() => SpeechAudioMetrics) | null = null;
    let boundAnalyser: AnalyserNode | null = null;

    function resolveMetrics(): SpeechAudioMetrics {
      const analyser = getSpeechAudioAnalyser();
      if (!analyser) {
        sampleSpeech = null;
        boundAnalyser = null;
        return createIdleSpeechMetrics();
      }
      if (analyser !== boundAnalyser) {
        boundAnalyser = analyser;
        sampleSpeech = createSpeechAudioSampler(analyser);
      }
      return sampleSpeech?.() ?? createIdleSpeechMetrics();
    }

    let fade = 0;
    let pulseRing = 0;
    let pulseStrength = 0;
    let lastEnergy = 0;

    const particles = Array.from({ length: 28 }, (_, index) => ({
      angle: (index / 28) * Math.PI * 2,
      radius: 0.155 + (index % 6) * 0.048,
      size: 0.9 + (index % 5) * 0.55,
      wobble: index * 0.39,
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

      const metrics = resolveMetrics();
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

      // No large colored radial orbs / central core anymore.
      // These were creating the strong "farbverlauf" over the whole surface.
      // The animation now relies on waveforms, bars, particles and subtle vignette for a cleaner look.
      // (Radial effects are now only inside the chat bubbles via MessageBubble styles.)

      // Beautiful reactive spectrum bars (bottom + subtle top mirror)
      const barCount = Math.min(spectrum.length, 48); // slightly fewer for perf + elegance
      const barWidth = width / barCount;
      for (let index = 0; index < barCount; index += 1) {
        const raw = spectrum[index] ?? 0;
        const barEnergy = raw * (speaking ? 0.7 + energy * 1.0 : 0.08 + energy * 0.15);
        const barHeight = barEnergy * height * 0.38;
        const x = index * barWidth + barWidth * 0.18;
        const bw = barWidth * 0.64;

        // Bottom bars with nice gradient + "cap"
        const bottomGrad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        bottomGrad.addColorStop(0, rgba(accent, 0.02 * globalAlpha));
        bottomGrad.addColorStop(0.35, rgba(danger, (0.09 + raw * 0.22) * globalAlpha));
        bottomGrad.addColorStop(1, rgba(danger, (0.18 + raw * 0.32) * globalAlpha));
        ctx.fillStyle = bottomGrad;
        ctx.fillRect(x, height - barHeight, bw, barHeight);

        // Rounded-ish cap on top of bar
        if (barHeight > 3) {
          ctx.beginPath();
          ctx.arc(x + bw / 2, height - barHeight, bw * 0.32, 0, Math.PI * 2);
          ctx.fillStyle = rgba(danger, (0.22 + raw * 0.25) * globalAlpha);
          ctx.fill();
        }

        // Subtle top "reflection" / treble sparkles
        const topH = Math.max(2, barHeight * (0.38 + treble * 0.42));
        const topGrad = ctx.createLinearGradient(0, 0, 0, topH);
        topGrad.addColorStop(0, rgba(secondary, (0.06 + raw * 0.18) * globalAlpha));
        topGrad.addColorStop(1, rgba(accent, 0.0));
        ctx.fillStyle = topGrad;
        ctx.fillRect(x, 0, bw, topH);
      }

      drawVoiceWaveform(
        ctx,
        metrics,
        width,
        height,
        centerY,
        danger,
        0.55 * globalAlpha,
        0.28,
        4,
        0,
      );
      drawVoiceWaveform(
        ctx,
        metrics,
        width,
        height,
        centerY * 0.72,
        accent,
        0.35 * globalAlpha,
        0.16,
        2.5,
        (metrics.waveform[40] ?? 0) * height * 0.01,
      );
      drawVoiceWaveform(
        ctx,
        metrics,
        width,
        height,
        centerY * 1.22,
        secondary,
        0.28 * globalAlpha,
        0.13,
        2,
        (metrics.waveform[64] ?? 0) * height * 0.012,
      );

      // Particles + constellation connections for premium audio-reactive look
      const particlePositions: Array<{ x: number; y: number; size: number }> = [];
      for (const particle of particles) {
        const motion = speaking ? 0.005 + mid * 0.025 + treble * 0.015 : 0.0008;
        particle.angle +=
          motion *
          (1 +
            (metrics.waveform[Math.floor(particle.wobble) % metrics.waveform.length] ?? 0) * 0.8);
        const orbitRadius =
          Math.min(width, height) *
          (particle.radius + bass * (speaking ? 0.12 : 0.015) + energy * (speaking ? 0.07 : 0.015));
        const px = centerX + Math.cos(particle.angle) * orbitRadius;
        const py =
          centerY + Math.sin(particle.angle * 1.15 + particle.wobble * 0.7) * orbitRadius * 0.65;
        const size = particle.size + voiceDrive * (speaking ? 6 : 1.3);

        particlePositions.push({ x: px, y: py, size });

        // Simple solid glow without radial gradient
        ctx.fillStyle = rgba(danger, (0.08 + mid * 0.15) * globalAlpha);
        ctx.beginPath();
        ctx.arc(px, py, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(accent, (0.03 + treble * 0.06) * globalAlpha);
        ctx.beginPath();
        ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw elegant constellation lines between nearby particles
      if (speaking || energy > 0.12) {
        ctx.lineWidth = 0.9;
        for (let i = 0; i < particlePositions.length; i += 1) {
          const p1 = particlePositions[i];
          for (let j = i + 1; j < particlePositions.length; j += 3) {
            // every 3rd for perf
            const p2 = particlePositions[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.hypot(dx, dy);
            const maxDist = Math.min(width, height) * 0.22;
            if (dist > 0 && dist < maxDist) {
              const lineAlpha = (1 - dist / maxDist) * (0.18 + voiceDrive * 0.22) * globalAlpha;
              ctx.strokeStyle = rgba(accent, lineAlpha * 0.7);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      if (pulseStrength > 0.05 && speaking) {
        // Multiple elegant expanding rings on voice peaks
        for (let r = 0; r < 2; r += 1) {
          const ringR = (pulseRing + r * 0.09) * Math.min(width, height) * 0.47;
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
          const ringA = pulseStrength * (0.28 - r * 0.09) * globalAlpha;
          ctx.strokeStyle = rgba(danger, ringA);
          ctx.lineWidth = 1.8 + pulseStrength * (2.2 - r * 0.6);
          ctx.stroke();
        }
      }

      // No vignette for cleaner look without radial
      // if needed, can add a simple full fade later
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
    transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1);
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
    inset: -38% -18%;
    background: conic-gradient(
      from 12deg at 50% 48%,
      transparent 0deg,
      color-mix(in srgb, var(--color-accent) 8%, transparent) 62deg,
      transparent 125deg,
      color-mix(in srgb, var(--color-danger) 6%, transparent) 195deg,
      transparent 260deg,
      color-mix(in srgb, var(--color-accent) 5%, transparent) 310deg,
      transparent 360deg
    );
    opacity: calc(0.04 + var(--speech-energy) * 0.22);
    mix-blend-mode: screen;
    animation: aurora-spin calc(26s - var(--speech-energy) * 15s) linear infinite;
    transform: scale(calc(1 + var(--speech-mid) * 0.07));
    /* no radial mask to avoid any radial gradient */
    transition:
      opacity 0.1s linear,
      transform 0.1s linear;
    filter: blur(0.5px);
  }

  .speech-bg.speaking .speech-bg-shimmer {
    animation-duration: calc(19s - var(--speech-energy) * 11s);
    opacity: calc(0.06 + var(--speech-energy) * 0.28);
  }

  @keyframes aurora-spin {
    to {
      transform: scale(calc(1 + var(--speech-mid) * 0.08)) rotate(360deg);
    }
  }
</style>
