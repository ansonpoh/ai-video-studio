/**
 * Visual asset planning and resolution. Decides, per scene, whether to use an
 * AI image, AI clip, stock media, a procedural still or live motion graphics,
 * then produces the files with caching, versioning and honest failure records.
 */
import fs from "node:fs";
import path from "node:path";
import type { Scene, CreativeDirection } from "../schemas/storyboard";
import type { Asset, AssetManifest, SceneAssets } from "../schemas/project";
import type { VideoRequest } from "../schemas/options";
import type { Providers } from "../providers/types";
import { PRESETS, type PlannedCost } from "./budget";
import { cacheDir, P, sha256 } from "./store";
import { THEME_TOKENS } from "../video/themes/themes";
import { env } from "../config/env";

const clipSecondsFor = (_s: Scene) => env().VIDEO_CLIP_SECONDS;

export type AssetPlan = {
  sceneId: string;
  source: "ai-image" | "ai-video" | "stock-image" | "stock-video" | "procedural-still" | "live-art" | "keep";
  reason: string;
  estimatedUsd: number;
  /** For ai-video: "hero" uses VIDEO_MODEL, "background" the cheaper VIDEO_BACKGROUND_MODEL. */
  clipTier?: "hero" | "background";
  /** For ai-video: the still's share of estimatedUsd (the clip is the rest). */
  stillUsd?: number;
};

const LIVE_TYPES = ["diagram", "motion_graphics", "animated_text"];
const FULL_BLEED = ["cinematic_image", "video_clip", "mixed_media"];

/**
 * Which scenes get real AI clips. Hook first (hybrid), then scenes the director
 * asked to be clips, then scenes it flagged as wanting motion; background clips
 * (hybrid, cheap model) go to the remaining full-bleed image scenes, spread out.
 */
export const pickClipScenes = (scenes: Scene[], request: VideoRequest, providers: Providers, offlineDemo: boolean) => {
  const rules = PRESETS[request.quality];
  const out = new Map<string, "hero" | "background">();
  if (offlineDemo || request.visualMode === "procedural_only" || !providers.images || request.clipApproval === "skipped") return out;
  const stockAllowed = request.visualMode !== "ai_only" && Boolean(providers.stock);
  const eligible = scenes.filter((s) => !LIVE_TYPES.includes(s.visual.type) && s.layout !== "diagram" && !(s.visual.type.startsWith("stock") && stockAllowed));
  if (providers.video && rules.maxVideoClips > 0) {
    const ranked: Scene[] = [];
    const add = (s: Scene | undefined) => s && !ranked.includes(s) && ranked.push(s);
    if (request.quality === "hybrid") add(eligible.find((s) => s.id === scenes[0]?.id));
    eligible.filter((s) => s.visual.type === "generated_video").forEach(add);
    eligible.filter((s) => s.visual.wantsMotionClip).forEach(add);
    ranked.slice(0, rules.maxVideoClips).forEach((s) => out.set(s.id, "hero"));
  }
  const bg = providers.videoBackground;
  if (bg && rules.backgroundClips > 0) {
    const rest = eligible.filter((s) => !out.has(s.id) && FULL_BLEED.includes(s.layout));
    const n = Math.min(rules.backgroundClips, rest.length);
    for (let k = 0; k < n; k++) out.set(rest[Math.floor(((k + 0.5) * rest.length) / n)].id, "background");
  }
  return out;
};

const portrait = (req: VideoRequest) => (req.aspectRatio === "9:16" || req.aspectRatio === "4:5" ? "portrait" : req.aspectRatio === "1:1" ? "square" : "landscape");

/** The image model for this request: budget stills when the preset asks for them and one is configured. */
export const imageProviderFor = (providers: Providers, request: VideoRequest) => (PRESETS[request.quality].budgetImages && providers.imagesBudget) || providers.images;

/** Generation size matching the video's orientation. */
export const imageSizeFor = (request: VideoRequest) => {
  const o = portrait(request);
  return o === "landscape" ? { width: 1536, height: 864 } : o === "square" ? { width: 1024, height: 1024 } : { width: 1024, height: 1536 };
};

const COMPOSITION = { portrait: "vertical composition", landscape: "wide landscape composition", square: "square composition" };

export class AiOnlyUnavailable extends Error {
  constructor(sceneId: string) {
    super(`Scene ${sceneId}: "AI-only" visuals were requested but no image generation provider is configured (set OPENAI_API_KEY), so stock media will not be substituted. Use the offline demo or switch visual mode.`);
  }
}

