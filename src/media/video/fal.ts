/**
 * fal.ai image-to-video / text-to-video. The endpoint comes from VIDEO_MODEL
 * (default "fal-ai/kling-video/v2.5-turbo/pro/image-to-video").
 *
 * IMPORTANT: every fal model has its own input schema. The field names below
 * (start_image_url / image_url, duration, resolution, aspect_ratio) must match
 * the chosen model's schema on fal.ai; check the model page and extend
 * FIELD_MAPS when switching models. Unknown fields may be rejected (422).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createFalClient, ApiError, ValidationError, type FalClient } from "@fal-ai/client";
import { env, videoKey } from "../../config/env";
import { ProviderError, type VideoClipRequest, type VideoClipResult, type VideoProvider } from "../../providers/types";

export type FalFieldMap = {
  /** Input field that receives the uploaded start image URL. */
  image: string;
  /** How `duration` is sent: some models want a string ("5"), others a number. */
  durationAs: "string" | "number";
  /** Allowed durations; the request is snapped up to the nearest one (else rounded). */
  durations?: number[];
  /** false = no resolution field; true = send "720p"/"1080p" as-is; a map = model-specific values. */
  resolution: boolean | Record<VideoClipRequest["resolution"], string>;
  aspectRatio: boolean;
  /** Fixed extra inputs (e.g. turn off a model's own audio track, which we replace anyway). */
  extra?: Record<string, unknown>;
};

/**
 * Keyed by model-id prefix; longest match wins. Keep honest: each entry was
 * checked against the model's API schema on fal.ai (Nov 2026).
 */
export const FIELD_MAPS: [prefix: string, map: FalFieldMap][] = [
  ["kling", { image: "start_image_url", durationAs: "string", resolution: true, aspectRatio: true }],
  // fal-ai/kling-video/* (e.g. v2.5-turbo/pro): image_url, duration "5" | "10"; aspect follows the image.
  ["fal-ai/kling-video", { image: "image_url", durationAs: "string", durations: [5, 10], resolution: false, aspectRatio: false }],
  // Kling 3.0: start_image_url, duration "3".."15", audio on by default (+50% price) -> off.
  ["fal-ai/kling-video/v3", { image: "start_image_url", durationAs: "string", resolution: false, aspectRatio: false, extra: { generate_audio: false } }],
  // MiniMax H3 Max / Max Turbo: duration float, resolution 480P | 768P | 1080P, aspect follows the image.
  ["minimax/h3", { image: "image_url", durationAs: "number", resolution: { "720p": "768P", "1080p": "1080P" }, aspectRatio: false }],
  // LTX-2 Fast: duration 6..20 (even), resolution 1080p minimum, audio on by default -> off.
  ["fal-ai/ltx-2", { image: "image_url", durationAs: "number", durations: [6, 8, 10], resolution: { "720p": "1080p", "1080p": "1080p" }, aspectRatio: false, extra: { generate_audio: false } }],
  // Wan 2.5 preview: duration "5" | "10", resolution 480p | 720p | 1080p.
  ["fal-ai/wan-25-preview", { image: "image_url", durationAs: "string", durations: [5, 10], resolution: true, aspectRatio: false }],
  // Seedance 1.x (Lite now redirects to Pro Fast): duration "2".."12", resolution 480p|720p|1080p.
  ["fal-ai/bytedance/seedance", { image: "image_url", durationAs: "string", resolution: true, aspectRatio: true }],
];
const DEFAULT_MAP: FalFieldMap = { image: "image_url", durationAs: "number", resolution: true, aspectRatio: true };

export const fieldMapFor = (model: string): FalFieldMap => {
  const sorted = [...FIELD_MAPS].sort((a, b) => b[0].length - a[0].length);
  return sorted.find(([p]) => model.startsWith(p))?.[1] ?? DEFAULT_MAP;
};

/** Seconds the model will actually produce (and bill) for a request. */
export const clipSecondsFor = (model: string, requested: number) => {
  const m = fieldMapFor(model);
  const s = Math.max(1, Math.round(requested));
  if (!m.durations?.length) return s;
  return m.durations.find((d) => d >= s) ?? m.durations[m.durations.length - 1];
};

