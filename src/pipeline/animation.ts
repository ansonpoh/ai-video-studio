/**
 * Animation and transition selection. Keeps the director's choices when they
 * fit the video's style family, otherwise maps them onto it, and avoids
 * monotony (no run of 3+ identical transitions unless the format wants a
 * consistent beat, e.g. listicle items).
 */
import type { AnimationPreset, TransitionName } from "../schemas/catalog";
import type { CreativeDirection, Scene } from "../schemas/storyboard";

const FAMILIES: Record<string, { transitions: TransitionName[]; text: AnimationPreset[] }> = {
  cinematic: { transitions: ["blur-dissolve", "crossfade", "dip-to-black", "zoom-through"], text: ["blur-in", "fade-up", "mask-reveal"] },
  energetic: { transitions: ["slide-left", "slide-up", "zoom-through", "flash", "wipe"], text: ["scale-pop", "slide-left", "word-stagger"] },
  clean: { transitions: ["crossfade", "wipe", "slide-up", "zoom-through", "flash"], text: ["fade-up", "word-stagger", "mask-reveal", "blur-in"] },
};

export const familyFor = (d: CreativeDirection) => {
  if (["cinematic_story", "narrative", "motivational"].includes(d.format) || d.pacing === "slow") return "cinematic";
  if (["listicle", "promo_ad", "facts"].includes(d.format) || d.pacing === "fast") return "energetic";
  return "clean";
};

export const selectAnimations = (d: CreativeDirection, scenes: Scene[]): Scene[] => {
  const fam = FAMILIES[familyFor(d)];
  const out: Scene[] = [];
  scenes.forEach((s, i) => {
    if (s.layout === "slide" || s.layout === "drawn") {
      out.push({ ...s, transitionIn: i === 0 ? "cut" : "crossfade", animationPreset: "fade-up" } as Scene);
      return;
    }
    let transitionIn: TransitionName = i === 0 ? "cut" : fam.transitions.includes(s.transitionIn) || s.transitionIn === "cut" ? s.transitionIn : fam.transitions[i % fam.transitions.length];
    const prev1 = out[i - 1]?.transitionIn;
    const prev2 = out[i - 2]?.transitionIn;
    const consistentBeat = s.layout === "listicle" && out[i - 1]?.layout === "listicle";
    if (!consistentBeat && i > 1 && transitionIn === prev1 && prev1 === prev2) {
      transitionIn = fam.transitions.find((t) => t !== prev1) ?? transitionIn;
    }
    const animationPreset: AnimationPreset = fam.text.includes(s.animationPreset) || (s.layout === "text_reveal" && s.animationPreset === "word-stagger") ? s.animationPreset : fam.text[i % fam.text.length];
    out.push({ ...s, transitionIn, animationPreset } as Scene);
  });
  return out;
};
