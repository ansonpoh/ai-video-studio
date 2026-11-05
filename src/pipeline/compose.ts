/**
 * Assembly: storyboard + user edits + assets + narration -> timeline ->
 * editable composition. Also exports captions (SRT + timings.json) from the
 * editable source, so caption edits made in Studio are what gets exported.
 */
import fs from "node:fs";
import path from "node:path";
import type { Scene, Storyboard } from "../schemas/storyboard";
import type { ProjectEdits, ProjectMetadata } from "../schemas/project";
import { buildTimeline, type Timeline } from "../rendering/timeline";
import { componentNameFor, generateEditableComposition } from "../editable/codegen";
import { readCaptions, readSceneSpans, syntaxErrors } from "../editable/ast";
import { syncStudioRegistry } from "../editable/registry";
import { buildCues, toSrt, type Word } from "../captions";
import { CaptionStyleName } from "../schemas/options";
import { P, sha256, store, writeJsonAtomic } from "./store";

/** Storyboard with user edits applied. AI output is never mutated. */
export const effectiveScenes = (sb: Storyboard, edits: ProjectEdits): Scene[] =>
  sb.scenes.map((s) => {
    const e = edits.scenes[s.id];
    if (!e) return s;
    const merged = {
      ...s,
      ...(e.layoutFields ?? {}),
      narration: e.narration ?? s.narration,
      title: e.title ?? s.title,
      onScreenText: e.onScreenText ?? s.onScreenText,
      visual: { ...s.visual, prompt: e.visualPrompt ?? s.visual.prompt },
    };
    return merged as Scene;
  });

export const timelineFor = (meta: ProjectMetadata, scenes: Scene[]): Timeline => {
  const manifest = store.assets(meta.id);
  return buildTimeline({
    fps: meta.fps,
    targetSeconds: meta.request.durationSeconds,
    pacing: meta.direction?.pacing ?? "measured",
    scenes: scenes.map((s) => ({
      id: s.id,
      narrationSeconds: manifest.narration.find((n) => n.sceneId === s.id)?.durationSeconds ?? s.estimatedDurationSeconds,
      transitionIn: s.transitionIn,
      minSeconds: s.layout === "listicle" || s.layout === "outro" ? 2 : 1.6,
    })),
  });
};

export const resolvedCaptionStyle = (meta: ProjectMetadata, edits: ProjectEdits) => {
  if (edits.captionStyle) return edits.captionStyle;
  if (meta.request.captionStyle !== "auto") return meta.request.captionStyle;
  return CaptionStyleName.parse(meta.direction?.captionStyle ?? "bold");
};

export type ComposeResult = { written: boolean; reason: string; timeline: Timeline; file: string };

/**
 * Writes editable/Video.tsx. If the file exists and has been edited since the
 * generator last wrote it, it is left alone unless `force` is set (and even
 * then the previous version is backed up).
 */
export const composeEditable = (id: string, opts: { force?: boolean } = {}): ComposeResult => {
  const meta = store.metadata(id);
  if (!meta.direction) throw new Error("Project has no creative direction yet");
  const sb = store.storyboard(id);
  const edits = store.edits(id);
  const scenes = effectiveScenes(sb, edits);
  const timeline = timelineFor(meta, scenes);
  const p = P(id);
  const manifest = store.manifest(id);
  const exists = fs.existsSync(p.editable);
  if (exists) {
    const current = fs.readFileSync(p.editable, "utf8");
    const userEdited = manifest.editableHash && sha256(current) !== manifest.editableHash;
    if (!opts.force) return { written: false, reason: userEdited ? "editable composition has user edits; kept as is" : "editable composition already exists", timeline, file: p.editable };
    const backup = path.join(p.editableDir, `Video.backup-${Date.now()}.tsx.txt`);
    fs.copyFileSync(p.editable, backup);
  }
  const code = generateEditableComposition({
    projectId: id,
    componentName: componentNameFor(id),
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    direction: meta.direction,
    scenes,
    manifest: store.assets(id),
    timeline,
    captionStyle: resolvedCaptionStyle(meta, edits),
    captionsEnabled: meta.request.captions,
    musicVolume: meta.request.musicVolume,
    speculativeLabel: meta.direction.contentKind === "speculative" ? "Speculative scenario" : meta.direction.contentKind === "fiction" ? "Fiction" : undefined,
  });
  const errors = syntaxErrors(code);
  if (errors.length) throw new Error(`Generated composition has syntax errors: ${errors.join("; ")}`);
  fs.mkdirSync(p.editableDir, { recursive: true });
  fs.writeFileSync(p.editable, code);
  manifest.editableHash = sha256(code);
  store.saveManifest(id, manifest);
  syncStudioRegistry();
  return { written: true, reason: exists ? "regenerated (backup kept)" : "created", timeline, file: p.editable };
};

/** Records the current file as the generator baseline after a deliberate programmatic patch. */
export const markEditablePatched = (id: string, code: string, previous: string) => {
  const m = store.manifest(id);
  // Only move the baseline if the file was untouched by the user before the patch.
  if (m.editableHash === sha256(previous)) m.editableHash = sha256(code);
  store.saveManifest(id, m);
};

export const editableIsUserModified = (id: string) => {
  const p = P(id);
  if (!fs.existsSync(p.editable)) return false;
  const m = store.manifest(id);
  return Boolean(m.editableHash && sha256(fs.readFileSync(p.editable, "utf8")) !== m.editableHash);
};

/** Global word timings as they currently stand in the editable composition. */
export const currentGlobalWords = (id: string): Word[] => {
  const meta = store.metadata(id);
  const src = fs.readFileSync(P(id).editable, "utf8");
  const { spans } = readSceneSpans(src, meta.fps);
  const caps = readCaptions(src);
  const words: Word[] = [];
  for (const span of spans) {
    const c = caps.get(span.sceneId);
    if (!c) continue;
    const base = (span.startFrame / meta.fps) * 1000;
    const sceneEnd = base + (span.durationInFrames / meta.fps) * 1000;
    for (const w of c.captions) {
      const startMs = Math.round(base + w.startMs);
      if (startMs > sceneEnd) continue; // trimmed away in Studio
      words.push({ text: w.text.trim(), startMs, endMs: Math.round(base + w.endMs) });
    }
  }
  return words.filter((w) => w.text);
};

export const exportCaptions = (id: string) => {
  const p = P(id);
  const words = currentGlobalWords(id);
  const cues = buildCues(words);
  fs.mkdirSync(p.captionsDir, { recursive: true });
  const srtFile = path.join(p.captionsDir, "captions.srt");
  fs.writeFileSync(srtFile, toSrt(cues));
  const timingsFile = path.join(p.captionsDir, "timings.json");
  const meta = store.metadata(id);
  const { spans } = readSceneSpans(fs.readFileSync(p.editable, "utf8"), meta.fps);
  writeJsonAtomic(timingsFile, { fps: meta.fps, words, cues, scenes: spans });
  return { srtFile, timingsFile, cues: cues.length, words: words.length };
};
