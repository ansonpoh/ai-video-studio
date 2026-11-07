/**
 * The generation pipeline. One implementation used by the CLI, the web UI
 * and the tests. Sixteen typed stages; each records status, attempts, errors
 * and timing in manifest.json so a failed run resumes where it stopped.
 */
import fs from "node:fs";
import path from "node:path";
import { VideoRequest, RESOLUTIONS, type VideoRequestInput } from "../schemas/options";
import { CreativeDirection, Scene, Storyboard } from "../schemas/storyboard";
import { STAGES, type ProjectMetadata, type StageName, type PipelineManifest } from "../schemas/project";
import type { Providers, PromptHints, Script } from "../providers/types";
import { ProviderError } from "../providers/types";
import { P, newProjectId, store, writeJsonAtomic } from "./store";
import { applyPresetLook } from "./explainer";
import { enforceBudget, recordCost, budgetFor, PRESETS, ClipApprovalRequired, type PlannedCost } from "./budget";
import { planAssets, plannedCosts, resolveSceneAsset, sceneEntry, makeClip, clipProviderFor, type AssetPlan } from "./assets";
import { synthesizeScene, upsertNarration, buildContinuousNarration } from "./narration";
import { selectAnimations } from "./animation";
import { composeEditable, effectiveScenes, exportCaptions, timelineFor } from "./compose";
import { checkContent, requiresReview } from "../ai/content-checks";
import { pickTrack } from "../audio/music-library";
import { generateProceduralMusic } from "../audio/procedural-music";
import { generateProceduralSfx } from "../audio/procedural-sfx";
import type { MusicMood, SfxKind } from "../schemas/catalog";

export type PipelineEvent = { projectId: string; stage: StageName | "done"; status: "running" | "done" | "failed" | "skipped" | "progress"; message?: string; progress?: number };

export type Preset = { direction: CreativeDirection; storyboard: Omit<Storyboard, "createdAt" | "version" | "source">; source: "demo" | "user" };

export type RunOptions = {
  providers: Providers;
  preset?: Preset;
  onEvent?: (e: PipelineEvent) => void;
  /** Stop after this stage (inclusive). */
  until?: StageName;
  /** Re-run these stages even if done. */
  rerun?: StageName[];
  skipRender?: boolean;
  skipExport?: boolean;
  /** Offline demo: procedural visuals, never calls paid providers. */
  offlineDemo?: boolean;
  retries?: number;
  /** Renderer hooks, injected so tests can run the pipeline without Chromium. */
  renderer?: Renderer;
};

export type Renderer = {
  renderProceduralStill: (props: { art: string; primaryColor: string; accentColor: string; backgroundColor: string; labels: string; seed: number }, output: string, size: { width: number; height: number }) => Promise<string>;
  renderVideo: (id: string, kind: "draft" | "final" | "clean", onProgress?: (p: { progress: number }) => void) => Promise<{ file: string }>;
  renderThumbnail: (id: string) => Promise<string>;
  renderAudioMix: (id: string) => Promise<string>;
  checkRender: (id: string, file: string, opts: { expectCaptions: boolean; scale?: number }) => Promise<{ ok: boolean; checks: { name: string; ok: boolean; severity: string; detail: string }[] }>;
};

export const defaultRenderer = async (): Promise<Renderer> => {
  const r = await import("../rendering/render");
  const q = await import("../rendering/quality");
  return {
    renderProceduralStill: r.renderProceduralStill,
    renderVideo: (id, kind, onProgress) => r.renderVideo(id, kind, { onProgress: onProgress ? (p) => onProgress({ progress: p.progress }) : undefined }),
    renderThumbnail: (id) => r.renderThumbnail(id),
    renderAudioMix: (id) => r.renderAudioMix(id),
    checkRender: q.checkRender,
  };
};

/* --------------------------------------------------------------- create */