/** Builds the fal input object for a request (exported for tests). */
export const buildFalInput = (model: string, req: VideoClipRequest, imageUrl?: string): Record<string, unknown> => {
  const m = fieldMapFor(model);
  const input: Record<string, unknown> = { prompt: req.prompt };
  if (imageUrl) input[m.image] = imageUrl;
  const seconds = clipSecondsFor(model, req.durationSeconds);
  input.duration = m.durationAs === "string" ? String(seconds) : seconds;
  if (m.resolution === true) input.resolution = req.resolution;
  else if (m.resolution) input.resolution = m.resolution[req.resolution];
  // image-to-video inherits the image's aspect
  if (m.aspectRatio && !imageUrl) input.aspect_ratio = req.aspectRatio;
  Object.assign(input, m.extra);
  return input;
};

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export type FalVideoOptions = { apiKey?: string; model?: string; client?: FalClient; pricePerSecond?: number };

export class FalVideo implements VideoProvider {
  readonly name = "fal";
  readonly model: string;
  private readonly client: FalClient;
  private readonly pricePerSecond: number;

  constructor(opts: FalVideoOptions = {}) {
    const e = env();
    this.model = opts.model ?? e.VIDEO_MODEL ?? "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
    // Equivalent to fal.config({ credentials }) but scoped to this instance instead of a global singleton.
    this.client = opts.client ?? createFalClient({ credentials: opts.apiKey ?? videoKey(e) });
    this.pricePerSecond = opts.pricePerSecond ?? e.PRICE_VIDEO_PER_SECOND;
  }

  estimateUsd(req: VideoClipRequest) {
    return this.pricePerSecond * clipSecondsFor(this.model, req.durationSeconds);
  }

  async generate(req: VideoClipRequest): Promise<VideoClipResult> {
    try {
      let imageUrl: string | undefined;
      if (req.imageFile) {
        const buf = await fs.readFile(req.imageFile);
        const type = MIME[path.extname(req.imageFile).toLowerCase()] ?? "application/octet-stream";
        imageUrl = await this.client.storage.upload(new Blob([new Uint8Array(buf)], { type }));
      }
      const input = buildFalInput(this.model, req, imageUrl);
      const result = await this.client.subscribe(this.model, { input, logs: false });
      const url = (result.data as { video?: { url?: string } } | undefined)?.video?.url;
      if (!url) throw new ProviderError(this.name, `no video.url in ${this.model} result (request ${result.requestId})`, false);
      const res = await fetch(url);
      if (!res.ok) throw new ProviderError(this.name, `downloading generated clip failed: HTTP ${res.status}`, res.status >= 500, res.status);
      const data = Buffer.from(await res.arrayBuffer());
      const usd = this.estimateUsd(req);
      return { data, model: this.model, cost: { estimatedUsd: usd, actualUsd: usd, description: `${this.model} ${clipSecondsFor(this.model, req.durationSeconds)}s clip (price assumption)` } };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): ProviderError {
    if (err instanceof ProviderError) return err;
    if (err instanceof ValidationError) {
      return new ProviderError(this.name, `input rejected by ${this.model} (check FIELD_MAPS in src/media/video/fal.ts): ${err.message}`, false, err.status);
    }
    if (err instanceof ApiError) {
      const s = err.status;
      const retryable = s === 429 || s >= 500 || (s === 408 && !err.isUserTimeout);
      // fal also answers 403 for a locked account (e.g. "Exhausted balance"), so surface its own detail.
      const detail = (err.body as { detail?: unknown } | undefined)?.detail;
      const falSays = typeof detail === "string" ? detail : err.message;
      const msg = s === 401 ? `authentication failed - check VIDEO_PROVIDER_API_KEY / FAL_KEY (${falSays})` : s === 403 ? `request refused by fal: ${falSays}` : err.message;
      return new ProviderError(this.name, msg, retryable, s);
    }
    if (err instanceof TypeError) return new ProviderError(this.name, `network error: ${err.message}`, true);
    return new ProviderError(this.name, err instanceof Error ? err.message : String(err), false);
  }
}
