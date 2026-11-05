/**
 * Provider interfaces. The pipeline only talks to these; concrete adapters
 * (Anthropic, OpenAI Images, fal.ai, Pexels, ElevenLabs, offline/procedural,
 * and mocks for tests) implement them. Keeping them narrow is what lets the
 * web UI, CLI and tests share one pipeline.
 */
import type { CreativeDirection, Scene, Storyboard } from "../schemas/storyboard";
import type { VideoRequest } from "../schemas/options";
import type { Word } from "../captions";

export type CostReport = { estimatedUsd: number; actualUsd?: number; description: string };

/* ---------------------------------------------------------------- LLM */

export type ScriptBeat = { purpose: Scene["purpose"]; narration: string; intent: string };
export type Script = { title: string; hook: string; beats: ScriptBeat[]; sources: { title: string; url: string }[] };

export interface LlmProvider {
  readonly name: string; // "anthropic" | "mock" | ...
  readonly model: string;
  direction(req: VideoRequest, hints: PromptHints): Promise<{ direction: CreativeDirection; cost: CostReport }>;
  script(req: VideoRequest, direction: CreativeDirection, hints: PromptHints): Promise<{ script: Script; cost: CostReport }>;
  storyboard(req: VideoRequest, direction: CreativeDirection, script: Script): Promise<{ storyboard: Omit<Storyboard, "version" | "createdAt" | "source">; cost: CostReport }>;
  /** Rewrites one scene (visual or narration) while keeping its purpose and position. */
  rewriteScene(req: VideoRequest, direction: CreativeDirection, scenes: Scene[], sceneId: string, instruction: string): Promise<{ scene: Scene; cost: CostReport }>;
  /** Optional fact review: returns claims that look unsupported. */
  reviewClaims?(direction: CreativeDirection, scenes: Scene[]): Promise<{ issues: { sceneId: string; claim: string; problem: string }[]; cost: CostReport }>;
}

/** Deterministic hints parsed from the raw prompt before any AI call (see ai/prompt-parser.ts). */
export type PromptHints = {
  requestedDurationSeconds?: number;
  listCount?: number;
  formatHint?: string;
  styleHints: string[];
  platformHint?: string;
  mentionsRealPerson: boolean;
  timeSensitive: boolean;
  fictional: boolean;
  speculative: boolean;
};

/* ---------------------------------------------------------------- media */

export type ImageRequest = { prompt: string; width: number; height: number; quality: "low" | "medium" | "high"; seed?: number };
export type ImageResult = { data: Buffer; extension: "png" | "jpg" | "webp"; model: string; revisedPrompt?: string; cost: CostReport };
export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  estimateUsd(req: ImageRequest): number;
  generate(req: ImageRequest): Promise<ImageResult>;
}

export type VideoClipRequest = { prompt: string; imageFile?: string; durationSeconds: number; aspectRatio: string; resolution: "720p" | "1080p" };
export type VideoClipResult = { data: Buffer; model: string; cost: CostReport };
export interface VideoProvider {
  readonly name: string;
  readonly model: string;
  estimateUsd(req: VideoClipRequest): number;
  generate(req: VideoClipRequest): Promise<VideoClipResult>;
}

export type StockCandidate = {
  kind: "image" | "video";
  id: string;
  url: string; // download url (best matching size)
  pageUrl: string;
  width: number;
  height: number;
  durationSeconds?: number;
  author: string;
  authorUrl: string;
  description: string;
  score?: number;
};
export interface StockProvider {
  readonly name: string;
  search(query: string, opts: { kind: "image" | "video"; orientation: "portrait" | "landscape" | "square"; perPage?: number }): Promise<StockCandidate[]>;
  download(c: StockCandidate): Promise<Buffer>;
  license: string;
  attribution(c: StockCandidate): string;
}

/* ---------------------------------------------------------------- audio */

export type SpeechRequest = { text: string; voiceId?: string; previousText?: string; nextText?: string; language?: string; style?: string };
export type SpeechResult = { audio: Buffer | null; extension: "mp3" | "wav"; durationSeconds: number; words: Word[]; timing: "tts-alignment" | "estimated"; voiceId?: string; cost: CostReport };
export interface TtsProvider {
  readonly name: string; // "elevenlabs" | "silent"
  readonly real: boolean;
  estimateUsd(text: string): number;
  synthesize(req: SpeechRequest): Promise<SpeechResult>;
}

export interface SfxProvider {
  readonly name: string;
  estimateUsd(seconds: number): number;
  generate(prompt: string, seconds: number): Promise<{ audio: Buffer; cost: CostReport }>;
}

export type Providers = {
  llm: LlmProvider;
  images: ImageProvider | null;
  video: VideoProvider | null;
  stock: StockProvider | null;
  tts: TtsProvider;
  sfx: SfxProvider | null;
};

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable = false,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export class MissingCredentialsError extends Error {
  constructor(
    public capability: string,
    public envVars: string[],
  ) {
    super(`${capability} needs ${envVars.join(" / ")} in .env (or use the offline demo: npm run demo).`);
  }
}
