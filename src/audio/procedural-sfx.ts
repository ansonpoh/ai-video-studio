/** Locally synthesised sound effects for the offline demo (no third-party rights). */
import type { SfxKind } from "../schemas/catalog";
import { biquad, echo, fade, gain, limit, noise, render, writeAudio } from "./synth";

type Recipe = { seconds: number; voice: (t: number, rnd: () => number) => number; post: (x: Float32Array) => Float32Array };

const RECIPES: Record<SfxKind, Recipe> = {
  whoosh: { seconds: 0.7, voice: (t, r) => r() * Math.sin((Math.PI * t) / 0.7), post: (x) => gain(biquad(x, "bandpass", 1800, 1.2), 1.6) },
  impact: {
    seconds: 0.9,
    voice: (t, r) => Math.sin(2 * Math.PI * (40 + 120 * Math.exp(-20 * t)) * t) * Math.exp(-6 * t) + 0.3 * r() * Math.exp(-30 * t),
    post: (x) => gain(biquad(x, "lowpass", 2500), 1.4),
  },
  pop: { seconds: 0.25, voice: (t) => Math.sin(2 * Math.PI * (600 + 900 * Math.exp(-30 * t)) * t) * Math.exp(-25 * t), post: (x) => gain(x, 0.9) },
  riser: {
    seconds: 1.5,
    voice: (t, r) => r() * (t / 1.5) * 0.6 + 0.3 * Math.sin(2 * Math.PI * (200 + 600 * t) * t) * (t / 1.5),
    post: (x) => gain(biquad(x, "highpass", 300), 1.1),
  },
  thunder: {
    seconds: 3,
    voice: (t, r) => r() * (Math.exp(-1.2 * t) + 0.5 * Math.exp(-3 * (t - 0.4) * (t - 0.4))),
    post: (x) => echo(gain(biquad(biquad(x, "lowpass", 320), "lowpass", 320), 3.2), 0.8, 0.6, [{ ms: 180, decay: 0.4 }, { ms: 420, decay: 0.25 }]),
  },
  chime: { seconds: 1.2, voice: (t) => ((Math.sin(2 * Math.PI * 880 * t) + 0.6 * Math.sin(2 * Math.PI * 1320 * t) + 0.3 * Math.sin(2 * Math.PI * 1760 * t)) * Math.exp(-4 * t)) / 2, post: (x) => gain(x, 0.8) },
  tick: { seconds: 0.12, voice: (t) => Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-80 * t), post: (x) => gain(x, 0.7) },
};

export const synthesizeSfx = (kind: SfxKind) => {
  const r = RECIPES[kind];
  const rnd = noise(kind.length * 977);
  return fade(limit(r.post(render(r.seconds, (t) => r.voice(t, rnd))), 0.95), 0, 0.08);
};

export const generateProceduralSfx = async (kind: SfxKind, outFile: string) => writeAudio(synthesizeSfx(kind), outFile);
