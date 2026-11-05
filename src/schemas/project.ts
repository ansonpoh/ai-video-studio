import { z } from "zod";
import { PROCEDURAL_ART } from "./catalog";
import { CreativeDirection } from "./storyboard";
import { CaptionStyleName, VideoRequest } from "./options";

/* ------------------------------------------------------------------ */
/* Resolved media assets (separate from creative instructions)        */
/* ------------------------------------------------------------------ */

const AssetCommon = z.object({
  id: z.string(),
  sceneId: z.string(),
  /** Path relative to the project directory, e.g. assets/s01-img-v1.png */
  file: z.string(),
  createdAt: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSeconds: z.number().optional(),
  costUsd: z.number().default(0),
  cacheKey: z.string().optional(),
});

export const Asset = z.discriminatedUnion("kind", [
  AssetCommon.extend({
    kind: z.literal("generated_image"),
    provider: z.string(),
    model: z.string(),
    prompt: z.string(),
    revisedPrompt: z.string().optional(),
  }),
  AssetCommon.extend({
    kind: z.literal("generated_video"),
    provider: z.string(),
    model: z.string(),
    prompt: z.string(),
    sourceImageAssetId: z.string().optional(),
  }),
  AssetCommon.extend({
    kind: z.literal("stock_image"),
    provider: z.literal("pexels"),
    query: z.string(),
    sourceUrl: z.string(),
    author: z.string(),
    authorUrl: z.string(),
    license: z.string(),
    attribution: z.string(),
  }),
  AssetCommon.extend({
    kind: z.literal("stock_video"),
    provider: z.literal("pexels"),
    query: z.string(),
    sourceUrl: z.string(),
    author: z.string(),
    authorUrl: z.string(),
    license: z.string(),
    attribution: z.string(),
  }),
  AssetCommon.extend({
    kind: z.literal("procedural_image"),
    provider: z.literal("procedural"),
    art: z.enum(PROCEDURAL_ART),
    seed: z.number().int(),
  }),
  AssetCommon.extend({
    kind: z.literal("uploaded"),
    originalName: z.string(),
    mediaType: z.enum(["image", "video"]),
  }),
]);
export type Asset = z.infer<typeof Asset>;
export type AssetKind = Asset["kind"];

export const SceneAssets = z.object({
  sceneId: z.string(),
  /** Asset currently used by the scene; null = render live procedural art only. */
  currentAssetId: z.string().nullable(),
  /** Every asset ever produced for this scene, so replacements can be reverted. */
  history: z.array(Asset).default([]),
  /** Failures are recorded, never treated as success. */
  lastError: z.string().optional(),
});
export type SceneAssets = z.infer<typeof SceneAssets>;

export const NarrationSegment = z.object({
  sceneId: z.string(),
  file: z.string().nullable(), // null in silent mode
  text: z.string(),
  durationSeconds: z.number(),
  timing: z.enum(["tts-alignment", "estimated"]),
  provider: z.string(),
  voiceId: z.string().optional(),
  version: z.number().int().default(1),
  costUsd: z.number().default(0),
  cacheKey: z.string().optional(),
  words: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })),
});
export type NarrationSegment = z.infer<typeof NarrationSegment>;

export const SfxCue = z.object({
  sceneId: z.string(),
  kind: z.string(),
  file: z.string(),
  provider: z.string(),
  costUsd: z.number().default(0),
});

export const AssetManifest = z.object({
  scenes: z.array(SceneAssets),
  narration: z.array(NarrationSegment).default([]),
  music: z
    .object({ file: z.string(), source: z.enum(["library", "procedural-demo"]), license: z.string(), mood: z.string() })
    .nullable()
    .default(null),
  sfx: z.array(SfxCue).default([]),
});
export type AssetManifest = z.infer<typeof AssetManifest>;

/* ------------------------------------------------------------------ */
/* User edits made through the review UI (never overwritten by AI)    */
/* ------------------------------------------------------------------ */

