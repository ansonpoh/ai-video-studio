/**
 * Turns narration timing into scene timing. Pure and deterministic: the same
 * inputs always produce the same frame numbers, which the codegen writes into
 * the editable composition as literals.
 *
 * Rules:
 * - Speech is never sped up. If narration is shorter than the target, scenes
 *   get small holds (capped) instead; if longer, the video runs long and the
 *   pipeline records a warning.
 * - Each transition finishes just before that scene's narration starts, so
 *   visuals lead the voice slightly (feels intentional, avoids "late" cuts).
 */
import type { TransitionName } from "../schemas/catalog";

export const TRANSITION_FRAMES: Record<TransitionName, number> = {
  cut: 0,
  flash: 8,
  crossfade: 12,
  "slide-up": 14,
  "slide-left": 14,
  wipe: 14,
  "zoom-through": 14,
  "blur-dissolve": 16,
  "dip-to-black": 18,
};

export type TimelineInput = {
  fps: number;
  targetSeconds: number;
  pacing: "slow" | "measured" | "brisk" | "fast";
  scenes: { id: string; narrationSeconds: number; transitionIn: TransitionName; minSeconds?: number }[];
};

export type SceneTiming = {
  id: string;
  /** Global frame where the scene's sequence starts (includes incoming transition). */
  startFrame: number;
  durationInFrames: number;
  transitionInFrames: number;
  /** Frame (relative to scene start) where this scene's narration begins. */
  narrationOffsetFrames: number;
  narrationFrames: number;
};

export type Timeline = { totalFrames: number; scenes: SceneTiming[]; naturalSeconds: number; warnings: string[] };

const GAP_SECONDS: Record<TimelineInput["pacing"], number> = { slow: 0.45, measured: 0.3, brisk: 0.2, fast: 0.12 };
const MAX_HOLD_SECONDS = 1.6;

export const buildTimeline = (input: TimelineInput): Timeline => {
  const { fps } = input;
  const warnings: string[] = [];
  const f = (s: number) => Math.round(s * fps);
  const lead = f(0.3);
  const tail = f(input.pacing === "fast" ? 0.6 : 1.0);
  const gap = f(GAP_SECONDS[input.pacing]);
  const n = input.scenes.map((s) => Math.max(f(0.8), f(s.narrationSeconds)));
  const trans = input.scenes.map((s, i) => (i === 0 ? 0 : TRANSITION_FRAMES[s.transitionIn] ?? 12));
  const minF = input.scenes.map((s) => f(s.minSeconds ?? 1.6));

  const natural = lead + n.reduce((a, b) => a + b, 0) + gap * (n.length - 1) + tail;
  const target = f(input.targetSeconds);
  let extraPerScene = 0;
  if (natural < target) {
    extraPerScene = Math.min(f(MAX_HOLD_SECONDS), Math.floor((target - natural) / Math.max(1, n.length)));
  } else if (natural > target * 1.15) {
    warnings.push(`Narration runs ${(natural / fps).toFixed(1)}s, longer than the ${input.targetSeconds}s target. Shorten the script to fit; speech is not sped up.`);
  }

  // narration start (global) for each scene
  const a: number[] = [];
  let cursor = lead;
  for (let i = 0; i < n.length; i++) {
    a.push(cursor);
    const hold = Math.max(extraPerScene, minF[i] - n[i]);
    cursor += n[i] + gap + hold;
  }
  const end = a[a.length - 1] + n[n.length - 1] + tail + extraPerScene;

  // scene start: transition completes 4 frames before narration starts
  const S = a.map((ai, i) => (i === 0 ? 0 : Math.max(0, ai - trans[i] - 4)));
  const scenes: SceneTiming[] = input.scenes.map((s, i) => {
    const next = i < n.length - 1 ? S[i + 1] + trans[i + 1] : end;
    let duration = next - S[i];
    duration = Math.max(duration, trans[i] + (trans[i + 1] ?? 0) + 2);
    return {
      id: s.id,
      startFrame: S[i],
      durationInFrames: duration,
      transitionInFrames: trans[i],
      narrationOffsetFrames: a[i] - S[i],
      narrationFrames: n[i],
    };
  });
  const totalFrames = scenes.reduce((acc, s, i) => acc + s.durationInFrames - (i === 0 ? 0 : s.transitionInFrames), 0);
  return { totalFrames, scenes, naturalSeconds: natural / fps, warnings };
};

/** Estimated speech duration used only when no TTS alignment exists (offline demo / silent mode). */
export const estimateSpeechSeconds = (text: string, wordsPerSecond = 2.6) => {
  const words = text.split(/\s+/).filter(Boolean).length;
  const punctuation = (text.match(/[.!?;:,—]/g) ?? []).length;
  return words / wordsPerSecond + punctuation * 0.12;
};
