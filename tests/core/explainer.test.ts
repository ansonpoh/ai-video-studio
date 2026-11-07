import { describe, expect, it } from "vitest";
import { createProviders, providerSummary } from "../../src/providers/index";
import { createMockProviders } from "../../src/providers/mocks";
import { EnvSchema } from "../../src/config/env";
import { VideoRequest } from "../../src/schemas/options";
import { imageProviderFor, imageSizeFor } from "../../src/pipeline/assets";
import { applyPresetLook, EXPLAINER_STYLE } from "../../src/pipeline/explainer";
import { PRESETS } from "../../src/pipeline/budget";
import { buildImageInput, FalImages, snapSize } from "../../src/media/images/fal";
import type { CreativeDirection } from "../../src/schemas/storyboard";

const request = (over: Record<string, unknown> = {}) => VideoRequest.parse({ prompt: "Explain lightning", quality: "explainer", ...over });
const direction = { musicMood: "epic", visualStyle: { name: "x", description: "keep me", imageStylePrompt: "y", palette: {} } } as unknown as CreativeDirection;

describe("explainer preset", () => {
  it("has no clips or sound effects", () => {
    expect(PRESETS.explainer).toMatchObject({ maxVideoClips: 0, backgroundClips: 0, soundEffects: false, budgetImages: true });
  });

  it("locks the look and drops automatic music", () => {
    const d = applyPresetLook(direction, request());
    expect(d.visualStyle).toMatchObject({ ...EXPLAINER_STYLE, description: "keep me" });
    expect(d.musicMood).toBe("none");
  });

  it("keeps music the user picked, and leaves other presets alone", () => {
    expect(applyPresetLook(direction, request({ music: "track.mp3" })).musicMood).toBe("epic");
    expect(applyPresetLook(direction, request({ quality: "hybrid" }))).toBe(direction);
  });
});

describe("image provider choice", () => {
  const keys = EnvSchema.parse({ OPENAI_API_KEY: "o", FAL_KEY: "f" });

  it("uses budget images only for presets that ask for them", () => {
    const p = createProviders({ env: keys });
    expect(imageProviderFor(p, request())?.name).toBe("fal");
    expect(imageProviderFor(p, request({ quality: "hybrid" }))?.name).toBe("openai");
  });

  it("uses budget images everywhere when there is no OpenAI key", () => {
    const p = createProviders({ env: EnvSchema.parse({ FAL_KEY: "f" }) });
    expect(providerSummary(p).images).toBe("fal:fal-ai/z-image/turbo");
    expect(imageProviderFor(p, request({ quality: "hybrid" }))?.name).toBe("fal");
  });

  it("keeps budget images when clips are turned off", () => {
    expect(imageProviderFor(createProviders({ env: keys, allowVideo: false }), request())?.name).toBe("fal");
  });

  it("falls back to the normal provider without a fal key", () => {
    const p = createMockProviders();
    expect(imageProviderFor(p, request())).toBe(p.images);
  });
});

describe("image sizes", () => {
  it("match the video's orientation", () => {
    expect(imageSizeFor(request({ aspectRatio: "16:9" }))).toEqual({ width: 1536, height: 864 });
    expect(imageSizeFor(request({ aspectRatio: "9:16" }))).toEqual({ width: 1024, height: 1536 });
    expect(imageSizeFor(request({ aspectRatio: "1:1" }))).toEqual({ width: 1024, height: 1024 });
  });
});

describe("fal budget images", () => {
  const req = { prompt: "a glass temple", width: 1536, height: 864, quality: "low" as const };

  it("matches the Z-Image Turbo schema", () => {
    expect(buildImageInput(req)).toEqual({ prompt: "a glass temple", image_size: { width: 1536, height: 864 }, num_images: 1, output_format: "png" });
    expect(buildImageInput({ ...req, seed: 7 }).seed).toBe(7);
    expect(snapSize(1000, 1003)).toEqual({ width: 1008, height: 1008 });
  });

  it("prices by megapixel", () => {
    expect(new FalImages({ apiKey: "k", pricePerMegapixel: 0.005 }).estimateUsd(req)).toBeCloseTo(0.00664, 4);
  });
});
