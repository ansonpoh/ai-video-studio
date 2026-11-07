/**
 * High-level operations shared by the CLI and the web UI: make, resume,
 * render/export, partial regeneration, media replacement and reverts.
 *
 * Partial regeneration never rewrites the whole editable composition. It
 * patches only the named elements of the scene concerned (via the TypeScript
 * AST), so edits made in Remotion Studio to other scenes, and to untouched
 * properties of the same scene, survive.
 */
import fs from "node:fs";
import path from "node:path";
import { RESOLUTIONS, CaptionStyleName, type VideoRequestInput } from "../schemas/options";
import type { Scene } from "../schemas/storyboard";
import type { Asset, ProjectEdits } from "../schemas/project";
import type { Providers } from "../providers/types";
import { MissingCredentialsError } from "../providers/types";
import { createProviders, providerSummary } from "../providers/index";
import { createProject, runPipeline, defaultRenderer, type PipelineEvent, type Renderer } from "./pipeline";
import { P, store } from "./store";
import { enforceBudget, recordCost, type PlannedCost } from "./budget";
import { planAssets, plannedCosts, resolveSceneAsset, sceneEntry, nextVersionFile, type AssetPlan } from "./assets";
import { synthesizeScene, upsertNarration } from "./narration";
import { composeEditable, editableIsUserModified, effectiveScenes, exportCaptions, markEditablePatched, resolvedCaptionStyle, timelineFor } from "./compose";
import { componentNameFor, sceneAudioCaptionCode, sceneLayoutCode, sceneSequenceCode, sceneVisualCode, type SceneCodeInput } from "../editable/codegen";
import { appendChild, findByName, findSceneSequence, listElements, readSceneSpans, removeElement, setAttr, syntaxErrors, type JsxEl } from "../editable/ast";
import { mediaDurationSeconds } from "../media/ffmpeg";

export type OpResult = { ok: boolean; message: string; patched?: string[] };

/* ------------------------------------------------------------ make/resume */

export type MakeOptions = { id?: string; llm?: "anthropic" | "mock"; skipExport?: boolean; outputDir?: string; onEvent?: (e: PipelineEvent) => void; providers?: Providers };

export const makeVideo = async (input: VideoRequestInput, opts: MakeOptions = {}) => {
  const providers = opts.providers ?? createProviders({ offline: Boolean(input.offline), llm: opts.llm });
  const id = createProject(input, { id: opts.id, mode: input.offline ? "mixed" : "live", providers: providerSummary(providers) });
  const meta = await runPipeline(id, { providers, onEvent: opts.onEvent, skipExport: opts.skipExport });
  if (opts.outputDir) copyOutputs(id, opts.outputDir);
  return { id, status: meta.status, dir: P(id).dir };
};

export const resumeProject = async (id: string, opts: { approveSpendUsd?: number; clips?: "approve" | "skip"; llm?: "anthropic" | "mock"; onEvent?: (e: PipelineEvent) => void; providers?: Providers; skipExport?: boolean; renderer?: Renderer } = {}) => {
  const meta = store.metadata(id);
  if (opts.approveSpendUsd !== undefined) {
    meta.request.approveSpendUsd = opts.approveSpendUsd;
    store.saveMetadata(meta);
  }
  if (opts.clips) {
    meta.request.clipApproval = opts.clips === "approve" ? "approved" : "skipped";
    store.saveMetadata(meta);
  }
  if (meta.mode === "offline-demo") {
    const { runDemos } = await import("./demo");
    const [r] = await runDemos({ only: [id], onEvent: opts.onEvent, skipExport: opts.skipExport });
    return { id, status: r?.status ?? store.metadata(id).status };
  }
  const providers = opts.providers ?? createProviders({ offline: meta.request.offline, llm: opts.llm });
  const m = await runPipeline(id, { providers, onEvent: opts.onEvent, skipExport: opts.skipExport, renderer: opts.renderer });
  return { id, status: m.status };
};

