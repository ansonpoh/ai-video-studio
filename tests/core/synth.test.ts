import { describe, expect, it } from "vitest";
import { synthesizeMusic } from "../../src/audio/procedural-music";
import { synthesizeSfx } from "../../src/audio/procedural-sfx";
import { SAMPLE_RATE, wav } from "../../src/audio/synth";

const peak = (x: Float32Array) => x.reduce((p, v) => Math.max(p, Math.abs(v)), 0);

describe("procedural audio (pure JS, no ffmpeg filters)", () => {
  it("synthesises every music mood without clipping", () => {
    for (const mood of ["cinematic", "suspenseful", "uplifting", "playful", "relaxed", "energetic"] as const) {
      const x = synthesizeMusic(mood, 4);
      expect(x.length).toBe(4 * SAMPLE_RATE);
      expect(x.some(Number.isNaN)).toBe(false);
      expect(peak(x)).toBeGreaterThan(0.05);
      expect(peak(x)).toBeLessThanOrEqual(0.9001);
    }
  });

  it("synthesises every sound effect within range", () => {
    for (const kind of ["whoosh", "impact", "pop", "riser", "thunder", "chime", "tick"] as const) {
      const x = synthesizeSfx(kind);
      expect(peak(x)).toBeGreaterThan(0.05);
      expect(peak(x)).toBeLessThanOrEqual(0.9501);
    }
  });

  it("writes a valid stereo 16-bit WAV header", () => {
    const b = wav(new Float32Array(100));
    expect(b.toString("ascii", 0, 4)).toBe("RIFF");
    expect(b.readUInt16LE(22)).toBe(2);
    expect(b.length).toBe(44 + 100 * 4);
  });
});
