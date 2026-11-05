/**
 * Project storage. Each project is a directory under projects/<id>/ with
 * separate files for the original AI storyboard, the user's edits, the asset
 * manifest, the pipeline manifest, metadata, and the editable composition.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { AssetManifest, PipelineManifest, ProjectEdits, ProjectMetadata, STAGES } from "../schemas/project";
import { Storyboard } from "../schemas/storyboard";

export const ROOT = process.env.VIDEO_STUDIO_ROOT ? path.resolve(process.env.VIDEO_STUDIO_ROOT) : process.cwd();
export const projectsDir = () => path.resolve(process.env.PROJECTS_DIR ?? path.join(ROOT, "projects"));
export const musicDir = () => path.resolve(process.env.MUSIC_DIR ?? path.join(ROOT, "music"));
export const cacheDir = () => path.join(ROOT, ".cache");

export const projectDir = (id: string) => {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(id)) throw new Error(`Invalid project id "${id}"`);
  return path.join(projectsDir(), id);
};

export const P = (id: string) => {
  const dir = projectDir(id);
  return {
    dir,
    metadata: path.join(dir, "metadata.json"),
    storyboard: path.join(dir, "storyboard.json"),
    storyboardHistory: path.join(dir, "history"),
    edits: path.join(dir, "edits.json"),
    assets: path.join(dir, "assets.json"),
    manifest: path.join(dir, "manifest.json"),
    assetsDir: path.join(dir, "assets"),
    audioDir: path.join(dir, "audio"),
    captionsDir: path.join(dir, "captions"),
    editableDir: path.join(dir, "editable"),
    editable: path.join(dir, "editable", "Video.tsx"),
    outputDir: path.join(dir, "output"),
  };
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "video";

/** Stable, unique id: slug of the title plus a short random suffix. Never reuses an existing directory. */
export const newProjectId = (title: string) => {
  for (let i = 0; i < 20; i++) {
    const id = `${slugify(title)}-${crypto.randomBytes(3).toString("hex")}`;
    if (!fs.existsSync(projectDir(id))) return id;
  }
  throw new Error("Could not allocate a unique project id");
};

export const writeJsonAtomic = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
};

export const readJson = <T extends z.ZodTypeAny>(file: string, schema: T): z.infer<T> => {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return schema.parse(raw);
};

export const exists = (f: string) => fs.existsSync(f);

export const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");

export const emptyManifest = (): PipelineManifest => ({
  stages: STAGES.map((name) => ({ name, status: "pending", attempts: 0 })),
  costs: [],
  log: [],
  renders: [],
});

export const store = {
  createDirs(id: string) {
    const p = P(id);
    for (const d of [p.dir, p.assetsDir, p.audioDir, path.join(p.audioDir, "narration"), p.captionsDir, p.editableDir, p.outputDir, p.storyboardHistory]) fs.mkdirSync(d, { recursive: true });
  },
  metadata: (id: string) => readJson(P(id).metadata, ProjectMetadata),
  saveMetadata(meta: ProjectMetadata) {
    writeJsonAtomic(P(meta.id).metadata, { ...meta, updatedAt: new Date().toISOString() });
  },
  storyboard: (id: string) => readJson(P(id).storyboard, Storyboard),
  saveStoryboard(id: string, sb: Storyboard) {
    const p = P(id);
    // keep every AI storyboard version; storyboard.json is the latest
    writeJsonAtomic(path.join(p.storyboardHistory, `storyboard.v${sb.version}.json`), sb);
    writeJsonAtomic(p.storyboard, sb);
  },
  edits: (id: string) => (exists(P(id).edits) ? readJson(P(id).edits, ProjectEdits) : ProjectEdits.parse({})),
  saveEdits: (id: string, e: ProjectEdits) => writeJsonAtomic(P(id).edits, e),
  assets: (id: string) => (exists(P(id).assets) ? readJson(P(id).assets, AssetManifest) : AssetManifest.parse({ scenes: [] })),
  saveAssets: (id: string, a: AssetManifest) => writeJsonAtomic(P(id).assets, a),
  manifest: (id: string) => (exists(P(id).manifest) ? readJson(P(id).manifest, PipelineManifest) : emptyManifest()),
  saveManifest: (id: string, m: PipelineManifest) => writeJsonAtomic(P(id).manifest, m),
  list(): ProjectMetadata[] {
    const dir = projectsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, "metadata.json")))
      .map((d) => {
        try {
          return readJson(path.join(dir, d, "metadata.json"), ProjectMetadata);
        } catch {
          return null;
        }
      })
      .filter((m): m is ProjectMetadata => Boolean(m))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
