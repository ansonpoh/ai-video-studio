/**
 * Budget image generation on fal.ai. The endpoint comes from IMAGE_BUDGET_MODEL
 * (default "fal-ai/z-image/turbo", billed per megapixel), so a video-sized still
 * costs well under a cent. Input fields follow that model's API schema (Nov 2026).
 */
import { createFalClient, type FalClient } from "@fal-ai/client";
import { env } from "../../config/env";
import { falError } from "../video/fal";
import { ProviderError, type ImageProvider, type ImageRequest, type ImageResult } from "../../providers/types";

/** Pixel sizes snapped to multiples of 16, which diffusion models expect. */
export const snapSize = (width: number, height: number) => ({
  width: Math.max(16, Math.round(width / 16) * 16),
  height: Math.max(16, Math.round(height / 16) * 16),
});

/** Builds the fal input object for a request (exported for tests). */
export const buildImageInput = (req: ImageRequest): Record<string, unknown> => {
  const input: Record<string, unknown> = { prompt: req.prompt, image_size: snapSize(req.width, req.height), num_images: 1, output_format: "png" };
  if (req.seed !== undefined) input.seed = req.seed;
  return input;
};

export type FalImagesOptions = { apiKey?: string; model?: string; client?: FalClient; pricePerMegapixel?: number; fetchImpl?: typeof fetch };

export class FalImages implements ImageProvider {
  readonly name = "fal";
  readonly model: string;
  private readonly client: FalClient;
  private readonly pricePerMegapixel: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FalImagesOptions = {}) {
    const e = env();
    this.model = opts.model ?? e.IMAGE_BUDGET_MODEL ?? "fal-ai/z-image/turbo";
    this.client = opts.client ?? createFalClient({ credentials: opts.apiKey ?? e.FAL_KEY });
    this.pricePerMegapixel = opts.pricePerMegapixel ?? e.PRICE_IMAGE_BUDGET_PER_MP;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  estimateUsd(req: ImageRequest) {
    const { width, height } = snapSize(req.width, req.height);
    return ((width * height) / 1_000_000) * this.pricePerMegapixel;
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    try {
      const result = await this.client.subscribe(this.model, { input: buildImageInput(req), logs: false });
      const url = (result.data as { images?: { url?: string }[] } | undefined)?.images?.[0]?.url;
      if (!url) throw new ProviderError(this.name, `no image url in ${this.model} result (request ${result.requestId})`, false);
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new ProviderError(this.name, `downloading generated image failed: HTTP ${res.status}`, res.status >= 500, res.status);
      const usd = this.estimateUsd(req);
      const { width, height } = snapSize(req.width, req.height);
      return {
        data: Buffer.from(await res.arrayBuffer()),
        extension: "png",
        model: this.model,
        cost: { estimatedUsd: usd, actualUsd: usd, description: `${this.model} ${width}x${height} image (price assumption)` },
      };
    } catch (err) {
      throw falError(this.name, this.model, err);
    }
  }
}
