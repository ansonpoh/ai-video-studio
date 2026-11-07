import { describe, expect, it, vi } from "vitest";
import { ElevenLabsTts, OutOfCreditsError } from "../../src/audio/elevenlabs";
import { EdgeTts, escapeSsml, parseBoundaries, wordsFromBoundaries } from "../../src/audio/edge";
import { FallbackTts } from "../../src/audio/fallback";
import type { SpeechResult, TtsProvider } from "../../src/providers/types";

const said = (name: string): SpeechResult => ({ audio: Buffer.from(name), extension: "mp3", durationSeconds: 1, words: [], timing: "estimated", cost: { estimatedUsd: 0, description: name } });
const free: TtsProvider = { name: "edge", real: true, estimateUsd: () => 0, synthesize: async () => said("edge") };
const primary = (over: Partial<ConstructorParameters<typeof FallbackTts>[0]> = {}) => ({
  name: "elevenlabs",
  estimateUsd: () => 1,
  remainingCharacters: async () => 1000 as number | null,
  synthesize: vi.fn(async () => said("elevenlabs")),
  ...over,
});
const jsonFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("FallbackTts", () => {
  it("uses ElevenLabs while the script fits the balance", async () => {
    const tts = new FallbackTts(primary(), free);
    expect(await tts.prepare(1000)).toBeNull();
    expect(tts.name).toBe("elevenlabs");
    expect((await tts.synthesize({ text: "hi" })).audio?.toString()).toBe("elevenlabs");
  });

  it("switches the whole run when the script won't fit", async () => {
    const p = primary();
    const tts = new FallbackTts(p, free);
    expect(await tts.prepare(1001)).toMatch(/1000 characters left/);
    expect(tts.name).toBe("edge");
    expect(tts.estimateUsd("x")).toBe(0);
    expect((await tts.synthesize({ text: "hi" })).audio?.toString()).toBe("edge");
    expect(p.synthesize).not.toHaveBeenCalled();
  });

  it("keeps ElevenLabs when the balance can't be read", async () => {
    const tts = new FallbackTts(primary({ remainingCharacters: async () => null }), free);
    expect(await tts.prepare(999_999)).toBeNull();
    expect(tts.name).toBe("elevenlabs");
  });

  it("falls back and stays there when credits run out mid-run", async () => {
    const p = primary({ synthesize: vi.fn(async () => Promise.reject(new OutOfCreditsError("elevenlabs", "no credits", false, 401))) });
    const tts = new FallbackTts(p, free);
    expect((await tts.synthesize({ text: "a" })).audio?.toString()).toBe("edge");
    expect((await tts.synthesize({ text: "b" })).audio?.toString()).toBe("edge");
    expect(p.synthesize).toHaveBeenCalledTimes(1);
    expect(tts.name).toBe("edge");
  });

  it("doesn't hide other failures", async () => {
    const tts = new FallbackTts(primary({ synthesize: async () => Promise.reject(new Error("boom")) }), free);
    await expect(tts.synthesize({ text: "a" })).rejects.toThrow("boom");
    expect(tts.name).toBe("elevenlabs");
  });

  it("tries ElevenLabs again on the next run, after credits may have reset", async () => {
    const tts = new FallbackTts(primary({ remainingCharacters: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(5000) }), free);
    await tts.prepare(10);
    expect(tts.name).toBe("edge");
    await tts.prepare(10);
    expect(tts.name).toBe("elevenlabs");
  });
});

