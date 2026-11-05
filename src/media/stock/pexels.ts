/**
 * Pexels stock photos and videos. Every result carries author + page URL so
 * attribution can be rendered/exported. A failed search throws a
 * ProviderError; an empty search returns []. Nothing is ever faked.
 */
import { env } from "../../config/env";
import { ProviderError, type StockCandidate, type StockProvider } from "../../providers/types";

type Orientation = "portrait" | "landscape" | "square";

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string | null;
  photographer: string;
  photographer_url: string;
  src: Record<"original" | "large2x" | "large" | "medium" | "small" | "portrait" | "landscape" | "tiny", string>;
};
type PexelsVideoFile = { id: number; quality: string | null; file_type: string; width: number | null; height: number | null; fps?: number | null; link: string };
type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  url: string;
  duration: number;
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
};

const TARGET = { width: 1080, height: 1920 };

/** "https://www.pexels.com/photo/woman-reading-a-book-1234/" -> "woman reading a book". */
export const slugWords = (pageUrl: string) => {
  const m = pageUrl.match(/\/(?:photo|video)\/([^/]+?)(?:-\d+)?\/?$/);
  return m ? m[1].replace(/-/g, " ") : "";
};

/**
 * Picks the photo URL for a target frame. Pexels' fixed `src` variants top out
 * well below 1920px tall (large2x fits 940x650 at dpr 2; portrait is 800x1200),
 * so for full-frame use we request the original through the Pexels image CDN's
 * resize parameters (auto=compress, fit=crop, w, h), which crops to the target
 * aspect without upscaling past the original. Small originals are used as-is.
 */
export const bestPhotoSrc = (p: PexelsPhoto, orientation: Orientation): { url: string; width: number; height: number } => {
  const target = orientation === "landscape" ? { width: 1920, height: 1080 } : orientation === "square" ? { width: 1080, height: 1080 } : TARGET;
  if (p.width >= target.width && p.height >= target.height) {
    const base = p.src.original.split("?")[0];
    return { url: `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${target.width}&h=${target.height}`, width: target.width, height: target.height };
  }
  return { url: p.src.original, width: p.width, height: p.height };
};

/** Picks the video file closest to (and preferably >=) the target long edge, mp4 first, portrait aspect preferred. */
export const bestVideoFile = (files: PexelsVideoFile[], target = TARGET): PexelsVideoFile | undefined => {
  const usable = files.filter((f) => f.link && f.width && f.height && /mp4/i.test(f.file_type));
  if (!usable.length) return undefined;
  const targetPortrait = target.height >= target.width;
  const score = (f: PexelsVideoFile) => {
    const w = f.width!;
    const h = f.height!;
    const portrait = h >= w;
    const covers = Math.min(w / target.width, h / target.height);
    // Prefer covering the frame (>=1), penalise oversize (bandwidth) and under-size (blur).
    const sizeScore = covers >= 1 ? 1 - Math.min(0.5, (covers - 1) * 0.25) : covers;
    return sizeScore + (portrait === targetPortrait ? 0.5 : 0) + ((f.fps ?? 30) <= 30 ? 0.05 : 0);
  };
  return [...usable].sort((a, b) => score(b) - score(a))[0];
};

/* ---------------------------------------------------------------- ranking */

const STOP = new Set(["a", "an", "the", "of", "and", "or", "in", "on", "at", "to", "for", "with", "by", "from", "is", "are", "photo", "video", "stock", "free", "image"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));

export type RankTarget = { width: number; height: number; orientation: Orientation; minDurationSeconds?: number };

/**
 * Scores candidates 0..1 (weighted): semantic relevance 0.5 (query token
 * overlap with description / alt / URL slug), resolution 0.2, orientation fit
 * 0.2, duration fit 0.1 (videos only; images get the full 0.1).
 */
