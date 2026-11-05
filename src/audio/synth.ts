/**
 * Tiny offline DSP toolkit for the procedural music and sound effects.
 * Everything is synthesised in JS and only *encoded* by ffmpeg, because the
 * ffmpeg bundled with Remotion (the fallback when no system ffmpeg is
 * installed) ships without aevalsrc, lowpass, aecho, afade and friends.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg } from "../media/ffmpeg";

export const SAMPLE_RATE = 44100;

/** Deterministic uniform noise in [-1, 1] (mulberry32). */
export const noise = (seed = 1) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
};

/** Renders `fn(t)` into a mono buffer of `seconds` length. */
export const render = (seconds: number, fn: (t: number) => number) => {
  const n = Math.max(1, Math.round(seconds * SAMPLE_RATE));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SAMPLE_RATE);
  return out;
};

type BiquadKind = "lowpass" | "highpass" | "bandpass";

/** RBJ biquad, matching ffmpeg's lowpass/highpass (Q 0.707) and bandpass (constant skirt gain) defaults. */
export const biquad = (x: Float32Array, kind: BiquadKind, freq: number, q = 0.707) => {
  const w0 = (2 * Math.PI * Math.min(freq, SAMPLE_RATE / 2 - 1)) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (kind === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (kind === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [q * alpha, 0, -q * alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
};

/** Same model as ffmpeg aecho: (in*inGain + sum(delayed in * decay)) * outGain. */
export const echo = (x: Float32Array, inGain: number, outGain: number, taps: { ms: number; decay: number }[]) => {
  const out = new Float32Array(x.length);
  const d = taps.map((t) => ({ n: Math.round((t.ms / 1000) * SAMPLE_RATE), decay: t.decay }));
  for (let i = 0; i < x.length; i++) {
    let s = x[i] * inGain;
    for (const t of d) if (i >= t.n) s += x[i - t.n] * t.decay;
    out[i] = s * outGain;
  }
  return out;
};

export const gain = (x: Float32Array, g: number) => x.map((v) => v * g);

/** Peak limiter: instant attack, ~50 ms release, so peaks never exceed `limit`. */
export const limit = (x: Float32Array, limitLevel = 0.9) => {
  const release = Math.exp(-1 / (0.05 * SAMPLE_RATE));
  let env = 0;
  return x.map((v) => {
    const a = Math.abs(v);
    env = a > env ? a : env * release + a * (1 - release);
    return env > limitLevel ? (v * limitLevel) / env : v;
  });
};

/** Linear fade in over the first `inS` seconds and out over the last `outS` seconds. */
export const fade = (x: Float32Array, inS: number, outS: number) => {
  const nIn = Math.round(inS * SAMPLE_RATE);
  const nOut = Math.round(outS * SAMPLE_RATE);
  return x.map((v, i) => {
    let g = 1;
    if (nIn && i < nIn) g *= i / nIn;
    const fromEnd = x.length - 1 - i;
    if (nOut && fromEnd < nOut) g *= fromEnd / nOut;
    return v * g;
  });
};

/** 16-bit PCM WAV, mono duplicated to stereo. */
export const wav = (x: Float32Array) => {
  const channels = 2;
  const data = Buffer.alloc(x.length * channels * 2);
  for (let i = 0; i < x.length; i++) {
    const s = Math.round(Math.max(-1, Math.min(1, x[i])) * 32767);
    data.writeInt16LE(s, i * 4);
    data.writeInt16LE(s, i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};

/** Writes the buffer to `outFile`: directly for .wav, otherwise via an ffmpeg encode (no filters needed). */
export const writeAudio = async (x: Float32Array, outFile: string, bitrate = "160k") => {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (path.extname(outFile).toLowerCase() === ".wav") {
    fs.writeFileSync(outFile, wav(x));
    return outFile;
  }
  const tmp = path.join(os.tmpdir(), `studio-synth-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  fs.writeFileSync(tmp, wav(x));
  try {
    await ffmpeg(["-i", tmp, "-ac", "2", "-b:a", bitrate, outFile]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return outFile;
};