/* ------------------------------------------------------------------ render */

export type OutputKind = "draft" | "final" | "clean" | "audio" | "thumbnail" | "captions";

export const renderOutputs = async (id: string, kinds: OutputKind[], onProgress?: (p: { stage: string; progress: number }) => void) => {
  const p = P(id);
  if (!fs.existsSync(p.editable)) composeEditable(id);
  const errors = syntaxErrors(fs.readFileSync(p.editable, "utf8"));
  if (errors.length) throw new Error(`editable/Video.tsx has syntax errors, fix them in your editor first: ${errors.join("; ")}`);
  const r = await import("../rendering/render");
  const files: string[] = [];
  const meta = store.metadata(id);
  for (const k of kinds) {
    if (k === "captions") {
      const c = exportCaptions(id);
      files.push(c.srtFile, c.timingsFile);
    } else if (k === "audio") {
      files.push(await r.renderAudioMix(id, onProgress));
    } else if (k === "thumbnail") {
      files.push(await r.renderThumbnail(id));
    } else {
      if (k === "clean" && !meta.request.captions) continue;
      files.push((await r.renderVideo(id, k, { onProgress })).file);
    }
  }
  const after = store.metadata(id);
  if (kinds.includes("final") && after.status !== "needs-review") {
    after.status = "rendered";
    store.saveMetadata(after);
  }
  return files;
};

export const copyOutputs = (id: string, dir: string) => {
  const p = P(id);
  const dest = path.resolve(dir, id);
  fs.mkdirSync(dest, { recursive: true });
  const copied: string[] = [];
  const from = [
    ...["final.mp4", "clean.mp4", "audio-mix.mp3", "thumbnail.png"].map((f) => path.join(p.outputDir, f)),
    ...["captions.srt", "timings.json"].map((f) => path.join(p.captionsDir, f)),
    path.join(p.audioDir, "narration.mp3"),
    path.join(p.dir, "credits.txt"),
  ];
  for (const f of from) {
    if (!fs.existsSync(f)) continue;
    const to = path.join(dest, path.basename(f));
    fs.copyFileSync(f, to);
    copied.push(to);
  }
  return copied;
};

/* ------------------------------------------------------- editable patching */

const sceneInputs = (id: string) => {
  const meta = store.metadata(id);
  if (!meta.direction) throw new Error("Project has no creative direction yet");
  const edits = store.edits(id);
  const scenes = effectiveScenes(store.storyboard(id), edits);
  const timeline = timelineFor(meta, scenes);
  const manifest = store.assets(id);
  const base = {
    projectId: id,
    componentName: componentNameFor(id),
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    direction: meta.direction,
    manifest,
    captionStyle: resolvedCaptionStyle(meta, edits),
    captionsEnabled: meta.request.captions,
    musicVolume: meta.request.musicVolume,
  };
  const forScene = (sceneId: string): SceneCodeInput => {
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new Error(`Scene ${sceneId} not found`);
    return { ...base, scene: scenes[index], index, timing: timeline.scenes[index], isLast: index === scenes.length - 1 };
  };
  return { meta, scenes, timeline, manifest, forScene };
};

type PatchPart = "visual" | "layout" | "audio" | "duration" | "sequence";

const lineFor = (lines: string[], name: string) => lines.find((l) => l.includes(`name=${JSON.stringify(name)}`));
const replaceEl = (src: string, el: JsxEl, code: string) => src.slice(0, el.start) + code.trim() + src.slice(el.end);

