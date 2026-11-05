/** Locally synthesised sound effects for the offline demo (no third-party rights). */
import { ffmpeg } from "../media/ffmpeg";
import type { SfxKind } from "../schemas/catalog";

const RECIPES: Record<SfxKind, { expr: string; seconds: number; filter: string }> = {
  whoosh: { expr: "(random(0)*2-1)*sin(PI*t/0.7)", seconds: 0.7, filter: "bandpass=f=1800:w=1.2,volume=1.6" },
  impact: { expr: "sin(2*PI*(40+120*exp(-20*t))*t)*exp(-6*t)+0.3*(random(0)*2-1)*exp(-30*t)", seconds: 0.9, filter: "lowpass=f=2500,volume=1.4" },
  pop: { expr: "sin(2*PI*(600+900*exp(-30*t))*t)*exp(-25*t)", seconds: 0.25, filter: "volume=0.9" },
  riser: { expr: "(random(0)*2-1)*(t/1.5)*0.6+0.3*sin(2*PI*(200+600*t)*t)*(t/1.5)", seconds: 1.5, filter: "highpass=f=300,volume=1.1" },
  thunder: { expr: "(random(0)*2-1)*(exp(-1.2*t)+0.5*exp(-3*(t-0.4)*(t-0.4)))", seconds: 3, filter: "lowpass=f=320,lowpass=f=320,volume=3.2,aecho=0.8:0.6:180|420:0.4|0.25" },
  chime: { expr: "(sin(2*PI*880*t)+0.6*sin(2*PI*1320*t)+0.3*sin(2*PI*1760*t))*exp(-4*t)/2", seconds: 1.2, filter: "volume=0.8" },
  tick: { expr: "sin(2*PI*2500*t)*exp(-80*t)", seconds: 0.12, filter: "volume=0.7" },
};

export const generateProceduralSfx = async (kind: SfxKind, outFile: string) => {
  const r = RECIPES[kind];
  await ffmpeg(["-f", "lavfi", "-i", `aevalsrc='${r.expr}':s=44100:d=${r.seconds}`, "-af", `${r.filter},afade=t=out:st=${Math.max(0, r.seconds - 0.08)}:d=0.08`, "-ac", "2", "-b:a", "160k", outFile]);
  return outFile;
};
