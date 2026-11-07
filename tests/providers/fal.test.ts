import { describe, expect, it } from "vitest";
import { buildFalInput, clipSecondsFor, fieldMapFor } from "../../src/media/video/fal";

const req = { prompt: "a slow push-in on a lighthouse", durationSeconds: 5, aspectRatio: "9:16", resolution: "720p" as const };

describe("fal input mapping", () => {
  it("matches the Kling 2.5 Turbo Pro image-to-video schema", () => {
    const model = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
    expect(fieldMapFor(model).image).toBe("image_url");
    expect(buildFalInput(model, req, "https://example.com/still.png")).toEqual({
      prompt: req.prompt,
      image_url: "https://example.com/still.png",
      duration: "5",
    });
  });

  it("keeps the Kling 4 field names for kling/v4 ids", () => {
    const input = buildFalInput("kling/v4/image-to-video", req, "https://example.com/still.png");
    expect(input.start_image_url).toBe("https://example.com/still.png");
    expect(input.resolution).toBe("720p");
  });
});

describe("cheaper background models", () => {
  const img = "https://example.com/still.png";
  it("MiniMax H3 Max Turbo: numeric duration, 768P instead of 720p", () => {
    expect(buildFalInput("minimax/h3-max-turbo/image-to-video", req, img)).toEqual({ prompt: req.prompt, image_url: img, duration: 5, resolution: "768P" });
  });
  it("LTX-2 Fast: snaps to its 6s minimum, 1080p, own audio off", () => {
    expect(buildFalInput("fal-ai/ltx-2/image-to-video/fast", req, img)).toEqual({ prompt: req.prompt, image_url: img, duration: 6, resolution: "1080p", generate_audio: false });
    expect(clipSecondsFor("fal-ai/ltx-2/image-to-video/fast", 5)).toBe(6);
  });
  it("Wan 2.5: string duration, real resolution field", () => {
    expect(buildFalInput("fal-ai/wan-25-preview/image-to-video", req, img)).toEqual({ prompt: req.prompt, image_url: img, duration: "5", resolution: "720p" });
  });
  it("Kling 3.0 Standard: start_image_url and no paid audio", () => {
    expect(buildFalInput("fal-ai/kling-video/v3/standard/image-to-video", req, img)).toEqual({ prompt: req.prompt, start_image_url: img, duration: "5", generate_audio: false });
  });
  it("prices the billed length, not the requested one", async () => {
    const { FalVideo } = await import("../../src/media/video/fal");
    const v = new FalVideo({ apiKey: "k", model: "fal-ai/ltx-2/image-to-video/fast", pricePerSecond: 0.04, client: {} as never });
    expect(v.estimateUsd(req)).toBeCloseTo(0.24);
  });
});

describe("fal error mapping", () => {
  it("shows fal's own reason for a 403 instead of blaming the key", async () => {
    const { ApiError } = await import("@fal-ai/client");
    const { FalVideo } = await import("../../src/media/video/fal");
    const body = { detail: "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing" };
    const client = { subscribe: async () => { throw new ApiError({ message: "Forbidden", status: 403, body, requestId: "r1" }); }, storage: { upload: async () => "" } };
    const v = new FalVideo({ apiKey: "k", model: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", client: client as never });
    await expect(v.generate(req)).rejects.toThrow(/Exhausted balance/);
  });
});