/** Re-reads the element after each edit since positions move. */
const patchVisual = (src: string, x: SceneCodeInput): string => {
  const id = x.scene.id;
  const lines = sceneVisualCode(x, "          ");
  const newVisual = lineFor(lines, `${id} visual`)!;
  const old = findByName(src, `${id} visual`);
  if (old && old.tag === "MediaLayer" && newVisual.trim().startsWith("<MediaLayer")) {
    // same component: only swap the media, keep the user's motion/position/darken edits
    const srcCode = /src=(\{staticFile\([^)]*\)\})/.exec(newVisual)![1];
    const typeCode = /mediaType=("[a-z]+")/.exec(newVisual)![1];
    src = setAttr(src, `${id} visual`, "src", srcCode);
    return setAttr(src, `${id} visual`, "mediaType", typeCode);
  }
  for (const extra of [`${id} backdrop`, `${id} overlay`]) src = removeElement(src, extra);
  const target = findByName(src, `${id} visual`);
  if (target) return replaceEl(src, target, lines.join("\n"));
  const seq = findSceneSequence(src, id);
  if (!seq) throw new Error(`Scene ${id} not found in editable composition`);
  // no visual element (user deleted it): insert as the first child
  const openEnd = src.indexOf(">", seq.openingEnd) + 1;
  return src.slice(0, openEnd) + "\n" + lines.join("\n") + src.slice(openEnd);
};

const patchAudio = (src: string, x: SceneCodeInput): string => {
  const id = x.scene.id;
  const lines = sceneAudioCaptionCode(x, "          ");
  const newNarr = lineFor(lines, `${id} narration`);
  const newCaps = lineFor(lines, `${id} captions`);
  const oldNarr = findByName(src, `${id} narration`);
  if (newNarr && oldNarr) {
    src = setAttr(src, `${id} narration`, "src", /src=(\{staticFile\([^)]*\)\})/.exec(newNarr)![1]);
    src = setAttr(src, `${id} narration`, "from", `{${x.timing.narrationOffsetFrames}}`);
  } else if (newNarr) src = appendChild(src, findSceneSequence(src, id)!, newNarr);
  else if (oldNarr) src = removeElement(src, `${id} narration`);
  const oldCaps = findByName(src, `${id} captions`);
  if (newCaps && oldCaps) {
    // keep the user's caption styling; swap only the timed words
    const caps = newCaps.slice(newCaps.indexOf("captions={") + "captions=".length, newCaps.lastIndexOf("}") + 1);
    src = setAttr(src, `${id} captions`, "captions", caps);
  } else if (newCaps) src = appendChild(src, findSceneSequence(src, id)!, newCaps);
  else if (oldCaps) src = removeElement(src, `${id} captions`);
  return src;
};

const patchLayout = (src: string, x: SceneCodeInput): string => {
  const id = x.scene.id;
  const lines = sceneLayoutCode(x, "          ");
  for (const part of ["title", "layout", "label"]) {
    const name = `${id} ${part}`;
    const line = lineFor(lines, name);
    const old = findByName(src, name);
    if (line && old) src = replaceEl(src, old, line);
    else if (old) src = removeElement(src, name);
    else if (line) {
      const visual = findByName(src, `${id} overlay`) ?? findByName(src, `${id} visual`);
      src = visual ? src.slice(0, visual.end) + "\n" + line + src.slice(visual.end) : appendChild(src, findSceneSequence(src, id)!, line);
    }
  }
  return src;
};

const patchDuckRanges = (src: string, id: string, fps: number, timeline: ReturnType<typeof timelineFor>) => {
  const music = listElements(src).find((e) => e.tag === "MusicBed");
  if (!music?.name) return src;
  const manifest = store.assets(id);
  const { spans } = readSceneSpans(src, fps);
  const ranges = spans
    .map((s) => {
      const t = timeline.scenes.find((x) => x.id === s.sceneId);
      if (!t || !manifest.narration.find((n) => n.sceneId === s.sceneId)?.file) return null;
      return [s.startFrame + t.narrationOffsetFrames, s.startFrame + t.narrationOffsetFrames + t.narrationFrames];
    })
    .filter(Boolean);
  // target the MusicBed itself: its wrapping <Track> carries the same name
  return setAttr(src, music.name, "duckRanges", `{${JSON.stringify(ranges)}}`, (s) => listElements(s).find((e) => e.tag === "MusicBed"));
};

