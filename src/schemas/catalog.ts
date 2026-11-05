/**
 * Shared vocabularies. The AI director picks from these lists, the Remotion
 * engine implements every entry, and the schemas validate against them, so a
 * storyboard can never ask for something the renderer cannot draw.
 */

export const PROCEDURAL_ART = [
  // weather / physics
  "storm-clouds",
  "lightning-bolt",
  "charge-separation",
  "stepped-leader",
  "thunder-wave",
  // space
  "starfield",
  "earth-two-moons",
  "two-moons-horizon",
  "tides",
  "orbit-diagram",
  "eclipse",
  // generic / abstract
  "aurora-gradient",
  "particle-network",
  "wireframe-globe",
  "bar-chart",
  "flow-arrows",
  // lifestyle / productivity
  "checklist",
  "phone-focus",
  "focus-timer",
  "calendar-blocks",
  "sunrise",
  "ocean-depths",
] as const;
export type ProceduralArt = (typeof PROCEDURAL_ART)[number];

export const PROCEDURAL_ART_DESCRIPTIONS: Record<ProceduralArt, string> = {
  "storm-clouds": "Dark stormy sky with drifting layered clouds and rain",
  "lightning-bolt": "A branching lightning bolt drawing itself with a bright flash",
  "charge-separation": "Diagram: thundercloud with + charges on top, - at the base, + on the ground",
  "stepped-leader": "Diagram: stepped leader descending, upward streamer rising to meet it",
  "thunder-wave": "Expanding shockwave rings from a hot air channel (sound/pressure)",
  starfield: "Deep space starfield with nebula glow",
  "earth-two-moons": "Earth from space with two moons orbiting",
  "two-moons-horizon": "Night landscape horizon with two moons in the sky",
  tides: "Ocean surface with tidal bulge and moon pull arrows",
  "orbit-diagram": "Orbital paths with bodies moving around a central body",
  eclipse: "A moon sliding across a glowing star (eclipse)",
  "aurora-gradient": "Flowing abstract colour fields, good neutral backdrop",
  "particle-network": "Connected glowing nodes (technology, networks, AI, data)",
  "wireframe-globe": "Rotating wireframe globe (global, travel, internet)",
  "bar-chart": "Animated bars rising (growth, statistics, finance)",
  "flow-arrows": "Arrows flowing left to right through stages (process, cause and effect)",
  checklist: "Checklist items ticking off one by one",
  "phone-focus": "Phone with notifications being silenced (focus, distraction)",
  "focus-timer": "Circular countdown timer ring (time, deep work, pomodoro)",
  "calendar-blocks": "Week calendar filling with colour blocks (planning, routines)",
  sunrise: "Sun rising over a horizon (morning, beginnings, motivation)",
  "ocean-depths": "Sunlight fading into the deep ocean with drifting particles",
};

export const MEDIA_MOTIONS = ["push-in", "pull-out", "pan-left", "pan-right", "pan-up", "pan-down", "parallax", "static"] as const;
export type MediaMotion = (typeof MEDIA_MOTIONS)[number];

export const ANIMATION_PRESETS = [
  "fade-up",
  "slide-left",
  "slide-right",
  "scale-pop",
  "blur-in",
  "typewriter",
  "word-stagger",
  "mask-reveal",
  "none",
] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

export const TRANSITIONS = [
  "crossfade",
  "slide-up",
  "slide-left",
  "wipe",
  "zoom-through",
  "blur-dissolve",
  "flash",
  "dip-to-black",
  "cut",
] as const;
export type TransitionName = (typeof TRANSITIONS)[number];

export const THEMES = ["storm", "cosmic", "vivid", "clean-light", "noir", "warm", "tech", "nature"] as const;
export type ThemeName = (typeof THEMES)[number];

export const FONT_PAIRINGS = ["modern-sans", "cinematic-serif", "bold-display", "tech-grotesk", "editorial", "friendly-rounded"] as const;
export type FontPairing = (typeof FONT_PAIRINGS)[number];

export const MUSIC_MOODS = ["cinematic", "uplifting", "playful", "suspenseful", "relaxed", "energetic", "none"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const VIDEO_FORMATS = [
  "explainer",
  "listicle",
  "cinematic_story",
  "tutorial",
  "product_showcase",
  "promo_ad",
  "motivational",
  "narrative",
  "comparison",
  "news_brief",
  "facts",
] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const SCENE_PURPOSES = ["hook", "context", "point", "evidence", "example", "twist", "climax", "summary", "cta", "outro"] as const;

export const SFX_KINDS = ["whoosh", "impact", "pop", "riser", "thunder", "chime", "tick"] as const;
export type SfxKind = (typeof SFX_KINDS)[number];