export const createProject = (input: VideoRequestInput, opts: { id?: string; mode?: ProjectMetadata["mode"]; providers?: Record<string, string> } = {}) => {
  const request = VideoRequest.parse(input);
  const id = opts.id ?? newProjectId(request.prompt);
  if (fs.existsSync(P(id).metadata)) throw new Error(`Project ${id} already exists`);
  store.createDirs(id);
  const { width, height } = RESOLUTIONS[request.aspectRatio];
  const now = new Date().toISOString();
  const meta: ProjectMetadata = {
    id,
    title: request.prompt.slice(0, 90),
    createdAt: now,
    updatedAt: now,
    status: "generating",
    request,
    mode: opts.mode ?? "live",
    providers: opts.providers ?? {},
    width,
    height,
    fps: request.fps,
    disclosure: { containsAiGeneratedMedia: false, containsAiVoice: false, containsAiScript: false, label: "" },
    contentFlags: [],
    requiresReview: false,
    storyboardVersion: 1,
    tags: [],
  };
  store.saveMetadata(meta);
  const m = store.manifest(id);
  store.saveManifest(id, m);
  return id;
};

/* --------------------------------------------------------------- runner */

type Ctx = {
  id: string;
  opts: RunOptions;
  manifest: PipelineManifest;
  log: (level: "info" | "warn" | "error", stage: string, message: string) => void;
  emit: (e: Omit<PipelineEvent, "projectId">) => void;
  renderer: Renderer;
  hints?: PromptHints;
};

