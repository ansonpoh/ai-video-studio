import { describe, expect, it } from "vitest";
import { alignmentEndSeconds, wordsFromTimestamps, SilentTts } from "../../src/audio/elevenlabs";

const align = (text: string, perChar = 0.05) => {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * perChar),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * perChar),
  };
};

describe("ElevenLabs alignment", () => {
  it("converts character alignment to word timings", () => {
    const words = wordsFromTimestamps({ alignment: align("Hello big world.") });
    expect(words.map((w) => w.text)).toEqual(["Hello", "big", "world."]);
    expect(words[0]).toEqual({ text: "Hello", startMs: 0, endMs: 250 });
    expect(words[1].startMs).toBe(300);
    expect(words[2].endMs).toBe(800);
  });

  it("falls back to normalized_alignment and computes end time", () => {
    const r = { alignment: null, normalized_alignment: align("one two", 0.1) };
    expect(wordsFromTimestamps(r).map((w) => w.text)).toEqual(["one", "two"]);
    expect(alignmentEndSeconds(r)).toBeCloseTo(0.7);
    expect(wordsFromTimestamps({})).toEqual([]);
  });
});

describe("SilentTts", () => {
  it("returns estimated timings, no audio, zero cost", async () => {
    const tts = new SilentTts();
    expect(tts.real).toBe(false);
    const r = await tts.synthesize({ text: "This is a silent test sentence." });
    expect(r.audio).toBeNull();
    expect(r.timing).toBe("estimated");
    expect(r.words).toHaveLength(6);
    expect(r.durationSeconds).toBeGreaterThan(1);
    expect(r.cost.estimatedUsd).toBe(0);
  });
});
