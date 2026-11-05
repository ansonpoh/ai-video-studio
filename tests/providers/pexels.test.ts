import { describe, expect, it } from "vitest";
import { PexelsStock, bestVideoFile, rankCandidates, slugWords } from "../../src/media/stock/pexels";
import type { StockCandidate } from "../../src/providers/types";

const c = (over: Partial<StockCandidate>): StockCandidate => ({
  kind: "image",
  id: "x",
  url: "https://example.com/x.jpg",
  pageUrl: "https://www.pexels.com/photo/x-1/",
  width: 1080,
  height: 1920,
  author: "A",
  authorUrl: "https://www.pexels.com/@a",
  description: "",
  ...over,
});

const target = { width: 1080, height: 1920, orientation: "portrait" as const };

describe("rankCandidates", () => {
  it("ranks semantic relevance above everything else", () => {
    const ranked = rankCandidates("stormy ocean waves", [
      c({ id: "city", description: "city skyline at dusk" }),
      c({ id: "ocean", description: "", pageUrl: "https://www.pexels.com/photo/stormy-ocean-waves-crashing-123/" }),
      c({ id: "partial", description: "calm ocean" }),
    ], target);
    expect(ranked.map((r) => r.id)).toEqual(["ocean", "partial", "city"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score!);
  });

  it("prefers portrait, high-resolution media for a portrait target", () => {
    const ranked = rankCandidates("forest", [
      c({ id: "landscape", description: "forest", width: 1920, height: 1080 }),
      c({ id: "small", description: "forest", width: 360, height: 640 }),
      c({ id: "portrait", description: "forest", width: 1080, height: 1920 }),
    ], target);
    expect(ranked[0].id).toBe("portrait");
    expect(ranked.at(-1)!.id).toBe("landscape");
  });

  it("penalises videos shorter than the scene", () => {
    const ranked = rankCandidates("rain", [
      c({ id: "short", kind: "video", description: "rain", durationSeconds: 2 }),
      c({ id: "long", kind: "video", description: "rain", durationSeconds: 8 }),
    ], { ...target, minDurationSeconds: 6 });
    expect(ranked[0].id).toBe("long");
  });
});

describe("pexels helpers", () => {
  it("extracts slug words", () => {
    expect(slugWords("https://www.pexels.com/photo/woman-reading-a-book-1234/")).toBe("woman reading a book");
    expect(slugWords("https://www.pexels.com/video/aerial-view-of-forest-856789/")).toBe("aerial view of forest");
  });

  it("picks the portrait mp4 closest to 1080x1920", () => {
    const f = bestVideoFile([
      { id: 1, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, link: "l1" },
      { id: 2, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "l2" },
      { id: 3, quality: "uhd", file_type: "video/mp4", width: 2160, height: 3840, link: "l3" },
      { id: 4, quality: "sd", file_type: "video/mp4", width: 540, height: 960, link: "l4" },
    ]);
    expect(f?.link).toBe("l2");
  });

  it("throws on failed searches and never fakes results (stubbed fetch, no network)", async () => {
    const stock = new PexelsStock({ apiKey: "k", fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch });
    await expect(stock.search("x", { kind: "image", orientation: "portrait" })).rejects.toMatchObject({ retryable: true, status: 500 });
    const empty = new PexelsStock({ apiKey: "k", fetchImpl: (async () => Response.json({ photos: [] })) as typeof fetch });
    await expect(empty.search("x", { kind: "image", orientation: "portrait" })).resolves.toEqual([]);
  });

  it("maps photo results with attribution and sends the key header", async () => {
    let auth = "";
    const stock = new PexelsStock({
      apiKey: "secret",
      fetchImpl: (async (_u: string, init?: RequestInit) => {
        auth = new Headers(init?.headers).get("Authorization") ?? "";
        return Response.json({
          photos: [{ id: 7, width: 3000, height: 4500, url: "https://www.pexels.com/photo/red-fox-7/", alt: "Red fox in snow", photographer: "Jane", photographer_url: "https://www.pexels.com/@jane", src: { original: "https://images.pexels.com/photos/7/a.jpeg" } }],
        });
      }) as typeof fetch,
    });
    const [p] = await stock.search("fox", { kind: "image", orientation: "portrait" });
    expect(auth).toBe("secret");
    expect(p).toMatchObject({ id: "pexels-photo-7", width: 1080, height: 1920, description: "Red fox in snow", author: "Jane" });
    expect(p.url).toContain("w=1080&h=1920");
    expect(stock.attribution(p)).toBe("Photo by Jane on Pexels");
  });
});
