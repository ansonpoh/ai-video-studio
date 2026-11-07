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