/** Pure planning step (no network), so budgets can be checked before anything is spent. */
export const planAssets = (opts: {
  scenes: Scene[];
  request: VideoRequest;
  providers: Providers;
  manifest: AssetManifest;
  offlineDemo: boolean;
  only?: string[];
  force?: boolean;
}): AssetPlan[] => {
  const { scenes, request, providers } = opts;
  const rules = PRESETS[request.quality];
  const clipScenes = pickClipScenes(scenes, request, providers, opts.offlineDemo);
  const plans: AssetPlan[] = [];
  for (const s of scenes) {
    if (opts.only && !opts.only.includes(s.id)) continue;
    const existing = opts.manifest.scenes.find((x) => x.sceneId === s.id);
    const cur = existing?.history.find((a) => a.id === existing.currentAssetId);
    if (cur && !opts.force) {
      plans.push({ sceneId: s.id, source: "keep", reason: cur.kind === "uploaded" ? "user-provided media is never replaced automatically" : "asset already resolved", estimatedUsd: 0 });
      continue;
    }
    const t = s.visual.type;
    const imgReq = { prompt: s.visual.prompt ?? s.visual.description, ...imageSizeFor(request), quality: rules.imageQuality };
    const imageModel = imageProviderFor(providers, request);
    const imageCost = imageModel ? imageModel.estimateUsd(imgReq) : 0;
    if (LIVE_TYPES.includes(t) || s.layout === "diagram") {
      plans.push({ sceneId: s.id, source: "live-art", reason: "programmatic motion graphics", estimatedUsd: 0 });
      continue;
    }
    if (request.visualMode === "procedural_only" || opts.offlineDemo) {
      plans.push({ sceneId: s.id, source: s.visual.art ? "procedural-still" : "live-art", reason: opts.offlineDemo ? "offline demo: procedural imagery" : "procedural-only mode", estimatedUsd: 0 });
      continue;
    }
    const stockAllowed = request.visualMode !== "ai_only" && Boolean(providers.stock);
    const tier = clipScenes.get(s.id);
    const clipProvider = tier === "background" ? providers.videoBackground : providers.video;
    if (tier && clipProvider) {
      const v = clipProvider.estimateUsd({ prompt: imgReq.prompt, durationSeconds: clipSecondsFor(s), aspectRatio: request.aspectRatio, resolution: "720p" });
      const reason = tier === "background" ? "background shot: cheap clip model" : s.id === scenes[0]?.id && request.quality === "hybrid" ? "hook: real motion grabs attention" : "key moment: benefits from real motion";
      plans.push({ sceneId: s.id, source: "ai-video", clipTier: tier, reason, estimatedUsd: imageCost + v, stillUsd: imageCost });
      continue;
    }
    if ((t === "stock_video" || t === "stock_image") && stockAllowed) {
      plans.push({ sceneId: s.id, source: t === "stock_video" ? "stock-video" : "stock-image", reason: "licensed stock fits this scene", estimatedUsd: 0 });
      continue;
    }
    if (providers.images) {
      plans.push({ sceneId: s.id, source: "ai-image", reason: t.startsWith("stock") ? "stock not allowed/available; generated instead" : "generated image", estimatedUsd: imageCost });
      continue;
    }
    if (request.visualMode === "ai_only") throw new AiOnlyUnavailable(s.id);
    if (request.visualMode === "stock_preferred" && providers.stock) {
      plans.push({ sceneId: s.id, source: "stock-image", reason: "no image generator; stock preferred", estimatedUsd: 0 });
      continue;
    }
    plans.push({ sceneId: s.id, source: s.visual.art ? "procedural-still" : "live-art", reason: "no image provider configured; procedural visuals", estimatedUsd: 0 });
  }
  return plans;
};

export const plannedCosts = (plans: AssetPlan[], providers: Providers, request: VideoRequest): PlannedCost[] =>
  plans
    .filter((p) => p.estimatedUsd > 0)
    .map((p) => ({
      category: p.source === "ai-video" ? "video" : "image",
      provider: p.source === "ai-video" ? `${clipProviderFor(providers, p.clipTier ?? "hero")?.model}` : `${imageProviderFor(providers, request)?.name}`,
      description: `${p.sceneId}: ${p.source === "ai-video" ? `still + ${p.clipTier ?? "hero"} clip` : p.source}`,
      estimatedUsd: p.estimatedUsd,
    }));

/* ------------------------------------------------------------- resolution */

