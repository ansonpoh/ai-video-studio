/**
 * Rendering: bundles a single project's editable composition and renders
 * MP4 (draft/final/caption-free), audio-only mixes, thumbnails and stills via
 * @remotion/renderer. Everything reads the editable source, so Studio edits
 * are always what gets rendered.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ROOT, P, cacheDir, sha256, store } from "../pipeline/store";
import { readSceneSpans } from "../editable/ast";
import { writeRenderEntry } from "../editable/registry";

export type RenderKind = "draft" | "final" | "clean";
export type Progress = (p: { stage: string; progress: number; message?: string }) => void;

const browserExecutable = () => process.env.REMOTION_BROWSER_EXECUTABLE || null;
const rOpts = () => ({ browserExecutable: browserExecutable(), logLevel: (process.env.REMOTION_LOG_LEVEL as "error" | "warn" | "info" | "verbose" | undefined) ?? "error" });
const concurrency = () => Number(process.env.RENDER_CONCURRENCY || Math.max(1, Math.min(8, os.cpus().length)));

/** Copies only this project's media into a private public dir so bundles stay small and isolated. */
const stagePublicDir = (id: string) => {
  const pub = path.join(cacheDir(), "public", id);
  const target = path.join(pub, id);
  fs.rmSync(pub, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const src = P(id).dir;
  fs.cpSync(src, target, {
    recursive: true,
    filter: (f) => {
      const rel = path.relative(src, f);
      return !rel.startsWith("output") && !rel.startsWith("history") && !rel.startsWith(".cache");
    },
  });
  return pub;
};

const bundleCache = new Map<string, string>();

export const bundleProject = async (id: string, onProgress?: Progress) => {
  const { entry, composition } = writeRenderEntry(id);
  const editable = fs.readFileSync(P(id).editable, "utf8");
  const key = `${id}:${sha256(editable)}:${sha256(JSON.stringify(fs.readdirSync(P(id).assetsDir)))}`;
  const cached = bundleCache.get(key);
  if (cached && fs.existsSync(cached)) return { serveUrl: cached, composition };
  const publicDir = stagePublicDir(id);
  const serveUrl = await bundle({
    entryPoint: entry,
    publicDir,
    rootDir: ROOT,
    outDir: path.join(cacheDir(), "bundles", id),
    onProgress: (p) => onProgress?.({ stage: "bundle", progress: p / 100 }),
    enableCaching: true,
  });
  bundleCache.set(key, serveUrl);
  return { serveUrl, composition };
};

export const currentDurationFrames = (id: string) => {
  const meta = store.metadata(id);
  const src = fs.readFileSync(P(id).editable, "utf8");
  return readSceneSpans(src, meta.fps).totalFrames;
};

export const renderVideo = async (id: string, kind: RenderKind, opts: { onProgress?: Progress; outFile?: string } = {}) => {
  const meta = store.metadata(id);
  const { serveUrl } = await bundleProject(id, opts.onProgress);
  const inputProps = { hideCaptions: kind === "clean" };
  const comp = await selectComposition({ serveUrl, id, inputProps, ...rOpts() });
  const durationInFrames = currentDurationFrames(id) || comp.durationInFrames;
  const outFile = opts.outFile ?? path.join(P(id).outputDir, `${kind}.mp4`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await renderMedia({
    serveUrl,
    composition: { ...comp, durationInFrames },
    codec: "h264",
    outputLocation: outFile,
    inputProps,
    crf: kind === "draft" ? 28 : 18,
    scale: kind === "draft" ? 0.5 : 1,
    concurrency: concurrency(),
    ...rOpts(),
    audioBitrate: "192k",
    imageFormat: "jpeg",
    jpegQuality: kind === "draft" ? 70 : 92,
    onProgress: ({ progress, renderedFrames }) => opts.onProgress?.({ stage: `render-${kind}`, progress, message: `${renderedFrames}/${durationInFrames} frames` }),
    timeoutInMilliseconds: 120000,
  });
  const m = store.manifest(id);
  m.renders = m.renders.filter((r) => r.kind !== kind);
  m.renders.push({ kind, file: path.relative(P(id).dir, outFile), at: new Date().toISOString(), sourceHash: sha256(fs.readFileSync(P(id).editable, "utf8")) });
  store.saveManifest(id, m);
  void meta;
  return { file: outFile, durationInFrames, fps: comp.fps, width: Math.round(comp.width * (kind === "draft" ? 0.5 : 1)), height: Math.round(comp.height * (kind === "draft" ? 0.5 : 1)) };
};

/** Full mix (narration + music + sfx) as a separate audio file. */
export const renderAudioMix = async (id: string, onProgress?: Progress) => {
  const { serveUrl } = await bundleProject(id, onProgress);
  const comp = await selectComposition({ serveUrl, id, inputProps: {}, ...rOpts() });
  const outFile = path.join(P(id).outputDir, "audio-mix.mp3");
  await renderMedia({
    serveUrl,
    composition: { ...comp, durationInFrames: currentDurationFrames(id) || comp.durationInFrames },
    codec: "mp3",
    outputLocation: outFile,
    concurrency: concurrency(),
    ...rOpts(),
    onProgress: ({ progress }) => onProgress?.({ stage: "render-audio", progress }),
  });
  return outFile;
};

export const renderThumbnail = async (id: string, frame?: number) => {
  const { serveUrl } = await bundleProject(id);
  const comp = await selectComposition({ serveUrl, id, inputProps: { hideCaptions: true }, ...rOpts() });
  const outFile = path.join(P(id).outputDir, "thumbnail.png");
  const total = currentDurationFrames(id) || comp.durationInFrames;
  await renderStill({
    serveUrl,
    composition: { ...comp, durationInFrames: total },
    output: outFile,
    frame: Math.min(total - 1, frame ?? Math.round(comp.fps * 1.6)),
    inputProps: { hideCaptions: true },
    ...rOpts(),
  });
  return outFile;
};

/** Renders frames from an existing composition for quality inspection. */
export const renderFrames = async (id: string, frames: number[], outDir: string) => {
  const { serveUrl } = await bundleProject(id);
  const comp = await selectComposition({ serveUrl, id, inputProps: {}, ...rOpts() });
  fs.mkdirSync(outDir, { recursive: true });
  const total = currentDurationFrames(id) || comp.durationInFrames;
  const files: string[] = [];
  for (const f of frames) {
    const out = path.join(outDir, `frame-${String(f).padStart(5, "0")}.png`);
    await renderStill({ serveUrl, composition: { ...comp, durationInFrames: total }, output: out, frame: Math.min(total - 1, f), ...rOpts(), scale: 0.5 });
    files.push(out);
  }
  return files;
};

/* ---------------------------------------------------------------- library */

let libraryServeUrl: string | null = null;
export const bundleLibrary = async () => {
  if (libraryServeUrl && fs.existsSync(libraryServeUrl)) return libraryServeUrl;
  const dir = path.join(cacheDir(), "entries", "_library");
  fs.mkdirSync(dir, { recursive: true });
  const rel = (p: string) => path.relative(dir, p).replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(dir, "index.tsx"),
    `import {registerRoot} from "remotion";\nimport {LibraryCompositions} from ${JSON.stringify(rel(path.join(ROOT, "src/video/Library")))};\nimport {ensureFonts} from ${JSON.stringify(rel(path.join(ROOT, "src/video/fonts")))};\nensureFonts();\nregisterRoot(() => <LibraryCompositions />);\n`,
  );
  const emptyPublic = path.join(cacheDir(), "public", "_library");
  fs.mkdirSync(emptyPublic, { recursive: true });
  libraryServeUrl = await bundle({ entryPoint: path.join(dir, "index.tsx"), publicDir: emptyPublic, rootDir: ROOT, outDir: path.join(cacheDir(), "bundles", "_library"), enableCaching: true });
  return libraryServeUrl;
};

export const renderProceduralStill = async (props: { art: string; primaryColor: string; accentColor: string; backgroundColor: string; labels: string; seed: number }, output: string, size: { width: number; height: number }, frame = 90) => {
  const serveUrl = await bundleLibrary();
  const comp = await selectComposition({ serveUrl, id: "ProceduralStill", inputProps: props, ...rOpts() });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await renderStill({ serveUrl, composition: { ...comp, width: size.width, height: size.height }, output, frame, inputProps: props, ...rOpts(), imageFormat: "png" });
  return output;
};
