/**
 * Offline demo music: synthesised locally with ffmpeg from sine waves, so it
 * carries no third-party rights. Synthesised in JS (see synth.ts) so it works
 * with the minimal ffmpeg bundled with Remotion. Real projects should use files from the
 * user's own licensed library in music/ (see audio/music-library.ts).
 */
import { biquad, echo, fade, gain, limit, noise, render, writeAudio } from "./synth";
import type { MusicMood } from "../schemas/catalog";

const NOTE: Record<string, number> = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, E5: 659.25 };

type Spec = { bpm: number; chords: string[][]; pad: number; pulse: number; kick: number; hat: number; brightness: number };

const SPECS: Record<Exclude<MusicMood, "none">, Spec> = {
  cinematic: { bpm: 60, chords: [["A2", "E3", "A3", "C4"], ["F3", "C4", "F4", "A4"], ["C3", "G3", "C4", "E4"], ["G3", "D4", "G4", "B4"]], pad: 0.22, pulse: 0, kick: 0.25, hat: 0, brightness: 0.4 },
  suspenseful: { bpm: 70, chords: [["A2", "E3", "A3", "C4"], ["A2", "F3", "A3", "C4"]], pad: 0.2, pulse: 0.05, kick: 0.3, hat: 0, brightness: 0.3 },
  uplifting: { bpm: 100, chords: [["C3", "G3", "C4", "E4"], ["G3", "D4", "G4", "B4"], ["A2", "E3", "A3", "C4"], ["F3", "C4", "F4", "A4"]], pad: 0.16, pulse: 0.07, kick: 0.35, hat: 0.04, brightness: 0.7 },
  playful: { bpm: 112, chords: [["C4", "E4", "G4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"], ["C4", "E4", "G4"]], pad: 0.1, pulse: 0.12, kick: 0.3, hat: 0.05, brightness: 0.9 },
  relaxed: { bpm: 72, chords: [["F3", "A3", "C4", "E4"], ["E3", "G3", "B3", "D4"], ["D3", "F3", "A3", "C4"], ["C3", "E3", "G3", "B3"]], pad: 0.18, pulse: 0.03, kick: 0, hat: 0, brightness: 0.5 },
  energetic: { bpm: 124, chords: [["A2", "E3", "A3", "C4"], ["F3", "C4", "F4", "A4"], ["C3", "G3", "C4", "E4"], ["G3", "D4", "G4", "B4"]], pad: 0.12, pulse: 0.1, kick: 0.55, hat: 0.07, brightness: 0.9 },
};

/** Per-sample generator for the mood (pad + pulse + kick + hat). Exported for tests. */
export const musicVoice = (mood: Exclude<MusicMood, "none">) => {
  const s = SPECS[mood];
  const beat = 60 / s.bpm;
  const bar = beat * 4;
  const loop = bar * s.chords.length;
  const freqs = s.chords.map((c) => c.map((n) => NOTE[n]));
  const voices = s.chords[0].length;
  const harm = s.brightness * 0.3;
  const rnd = noise(7);
  const chordAt = (t: number) => {
    const f = freqs[Math.min(freqs.length - 1, Math.floor((t % loop) / bar))];
    let v = 0;
    for (let i = 0; i < f.length; i++) v += Math.sin(2 * Math.PI * f[i] * t + i) + harm * Math.sin(4 * Math.PI * f[i] * t);
    return v / voices;
  };
  const sample = (t: number) => {
    const chord = chordAt(t);
    const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / (bar * 2));
    let v = s.pad * swell * chord;
    if (s.pulse) v += s.pulse * Math.exp(-6 * (t % (beat / 2))) * chord;
    if (s.kick) {
      const k = t % beat;
      v += s.kick * Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-25 * k)) * k) * Math.exp(-9 * k);
    }
    if (s.hat) v += s.hat * rnd() * Math.exp(-60 * ((t + beat / 2) % beat));
    return v;
  };
  return { sample, loopSeconds: loop };
};

export const synthesizeMusic = (mood: Exclude<MusicMood, "none">, seconds = 64) => {
  const { sample } = musicVoice(mood);
  let x = render(seconds, sample);
  x = biquad(x, "lowpass", mood === "energetic" || mood === "playful" ? 9000 : 5000);
  x = echo(x, 0.8, 0.7, [{ ms: 120, decay: 0.25 }, { ms: 240, decay: 0.15 }]);
  x = limit(gain(x, 2.2), 0.9);
  return fade(x, 1, 2);
};

export const generateProceduralMusic = async (mood: Exclude<MusicMood, "none">, outFile: string, seconds = 64) =>
  writeAudio(synthesizeMusic(mood, seconds), outFile);
