/**
 * Narration: one TTS request per scene (with neighbouring text passed as
 * context for continuity), cached by text+voice+model, versioned per scene,
 * plus a continuous narration track assembled for export.
 */
import fs from "node:fs";
import path from "node:path";
import type { Scene } from "../schemas/storyboard";
import type { AssetManifest, NarrationSegment } from "../schemas/project";
import type { TtsProvider } from "../providers/types";
import { cacheDir, P, sha256 } from "./store";
import { ffmpeg } from "../media/ffmpeg";
import type { Timeline } from "../rendering/timeline";

const narrationCache = () => path.join(cacheDir(), "tts");

export const narrationKey = (tts: TtsProvider, voiceId: string | undefined, text: string) => sha256(`${tts.name}|${voiceId ?? "default"}|${text}`);

const nextNarrationFile = (projectId: string, sceneId: string, ext: string) => {
  for (let v = 1; v < 1000; v++) {
    const rel = `audio/narration/${sceneId}-v${v}.${ext}`;
    if (!fs.existsSync(path.join(P(projectId).dir, rel))) return { rel, version: v };
  }
  throw new Error("too many narration versions");
};

export const synthesizeScene = async (opts: {
  projectId: string;
  tts: TtsProvider;
  scene: Scene;
  prev?: Scene;
  next?: Scene;
  voiceId?: string;
  language?: string;
  style?: string;
  onCost: (usd: number, cached: boolean, description: string) => void;
}): Promise<NarrationSegment> => {
  const { tts, scene, projectId } = opts;
  const text = scene.narration.trim();
  const key = narrationKey(tts, opts.voiceId, text);
  const cacheMeta = path.join(narrationCache(), `${key}.json`);
  if (tts.real && fs.existsSync(cacheMeta)) {
    const meta = JSON.parse(fs.readFileSync(cacheMeta, "utf8")) as { ext: string; durationSeconds: number; words: NarrationSegment["words"]; voiceId?: string };
    const audio = path.join(narrationCache(), `${key}.${meta.ext}`);
    if (fs.existsSync(audio)) {
      const { rel, version } = nextNarrationFile(projectId, scene.id, meta.ext);
      fs.mkdirSync(path.dirname(path.join(P(projectId).dir, rel)), { recursive: true });
      fs.copyFileSync(audio, path.join(P(projectId).dir, rel));
      opts.onCost(0, true, `${scene.id} narration (cache hit)`);
      return { sceneId: scene.id, file: rel, text, durationSeconds: meta.durationSeconds, timing: "tts-alignment", provider: tts.name, voiceId: meta.voiceId, version, costUsd: 0, cacheKey: key, words: meta.words };
    }
  }
  const res = await tts.synthesize({ text, voiceId: opts.voiceId, previousText: opts.prev?.narration, nextText: opts.next?.narration, language: opts.language, style: opts.style });
  const usd = res.cost.actualUsd ?? res.cost.estimatedUsd;
  opts.onCost(usd, false, `${scene.id} narration (${text.length} chars)`);
  if (!res.audio) {
    return { sceneId: scene.id, file: null, text, durationSeconds: res.durationSeconds, timing: res.timing, provider: tts.name, version: 1, costUsd: 0, words: res.words };
  }
  const { rel, version } = nextNarrationFile(projectId, scene.id, res.extension);
  fs.mkdirSync(path.dirname(path.join(P(projectId).dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(P(projectId).dir, rel), res.audio);
  fs.mkdirSync(narrationCache(), { recursive: true });
  fs.writeFileSync(path.join(narrationCache(), `${key}.${res.extension}`), res.audio);
  fs.writeFileSync(cacheMeta, JSON.stringify({ ext: res.extension, durationSeconds: res.durationSeconds, words: res.words, voiceId: res.voiceId }));
  return { sceneId: scene.id, file: rel, text, durationSeconds: res.durationSeconds, timing: res.timing, provider: tts.name, voiceId: res.voiceId, version, costUsd: usd, cacheKey: key, words: res.words };
};

export const upsertNarration = (m: AssetManifest, seg: NarrationSegment) => {
  m.narration = [...m.narration.filter((n) => n.sceneId !== seg.sceneId), seg];
};

/** Builds audio/narration.mp3: every scene's narration placed at its timeline position. */
export const buildContinuousNarration = async (projectId: string, manifest: AssetManifest, timeline: Timeline, fps: number) => {
  const placed = timeline.scenes
    .map((t) => ({ t, seg: manifest.narration.find((n) => n.sceneId === t.id) }))
    .filter((x) => x.seg?.file);
  if (!placed.length) return null;
  const out = path.join(P(projectId).audioDir, "narration.mp3");
  const inputs = placed.flatMap((x) => ["-i", path.join(P(projectId).dir, x.seg!.file!)]);
  const delays = placed.map((x, i) => `[${i}:a]adelay=${Math.round(((x.t.startFrame + x.t.narrationOffsetFrames) / fps) * 1000)}:all=1[a${i}]`);
  const mix = `${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0[out]`;
  await ffmpeg([...inputs, "-filter_complex", [...delays, mix].join(";"), "-map", "[out]", "-ac", "2", "-b:a", "192k", out]);
  return out;
};
