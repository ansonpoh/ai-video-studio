import React, { type CSSProperties } from "react";
import { Interactive, interpolate, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { boolField, numberField } from "./schema-helpers";

type MusicBedProps = {
  src: string;
  volume: number;
  duckTo: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  muted: boolean;
  /** Frame ranges where narration plays; music ducks under them. */
  duckRanges: [number, number][];
  style?: CSSProperties;
};

/** Music volume at a given frame: fades plus ducking under narration. Exported for tests. */
export const musicVolumeAt = (f: number, total: number, fps: number, p: Pick<MusicBedProps, "volume" | "duckTo" | "fadeInSeconds" | "fadeOutSeconds" | "duckRanges">) => {
  const fadeIn = interpolate(f, [0, Math.max(1, p.fadeInSeconds * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [total - Math.max(1, p.fadeOutSeconds * fps), total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ramp = fps * 0.25;
  let duck = 0;
  for (const [s, e] of p.duckRanges ?? []) {
    const d = interpolate(f, [s - ramp, s, e, e + ramp * 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    duck = Math.max(duck, d);
  }
  const level = p.volume + (p.duckTo - p.volume) * duck;
  return Math.max(0, level * fadeIn * fadeOut);
};

const MusicBedInner: React.FC<MusicBedProps> = ({ src, volume, duckTo, fadeInSeconds, fadeOutSeconds, muted, duckRanges }) => {
  const { durationInFrames, fps } = useVideoConfig();
  if (!src) return null;
  return (
    <Audio
      src={src}
      loop
      muted={muted}
      volume={(f) => musicVolumeAt(f, durationInFrames, fps, { volume, duckTo, fadeInSeconds, fadeOutSeconds, duckRanges })}
    />
  );
};

export const MusicBed = Interactive.create({
  Component: MusicBedInner,
  layout: "none",
  schema: {
    src: { type: "asset", assetType: "audio", default: undefined, description: "Music file" },
    volume: numberField(0.18, "Music volume", { min: 0, max: 1, step: 0.01 }),
    duckTo: numberField(0.07, "Volume under narration", { min: 0, max: 1, step: 0.01 }),
    fadeInSeconds: numberField(1, "Fade in (s)", { min: 0, max: 10, step: 0.1 }),
    fadeOutSeconds: numberField(2, "Fade out (s)", { min: 0, max: 10, step: 0.1 }),
    muted: boolField(false, "Mute music"),
    duckRanges: { type: "hidden" },
  },
});