const mediaCache = () => path.join(cacheDir(), "media");
const cached = (key: string, ext: string) => {
  const f = path.join(mediaCache(), `${key}.${ext}`);
  return fs.existsSync(f) ? f : null;
};
const putCache = (key: string, ext: string, data: Buffer) => {
  fs.mkdirSync(mediaCache(), { recursive: true });
  const f = path.join(mediaCache(), `${key}.${ext}`);
  fs.writeFileSync(f, data);
  return f;
};

export const sceneEntry = (m: AssetManifest, sceneId: string): SceneAssets => {
  let e = m.scenes.find((s) => s.sceneId === sceneId);
  if (!e) {
    e = { sceneId, currentAssetId: null, history: [] };
    m.scenes.push(e);
  }
  return e;
};

export const nextVersionFile = (projectId: string, sceneId: string, tag: string, ext: string) => {
  const dir = P(projectId).assetsDir;
  fs.mkdirSync(dir, { recursive: true });
  for (let v = 1; v < 1000; v++) {
    const rel = `assets/${sceneId}-${tag}-v${v}.${ext}`;
    if (!fs.existsSync(path.join(P(projectId).dir, rel))) return rel;
  }
  throw new Error("too many asset versions");
};

export type ResolveContext = {
  projectId: string;
  request: VideoRequest;
  direction: CreativeDirection;
  providers: Providers;
  log: (level: "info" | "warn" | "error", msg: string) => void;
  cost: (category: "image" | "video" | "stock", provider: string, description: string, usd: number, cached: boolean) => void;
  renderProceduralStill: (props: { art: string; primaryColor: string; accentColor: string; backgroundColor: string; labels: string; seed: number }, output: string, size: { width: number; height: number }) => Promise<string>;
  size: { width: number; height: number };
  /** Set to request a fresh variant: bypasses the media cache for this call. */
  variant?: string;
};

const stylePrompt = (s: Scene, d: CreativeDirection, request: VideoRequest, override?: string) =>
  [s.visual.prompt ?? s.visual.description, override ?? d.visualStyle.imageStylePrompt, `${COMPOSITION[portrait(request)]}, cinematic lighting, no text, no letters, no logos, no watermarks`].filter(Boolean).join(". ");

/** Produces the asset for one scene according to its plan; returns the new Asset or null for live art. */
export const resolveSceneAsset = async (ctx: ResolveContext, scene: Scene, plan: AssetPlan, index: number, styleOverride?: string): Promise<Asset | null> => {
  const now = new Date().toISOString();
  const { projectId, providers, request, direction } = ctx;
  const rules = PRESETS[request.quality];
  const dirOf = (rel: string) => path.join(P(projectId).dir, rel);

  const makeImage = async (): Promise<Asset> => {
    const images = imageProviderFor(providers, request);
    if (!images) throw new Error("no image provider");
    const prompt = stylePrompt(scene, direction, request, styleOverride);
    const req = { prompt, ...imageSizeFor(request), quality: rules.imageQuality };
    const key = sha256(`${images.name}|${images.model}|${prompt}|${req.width}x${req.height}|${req.quality}${ctx.variant ? `|${ctx.variant}` : ""}`);
    let file: string;
    let usd = 0;
    let model = images.model;
    let revised: string | undefined;
    const hit = cached(key, "png") ?? cached(key, "jpg") ?? cached(key, "webp");
    if (hit) {
      file = nextVersionFile(projectId, scene.id, "img", path.extname(hit).slice(1));
      fs.copyFileSync(hit, dirOf(file));
      ctx.cost("image", images.name, `${scene.id} image (cache hit)`, 0, true);
    } else {
      const res = await images.generate(req);
      putCache(key, res.extension, res.data);
      file = nextVersionFile(projectId, scene.id, "img", res.extension);
      fs.writeFileSync(dirOf(file), res.data);
      usd = res.cost.actualUsd ?? res.cost.estimatedUsd;
      model = res.model;
      revised = res.revisedPrompt;
      ctx.cost("image", images.name, `${scene.id} image`, usd, false);
    }
    return { kind: "generated_image", id: `${scene.id}-${path.basename(file)}`, sceneId: scene.id, file, createdAt: now, provider: images.name, model, prompt, revisedPrompt: revised, costUsd: usd, cacheKey: key, width: req.width, height: req.height };
  };

  switch (plan.source) {
    case "keep":
    case "live-art":
      return null;
    case "procedural-still": {
      const art = scene.visual.art ?? "aurora-gradient";
      const pal = direction.visualStyle.palette;
      const props = { art, primaryColor: pal.primary, accentColor: pal.accent, backgroundColor: pal.background, labels: "", seed: index + 1 };
      const key = sha256(`procedural|${JSON.stringify(props)}|${ctx.size.width}x${ctx.size.height}`);
      const file = nextVersionFile(projectId, scene.id, "still", "png");
      const hit = cached(key, "png");
      if (hit) fs.copyFileSync(hit, dirOf(file));
      else {
        await ctx.renderProceduralStill(props, dirOf(file), ctx.size);
        putCache(key, "png", fs.readFileSync(dirOf(file)));
      }
      void THEME_TOKENS;
      return { kind: "procedural_image", id: `${scene.id}-${path.basename(file)}`, sceneId: scene.id, file, createdAt: now, provider: "procedural", art, seed: index + 1, costUsd: 0, cacheKey: key, width: ctx.size.width, height: ctx.size.height };
    }
    case "ai-image":
      return makeImage();
    case "ai-video": {
      const still = await makeImage();
      const clip = await makeClip(ctx, scene, still, plan.clipTier ?? "hero");
      return clip ?? still;
    }
    case "stock-image":
    case "stock-video": {
      const stock = providers.stock;
      if (!stock) throw new Error("no stock provider");
      const kind = plan.source === "stock-video" ? "video" : "image";
      const query = scene.visual.stockQuery ?? scene.visual.description;
      const results = await stock.search(query, { kind, orientation: portrait(request), perPage: 15 });
      if (!results.length) throw new Error(`Stock search returned no results for "${query}"`);
      const best = results[0];
      const data = await stock.download(best);
      const ext = kind === "video" ? "mp4" : "jpg";
      const file = nextVersionFile(projectId, scene.id, "stock", ext);
      fs.writeFileSync(dirOf(file), data);
      ctx.cost("stock", stock.name, `${scene.id} stock ${kind}`, 0, false);
      return {
        kind: kind === "video" ? "stock_video" : "stock_image",
        id: `${scene.id}-${path.basename(file)}`,
        sceneId: scene.id,
        file,
        createdAt: now,
        provider: "pexels",
        query,
        sourceUrl: best.pageUrl,
        author: best.author,
        authorUrl: best.authorUrl,
        license: stock.license,
        attribution: stock.attribution(best),
        width: best.width,
        height: best.height,
        durationSeconds: best.durationSeconds,
        costUsd: 0,
      };
    }
  }
};