export const SceneEdit = z.object({
  narration: z.string().optional(),
  title: z.string().optional(),
  onScreenText: z.string().optional(),
  visualPrompt: z.string().optional(),
  visualStyle: z.string().optional(),
  layoutFields: z.record(z.string(), z.unknown()).optional(),
  editedAt: z.string(),
});
export type SceneEdit = z.infer<typeof SceneEdit>;

export const ProjectEdits = z.object({
  scenes: z.record(z.string(), SceneEdit).default({}),
  voiceId: z.string().optional(),
  captionStyle: CaptionStyleName.optional(),
  captionsText: z.record(z.string(), z.string()).optional(),
});
export type ProjectEdits = z.infer<typeof ProjectEdits>;

/* ------------------------------------------------------------------ */
/* Pipeline manifest                                                    */
/* ------------------------------------------------------------------ */

export const STAGES = [
  "interpret",
  "direction",
  "script",
  "storyboard",
  "validate",
  "plan-assets",
  "assets",
  "narration",
  "timing",
  "captions",
  "animation",
  "compose",
  "preview",
  "quality",
  "save",
  "export",
] as const;
export type StageName = (typeof STAGES)[number];

export const StageRecord = z.object({
  name: z.enum(STAGES),
  status: z.enum(["pending", "running", "done", "failed", "skipped"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  attempts: z.number().int().default(0),
  error: z.string().optional(),
  note: z.string().optional(),
});
export type StageRecord = z.infer<typeof StageRecord>;

export const CostEntry = z.object({
  at: z.string(),
  category: z.enum(["llm", "image", "video", "voice", "sfx", "stock"]),
  provider: z.string(),
  description: z.string(),
  estimatedUsd: z.number(),
  actualUsd: z.number().optional(),
  cached: z.boolean().default(false),
});
export type CostEntry = z.infer<typeof CostEntry>;

export const PipelineManifest = z.object({
  stages: z.array(StageRecord),
  costs: z.array(CostEntry).default([]),
  log: z.array(z.object({ at: z.string(), level: z.enum(["info", "warn", "error"]), stage: z.string(), message: z.string() })).default([]),
  /** sha256 of editable/Video.tsx when the generator last wrote it. */
  editableHash: z.string().optional(),
  renders: z
    .array(
      z.object({
        kind: z.enum(["draft", "final", "clean", "audio", "narration", "thumbnail"]),
        file: z.string(),
        at: z.string(),
        sourceHash: z.string().optional(),
        quality: z.unknown().optional(),
      }),
    )
    .default([]),
});
export type PipelineManifest = z.infer<typeof PipelineManifest>;

/* ------------------------------------------------------------------ */
/* Project metadata                                                    */
/* ------------------------------------------------------------------ */

export const ContentFlag = z.object({
  severity: z.enum(["info", "review", "blocker"]),
  kind: z.enum([
    "unsupported-claim",
    "statistic-needs-source",
    "quote-needs-source",
    "speculation",
    "time-sensitive",
    "real-person",
    "synthetic-media",
    "licensing",
    "misleading-visual",
    "fiction",
  ]),
  sceneId: z.string().optional(),
  message: z.string(),
});
export type ContentFlag = z.infer<typeof ContentFlag>;

export const ProjectStatus = z.enum(["draft", "generating", "ready", "rendered", "failed", "needs-review"]);

export const ProjectMetadata = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: ProjectStatus,
  request: VideoRequest,
  mode: z.enum(["live", "offline-demo", "mixed"]),
  providers: z.record(z.string(), z.string()),
  direction: CreativeDirection.optional(),
  durationSeconds: z.number().optional(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number().int(),
  disclosure: z.object({
    containsAiGeneratedMedia: z.boolean(),
    containsAiVoice: z.boolean(),
    containsAiScript: z.boolean(),
    label: z.string(),
  }),
  contentFlags: z.array(ContentFlag).default([]),
  requiresReview: z.boolean().default(false),
  storyboardVersion: z.number().int().default(1),
  tags: z.array(z.string()).default([]),
});
export type ProjectMetadata = z.infer<typeof ProjectMetadata>;
