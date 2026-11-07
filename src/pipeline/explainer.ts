/**
 * The explainer preset's locked art direction. Every image shares one look, one
 * object on near-black with clean space around it, so stills sit comfortably
 * behind titles and panels. Narration carries the video, so no automatic music.
 */
import { parseDuration } from "../ai/prompt-parser";
import type { VideoRequest, VideoRequestInput } from "../schemas/options";
import type { CreativeDirection } from "../schemas/storyboard";

export const EXPLAINER_STYLE = {
  name: "Dark glass explainer",
  imageStylePrompt:
    "single symbolic 3D object rendered in frosted glass and matte stone, the whole object visible, centred and filling about half of the frame with empty space all around it, isolated on a seamless solid pure black #000000 background with no visible floor or horizon, soft rim light, muted mint and teal accents, sharp focus, premium product-render look",
  theme: "tech" as const,
  fontPairing: "modern-sans" as const,
  palette: { background: "#050708", primary: "#5eead4", accent: "#38bdf8", text: "#f8fafc" },
};

/** A slide holds a whole thought rather than one line, so about 14 seconds. */
export const explainerSceneCount = (seconds: number) => Math.min(60, Math.max(3, Math.round(seconds / 14)));

/**
 * Only the explainer preset can run past 180 seconds, so a longer video switches
 * to it, whether the length came from the form or the prompt ("a 10 minute
 * video"). A number typed alongside another specific preset is left alone, so
 * validation can say why that combination doesn't work.
 */
export const withLengthDefaults = <T extends VideoRequestInput>(input: T): T => {
  const stated = input.durationSeconds;
  // The prompt's length only counts while the form still holds its default.
  const hinted = stated === undefined || stated === 30 ? parseDuration(input.prompt ?? "") : undefined;
  const seconds = hinted ?? stated ?? 30;
  if (seconds <= 180 || input.quality === "explainer") return input;
  const otherPreset = input.quality && input.quality !== "hybrid";
  if (otherPreset && !hinted) return input;
  return {
    ...input,
    quality: "explainer",
    durationSeconds: Math.min(seconds, 900),
    aspectRatio: !input.aspectRatio || input.aspectRatio === "9:16" ? "16:9" : input.aspectRatio,
    captions: false,
  };
};

export const applyPresetLook = (direction: CreativeDirection, request: VideoRequest): CreativeDirection => {
  if (request.quality !== "explainer") return direction;
  return {
    ...direction,
    visualStyle: { ...direction.visualStyle, ...EXPLAINER_STYLE },
    musicMood: request.music === "auto" ? "none" : direction.musicMood,
    format: "explainer",
    pacing: "measured",
    transitionStyle: "crossfade",
    targetSceneCount: explainerSceneCount(request.durationSeconds),
  };
};
