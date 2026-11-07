/**
 * The explainer preset's locked art direction. Every image shares one look, one
 * object on near-black with clean space around it, so stills sit comfortably
 * behind titles and panels. Narration carries the video, so no automatic music.
 */
import type { VideoRequest } from "../schemas/options";
import type { CreativeDirection } from "../schemas/storyboard";

export const EXPLAINER_STYLE = {
  name: "Dark glass explainer",
  imageStylePrompt:
    "single symbolic 3D object rendered in frosted glass and matte stone, isolated on a seamless solid pure black #000000 background with no visible floor or horizon, soft rim light, muted mint and teal accents, shallow depth of field, generous empty negative space, premium product-render look",
  palette: { background: "#07090B", primary: "#5EEAD4", accent: "#38BDF8", text: "#F8FAFC" },
};

export const applyPresetLook = (direction: CreativeDirection, request: VideoRequest): CreativeDirection => {
  if (request.quality !== "explainer") return direction;
  return {
    ...direction,
    visualStyle: { ...direction.visualStyle, ...EXPLAINER_STYLE },
    musicMood: request.music === "auto" ? "none" : direction.musicMood,
  };
};
