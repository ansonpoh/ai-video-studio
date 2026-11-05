import { describe, expect, it } from "vitest";
import { mapLlmDirection, mapLlmScene, mapLlmStoryboard, validateScene, type LlmScene, type LlmStoryboard } from "../../src/ai/providers/anthropic";
import { Scene } from "../../src/schemas/storyboard";

const scene = (over: Partial<LlmScene>): LlmScene => ({
  purpose: "point",
  layout: "cinematic_image",
  narration: "Lightning is hotter than the surface of the sun.",
  visual: { type: "generated_image", description: "A lightning bolt over a dark plain" },
  ...over,
});

const board = (scenes: LlmScene[]): LlmStoryboard => ({ title: "Lightning", hook: "Hotter than the sun", scenes, sources: [] });

describe("mapLlmStoryboard", () => {
  it("maps flat scenes into the strict Scene union and renumbers ids", () => {
    const r = mapLlmStoryboard(
      board([
        scene({ purpose: "hook", layout: "text_reveal", content: { emphasis: "hotter" }, visual: { type: "animated_text", description: "Kinetic type" } }),
        scene({ layout: "listicle", content: { heading: "Tool one" } }),
        scene({ layout: "listicle", content: { number: 2, heading: "Tool two", body: "More detail" } }),
        scene({ layout: "fact_card", content: { label: "Did you know?", fact: "About 30,000 K." }, claims: [{ text: "Lightning ~30,000 K", kind: "statistic", confidence: 80, sourceUrl: "not a url" }] }),
        scene({ layout: "comparison", content: { leftLabel: "Sun", rightLabel: "Bolt", leftText: "5,500 C", rightText: "30,000 C" } }),
        scene({ layout: "timeline", content: { points: ["Charge", "Leader", "Strike"] } }),
        scene({ layout: "number_counter", content: { value: 5, suffix: "x", label: "hotter" } }),
        scene({ layout: "infographic", content: { stats: [{ label: "a", value: 1, display: "1" }, { label: "b", value: 2, display: "2" }] } }),
        scene({ layout: "diagram", visual: { type: "diagram", description: "stepped leader descending" }, content: { labels: ["a", "b", "c", "d", "e"] } }),
        scene({ purpose: "outro", layout: "outro", content: { cta: "Follow" } }),
      ]),
    );
    expect(r.errors).toEqual([]);
    const scenes = r.value!.scenes;
    expect(scenes.map((s) => s.id)).toEqual(["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10"]);
    for (const s of scenes) expect(Scene.safeParse(s).success).toBe(true);
    const l1 = scenes[1];
    expect(l1.layout === "listicle" && l1.number).toBe(1);
    const fc = scenes[3];
    expect(fc.claims[0].confidence).toBe(0.8);
    expect(fc.claims[0].sourceUrl).toBeUndefined();
    const dg = scenes[8];
    expect(dg.layout === "diagram" && dg.labels.length).toBe(4);
    expect(dg.visual.art).toBeDefined();
    expect(scenes[0].visual.prompt).toBeUndefined();
    expect(scenes[1].visual.prompt).toBe("A lightning bolt over a dark plain");
  });

  it("downgrades layouts whose essential data is missing instead of inventing it", () => {
    const r = mapLlmStoryboard(
      board([
        scene({ layout: "quote", content: { quote: "Something wise" } }),
        scene({ layout: "comparison", content: { leftText: "only one side" } }),
        scene({ layout: "timeline", content: { points: ["one"] } }),
        scene({ layout: "number_counter", content: { label: "no value" } }),
        scene({ layout: "infographic", content: { stats: [{ label: "x", value: 1, display: "1" }] } }),
        scene({ layout: "video_clip" }),
        scene({ layout: "product_showcase" }),
      ]),
    );
    expect(r.errors).toEqual([]);
    expect(r.value!.scenes.map((s) => s.layout)).toEqual(["text_reveal", "text_reveal", "text_reveal", "text_reveal", "fact_card", "cinematic_image", "cinematic_image"]);
    expect(r.repairs.some((x) => x.includes("quote -> text_reveal"))).toBe(true);
  });

  it("clamps lengths and durations and drops unknown art", () => {
    const long = "word ".repeat(60);
    const r = mapLlmStoryboard(
      board([
        scene({
          title: long,
          onScreenText: long,
          estimatedDurationSeconds: 99,
          visual: { type: "motion_graphics", description: "space", art: "not-an-art" as never },
        }),
      ]),
    );
    expect(r.errors).toEqual([]);
    const s = r.value!.scenes[0];
    expect(s.title!.length).toBeLessThanOrEqual(80);
    expect(s.onScreenText!.length).toBeLessThanOrEqual(140);
    expect(s.estimatedDurationSeconds).toBe(30);
    expect(s.visual.art).toBe("lightning-bolt"); // re-picked from description + narration
    expect(r.repairs.some((x) => x.includes("dropped unknown art"))).toBe(true);
  });

  it("enforces visual modes", () => {
    const scenes = [
      scene({ visual: { type: "stock_video", description: "ocean waves", stockQuery: "ocean waves" } }),
      scene({ visual: { type: "generated_image", description: "a whale", stockQuery: "whale" } }),
      scene({ layout: "video_clip", visual: { type: "generated_video", description: "storm", wantsMotionClip: true } }),
    ];
    const ai = mapLlmStoryboard(board(scenes), { visualMode: "ai_only" }).value!;
    expect(ai.scenes.map((s) => s.visual.type)).toEqual(["generated_video", "generated_image", "generated_video"]);

    const proc = mapLlmStoryboard(board(scenes), { visualMode: "procedural_only" }).value!;
    for (const s of proc.scenes) {
      expect(["motion_graphics", "diagram", "animated_text"]).toContain(s.visual.type);
      expect(s.visual.art).toBeDefined();
      expect(s.visual.wantsMotionClip).toBe(false);
    }

    const stock = mapLlmStoryboard(board(scenes), { visualMode: "stock_preferred" }).value!;
    expect(stock.scenes[1].visual.type).toBe("stock_image");
    expect(stock.scenes[0].visual.stockQuery).toBe("ocean waves");
  });

  it("reports validation errors for empty storyboards", () => {
    const r = mapLlmStoryboard(board([]));
    expect(r.value).toBeUndefined();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("filters sources without valid URLs", () => {
    const r = mapLlmStoryboard({ ...board([scene({})]), sources: [{ title: "NASA", url: "https://www.nasa.gov/" }, { title: "Made up", url: "nasa dot gov" }] });
    expect(r.value!.sources).toEqual([{ title: "NASA", url: "https://www.nasa.gov/" }]);
  });
});

describe("mapLlmScene / validateScene", () => {
  it("produces a valid scene for a single rewrite", () => {
    const m = mapLlmScene(scene({ layout: "outro" }), 4);
    const v = validateScene(m.scene);
    expect(v.errors).toEqual([]);
    expect(v.value!.id).toBe("s05");
    expect(v.value!.layout === "outro" && v.value!.cta).toBe("Follow for more");
  });
});

describe("mapLlmDirection", () => {
  it("repairs hex colours and clamps scene count", () => {
    const r = mapLlmDirection({
      title: "Two moons",
      objective: "o",
      audience: "a",
      tone: "t",
      format: "cinematic_story",
      contentKind: "speculative",
      pacing: "measured",
      narrationStyle: "calm",
      visualStyle: { name: "n", description: "d", imageStylePrompt: "p", theme: "cosmic", fontPairing: "cinematic-serif", palette: { background: "#000", primary: "C9B6FF", accent: "orange", text: "#FFFFFF" } },
      captionStyle: "cinematic",
      transitionStyle: "blur-dissolve",
      musicMood: "suspenseful",
      targetSceneCount: 40,
      hookIdea: "h",
      ending: "e",
      needsFactCheck: false,
      timeSensitive: false,
    }, { styleHints: [], mentionsRealPerson: false, timeSensitive: true, fictional: false, speculative: true });
    expect(r.errors).toEqual([]);
    expect(r.value!.visualStyle.palette).toEqual({ background: "#000000", primary: "#c9b6ff", accent: "#ffd166", text: "#ffffff" });
    expect(r.value!.targetSceneCount).toBe(20);
    expect(r.value!.timeSensitive).toBe(true);
    expect(r.value!.needsFactCheck).toBe(true);
  });
});
