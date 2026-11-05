/**
 * OpenAI image generation (gpt-image family). The model comes from
 * OPENAI_IMAGE_MODEL (default "gpt-image-2"); retired DALL-E models are never
 * referenced. gpt-image models always return base64 (`b64_json`).
 */
import OpenAI from "openai";
import { env } from "../../config/env";
import { ProviderError, type ImageProvider, type ImageRequest, type ImageResult } from "../../providers/types";

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

/** Maps a requested pixel size / aspect to the closest supported generation size. */
export const sizeFor = (width: number, height: number): ImageSize => {
  const ratio = width / Math.max(1, height);
  if (ratio < 0.85) return "1024x1536"; // portrait (9:16, 4:5)
  if (ratio > 1.18) return "1536x1024"; // landscape (16:9)
  return "1024x1024";
};

export type OpenAiImagesOptions = { apiKey?: string; model?: string; client?: OpenAI };

export class OpenAiImages implements ImageProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly client: OpenAI;
  private readonly prices: Record<ImageRequest["quality"], number>;

  constructor(opts: OpenAiImagesOptions = {}) {
    const e = env();
    this.model = opts.model ?? e.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    this.client = opts.client ?? new OpenAI({ apiKey: opts.apiKey ?? e.OPENAI_API_KEY, maxRetries: 2 });
    this.prices = { low: e.PRICE_IMAGE_LOW, medium: e.PRICE_IMAGE_MEDIUM, high: e.PRICE_IMAGE_HIGH };
  }

  estimateUsd(req: ImageRequest) {
    return this.prices[req.quality] ?? this.prices.medium;
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const size = sizeFor(req.width, req.height);
    try {
      const res = await this.client.images.generate({ model: this.model, prompt: req.prompt, size, quality: req.quality, n: 1 });
      const item = res.data?.[0];
      if (!item?.b64_json) throw new ProviderError(this.name, "image response contained no b64_json data", false);
      const usd = this.estimateUsd(req);
      const fmt = (res as { output_format?: string }).output_format;
      return {
        data: Buffer.from(item.b64_json, "base64"),
        extension: fmt === "jpeg" || fmt === "jpg" ? "jpg" : fmt === "webp" ? "webp" : "png",
        model: this.model,
        revisedPrompt: item.revised_prompt ?? undefined,
        cost: { estimatedUsd: usd, actualUsd: usd, description: `${this.model} ${size} ${req.quality} image (price assumption)` },
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): ProviderError {
    if (err instanceof ProviderError) return err;
    if (err instanceof OpenAI.RateLimitError) return new ProviderError(this.name, `rate limited: ${err.message}`, true, 429);
    if (err instanceof OpenAI.APIConnectionError) return new ProviderError(this.name, `connection failed: ${err.message}`, true);
    if (err instanceof OpenAI.InternalServerError) return new ProviderError(this.name, `server error: ${err.message}`, true, err.status);
    if (err instanceof OpenAI.AuthenticationError) return new ProviderError(this.name, "authentication failed - check OPENAI_API_KEY", false, 401);
    if (err instanceof OpenAI.PermissionDeniedError) return new ProviderError(this.name, `permission denied (organisation verification may be required for ${this.model}): ${err.message}`, false, 403);
    if (err instanceof OpenAI.BadRequestError) return new ProviderError(this.name, `bad request (possibly a content-policy rejection): ${err.message}`, false, 400);
    if (err instanceof OpenAI.APIError) {
      const status = typeof err.status === "number" ? err.status : undefined;
      return new ProviderError(this.name, err.message, status === 408 || status === 409 || (status ?? 0) >= 500, status);
    }
    return new ProviderError(this.name, err instanceof Error ? err.message : String(err), false);
  }
}