const scratch = (id: string) => path.join(P(id).dir, ".pipeline");
const saveScratch = (id: string, name: string, data: unknown) => writeJsonAtomic(path.join(scratch(id), `${name}.json`), data);
const loadScratch = <T>(id: string, name: string): T | null => {
  const f = path.join(scratch(id), `${name}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as T) : null;
};

const isRetryable = (err: unknown) => err instanceof ProviderError && err.retryable;

export const writeProgress = (id: string, data: { stage: string; status: string; progress?: number; message?: string }) => {
  try {
    writeJsonAtomic(path.join(P(id).dir, "progress.json"), { ...data, at: new Date().toISOString() });
  } catch {
    /* progress is best-effort */
  }
};

export const runPipeline = async (id: string, opts: RunOptions) => {
  const renderer = opts.renderer ?? (await defaultRenderer());
  const ctx: Ctx = {
    id,
    opts,
    manifest: store.manifest(id),
    renderer,
    log: (level, stage, message) => {
      ctx.manifest.log.push({ at: new Date().toISOString(), level, stage, message });
      persist();
    },
    emit: (e) => {
      writeProgress(id, { stage: e.stage, status: e.status, progress: e.progress, message: e.message });
      opts.onEvent?.({ projectId: id, ...e });
    },
  };
  /** Merge our stage/log/cost state into the on-disk manifest (other writers own renders and editableHash). */
  const persist = () => {
    const disk = store.manifest(id);
    store.saveManifest(id, { ...disk, stages: ctx.manifest.stages, log: ctx.manifest.log, costs: ctx.manifest.costs });
  };
  const meta = store.metadata(id);
  meta.status = "generating";
  store.saveMetadata(meta);

  for (const name of STAGES) {
    const rec = ctx.manifest.stages.find((s) => s.name === name)!;
    if (rec.status === "done" && !opts.rerun?.includes(name)) {
      ctx.emit({ stage: name, status: "skipped", message: "already done" });
      if (opts.until === name) break;
      continue;
    }
    const maxAttempts = (opts.retries ?? 2) + 1;
    for (let attempt = 1; ; attempt++) {
      rec.status = "running";
      rec.attempts += 1;
      rec.startedAt = new Date().toISOString();
      rec.error = undefined;
      persist();
      ctx.emit({ stage: name, status: "running" });
      try {
        const note = await STAGE_IMPL[name](ctx);
        rec.status = note === "skipped" ? "skipped" : "done";
        rec.note = typeof note === "string" && note !== "skipped" ? note : rec.note;
        rec.finishedAt = new Date().toISOString();
        persist();
        ctx.emit({ stage: name, status: rec.status === "skipped" ? "skipped" : "done", message: rec.note });
        break;
      } catch (err) {
        const message = (err as Error).message;
        ctx.log(attempt < maxAttempts && isRetryable(err) ? "warn" : "error", name, message);
        if (attempt < maxAttempts && isRetryable(err)) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        // The storyboard preview is a pause, not a failure: the stage stays pending until clips are approved or skipped.
        const paused = (err as Error).name === "ClipApprovalRequired";
        rec.status = paused ? "pending" : "failed";
        rec.error = paused ? undefined : message;
        rec.note = paused ? "waiting for clip approval" : rec.note;
        rec.finishedAt = new Date().toISOString();
        persist();
        const m = store.metadata(id);
        m.status = paused ? "draft" : "failed";
        store.saveMetadata(m);
        ctx.emit({ stage: name, status: "failed", message });
        throw err;
      }
    }
    if (opts.until === name) break;
  }
  persist();
  const done = ctx.manifest.stages.every((s) => s.status === "done" || s.status === "skipped");
  const m = store.metadata(id);
  if (done) m.status = m.requiresReview ? "needs-review" : store.manifest(id).renders.some((r) => r.kind === "final") ? "rendered" : "ready";
  else if (m.status === "generating") m.status = "draft";
  store.saveMetadata(m);
  ctx.emit({ stage: "done", status: "done" });
  return store.metadata(id);
};

/* --------------------------------------------------------------- stages */

type StageResult = string | void | "skipped";

const reqOf = (id: string) => store.metadata(id).request;

const STAGE_IMPL: Record<StageName, (ctx: Ctx) => Promise<StageResult>> = {
  async interpret(ctx) {
    const { parsePromptHints } = await import("../ai/prompt-parser");
    const meta = store.metadata(ctx.id);
    const hints = parsePromptHints(meta.request.prompt);
    // Explicit duration in the prompt wins over the default, unless the user set one in the form/CLI.
    if (hints.requestedDurationSeconds && meta.request.durationSeconds === 30) meta.request.durationSeconds = hints.requestedDurationSeconds;
    store.saveMetadata(meta);
    saveScratch(ctx.id, "hints", hints);
    return `format hint: ${hints.formatHint ?? "none"}; list: ${hints.listCount ?? "-"}; duration ${meta.request.durationSeconds}s`;
  },

  async direction(ctx) {
    const meta = store.metadata(ctx.id);
    const hints = loadScratch<PromptHints>(ctx.id, "hints")!;
    let direction: CreativeDirection;
    if (ctx.opts.preset) direction = CreativeDirection.parse(ctx.opts.preset.direction);
    else {
      const llm = ctx.opts.providers.llm;
      enforceBudget(meta.request, ctx.manifest, [{ category: "llm", provider: llm.name, description: "direction + script + storyboard", estimatedUsd: 0.15 }]);
      const res = await llm.direction(meta.request, hints);
      recordCost(ctx.manifest, { category: "llm", provider: llm.name, description: "creative direction", estimatedUsd: res.cost.estimatedUsd, actualUsd: res.cost.actualUsd });
      // user choices from the form override the director
      direction = applyPresetLook(res.direction, meta.request);
      if (meta.request.captionStyle !== "auto") direction.captionStyle = meta.request.captionStyle;
    }
    meta.direction = direction;
    meta.title = direction.title;
    store.saveMetadata(meta);
    return `${direction.format} · ${direction.visualStyle.name} · ${direction.pacing}`;
  },

  async script(ctx) {
    if (ctx.opts.preset) {
      const sb = ctx.opts.preset.storyboard;
      const script: Script = { title: sb.title, hook: sb.hook, beats: sb.scenes.map((s) => ({ purpose: s.purpose, narration: s.narration, intent: s.title ?? "" })), sources: sb.sources };
      saveScratch(ctx.id, "script", script);
      return "predefined script";
    }
    const meta = store.metadata(ctx.id);
    const hints = loadScratch<PromptHints>(ctx.id, "hints")!;
    const res = await ctx.opts.providers.llm.script(meta.request, meta.direction!, hints);
    recordCost(ctx.manifest, { category: "llm", provider: ctx.opts.providers.llm.name, description: "script", estimatedUsd: res.cost.estimatedUsd, actualUsd: res.cost.actualUsd });
    saveScratch(ctx.id, "script", res.script);
    return `${res.script.beats.length} beats`;
  },

  async storyboard(ctx) {
    const meta = store.metadata(ctx.id);
    const prevVersion = fs.existsSync(P(ctx.id).storyboard) ? store.storyboard(ctx.id).version : 0;
    let sb: Omit<Storyboard, "createdAt" | "version" | "source">;
    let source: Storyboard["source"];
    if (ctx.opts.preset) {
      sb = ctx.opts.preset.storyboard;
      source = ctx.opts.preset.source;
    } else {
      const script = loadScratch<Script>(ctx.id, "script")!;
      const res = await ctx.opts.providers.llm.storyboard(meta.request, meta.direction!, script);
      recordCost(ctx.manifest, { category: "llm", provider: ctx.opts.providers.llm.name, description: "storyboard", estimatedUsd: res.cost.estimatedUsd, actualUsd: res.cost.actualUsd });
      sb = res.storyboard;
      source = ctx.opts.providers.llm.name === "anthropic" ? "anthropic" : "mock";
    }
    const full = Storyboard.parse({ ...sb, version: prevVersion + 1, createdAt: new Date().toISOString(), source, model: ctx.opts.preset ? undefined : ctx.opts.providers.llm.model });
    store.saveStoryboard(ctx.id, full);
    meta.storyboardVersion = full.version;
    meta.disclosure.containsAiScript = source === "anthropic" || source === "mock";
    store.saveMetadata(meta);
    return `${full.scenes.length} scenes (v${full.version})`;
  },

  async validate(ctx) {
    const meta = store.metadata(ctx.id);
    const sb = store.storyboard(ctx.id);
    const problems: string[] = [];
    const ids = new Set<string>();
    sb.scenes.forEach((s, i) => {
      if (ids.has(s.id)) problems.push(`duplicate scene id ${s.id}`);
      ids.add(s.id);
      if (!s.narration.trim() && meta.request.narration) problems.push(`${s.id} has no narration`);
      Scene.parse(s);
      if (i > 0 && s.layout === sb.scenes[i - 1].layout && s.layout !== "listicle" && s.visual.art && s.visual.art === sb.scenes[i - 1].visual.art) problems.push(`${s.id} repeats the previous scene's layout and visual`);
    });
    // visual-mode rules
    if (meta.request.visualMode === "ai_only") {
      const stock = sb.scenes.filter((s) => s.visual.type.startsWith("stock"));
      if (stock.length) {
        sb.scenes = sb.scenes.map((s) => (s.visual.type.startsWith("stock") ? ({ ...s, visual: { ...s.visual, type: "generated_image" } } as Scene) : s));
        ctx.log("info", "validate", `AI-only mode: converted ${stock.length} stock scene(s) to generated imagery`);
        store.saveStoryboard(ctx.id, { ...sb });
      }
    }
    const hard = problems.filter((p) => p.includes("duplicate") || p.includes("no narration"));
    if (hard.length) throw new Error(`Storyboard invalid: ${hard.join("; ")}`);
    problems.filter((p) => !hard.includes(p)).forEach((p) => ctx.log("warn", "validate", p));
    const hints = loadScratch<PromptHints>(ctx.id, "hints")!;
    meta.contentFlags = checkContent({ direction: meta.direction!, scenes: sb.scenes, hints, retrievalAvailable: false, usesGeneratedMedia: false, usesStock: false });
    meta.requiresReview = requiresReview(meta.contentFlags);
    store.saveMetadata(meta);
    return `${sb.scenes.length} scenes valid; ${meta.contentFlags.length} content notes`;
  },

  async "plan-assets"(ctx) {
    const meta = store.metadata(ctx.id);
    const scenes = effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id));
    const plans = planAssets({ scenes, request: meta.request, providers: ctx.opts.providers, manifest: store.assets(ctx.id), offlineDemo: Boolean(ctx.opts.offlineDemo) });
    const planned: PlannedCost[] = plannedCosts(plans, ctx.opts.providers, meta.request);
    const narrationChars = scenes.reduce((a, s) => a + s.narration.length, 0);
    if (meta.request.narration && ctx.opts.providers.tts.real && !ctx.opts.offlineDemo)
      planned.push({ category: "voice", provider: ctx.opts.providers.tts.name, description: `${narrationChars} characters`, estimatedUsd: ctx.opts.providers.tts.estimateUsd(scenes.map((s) => s.narration).join(" ")) });
    const sfxScenes = scenes.filter((s) => s.sfx);
    if ((meta.request.soundEffects || PRESETS[meta.request.quality].soundEffects) && ctx.opts.providers.sfx && !ctx.opts.offlineDemo && sfxScenes.length)
      planned.push({ category: "sfx", provider: ctx.opts.providers.sfx.name, description: `${sfxScenes.length} effects`, estimatedUsd: sfxScenes.length * ctx.opts.providers.sfx.estimateUsd(2) });
    saveScratch(ctx.id, "asset-plan", { plans, planned });
    const { total, budget } = enforceBudget(meta.request, ctx.manifest, planned);
    return `est. $${total.toFixed(2)} of $${budget.toFixed(2)} budget; ${plans.map((p) => `${p.sceneId}:${p.source}`).join(" ")}`;
  },

  async assets(ctx) {
    const meta = store.metadata(ctx.id);
    const scenes = effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id));
    const { plans } = loadScratch<{ plans: AssetPlan[] }>(ctx.id, "asset-plan")!;
    const manifest = store.assets(ctx.id);
    let generated = false;
    let stock = false;
    for (const [i, s] of scenes.entries()) {
      const plan = plans.find((p) => p.sceneId === s.id);
      const entry = sceneEntry(manifest, s.id);
      if (!plan || plan.source === "keep") continue;
      ctx.emit({ stage: "assets", status: "progress", progress: i / scenes.length, message: `${s.id}: ${plan.source === "ai-video" ? "still (clip comes after review)" : plan.source}` });
      // Clips are made in the "clips" stage, after the stills can be previewed.
      const stillPlan: AssetPlan = plan.source === "ai-video" ? { ...plan, source: "ai-image", estimatedUsd: plan.stillUsd ?? 0 } : plan;
      try {
        const asset = await resolveSceneAsset(
          {
            projectId: ctx.id,
            request: meta.request,
            direction: meta.direction!,
            providers: ctx.opts.providers,
            size: { width: meta.width, height: meta.height },
            renderProceduralStill: ctx.renderer.renderProceduralStill,
            log: (l, m) => ctx.log(l, "assets", m),
            cost: (category, provider, description, usd, cached) => recordCost(ctx.manifest, { category, provider, description, estimatedUsd: usd, cached }),
          },
          s,
          stillPlan,
          i,
        );
        if (asset) {
          entry.history.push(asset);
          entry.currentAssetId = asset.id;
          entry.lastError = undefined;
          if (["generated_image", "generated_video"].includes(asset.kind)) generated = true;
          if (asset.kind.startsWith("stock")) stock = true;
        }
      } catch (err) {
        // A failed retrieval is recorded and the scene falls back to live motion graphics; never reported as success.
        entry.lastError = (err as Error).message;
        ctx.log("warn", "assets", `${s.id}: ${plan.source} failed: ${(err as Error).message}. Using motion graphics.`);
        if (meta.request.visualMode === "ai_only" && plan.source.startsWith("ai")) throw err;
      }
      store.saveAssets(ctx.id, manifest);
    }
    store.saveAssets(ctx.id, manifest);
    meta.disclosure.containsAiGeneratedMedia = meta.disclosure.containsAiGeneratedMedia || generated;
    if (stock) {
      const credits = manifest.scenes.flatMap((e) => e.history.filter((a) => a.kind === "stock_image" || a.kind === "stock_video")).map((a) => ("attribution" in a ? `${a.sceneId}: ${a.attribution} — ${a.sourceUrl} (${a.license})` : ""));
      fs.writeFileSync(path.join(P(ctx.id).dir, "credits.txt"), credits.join("\n") + "\n");
    }
    store.saveMetadata(meta);
    const failed = manifest.scenes.filter((e) => e.lastError).length;
    return `${manifest.scenes.filter((e) => e.currentAssetId).length} media assets; ${failed} fell back to motion graphics`;
  },

  async clips(ctx) {
    const meta = store.metadata(ctx.id);
    const scenes = effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id));
    const { plans } = loadScratch<{ plans: AssetPlan[] }>(ctx.id, "asset-plan")!;
    const manifest = store.assets(ctx.id);
    const current = (sid: string) => {
      const e = manifest.scenes.find((x) => x.sceneId === sid);
      return e?.history.find((a) => a.id === e.currentAssetId);
    };
    // Only scenes whose current asset is still the generated image (not already a clip, an upload or a fallback).
    const todo = plans.filter((p) => p.source === "ai-video" && current(p.sceneId)?.kind === "generated_image");
    if (!todo.length) return "skipped";
    if (meta.request.clipApproval === "skipped") return `${todo.length} planned clip(s) skipped; animated stills kept`;
    if (meta.request.clipApproval !== "approved") {
      const clips = todo.map((p) => ({ sceneId: p.sceneId, tier: p.clipTier ?? ("hero" as const), model: clipProviderFor(ctx.opts.providers, p.clipTier ?? "hero")?.model ?? "none", estimatedUsd: Math.max(0, p.estimatedUsd - (p.stillUsd ?? 0)) }));
      throw new ClipApprovalRequired(clips, clips.reduce((a, c) => a + c.estimatedUsd, 0));
    }
    const resolveCtx = {
      projectId: ctx.id,
      request: meta.request,
      direction: meta.direction!,
      providers: ctx.opts.providers,
      size: { width: meta.width, height: meta.height },
      renderProceduralStill: ctx.renderer.renderProceduralStill,
      log: (l: "info" | "warn" | "error", m: string) => ctx.log(l, "clips", m),
      cost: (category: "image" | "video" | "stock", provider: string, description: string, usd: number, cached: boolean) => recordCost(ctx.manifest, { category, provider, description, estimatedUsd: usd, cached }),
    };
    // Clips take about a minute each, so a few run at once.
    let made = 0;
    let done = 0;
    const queue = [...todo];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const scene = scenes.find((s) => s.id === p!.sceneId);
        const still = current(p.sceneId);
        if (!scene || !still) continue;
        const clip = await makeClip(resolveCtx, scene, still, p.clipTier ?? "hero");
        if (clip) {
          const entry = sceneEntry(manifest, scene.id);
          entry.history.push(clip);
          entry.currentAssetId = clip.id;
          made++;
          store.saveAssets(ctx.id, manifest);
        }
        ctx.emit({ stage: "clips", status: "progress", progress: ++done / todo.length, message: `${scene.id}: ${clip ? "clip ready" : "kept animated still"}` });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
    store.saveAssets(ctx.id, manifest);
    if (made) {
      meta.disclosure.containsAiGeneratedMedia = true;
      store.saveMetadata(meta);
    }
    return `${made}/${todo.length} clips generated${made < todo.length ? "; the rest keep animated stills" : ""}`;
  },

  async narration(ctx) {
    const meta = store.metadata(ctx.id);
    const scenes = effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id));
    const manifest = store.assets(ctx.id);
    const tts = meta.request.narration && !ctx.opts.offlineDemo ? ctx.opts.providers.tts : (await import("../audio/silent")).silentTts;
    const voiceId = store.edits(ctx.id).voiceId ?? meta.request.voiceId;
    const done = (s: (typeof scenes)[number]) => {
      const existing = manifest.narration.find((n) => n.sceneId === s.id);
      return Boolean(existing && existing.text === s.narration.trim() && (existing.file || !tts.real) && existing.provider === tts.name);
    };
    const note = await tts.prepare?.(scenes.filter((s) => !done(s)).reduce((a, s) => a + s.narration.trim().length, 0));
    if (note) ctx.log("warn", "narration", note);
    // A second pass only runs when the provider changed partway, so the video keeps one voice.
    for (let pass = 0; pass < 2; pass++) {
      const startedOn = tts.name;
      for (const [i, s] of scenes.entries()) {
        if (done(s)) continue;
        ctx.emit({ stage: "narration", status: "progress", progress: i / scenes.length, message: s.id });
        const seg = await synthesizeScene({
          projectId: ctx.id,
          tts,
          scene: s,
          prev: scenes[i - 1],
          next: scenes[i + 1],
          voiceId,
          language: meta.request.language,
          style: meta.direction?.narrationStyle,
          onCost: (usd, cached, description) => recordCost(ctx.manifest, { category: "voice", provider: tts.name, description, estimatedUsd: usd, cached }),
        });
        upsertNarration(manifest, seg);
        store.saveAssets(ctx.id, manifest);
      }
      if (tts.name === startedOn) break;
      ctx.log("warn", "narration", `${startedOn} ran out of credits partway; re-voicing every scene with ${tts.name}`);
    }
    meta.disclosure.containsAiVoice = manifest.narration.some((n) => n.file);
    store.saveMetadata(meta);
    return tts.real ? `${tts.name}: aligned timing` : "silent mode: estimated timing (no narration audio)";
  },

  async timing(ctx) {
    const meta = store.metadata(ctx.id);
    const scenes = effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id));
    const tl = timelineFor(meta, scenes);
    tl.warnings.forEach((w) => ctx.log("warn", "timing", w));
    saveScratch(ctx.id, "timeline", tl);
    meta.durationSeconds = tl.totalFrames / meta.fps;
    store.saveMetadata(meta);
    return `${(tl.totalFrames / meta.fps).toFixed(1)}s total (target ${meta.request.durationSeconds}s)`;
  },

  async captions(ctx) {
    const manifest = store.assets(ctx.id);
    const words = manifest.narration.reduce((a, n) => a + n.words.length, 0);
    const estimated = manifest.narration.some((n) => n.timing === "estimated");
    return `${words} timed words${estimated ? " (estimated timing)" : " (speech alignment)"}`;
  },

  async animation(ctx) {
    const meta = store.metadata(ctx.id);
    const sb = store.storyboard(ctx.id);
    const selected = selectAnimations(meta.direction!, sb.scenes);
    store.saveStoryboard(ctx.id, { ...sb, scenes: selected });
    // music + sound effects belong to the "sound design" part of this stage
    const manifest = store.assets(ctx.id);
    const mood = (meta.direction?.musicMood ?? "none") as MusicMood;
    if (!manifest.music && meta.request.music !== "none" && mood !== "none") {
      const track = pickTrack(mood, meta.request.music);
      const dest = path.join(P(ctx.id).audioDir, "background-music" + (track ? path.extname(track.file) : ".mp3"));
      if (track) {
        fs.copyFileSync(track.path, dest);
        manifest.music = { file: `audio/${path.basename(dest)}`, source: "library", license: track.license, mood };
      } else {
        await generateProceduralMusic(mood, dest);
        manifest.music = { file: "audio/background-music.mp3", source: "procedural-demo", license: "Synthesised locally by the studio (no third-party rights)", mood };
        ctx.log("info", "animation", "No licensed track for this mood in music/; using locally synthesised placeholder music.");
      }
    }
    const wantSfx = meta.request.soundEffects || PRESETS[meta.request.quality].soundEffects || ctx.opts.offlineDemo;
    if (wantSfx && !manifest.sfx.length) {
      for (const s of selected.filter((x) => x.sfx)) {
        const file = `audio/sfx-${s.id}-${s.sfx}.mp3`;
        const abs = path.join(P(ctx.id).dir, file);
        if (ctx.opts.providers.sfx && !ctx.opts.offlineDemo) {
          const res = await ctx.opts.providers.sfx.generate(`${s.sfx} sound effect, short, clean, for a short-form video`, 2);
          fs.writeFileSync(abs, res.audio);
          recordCost(ctx.manifest, { category: "sfx", provider: ctx.opts.providers.sfx.name, description: `${s.id} ${s.sfx}`, estimatedUsd: res.cost.estimatedUsd, actualUsd: res.cost.actualUsd });
          manifest.sfx.push({ sceneId: s.id, kind: s.sfx!, file, provider: ctx.opts.providers.sfx.name, costUsd: res.cost.actualUsd ?? res.cost.estimatedUsd });
        } else {
          await generateProceduralSfx(s.sfx as SfxKind, abs);
          manifest.sfx.push({ sceneId: s.id, kind: s.sfx!, file, provider: "procedural", costUsd: 0 });
        }
      }
    }
    store.saveAssets(ctx.id, manifest);
    return `transitions: ${selected.map((s) => s.transitionIn).join(", ")}`;
  },

  async compose(ctx) {
    const force = Boolean(ctx.opts.rerun?.includes("compose"));
    const res = composeEditable(ctx.id, { force });
    return `${res.reason}: ${path.relative(P(ctx.id).dir, res.file)}`;
  },

  async preview(ctx) {
    if (ctx.opts.skipRender) return "skipped";
    const out = await ctx.renderer.renderVideo(ctx.id, "draft", (p) => ctx.emit({ stage: "preview", status: "progress", progress: p.progress }));
    return path.relative(P(ctx.id).dir, out.file);
  },

  async quality(ctx) {
    if (ctx.opts.skipRender) return "skipped";
    const file = path.join(P(ctx.id).outputDir, "draft.mp4");
    const report = await ctx.renderer.checkRender(ctx.id, file, { expectCaptions: true, scale: 0.5 });
    report.checks.filter((c) => !c.ok).forEach((c) => ctx.log(c.severity === "error" ? "error" : "warn", "quality", `${c.name}: ${c.detail}`));
    const errors = report.checks.filter((c) => !c.ok && c.severity === "error");
    if (errors.length) throw new Error(`Quality checks failed: ${errors.map((e) => `${e.name} (${e.detail})`).join("; ")}`);
    return `${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks passed`;
  },

  async save(ctx) {
    const meta = store.metadata(ctx.id);
    const cap = exportCaptions(ctx.id);
    const labels: string[] = [];
    if (meta.disclosure.containsAiGeneratedMedia) labels.push("AI-generated imagery");
    if (meta.disclosure.containsAiVoice) labels.push("AI voice");
    if (meta.disclosure.containsAiScript) labels.push("AI-assisted script");
    meta.disclosure.label = labels.length ? `Contains ${labels.join(", ")}` : meta.mode === "offline-demo" ? "Offline demo: procedural visuals, hand-written script, no AI services called" : "No AI-generated media";
    const hints = loadScratch<PromptHints>(ctx.id, "hints")!;
    const sb = store.storyboard(ctx.id);
    const assets = store.assets(ctx.id);
    meta.contentFlags = checkContent({
      direction: meta.direction!,
      scenes: effectiveScenes(sb, store.edits(ctx.id)),
      hints,
      retrievalAvailable: false,
      usesGeneratedMedia: meta.disclosure.containsAiGeneratedMedia,
      usesStock: assets.scenes.some((e) => e.history.some((a) => a.kind.startsWith("stock"))),
    });
    meta.requiresReview = requiresReview(meta.contentFlags);
    store.saveMetadata(meta);
    return `captions: ${cap.cues} cues; ${meta.disclosure.label}`;
  },

  async export(ctx) {
    if (ctx.opts.skipRender || ctx.opts.skipExport) return "skipped";
    const meta = store.metadata(ctx.id);
    await ctx.renderer.renderVideo(ctx.id, "final", (p) => ctx.emit({ stage: "export", status: "progress", progress: p.progress * 0.6, message: "final.mp4" }));
    if (meta.request.captions) await ctx.renderer.renderVideo(ctx.id, "clean", (p) => ctx.emit({ stage: "export", status: "progress", progress: 0.6 + p.progress * 0.3, message: "clean.mp4" }));
    await ctx.renderer.renderThumbnail(ctx.id);
    const assets = store.assets(ctx.id);
    const tl = timelineFor(meta, effectiveScenes(store.storyboard(ctx.id), store.edits(ctx.id)));
    const narration = await buildContinuousNarration(ctx.id, assets, tl, meta.fps).catch((e) => {
      ctx.log("warn", "export", `continuous narration track not built: ${(e as Error).message}`);
      return null;
    });
    if (assets.music || narration) await ctx.renderer.renderAudioMix(ctx.id);
    return `final.mp4${meta.request.captions ? ", clean.mp4" : ""}, thumbnail.png, captions.srt${narration ? ", narration.mp3" : ""}`;
  },
};

export const stageNames = STAGES;
export { budgetFor };
