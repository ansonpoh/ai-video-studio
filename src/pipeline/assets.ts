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

export type AssetPlan = {
  sceneId: string;
  source: "ai-image" | "ai-video" | "stock-image" | "stock-video" | "procedural-still" | "live-art" | "keep";
  reason: string;
  estimatedUsd: number;
};

const portrait = (req: VideoRequest) => (req.aspectRatio === "9:16" || req.aspectRatio === "4:5" ? "portrait" : req.aspectRatio === "1:1" ? "square" : "landscape");

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
  let clips = 0;
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
    const imgReq = { prompt: s.visual.prompt ?? s.visual.description, width: 1024, height: 1536, quality: rules.imageQuality };
    const imageCost = providers.images ? providers.images.estimateUsd(imgReq) : 0;
    const liveTypes = ["diagram", "motion_graphics", "animated_text"];
    if (liveTypes.includes(t) || s.layout === "diagram") {
      plans.push({ sceneId: s.id, source: "live-art", reason: "programmatic motion graphics", estimatedUsd: 0 });
      continue;
    }
    if (request.visualMode === "procedural_only" || opts.offlineDemo) {
      plans.push({ sceneId: s.id, source: s.visual.art ? "procedural-still" : "live-art", reason: opts.offlineDemo ? "offline demo: procedural imagery" : "procedural-only mode", estimatedUsd: 0 });
      continue;
    }
    const stockAllowed = request.visualMode !== "ai_only" && Boolean(providers.stock);
    if (t === "generated_video" || (s.visual.wantsMotionClip && rules.maxVideoClips > 0)) {
      if (providers.video && clips < rules.maxVideoClips && providers.images) {
        clips++;
        const v = providers.video.estimateUsd({ prompt: imgReq.prompt, durationSeconds: 5, aspectRatio: request.aspectRatio, resolution: "720p" });
        plans.push({ sceneId: s.id, source: "ai-video", reason: "scene benefits from real motion", estimatedUsd: imageCost + v });
        continue;
      }
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

export const plannedCosts = (plans: AssetPlan[], providers: Providers): PlannedCost[] =>
  plans
    .filter((p) => p.estimatedUsd > 0)
    .map((p) => ({
      category: p.source === "ai-video" ? "video" : "image",
      provider: p.source === "ai-video" ? `${providers.video?.name}` : `${providers.images?.name}`,
      description: `${p.sceneId}: ${p.source}`,
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
};

const stylePrompt = (s: Scene, d: CreativeDirection, override?: string) =>
  [s.visual.prompt ?? s.visual.description, override ?? d.visualStyle.imageStylePrompt, "vertical composition, cinematic lighting, no text, no letters, no logos, no watermarks"].filter(Boolean).join(". ");

/** Produces the asset for one scene according to its plan; returns the new Asset or null for live art. */
export const resolveSceneAsset = async (ctx: ResolveContext, scene: Scene, plan: AssetPlan, index: number, styleOverride?: string): Promise<Asset | null> => {
  const now = new Date().toISOString();
  const { projectId, providers, request, direction } = ctx;
  const rules = PRESETS[request.quality];
  const dirOf = (rel: string) => path.join(P(projectId).dir, rel);

  const makeImage = async (): Promise<Asset> => {
    if (!providers.images) throw new Error("no image provider");
    const prompt = stylePrompt(scene, direction, styleOverride);
    const req = { prompt, width: 1024, height: portrait(request) === "landscape" ? 1024 : 1536, quality: rules.imageQuality };
    const key = sha256(`${providers.images.name}|${providers.images.model}|${prompt}|${req.width}x${req.height}|${req.quality}`);
    let file: string;
    let usd = 0;
    let model = providers.images.model;
    let revised: string | undefined;
    const hit = cached(key, "png") ?? cached(key, "jpg") ?? cached(key, "webp");
    if (hit) {
      file = nextVersionFile(projectId, scene.id, "img", path.extname(hit).slice(1));
      fs.copyFileSync(hit, dirOf(file));
      ctx.cost("image", providers.images.name, `${scene.id} image (cache hit)`, 0, true);
    } else {
      const res = await providers.images.generate(req);
      putCache(key, res.extension, res.data);
      file = nextVersionFile(projectId, scene.id, "img", res.extension);
      fs.writeFileSync(dirOf(file), res.data);
      usd = res.cost.actualUsd ?? res.cost.estimatedUsd;
      model = res.model;
      revised = res.revisedPrompt;
      ctx.cost("image", providers.images.name, `${scene.id} image`, usd, false);
    }
    return { kind: "generated_image", id: `${scene.id}-${path.basename(file)}`, sceneId: scene.id, file, createdAt: now, provider: providers.images.name, model, prompt, revisedPrompt: revised, costUsd: usd, cacheKey: key, width: req.width, height: req.height };
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
      if (!providers.video) return still;
      const prompt = `${scene.visual.prompt ?? scene.visual.description}. Subtle, cinematic camera motion. ${direction.visualStyle.imageStylePrompt}`;
      const req = { prompt, imageFile: dirOf(still.file), durationSeconds: 5, aspectRatio: request.aspectRatio, resolution: "720p" as const };
      const key = sha256(`${providers.video.name}|${providers.video.model}|${prompt}|${still.cacheKey}|${req.durationSeconds}`);
      const hit = cached(key, "mp4");
      const file = nextVersionFile(projectId, scene.id, "clip", "mp4");
      let usd = 0;
      if (hit) {
        fs.copyFileSync(hit, dirOf(file));
        ctx.cost("video", providers.video.name, `${scene.id} clip (cache hit)`, 0, true);
      } else {
        try {
          const res = await providers.video.generate(req);
          putCache(key, "mp4", res.data);
          fs.writeFileSync(dirOf(file), res.data);
          usd = res.cost.actualUsd ?? res.cost.estimatedUsd;
          ctx.cost("video", providers.video.name, `${scene.id} clip`, usd, false);
        } catch (err) {
          ctx.log("warn", `${scene.id}: video generation failed (${(err as Error).message}); using the animated still instead`);
          return still;
        }
      }
      return { kind: "generated_video", id: `${scene.id}-${path.basename(file)}`, sceneId: scene.id, file, createdAt: now, provider: providers.video.name, model: providers.video.model, prompt, sourceImageAssetId: still.id, costUsd: usd, cacheKey: key, durationSeconds: req.durationSeconds };
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
