/**
 * fal.ai image-to-video / text-to-video. The endpoint comes from VIDEO_MODEL
 * (default "kling/v4/image-to-video").
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
  /** Whether the model accepts `resolution` / `aspect_ratio`. */
  resolution: boolean;
  aspectRatio: boolean;
};

/** Keyed by model-id prefix; first match wins. Keep honest: verify against the model's schema. */
export const FIELD_MAPS: [prefix: string, map: FalFieldMap][] = [
  ["kling", { image: "start_image_url", durationAs: "string", resolution: true, aspectRatio: true }],
  ["fal-ai/kling-video", { image: "image_url", durationAs: "string", resolution: false, aspectRatio: true }],
];
const DEFAULT_MAP: FalFieldMap = { image: "image_url", durationAs: "number", resolution: true, aspectRatio: true };

export const fieldMapFor = (model: string): FalFieldMap => {
  // Longest prefix first so "fal-ai/kling-video" beats a bare "kling" match.
  const sorted = [...FIELD_MAPS].sort((a, b) => b[0].length - a[0].length);
  return sorted.find(([p]) => model.startsWith(p))?.[1] ?? DEFAULT_MAP;
};

/** Builds the fal input object for a request (exported for tests). */
export const buildFalInput = (model: string, req: VideoClipRequest, imageUrl?: string): Record<string, unknown> => {
  const m = fieldMapFor(model);
  const input: Record<string, unknown> = { prompt: req.prompt };
  if (imageUrl) input[m.image] = imageUrl;
  const seconds = Math.max(1, Math.round(req.durationSeconds));
  input.duration = m.durationAs === "string" ? String(seconds) : seconds;
  if (m.resolution) input.resolution = req.resolution;
  if (m.aspectRatio && !imageUrl) input.aspect_ratio = req.aspectRatio; // image-to-video inherits the image's aspect
  return input;
};

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export type FalVideoOptions = { apiKey?: string; model?: string; client?: FalClient };

export class FalVideo implements VideoProvider {
  readonly name = "fal";
  readonly model: string;
  private readonly client: FalClient;
  private readonly pricePerSecond: number;

  constructor(opts: FalVideoOptions = {}) {
    const e = env();
    this.model = opts.model ?? e.VIDEO_MODEL ?? "kling/v4/image-to-video";
    // Equivalent to fal.config({ credentials }) but scoped to this instance instead of a global singleton.
    this.client = opts.client ?? createFalClient({ credentials: opts.apiKey ?? videoKey(e) });
    this.pricePerSecond = e.PRICE_VIDEO_PER_SECOND;
  }

  estimateUsd(req: VideoClipRequest) {
    return this.pricePerSecond * Math.max(1, Math.round(req.durationSeconds));
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
      return { data, model: this.model, cost: { estimatedUsd: usd, actualUsd: usd, description: `${this.model} ${Math.round(req.durationSeconds)}s ${req.resolution} clip (price assumption)` } };
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
      const msg = s === 401 || s === 403 ? "authentication failed - check VIDEO_PROVIDER_API_KEY / FAL_KEY" : err.message;
      return new ProviderError(this.name, msg, retryable, s);
    }
    if (err instanceof TypeError) return new ProviderError(this.name, `network error: ${err.message}`, true);
    return new ProviderError(this.name, err instanceof Error ? err.message : String(err), false);
  }
}