/**
 * Patches the named elements of the given scenes in editable/Video.tsx.
 * Creates the file if it does not exist yet.
 */
export const patchScenes = (id: string, sceneIds: string[], parts: PatchPart[]): string[] => {
  const p = P(id);
  if (!fs.existsSync(p.editable)) {
    composeEditable(id);
    return ["editable/Video.tsx (created)"];
  }
  const previous = fs.readFileSync(p.editable, "utf8");
  const { meta, timeline, forScene } = sceneInputs(id);
  let src = previous;
  const patched: string[] = [];
  for (const sid of sceneIds) {
    const x = forScene(sid);
    if (!findSceneSequence(src, sid)) throw new Error(`Scene ${sid} is not in the editable composition (was it deleted in Studio?)`);
    if (parts.includes("sequence")) {
      src = replaceEl(src, findSceneSequence(src, sid)!, sceneSequenceCode(x));
      patched.push(`${sid} (whole scene)`);
      continue;
    }
    if (parts.includes("visual")) {
      src = patchVisual(src, x);
      patched.push(`${sid} visual`);
    }
    if (parts.includes("layout")) {
      src = patchLayout(src, x);
      patched.push(`${sid} text`);
    }
    if (parts.includes("audio")) {
      src = patchAudio(src, x);
      patched.push(`${sid} narration + captions`);
    }
    if (parts.includes("duration") || parts.includes("audio")) {
      const seq = findSceneSequence(src, sid)!;
      src = setAttr(src, seq.name!, "durationInFrames", `{${x.timing.durationInFrames}}`, (s) => findSceneSequence(s, sid));
    }
  }
  if (parts.some((x) => x === "audio" || x === "duration" || x === "sequence")) src = patchDuckRanges(src, id, meta.fps, timeline);
  const errors = syntaxErrors(src);
  if (errors.length) throw new Error(`Patch produced invalid code (file left unchanged): ${errors.join("; ")}`);
  fs.writeFileSync(p.editable, src);
  markEditablePatched(id, src, previous);
  return patched;
};

/* ------------------------------------------------------------ regenerate */

export type RegenerateWhat = "image" | "clip" | "narration" | "script" | "visuals" | "scene-style" | "captions";
export type RegenerateOptions = {
  what: RegenerateWhat;
  sceneId?: string;
  style?: string;
  instruction?: string;
  approveSpendUsd?: number;
  providers?: Providers;
  llm?: "anthropic" | "mock";
};

const providersFor = (id: string, o: { providers?: Providers; llm?: "anthropic" | "mock" }) => {
  const meta = store.metadata(id);
  return o.providers ?? createProviders({ offline: meta.mode === "offline-demo" || meta.request.offline, llm: o.llm });
};

const withApproval = (id: string, approve?: number) => {
  const meta = store.metadata(id);
  if (approve !== undefined) {
    meta.request.approveSpendUsd = approve;
    store.saveMetadata(meta);
  }
  return meta;
};

const requireScene = (id: string, sceneId: string | undefined, what: string) => {
  if (!sceneId) throw new Error(`--scene is required to regenerate ${what}`);
  const sb = store.storyboard(id);
  if (!sb.scenes.some((s) => s.id === sceneId)) throw new Error(`Scene ${sceneId} not found (scenes: ${sb.scenes.map((s) => s.id).join(", ")})`);
  return sceneId;
};