/** The video provider for a clip tier (background falls back to the hero model when no cheap model is set). */
export const clipProviderFor = (providers: Providers, tier: "hero" | "background") => (tier === "background" ? providers.videoBackground ?? providers.video : providers.video);

/**
 * Animates an existing still into a clip. Returns null when there is no video
 * provider or generation fails (the scene keeps its animated still).
 */
export const makeClip = async (ctx: ResolveContext, scene: Scene, still: Asset, tier: "hero" | "background"): Promise<Asset | null> => {
  const { projectId, request, direction } = ctx;
  const video = clipProviderFor(ctx.providers, tier);
  if (!video) return null;
  const dirOf = (rel: string) => path.join(P(projectId).dir, rel);
  const prompt = `${scene.visual.prompt ?? scene.visual.description}. Subtle, cinematic camera motion. ${direction.visualStyle.imageStylePrompt}`;
  const req = { prompt, imageFile: dirOf(still.file), durationSeconds: clipSecondsFor(scene), aspectRatio: request.aspectRatio, resolution: "720p" as const };
  const key = sha256(`${video.name}|${video.model}|${prompt}|${"cacheKey" in still ? still.cacheKey : still.id}|${req.durationSeconds}${ctx.variant ? `|${ctx.variant}` : ""}`);
  const hit = cached(key, "mp4");
  const file = nextVersionFile(projectId, scene.id, "clip", "mp4");
  let usd = 0;
  if (hit) {
    fs.copyFileSync(hit, dirOf(file));
    ctx.cost("video", video.name, `${scene.id} clip (cache hit)`, 0, true);
  } else {
    try {
      const res = await video.generate(req);
      putCache(key, "mp4", res.data);
      fs.writeFileSync(dirOf(file), res.data);
      usd = res.cost.actualUsd ?? res.cost.estimatedUsd;
      ctx.cost("video", video.name, `${scene.id} ${tier} clip (${video.model})`, usd, false);
    } catch (err) {
      ctx.log("warn", `${scene.id}: video generation failed (${(err as Error).message}); using the animated still instead`);
      return null;
    }
  }
  return { kind: "generated_video", id: `${scene.id}-${path.basename(file)}`, sceneId: scene.id, file, createdAt: new Date().toISOString(), provider: video.name, model: video.model, prompt, sourceImageAssetId: still.id, costUsd: usd, cacheKey: key, durationSeconds: req.durationSeconds };
};