describe("ElevenLabs credit errors", () => {
  const tts = (fetchImpl: typeof fetch) => new ElevenLabsTts({ apiKey: "k", voiceId: "v", model: "m", fetchImpl });

  it("recognises an exhausted quota", async () => {
    const err = await tts(jsonFetch(401, { detail: { status: "quota_exceeded", message: "This request exceeds your quota" } }))
      .synthesize({ text: "hi" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OutOfCreditsError);
    expect(err.message).toMatch(/exceeds your quota/);
  });

  it("treats a bad key as a real error", async () => {
    const err = await tts(jsonFetch(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } }))
      .synthesize({ text: "hi" })
      .catch((e) => e);
    expect(err).not.toBeInstanceOf(OutOfCreditsError);
    expect(err.message).toMatch(/authentication failed/);
  });

  it("keeps a voice that needs a paid plan as a real error", async () => {
    const err = await tts(jsonFetch(402, { detail: { status: "paid_plan_required", message: "Free users cannot use library voices" } }))
      .synthesize({ text: "hi" })
      .catch((e) => e);
    expect(err).not.toBeInstanceOf(OutOfCreditsError);
    expect(err.message).toMatch(/library voices/);
  });

  it("reads the remaining characters, or null when it can't", async () => {
    expect(await tts(jsonFetch(200, { character_count: 2500, character_limit: 10000 })).remainingCharacters()).toBe(7500);
    expect(await tts(jsonFetch(401, { detail: "missing permission" })).remainingCharacters()).toBeNull();
    expect(await tts((async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch).remainingCharacters()).toBeNull();
  });
});

describe("Edge TTS timing", () => {
  const b = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

  it("parses word boundaries from metadata ticks", () => {
    const chunk = JSON.stringify({
      Metadata: [
        { Type: "WordBoundary", Data: { Offset: 1_000_000, Duration: 2_000_000, text: { Text: "Hello" } } },
        { Type: "SessionEnd", Data: {} },
      ],
    });
    expect(parseBoundaries([chunk])).toEqual([b("Hello", 100, 300)]);
  });

  it("keeps the script's punctuation on timed words", () => {
    expect(wordsFromBoundaries("Hello, world!", [b("Hello", 0, 100), b("world", 150, 300)])).toEqual([
      { text: "Hello,", startMs: 0, endMs: 100 },
      { text: "world!", startMs: 150, endMs: 300 },
    ]);
  });

  it("joins boundaries split inside one word, and marks onto the previous word", () => {
    expect(wordsFromBoundaries("well-known — fact", [b("well", 0, 50), b("known", 50, 100), b("fact", 200, 300)])).toEqual([
      { text: "well-known —", startMs: 0, endMs: 100 },
      { text: "fact", startMs: 200, endMs: 300 },
    ]);
  });

  it("gives up when the words don't line up", () => {
    expect(wordsFromBoundaries("10 cats", [b("ten", 0, 50), b("cats", 50, 100)])).toBeNull();
    expect(wordsFromBoundaries("cats", [b("cats", 0, 50), b("dogs", 50, 100)])).toBeNull();
    expect(wordsFromBoundaries("cats dogs", [b("cats", 0, 50)])).toBeNull();
  });

  it("escapes text before it reaches SSML", () => {
    expect(escapeSsml(`Q&A <b> "x" 'y'`)).toBe("Q&amp;A &lt;b&gt; &quot;x&quot; &apos;y&apos;");
  });

  it("ignores ElevenLabs voice ids but honours Edge voice names", async () => {
    const speak = vi.fn(async () => ({ audio: Buffer.from("mp3"), metadata: [] }));
    const tts = new EdgeTts({ voice: "en-US-AndrewMultilingualNeural", speak });
    await tts.synthesize({ text: "hi", voiceId: "JBFqnCBsd6RMkjVDRZzb" });
    await tts.synthesize({ text: "hi", voiceId: "en-GB-RyanNeural" });
    expect(speak.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["en-US-AndrewMultilingualNeural", "en-GB-RyanNeural"]);
  });

  it("retries a dropped connection, then reports the failure", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error("Stream closed")).mockResolvedValue({ audio: Buffer.from("mp3"), metadata: [] });
    expect((await new EdgeTts({ voice: "v", speak: flaky }).synthesize({ text: "hi" })).audio?.toString()).toBe("mp3");
    expect(flaky).toHaveBeenCalledTimes(2);
    const down = vi.fn(async () => Promise.reject(new Error("blocked")));
    await expect(new EdgeTts({ voice: "v", speak: down }).synthesize({ text: "hi" })).rejects.toThrow(/3 tries: blocked/);
  });

  it("falls back to estimated caption timing when alignment fails", async () => {
    const res = await new EdgeTts({ voice: "v", speak: async () => ({ audio: Buffer.from("mp3"), metadata: [] }) }).synthesize({ text: "two words" });
    expect(res.timing).toBe("estimated");
    expect(res.words).toHaveLength(2);
    expect(res.cost.actualUsd).toBe(0);
  });
});