export const rankCandidates = (query: string, candidates: StockCandidate[], target: RankTarget): StockCandidate[] => {
  const q = [...new Set(tokens(query))];
  return candidates
    .map((c) => {
      const words = new Set(tokens(`${c.description} ${slugWords(c.pageUrl)}`));
      const hits = q.filter((t) => words.has(t)).length;
      const relevance = q.length ? hits / q.length : 0;
      const coverage = Math.min(c.width / target.width, c.height / target.height);
      const resolution = Math.min(1, coverage);
      const ar = c.width / Math.max(1, c.height);
      const tr = target.width / Math.max(1, target.height);
      const orient = target.orientation === "square" ? 1 - Math.min(1, Math.abs(ar - 1)) : Math.max(0, 1 - Math.abs(Math.log(ar / tr)) / Math.log(3));
      let duration = 1;
      if (c.kind === "video") {
        const d = c.durationSeconds ?? 0;
        const min = target.minDurationSeconds ?? 0;
        duration = d >= min ? (d > Math.max(min * 4, 40) ? 0.7 : 1) : min ? d / min : 1;
      }
      const score = Math.round((0.5 * relevance + 0.2 * resolution + 0.2 * orient + 0.1 * duration) * 1000) / 1000;
      return { ...c, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));
};

/* ---------------------------------------------------------------- provider */

export type PexelsOptions = { apiKey?: string; fetchImpl?: typeof fetch };

export class PexelsStock implements StockProvider {
  readonly name = "pexels";
  readonly license = "Pexels License (free to use; attribution appreciated)";
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PexelsOptions = {}) {
    const key = opts.apiKey ?? env().PEXELS_API_KEY;
    if (!key) throw new ProviderError("pexels", "PEXELS_API_KEY is not set", false);
    this.key = key;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Authorization: this.key } });
    } catch (err) {
      throw new ProviderError(this.name, `network error: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = res.status === 401 || res.status === 403 ? "authentication failed - check PEXELS_API_KEY" : `HTTP ${res.status} ${body.slice(0, 200)}`;
      throw new ProviderError(this.name, msg, res.status === 429 || res.status >= 500, res.status);
    }
    return (await res.json()) as T;
  }

  async search(query: string, opts: { kind: "image" | "video"; orientation: Orientation; perPage?: number }): Promise<StockCandidate[]> {
    const params = new URLSearchParams({ query, orientation: opts.orientation, per_page: String(Math.min(80, Math.max(1, opts.perPage ?? 15))) });
    if (opts.kind === "image") {
      const data = await this.getJson<{ photos?: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?${params}`);
      return (data.photos ?? []).map((p) => {
        const best = bestPhotoSrc(p, opts.orientation);
        return {
          kind: "image" as const,
          id: `pexels-photo-${p.id}`,
          url: best.url,
          pageUrl: p.url,
          width: best.width,
          height: best.height,
          author: p.photographer,
          authorUrl: p.photographer_url,
          description: p.alt?.trim() || slugWords(p.url),
        };
      });
    }
    const data = await this.getJson<{ videos?: PexelsVideo[] }>(`https://api.pexels.com/videos/search?${params}`);
    const out: StockCandidate[] = [];
    for (const v of data.videos ?? []) {
      const f = bestVideoFile(v.video_files, opts.orientation === "landscape" ? { width: 1920, height: 1080 } : opts.orientation === "square" ? { width: 1080, height: 1080 } : TARGET);
      if (!f) continue;
      out.push({
        kind: "video",
        id: `pexels-video-${v.id}`,
        url: f.link,
        pageUrl: v.url,
        width: f.width!,
        height: f.height!,
        durationSeconds: v.duration,
        author: v.user?.name ?? "Unknown",
        authorUrl: v.user?.url ?? v.url,
        description: slugWords(v.url),
      });
    }
    return out;
  }

  async download(c: StockCandidate): Promise<Buffer> {
    let res: Response;
    try {
      res = await this.fetchImpl(c.url);
    } catch (err) {
      throw new ProviderError(this.name, `download failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    if (!res.ok) throw new ProviderError(this.name, `download failed: HTTP ${res.status}`, res.status === 429 || res.status >= 500, res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new ProviderError(this.name, "download returned an empty file", true);
    return buf;
  }

  attribution(c: StockCandidate) {
    return `${c.kind === "video" ? "Video" : "Photo"} by ${c.author} on Pexels`;
  }
}
