import { z } from "zod";

/** Options a user picks on the creation screen or passes to the CLI. */
export const AspectRatio = z.enum(["9:16", "16:9", "1:1", "4:5"]);
export type AspectRatio = z.infer<typeof AspectRatio>;

/**
 * - economy: AI stills with camera motion, no clips.
 * - hybrid (default): AI stills with camera motion on most scenes; real AI clips
 *   only for the hook and 2 key moments, plus cheap clips for a couple of
 *   background shots when VIDEO_BACKGROUND_MODEL is set.
 * - balanced / premium: earlier presets with up to 2 / 5 premium clips.
 */
export const QualityPreset = z.enum(["economy", "hybrid", "balanced", "premium"]);
export type QualityPreset = z.infer<typeof QualityPreset>;

export const CaptionStyleName = z.enum([
  "minimal",
  "bold",
  "word-highlight",
  "karaoke",
  "cinematic",
]);
export type CaptionStyleName = z.infer<typeof CaptionStyleName>;

/**
 * How visuals may be sourced.
 * - auto: the director mixes generated images, motion graphics, stock and clips.
 * - ai_only: only AI-generated or programmatic visuals; stock is never used.
 * - stock_preferred: prefer licensed stock media, fall back to generated.
 * - procedural_only: no paid media calls; programmatic motion graphics only.
 */
export const VisualMode = z.enum(["auto", "ai_only", "stock_preferred", "procedural_only"]);
export type VisualMode = z.infer<typeof VisualMode>;

export const VisualStylePreference = z.enum([
  "auto",
  "cinematic",
  "educational",
  "bold-modern",
  "minimal",
  "documentary",
  "playful",
  "luxury",
  "retro",
  "tech",
]);
export type VisualStylePreference = z.infer<typeof VisualStylePreference>;

export const Platform = z.enum(["shorts", "tiktok", "reels", "youtube", "generic"]);

export const RESOLUTIONS: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const VideoRequest = z.object({
  prompt: z.string().min(3, "Describe the video you want (at least a few words)."),
  durationSeconds: z.number().int().min(5).max(180).default(30),
  aspectRatio: AspectRatio.default("9:16"),
  fps: z.number().int().min(24).max(60).default(30),
  style: VisualStylePreference.default("auto"),
  tone: z.string().default("auto"),
  audience: z.string().default("auto"),
  language: z.string().default("en"),
  narration: z.boolean().default(true),
  voiceId: z.string().optional(),
  captions: z.boolean().default(true),
  captionStyle: z.union([CaptionStyleName, z.literal("auto")]).default("auto"),
  music: z.string().default("auto"), // "auto" | "none" | file name inside music/
  musicVolume: z.number().min(0).max(1).default(0.18),
  visualMode: VisualMode.default("auto"),
  quality: QualityPreset.default("hybrid"),
  /**
   * Storyboard preview before paying for clips. "ask" stops after the stills
   * are made so they can be reviewed; "approved" generates the planned clips;
   * "skipped" keeps the animated stills and never calls the video provider.
   */
  clipApproval: z.enum(["ask", "approved", "skipped"]).default("ask"),
  platform: Platform.default("shorts"),
  /** Hard ceiling for this project's estimated spend. Falls back to MAX_GENERATION_BUDGET_USD. */
  budgetUsd: z.number().min(0).optional(),
  /** Explicit consent to exceed the budget (CLI --approve-spend / UI confirmation). */
  approveSpendUsd: z.number().min(0).optional(),
  /** Force offline providers even if keys are configured. */
  offline: z.boolean().default(false),
  /** Allow sound effect generation (costs money when ElevenLabs is configured). */
  soundEffects: z.boolean().default(false),
});
export type VideoRequest = z.infer<typeof VideoRequest>;
export type VideoRequestInput = z.input<typeof VideoRequest>;