const resolveVisuals = async (id: string, providers: Providers, sceneIds: string[], override: (plan: AssetPlan) => AssetPlan, styleOverride?: string, variant?: string) => {
  const meta = store.metadata(id);
  const scenes = effectiveScenes(store.storyboard(id), store.edits(id));
  const manifest = store.assets(id);
  const pm = store.manifest(id);
  const plans = planAssets({ scenes, request: meta.request, providers, manifest, offlineDemo: meta.mode === "offline-demo", only: sceneIds, force: true }).map(override);
  const planned: PlannedCost[] = plannedCosts(plans, providers, meta.request);
  enforceBudget(meta.request, pm, planned);
  const renderer = await defaultRenderer();
  const changed: string[] = [];
  const failures: string[] = [];
  for (const plan of plans) {
    const index = scenes.findIndex((s) => s.id === plan.sceneId);
    const scene = scenes[index];
    const entry = sceneEntry(manifest, scene.id);
    try {
      const asset = await resolveSceneAsset(
        {
          projectId: id,
          request: meta.request,
          direction: meta.direction!,
          providers,
          size: { width: meta.width, height: meta.height },
          renderProceduralStill: renderer.renderProceduralStill,
          variant,
          log: (level, message) => pm.log.push({ at: new Date().toISOString(), level, stage: "regenerate", message }),
          cost: (category, provider, description, usd, cached) => recordCost(pm, { category, provider, description, estimatedUsd: usd, cached }),
        },
        scene,
        plan,
        index,
        styleOverride ?? store.edits(id).scenes[scene.id]?.visualStyle,
      );
      if (asset) {
        entry.history.push(asset);
        entry.currentAssetId = asset.id;
      } else entry.currentAssetId = null;
      entry.lastError = undefined;
      changed.push(scene.id);
      if (asset && (asset.kind === "generated_image" || asset.kind === "generated_video")) meta.disclosure.containsAiGeneratedMedia = true;
    } catch (err) {
      entry.lastError = (err as Error).message;
      failures.push(`${scene.id}: ${(err as Error).message}`);
    }
    store.saveAssets(id, manifest);
  }
  store.saveManifest(id, { ...store.manifest(id), costs: pm.costs, log: pm.log });
  store.saveMetadata(meta);
  return { changed, failures };
};

const resynthesize = async (id: string, providers: Providers, sceneIds: string[]) => {
  const meta = store.metadata(id);
  const scenes = effectiveScenes(store.storyboard(id), store.edits(id));
  const manifest = store.assets(id);
  const pm = store.manifest(id);
  const silent = !meta.request.narration || meta.mode === "offline-demo" || !providers.tts.real;
  const tts = silent ? (await import("../audio/silent")).silentTts : providers.tts;
  if (!silent) enforceBudget(meta.request, pm, [{ category: "voice", provider: tts.name, description: "narration", estimatedUsd: tts.estimateUsd(scenes.filter((s) => sceneIds.includes(s.id)).map((s) => s.narration).join(" ")) }]);
  const voiceId = store.edits(id).voiceId ?? meta.request.voiceId;
  for (const sid of sceneIds) {
    const i = scenes.findIndex((s) => s.id === sid);
    const seg = await synthesizeScene({
      projectId: id,
      tts,
      scene: scenes[i],
      prev: scenes[i - 1],
      next: scenes[i + 1],
      voiceId,
      language: meta.request.language,
      style: meta.direction?.narrationStyle,
      onCost: (usd, cached, description) => recordCost(pm, { category: "voice", provider: tts.name, description, estimatedUsd: usd, cached }),
    });
    upsertNarration(manifest, seg);
  }
  store.saveAssets(id, manifest);
  store.saveManifest(id, { ...store.manifest(id), costs: pm.costs });
  meta.disclosure.containsAiVoice = manifest.narration.some((n) => n.file);
  meta.durationSeconds = timelineFor(meta, scenes).totalFrames / meta.fps;
  store.saveMetadata(meta);
  return { silent, provider: tts.name };
};

const afterPatch = (id: string) => {
  try {
    exportCaptions(id);
  } catch {
    /* captions are refreshed again at export */
  }
  const meta = store.metadata(id);
  if (meta.status === "rendered") {
    meta.status = "ready";
    store.saveMetadata(meta);
  }
};

