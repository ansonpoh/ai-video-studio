/**
 * Offline demo music: synthesised locally with ffmpeg from sine waves, so it
 * carries no third-party rights. Real projects should use files from the
 * user's own licensed library in music/ (see audio/music-library.ts).
 */
import { ffmpeg } from "../media/ffmpeg";
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

/** Builds an ffmpeg aevalsrc expression for the mood. Exported for tests. */
export const musicExpression = (mood: Exclude<MusicMood, "none">) => {
  const s = SPECS[mood];
  const beat = 60 / s.bpm;
  const bar = beat * 4;
  const loop = bar * s.chords.length;
  const chordTerm = (notes: string[]) => notes.map((n, i) => `sin(2*PI*${NOTE[n]}*t+${i})+${s.brightness * 0.3}*sin(4*PI*${NOTE[n]}*t)`).join("+");
  const sel = s.chords
    .map((c, i) => `between(mod(t,${loop.toFixed(3)}),${(i * bar).toFixed(3)},${((i + 1) * bar - 0.001).toFixed(3)})*(${chordTerm(c)})`)
    .join("+");
  const swell = `(0.75+0.25*sin(2*PI*t/${(bar * 2).toFixed(3)}))`;
  const pad = `${s.pad}*${swell}*(${sel})/${s.chords[0].length}`;
  const pulse = s.pulse ? `+${s.pulse}*exp(-6*mod(t,${(beat / 2).toFixed(3)}))*(${sel})/${s.chords[0].length}` : "";
  const kick = s.kick ? `+${s.kick}*sin(2*PI*(45+90*exp(-25*mod(t,${beat.toFixed(3)})))*mod(t,${beat.toFixed(3)}))*exp(-9*mod(t,${beat.toFixed(3)}))` : "";
  const hat = s.hat ? `+${s.hat}*(random(0)*2-1)*exp(-60*mod(t+${(beat / 2).toFixed(3)},${beat.toFixed(3)}))` : "";
  return { expr: `${pad}${pulse}${kick}${hat}`, loopSeconds: loop };
};

export const generateProceduralMusic = async (mood: Exclude<MusicMood, "none">, outFile: string, seconds = 64) => {
  const { expr } = musicExpression(mood);
  await ffmpeg([
    "-f", "lavfi",
    "-i", `aevalsrc='${expr}':s=44100:d=${seconds}`,
    "-af", `lowpass=f=${mood === "energetic" || mood === "playful" ? 9000 : 5000},aecho=0.8:0.7:120|240:0.25|0.15,volume=2.2,alimiter=limit=0.9,afade=t=in:d=1,afade=t=out:st=${seconds - 2}:d=2`,
    "-ac", "2",
    "-b:a", "160k",
    outFile,
  ]);
  return outFile;
};
