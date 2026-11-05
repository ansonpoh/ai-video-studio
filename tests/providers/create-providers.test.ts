import { describe, expect, it } from "vitest";
import { createProviders, providerSummary } from "../../src/providers/index";
import { createMockProviders, silentWav, solidPng, wavDurationSeconds } from "../../src/providers/mocks";
import { EnvSchema } from "../../src/config/env";
import { MissingCredentialsError } from "../../src/providers/types";
import { VideoRequest } from "../../src/schemas/options";
import { parsePromptHints } from "../../src/ai/prompt-parser";

const noKeys = EnvSchema.parse({});

describe("createProviders", () => {
  it("degrades honestly with no keys", async () => {
    const p = createProviders({ env: noKeys });
    expect(p.tts.name).toBe("silent");
    expect(p.tts.real).toBe(false);
    expect(p.images).toBeNull();
    expect(p.video).toBeNull();
    expect(p.stock).toBeNull();
    expect(p.sfx).toBeNull();
    const req = VideoRequest.parse({ prompt: "Explain lightning" });
    await expect(p.llm.direction(req, parsePromptHints(req.prompt))).rejects.toBeInstanceOf(MissingCredentialsError);
    await expect(p.llm.direction(req, parsePromptHints(req.prompt))).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(providerSummary(p).llm).toMatch(/unavailable/);
  });

  it("uses the mock LLM only when asked", () => {
    const p = createProviders({ env: noKeys, offline: true, llm: "mock" });
    expect(p.llm.name).toBe("mock");
    expect(p.llm.model).toBe("mock-offline");
  });

  it("selects real adapters when keys exist (constructs only, no calls)", () => {
    const e = EnvSchema.parse({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", FAL_KEY: "f", PEXELS_API_KEY: "p", ELEVENLABS_API_KEY: "e" });
    const p = createProviders({ env: e });
    expect(providerSummary(p)).toMatchObject({ llm: "anthropic:claude-opus-5-5", images: "openai:gpt-image-2", video: "fal:kling/v4/image-to-video", stock: "pexels", tts: "elevenlabs", sfx: "elevenlabs-sfx" });
    const restricted = createProviders({ env: e, allowStock: false, allowVideo: false });
    expect(restricted.stock).toBeNull();
    expect(restricted.video).toBeNull();
    const off = createProviders({ env: e, offline: true });
    expect(off.images).toBeNull();
    expect(off.tts.real).toBe(false);
    expect(off.llm.name).toBe("unavailable");
  });
});

describe("mock providers", () => {
  it("generate valid media and count calls", async () => {
    const m = createMockProviders();
    const img = await m.images.generate({ prompt: "x", width: 1080, height: 1920, quality: "low" });
    expect(img.data.subarray(1, 4).toString()).toBe("PNG");
    expect(m.images.calls).toBe(1);
    const s = await m.tts.synthesize({ text: "one two three four five" });
    expect(s.extension).toBe("wav");
    expect(s.audio!.subarray(0, 4).toString()).toBe("RIFF");
    expect(s.durationSeconds).toBeCloseTo(wavDurationSeconds(s.audio!));
    expect(s.words.at(-1)!.endMs).toBeLessThanOrEqual(s.durationSeconds * 1000 + 1);
    expect(m.tts.calls).toBe(1);
    expect(await m.stock.search("q", { kind: "video", orientation: "portrait" })).toHaveLength(1);
    expect(m.stock.searches).toBe(1);
    await m.sfx.generate("whoosh", 1);
    expect(m.sfx.calls).toBe(1);
    expect(solidPng(2, 2).length).toBeGreaterThan(40);
    expect(wavDurationSeconds(silentWav(1.5))).toBeCloseTo(1.5);
  });
});