export const regenerate = async (id: string, o: RegenerateOptions): Promise<OpResult> => {
  withApproval(id, o.approveSpendUsd);
  const providers = providersFor(id, o);
  const allIds = store.storyboard(id).scenes.map((s) => s.id);

  switch (o.what) {
    case "image":
    case "clip":
    case "scene-style": {
      const sid = requireScene(id, o.sceneId, o.what);
      if (o.what === "scene-style") {
        if (!o.style) throw new Error("--style is required for scene-style");
        const edits = store.edits(id);
        edits.scenes[sid] = { ...edits.scenes[sid], visualStyle: o.style, editedAt: new Date().toISOString() };
        store.saveEdits(id, edits);
      }
      const wantVideo = o.what === "clip";
      if (wantVideo && !providers.video) throw new MissingCredentialsError("Video clip generation", ["FAL_KEY"]);
      if (!wantVideo && !providers.images) throw new MissingCredentialsError("Image generation", ["OPENAI_API_KEY", "FAL_KEY"]);
      const { changed, failures } = await resolveVisuals(id, providers, [sid], (p) => ({ ...p, source: wantVideo ? "ai-video" : "ai-image", reason: `regenerate ${o.what}` }), o.style, o.what === "scene-style" ? undefined : `regen-${Date.now()}`);
      if (!changed.length) return { ok: false, message: `Regeneration failed; the scene keeps its previous media. ${failures.join("; ")}` };
      const patched = patchScenes(id, changed, ["visual"]);
      afterPatch(id);
      return { ok: true, message: `New ${wantVideo ? "clip" : "image"} for ${sid}; patched ${patched.join(", ")}. Earlier versions are kept and can be restored with "revert".`, patched };
    }

    case "visuals": {
      const ids = o.sceneId ? [requireScene(id, o.sceneId, "visuals")] : allIds;
      const { changed, failures } = await resolveVisuals(id, providers, ids, (p) => p);
      const patched = changed.length ? patchScenes(id, changed, ["visual"]) : [];
      afterPatch(id);
      return { ok: failures.length === 0, message: `Re-resolved visuals for ${changed.length} scene(s)${failures.length ? `; failed: ${failures.join("; ")}` : ""}`, patched };
    }

    case "narration": {
      const ids = o.sceneId ? [requireScene(id, o.sceneId, "narration")] : allIds;
      const r = await resynthesize(id, providers, ids);
      const patched = patchScenes(id, ids, ["audio"]);
      afterPatch(id);
      return { ok: true, message: `Narration ${r.silent ? "re-timed (silent mode, estimated timing)" : `regenerated with ${r.provider}`} for ${ids.join(", ")}; scene lengths and captions updated.`, patched };
    }

    case "script": {
      const sid = requireScene(id, o.sceneId, "script");
      if (!o.instruction) throw new Error("--instruction is required for script rewrites");
      const meta = store.metadata(id);
      const pm = store.manifest(id);
      enforceBudget(meta.request, pm, [{ category: "llm", provider: providers.llm.name, description: "scene rewrite", estimatedUsd: 0.05 }]);
      const sb = store.storyboard(id);
      const scenes = effectiveScenes(sb, store.edits(id));
      const res = await providers.llm.rewriteScene(meta.request, meta.direction!, scenes, sid, o.instruction);
      recordCost(pm, { category: "llm", provider: providers.llm.name, description: `rewrite ${sid}`, estimatedUsd: res.cost.estimatedUsd, actualUsd: res.cost.actualUsd });
      store.saveManifest(id, { ...store.manifest(id), costs: pm.costs });
      const old = sb.scenes.find((s) => s.id === sid)!;
      const rewritten = { ...res.scene, id: sid, transitionIn: old.transitionIn, animationPreset: res.scene.animationPreset ?? old.animationPreset } as Scene;
      const next = { ...sb, version: sb.version + 1, createdAt: new Date().toISOString(), scenes: sb.scenes.map((s) => (s.id === sid ? rewritten : s)) };
      store.saveStoryboard(id, next);
      // the rewrite supersedes manual text edits for this scene
      const edits = store.edits(id);
      delete edits.scenes[sid];
      store.saveEdits(id, edits);
      meta.storyboardVersion = next.version;
      store.saveMetadata(meta);
      await resynthesize(id, providers, [sid]);
      const patched = patchScenes(id, [sid], ["sequence"]);
      afterPatch(id);
      return { ok: true, message: `Rewrote ${sid} (storyboard v${next.version}); other scenes and their edits are untouched.`, patched };
    }

    case "captions": {
      if (o.style) {
        const style = CaptionStyleName.parse(o.style);
        const edits = store.edits(id);
        edits.captionStyle = style;
        store.saveEdits(id, edits);
        return setCaptionStyle(id, style);
      }
      const patched = patchScenes(id, o.sceneId ? [o.sceneId] : allIds, ["audio"]);
      afterPatch(id);
      return { ok: true, message: "Caption timings rebuilt from narration", patched };
    }
  }
};

