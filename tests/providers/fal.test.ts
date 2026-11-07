import { describe, expect, it } from "vitest";
import { buildFalInput, fieldMapFor } from "../../src/media/video/fal";

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
