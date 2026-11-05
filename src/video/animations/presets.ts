import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "remotion";
import type { AnimationPreset, MediaMotion } from "../../schemas/catalog";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Entrance animation for a text or graphic element.
 * `delay` is in frames relative to the element's own sequence.
 */
export const entrance = (
  preset: AnimationPreset,
  frame: number,
  fps: number,
  delay = 0,
  durationInFrames?: number,
): CSSProperties => {
  const f = frame - delay;
  const exitStart = durationInFrames ? durationInFrames - Math.round(fps * 0.35) : Infinity;
  const exit = interpolate(frame, [exitStart, exitStart + fps * 0.35], [1, 0], clamp);
  const t = interpolate(f, [0, fps * 0.6], [0, 1], { ...clamp, easing: easeOut });
  switch (preset) {
    case "none":
      return { opacity: exit };
    case "fade-up":
      return { opacity: t * exit, translate: `0px ${(1 - t) * 60}px` };
    case "slide-left":
      return { opacity: t * exit, translate: `${(1 - t) * 160}px 0px` };
    case "slide-right":
      return { opacity: t * exit, translate: `${(t - 1) * 160}px 0px` };
    case "scale-pop": {
      const s = spring({ frame: f, fps, config: { damping: 12, stiffness: 180, mass: 0.6 } });
      return { opacity: Math.min(1, s * 1.5) * exit, scale: `${0.6 + 0.4 * s}` };
    }
    case "blur-in":
      return { opacity: t * exit, filter: `blur(${(1 - t) * 18}px)`, scale: `${1.06 - 0.06 * t}` };
    case "mask-reveal":
      return { opacity: exit, clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` };
    case "typewriter":
    case "word-stagger":
      // handled per-word by the text component; container just fades
      return { opacity: exit };
  }
};

/** Per-word progress (0..1) for staggered / typewriter text. */
export const wordProgress = (preset: AnimationPreset, frame: number, fps: number, index: number, delay = 0) => {
  const step = preset === "typewriter" ? fps * 0.07 : fps * 0.09;
  const start = delay + index * step;
  return interpolate(frame, [start, start + fps * 0.35], [0, 1], { ...clamp, easing: easeOut });
};

/** Camera move over a still image or clip ("Ken Burns", pans, parallax). */
export const cameraMove = (
  motion: MediaMotion,
  progress: number,
  strength: number,
): { scale: number; x: number; y: number } => {
  const s = strength;
  const p = Easing.inOut(Easing.sin)(Math.min(1, Math.max(0, progress)));
  switch (motion) {
    case "push-in":
      return { scale: 1.04 + s * p, x: 0, y: 0 };
    case "pull-out":
      return { scale: 1.04 + s * (1 - p), x: 0, y: 0 };
    case "pan-left":
      return { scale: 1.12 + s * 0.3, x: (0.5 - p) * 100 * s * 4, y: 0 };
    case "pan-right":
      return { scale: 1.12 + s * 0.3, x: (p - 0.5) * 100 * s * 4, y: 0 };
    case "pan-up":
      return { scale: 1.12 + s * 0.3, x: 0, y: (0.5 - p) * 100 * s * 4 };
    case "pan-down":
      return { scale: 1.12 + s * 0.3, x: 0, y: (p - 0.5) * 100 * s * 4 };
    case "parallax":
      return { scale: 1.08 + s * p * 0.6, x: (p - 0.5) * 40 * s * 4, y: (0.5 - p) * 20 * s * 4 };
    case "static":
      return { scale: 1.02, x: 0, y: 0 };
  }
};