/* ------------------------------------------------------- direct edits */

/** Text edits from the review screen: stored as user edits (AI output stays in history), then patched in. */
export const editScene = async (id: string, sceneId: string, e: { narration?: string; title?: string; onScreenText?: string; visualPrompt?: string }, o: { providers?: Providers; approveSpendUsd?: number } = {}): Promise<OpResult> => {
  requireScene(id, sceneId, "edits");
  withApproval(id, o.approveSpendUsd);
  const edits: ProjectEdits = store.edits(id);
  const before = effectiveScenes(store.storyboard(id), edits).find((s) => s.id === sceneId)!;
  edits.scenes[sceneId] = { ...edits.scenes[sceneId], ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)), editedAt: new Date().toISOString() };
  store.saveEdits(id, edits);
  const parts: PatchPart[] = [];
  if ((e.title !== undefined && e.title !== before.title) || (e.onScreenText !== undefined && e.onScreenText !== before.onScreenText)) parts.push("layout");
  if (e.narration !== undefined && e.narration.trim() !== before.narration.trim()) {
    await resynthesize(id, providersFor(id, o), [sceneId]);
    parts.push("audio");
  }
  if (!parts.length) return { ok: true, message: "Saved (nothing to re-render)" };
  const patched = patchScenes(id, [sceneId], parts);
  afterPatch(id);
  return { ok: true, message: `Updated ${patched.join(", ")}`, patched };
};

export const setCaptionStyle = (id: string, style: CaptionStyleName): OpResult => {
  const edits = store.edits(id);
  edits.captionStyle = style;
  store.saveEdits(id, edits);
  const { scenes, forScene } = sceneInputs(id);
  const p = P(id);
  const previous = fs.readFileSync(p.editable, "utf8");
  let src = previous;
  const patched: string[] = [];
  for (const s of scenes) {
    const line = lineFor(sceneAudioCaptionCode(forScene(s.id), "          "), `${s.id} captions`);
    const old = findByName(src, `${s.id} captions`);
    if (line && old) {
      src = replaceEl(src, old, line);
      patched.push(`${s.id} captions`);
    }
  }
  fs.writeFileSync(p.editable, src);
  markEditablePatched(id, src, previous);
  afterPatch(id);
  return { ok: true, message: `Caption style set to ${style} on ${patched.length} scene(s)`, patched };
};

export const setVoice = async (id: string, voiceId: string, o: { providers?: Providers; approveSpendUsd?: number } = {}) => {
  const edits = store.edits(id);
  edits.voiceId = voiceId;
  store.saveEdits(id, edits);
  return regenerate(id, { what: "narration", providers: o.providers, approveSpendUsd: o.approveSpendUsd });
};

