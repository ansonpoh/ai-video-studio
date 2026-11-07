/**
 * Server-side helpers shared by the web UI's route handlers and pages.
 * Never import this from client components: it reads the filesystem and the
 * environment (API keys stay on the server).
 */
import fs from "node:fs";
import path from "node:path";
import { P, store } from "../pipeline/store";
import { projectDetails } from "../pipeline/operations";
import { costSummary, PRESETS } from "../pipeline/budget";
import { env, publicCapabilities } from "../config/env";
import { listLibrary } from "../audio/music-library";
import { latestJob, listJobs, view, JobConflict } from "./jobs";
import type { ProjectMetadata } from "../schemas/project";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** Maps thrown errors to JSON responses; budget gates become 402 with the breakdown. */
export const errorResponse = (err: unknown) => {
  const e = err as Error & { breakdown?: unknown; estimateUsd?: number; budgetUsd?: number; job?: unknown };
  if (e?.name === "BudgetApprovalRequired") {
    const estimateUsd = e.estimateUsd ?? 0;
    return json({ error: e.message, budget: { estimateUsd, budgetUsd: e.budgetUsd ?? 0, approveUsd: Math.ceil(estimateUsd * 100) / 100, breakdown: e.breakdown ?? [] } }, 402);
  }
  if (e instanceof JobConflict) return json({ error: e.message, job: e.job }, 409);
  if (e?.name === "MissingCredentialsError") return json({ error: e.message }, 412);
  const msg = e?.message ?? String(err);
  if (/^Invalid project id/.test(msg)) return json({ error: msg }, 400);
  if (/ENOENT/.test(msg)) return json({ error: "Not found" }, 404);
  return json({ error: msg }, 500);
};

/** Validates the id (P() rejects malformed ids) and that the project exists. */
export const requireProject = (id: string) => {
  const p = P(id);
  if (!fs.existsSync(p.metadata)) throw Object.assign(new Error(`ENOENT: project ${id}`), { code: "ENOENT" });
  return p;
};

export const readProgress = (id: string): { stage: string; status: string; progress?: number; message?: string; at: string } | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(P(id).dir, "progress.json"), "utf8"));
  } catch {
    return null;
  }
};

const outputFile = (id: string, ...rel: string[]) => {
  const f = path.join(P(id).dir, ...rel);
  return fs.existsSync(f) ? rel.join("/") : null;
};

export type ProjectCard = {
  id: string;
  title: string;
  status: ProjectMetadata["status"];
  mode: ProjectMetadata["mode"];
  durationSeconds: number | null;
  createdAt: string;
  aspectRatio: string;
  width: number;
  height: number;
  thumbnail: string | null;
  quality: string;
  running: boolean;
  requiresReview: boolean;
};

export const projectCards = (): ProjectCard[] =>
  store.list().map((m) => {
    const running = listJobs(m.id).some((j) => view(j).status === "running");
    return {
      id: m.id,
      title: m.title,
      status: m.status,
      mode: m.mode,
      durationSeconds: m.durationSeconds ?? null,
      createdAt: m.createdAt,
      aspectRatio: m.request.aspectRatio,
      width: m.width,
      height: m.height,
      thumbnail: outputFile(m.id, "output", "thumbnail.png") ?? outputFile(m.id, "output", "frames", "scene-01.jpg"),
      quality: m.request.quality,
      running,
      requiresReview: m.requiresReview,
    };
  });

/** Everything the review screen needs, in one JSON payload (no secrets). */
export const reviewPayload = (id: string) => {
  requireProject(id);
  const d = projectDetails(id);
  const p = P(id);
  const frames = path.join(p.outputDir, "frames");
  const frameFiles = fs.existsSync(frames) ? fs.readdirSync(frames).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort() : [];
  const downloads = [
    { label: "Final video", file: "output/final.mp4" },
    { label: "Caption-free video", file: "output/clean.mp4" },
    { label: "Draft preview", file: "output/draft.mp4" },
    { label: "Captions (SRT)", file: "captions/captions.srt" },
    { label: "Word timings (JSON)", file: "captions/timings.json" },
    { label: "Audio mix", file: "output/audio-mix.mp3" },
    { label: "Thumbnail", file: "output/thumbnail.png" },
    { label: "Credits", file: "credits.txt" },
  ].filter((x) => fs.existsSync(path.join(p.dir, x.file)));
  const video = outputFile(id, "output", "final.mp4") ?? outputFile(id, "output", "draft.mp4");
  const stat = video ? fs.statSync(path.join(p.dir, video)) : null;
  return {
    meta: d.meta,
    scenes: d.scenes.map((s, i) => ({
      ...s,
      previewFrame: frameFiles[i] ? `output/frames/${frameFiles[i]}` : null,
    })),
    edits: d.edits,
    stages: d.manifest.stages,
    log: d.manifest.log.slice(-40),
    costs: costSummary(d.manifest),
    costEntries: d.manifest.costs.slice(-60),
    music: d.music,
    editable: { exists: d.editable.exists, userModified: d.editable.userModified, path: path.relative(p.dir, d.editable.path) },
    outputs: d.outputs,
    resolution: d.resolution,
    video: video ? { file: video, version: stat ? Math.round(stat.mtimeMs) : 0, isFinal: video.endsWith("final.mp4") } : null,
    downloads,
    progress: readProgress(id),
    job: latestJob(id),
  };
};
export type ReviewPayload = ReturnType<typeof reviewPayload>;

/** Price assumptions used for estimates (numbers only, no credentials). */
const prices = () => {
  const e = env();
  return {
    defaultBudgetUsd: e.MAX_GENERATION_BUDGET_USD,
    llmRun: 0.15,
    image: { low: e.PRICE_IMAGE_LOW, medium: e.PRICE_IMAGE_MEDIUM, high: e.PRICE_IMAGE_HIGH },
    videoPerSecond: e.PRICE_VIDEO_PER_SECOND,
    /** null when no cheap background model is configured (those scenes stay animated stills). */
    backgroundVideoPerSecond: e.VIDEO_BACKGROUND_MODEL ? e.PRICE_VIDEO_BACKGROUND_PER_SECOND : null,
    clipSeconds: e.VIDEO_CLIP_SECONDS,
    ttsPer1kChars: e.PRICE_TTS_PER_1K_CHARS,
    sfxPerSecond: e.PRICE_SFX_PER_SECOND,
  };
};
export type Prices = ReturnType<typeof prices>;

export const createOptions = () => ({
  capabilities: publicCapabilities(),
  music: listLibrary().map((t) => ({ file: t.file, moods: t.moods, license: t.license })),
  presets: PRESETS,
  prices: prices(),
});
export type CreateOptions = ReturnType<typeof createOptions>;
