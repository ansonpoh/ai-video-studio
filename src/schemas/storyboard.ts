import { z } from "zod";
import {
  ANIMATION_PRESETS,
  FONT_PAIRINGS,
  MEDIA_MOTIONS,
  MUSIC_MOODS,
  PROCEDURAL_ART,
  SCENE_PURPOSES,
  SFX_KINDS,
  THEMES,
  TRANSITIONS,
  VIDEO_FORMATS,
} from "./catalog";
import { CaptionStyleName } from "./options";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");

/* ------------------------------------------------------------------ */
/* Creative direction                                                  */
/* ------------------------------------------------------------------ */

export const ContentKind = z.enum(["factual", "speculative", "fiction", "promotional", "opinion", "instructional"]);
export type ContentKind = z.infer<typeof ContentKind>;

export const CreativeDirection = z.object({
  title: z.string().min(1).max(90),
  objective: z.string(),
  audience: z.string(),
  tone: z.string(),
  format: z.enum(VIDEO_FORMATS),
  contentKind: ContentKind,
  pacing: z.enum(["slow", "measured", "brisk", "fast"]),
  narrationStyle: z.string(),
  visualStyle: z.object({
    name: z.string(),
    description: z.string(),
    /** Appended to every image prompt so all scenes share one look. */
    imageStylePrompt: z.string(),
    theme: z.enum(THEMES),
    fontPairing: z.enum(FONT_PAIRINGS),
    palette: z.object({ background: hex, primary: hex, accent: hex, text: hex }),
  }),
  captionStyle: CaptionStyleName,
  transitionStyle: z.enum(TRANSITIONS),
  musicMood: z.enum(MUSIC_MOODS),
  targetSceneCount: z.number().int().min(2).max(20),
  hookIdea: z.string(),
  ending: z.string(),
  needsFactCheck: z.boolean(),
  timeSensitive: z.boolean(),
});
export type CreativeDirection = z.infer<typeof CreativeDirection>;

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

export const SceneVisualType = z.enum([
  "generated_image",
  "generated_video",
  "stock_video",
  "stock_image",
  "motion_graphics",
  "animated_text",
  "diagram",
  "uploaded_media",
  "mixed",
]);
export type SceneVisualType = z.infer<typeof SceneVisualType>;

/** What the AI wants to see. Resolved media lives in the asset manifest, not here. */
export const VisualPlan = z.object({
  type: SceneVisualType,
  /** Optimised prompt for image/video generation (no text in image). */
  prompt: z.string().optional(),
  /** Plain description, used for stock search ranking and accessibility. */
  description: z.string(),
  stockQuery: z.string().optional(),
  /** Procedural art used for diagram / motion_graphics scenes and as a fallback backdrop. */
  art: z.enum(PROCEDURAL_ART).optional(),
  motion: z.enum(MEDIA_MOTIONS).default("push-in"),
  /** Whether this scene is worth an (expensive) AI video clip when budget allows. */
  wantsMotionClip: z.boolean().default(false),
});
export type VisualPlan = z.infer<typeof VisualPlan>;

export const Claim = z.object({
  text: z.string(),
  kind: z.enum(["fact", "statistic", "quote", "speculation", "opinion", "fiction"]),
  sourceUrl: z.string().url().optional(),
  /** Model's own confidence; low values are flagged for review. */
  confidence: z.number().min(0).max(1).default(0.7),
});
export type Claim = z.infer<typeof Claim>;

const SceneBase = z.object({
  id: z.string().regex(/^s\d{2}$/, "scene ids look like s01"),
  purpose: z.enum(SCENE_PURPOSES),
  title: z.string().max(80).optional(),
  narration: z.string(),
  onScreenText: z.string().max(140).optional(),
  visual: VisualPlan,
  animationPreset: z.enum(ANIMATION_PRESETS).default("fade-up"),
  /** Transition INTO this scene (ignored for the first scene). */
  transitionIn: z.enum(TRANSITIONS).default("crossfade"),
  estimatedDurationSeconds: z.number().min(1).max(30).default(4),
  sfx: z.enum(SFX_KINDS).optional(),
  claims: z.array(Claim).default([]),
});

/** Layout-specific content. Discriminated on `layout` so each scene component gets exactly the props it needs. */
export const SceneLayout = z.discriminatedUnion("layout", [
  z.object({ layout: z.literal("cinematic_image") }),
  z.object({ layout: z.literal("video_clip") }),
  z.object({ layout: z.literal("text_reveal"), emphasis: z.string().optional() }),
  z.object({ layout: z.literal("listicle"), number: z.number().int().min(1).max(20), heading: z.string(), body: z.string().optional() }),
  z.object({ layout: z.literal("fact_card"), label: z.string(), fact: z.string() }),
  z.object({
    layout: z.literal("comparison"),
    leftLabel: z.string(),
    rightLabel: z.string(),
    leftText: z.string(),
    rightText: z.string(),
  }),
  z.object({ layout: z.literal("timeline"), points: z.array(z.string()).min(2).max(5) }),
  z.object({ layout: z.literal("quote"), quote: z.string(), attribution: z.string() }),
  z.object({ layout: z.literal("diagram"), labels: z.array(z.string()).max(4).default([]) }),
  z.object({
    layout: z.literal("product_showcase"),
    productName: z.string(),
    tagline: z.string(),
    features: z.array(z.string()).max(4).default([]),
  }),
  z.object({
    layout: z.literal("number_counter"),
    value: z.number(),
    prefix: z.string().default(""),
    suffix: z.string().default(""),
    label: z.string(),
    decimals: z.number().int().min(0).max(3).default(0),
  }),
  z.object({
    layout: z.literal("infographic"),
    stats: z.array(z.object({ label: z.string(), value: z.number(), display: z.string() })).min(2).max(4),
  }),
  z.object({ layout: z.literal("outro"), cta: z.string() }),
  z.object({ layout: z.literal("mixed_media"), overlayArt: z.enum(PROCEDURAL_ART).optional() }),
]);
export type SceneLayout = z.infer<typeof SceneLayout>;
export type LayoutName = SceneLayout["layout"];

export const Scene = z.intersection(SceneBase, SceneLayout);
export type Scene = z.infer<typeof Scene>;

export const Storyboard = z.object({
  version: z.number().int().min(1),
  createdAt: z.string(),
  source: z.enum(["anthropic", "mock", "demo", "user"]),
  model: z.string().optional(),
  title: z.string(),
  hook: z.string(),
  scenes: z.array(Scene).min(1).max(24),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
  disclaimer: z.string().optional(),
});
export type Storyboard = z.infer<typeof Storyboard>;