/* --------------------------------------------------- replace / revert */

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export const replaceMedia = async (id: string, sceneId: string, file: string): Promise<OpResult> => {
  requireScene(id, sceneId, "media");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const ext = path.extname(file).slice(1).toLowerCase();
  const mediaType = VIDEO_EXT.has(ext) ? "video" : IMAGE_EXT.has(ext) ? "image" : null;
  if (!mediaType) throw new Error(`Unsupported file type .${ext} (use ${[...IMAGE_EXT, ...VIDEO_EXT].join(", ")})`);
  const rel = nextVersionFile(id, sceneId, "upload", ext);
  fs.copyFileSync(file, path.join(P(id).dir, rel));
  const durationSeconds = mediaType === "video" ? await mediaDurationSeconds(path.join(P(id).dir, rel)).catch(() => undefined) : undefined;
  const asset: Asset = { kind: "uploaded", id: `${sceneId}-${path.basename(rel)}`, sceneId, file: rel, createdAt: new Date().toISOString(), originalName: path.basename(file), mediaType, durationSeconds, costUsd: 0 };
  const manifest = store.assets(id);
  const entry = sceneEntry(manifest, sceneId);
  entry.history.push(asset);
  entry.currentAssetId = asset.id;
  entry.lastError = undefined;
  store.saveAssets(id, manifest);
  const patched = patchScenes(id, [sceneId], ["visual"]);
  afterPatch(id);
  return { ok: true, message: `${sceneId} now uses ${path.basename(file)} (${mediaType}). Previous media kept in history.`, patched };
};

/** Switch a scene to an earlier asset ("art" or "none" = live procedural art). */
export const selectAsset = async (id: string, sceneId: string, assetId: string): Promise<OpResult> => {
  requireScene(id, sceneId, "asset");
  const manifest = store.assets(id);
  const entry = sceneEntry(manifest, sceneId);
  if (assetId === "none" || assetId === "art") entry.currentAssetId = null;
  else {
    const a = entry.history.find((h) => h.id === assetId);
    if (!a) throw new Error(`Asset ${assetId} not found for ${sceneId}. Available: ${entry.history.map((h) => h.id).join(", ") || "none"}`);
    if (!fs.existsSync(path.join(P(id).dir, a.file))) throw new Error(`Asset file is missing: ${a.file}`);
    entry.currentAssetId = a.id;
  }
  store.saveAssets(id, manifest);
  const patched = patchScenes(id, [sceneId], ["visual"]);
  afterPatch(id);
  return { ok: true, message: `${sceneId} switched to ${entry.currentAssetId ?? "live motion graphics"}`, patched };
};

/* ---------------------------------------------------------------- info */

export const projectDetails = (id: string) => {
  const meta = store.metadata(id);
  const p = P(id);
  const sb = fs.existsSync(p.storyboard) ? store.storyboard(id) : null;
  const edits = store.edits(id);
  const assets = store.assets(id);
  const manifest = store.manifest(id);
  const scenes = sb ? effectiveScenes(sb, edits) : [];
  const src = fs.existsSync(p.editable) ? fs.readFileSync(p.editable, "utf8") : null;
  const spans = src ? readSceneSpans(src, meta.fps).spans : [];
  return {
    meta,
    storyboard: sb,
    scenes: scenes.map((s) => ({
      ...s,
      span: spans.find((x) => x.sceneId === s.id) ?? null,
      assets: assets.scenes.find((e) => e.sceneId === s.id) ?? null,
      narrationSegment: assets.narration.find((n) => n.sceneId === s.id) ?? null,
      edited: Boolean(edits.scenes[s.id]),
    })),
    edits,
    manifest,
    music: assets.music ?? null,
    editable: { path: p.editable, exists: Boolean(src), userModified: editableIsUserModified(id) },
    outputs: fs.existsSync(p.outputDir) ? fs.readdirSync(p.outputDir).filter((f) => !f.startsWith(".")) : [],
    resolution: RESOLUTIONS[meta.request.aspectRatio],
  };
};
