import { describe, expect, it } from "vitest";
import { chapterMarks, resolveReveals } from "../../src/rendering/reveals";
import { layoutDiagram, slideMediaBox, slideMediaMode } from "../../src/video/scenes/slide-layout";
import { mapLlmStoryboard, splitHeading, type LlmScene } from "../../src/ai/providers/anthropic";
import { VideoRequest } from "../../src/schemas/options";
import { explainerSceneCount, withLengthDefaults } from "../../src/pipeline/explainer";

const words = "First we load the data then we check the data and finally we ship it".split(" ").map((text, i) => ({ text: i === 2 ? `${text},` : text, startMs: i * 500, endMs: i * 500 + 400 }));

describe("resolveReveals", () => {
  const at = (cues: (string | undefined)[], offset = 10) => resolveReveals(cues, words, offset, 300, 30);

  it("reveals on the frame the cue is spoken, after the narration offset", () => {
    expect(at(["load the", "check"])).toEqual([10 + 30, 10 + 105]);
  });

  it("ignores punctuation and case", () => {
    expect(at(["LOAD, the Data"])).toEqual([40]);
  });

  it("searches in order, so a repeated word can't fire early", () => {
    // "the data" occurs twice; the second cue must land on the later one
    expect(at(["the data", "the data"])).toEqual([10 + 45, 10 + 120]);
  });

  it("spaces out items with no usable cue, and never goes backwards", () => {
    expect(at([undefined, undefined, undefined])).toEqual([10, 110, 210]);
    const mixed = at(["ship", "not spoken", "first"]);
    expect(mixed[0]).toBeLessThanOrEqual(mixed[1]);
    expect(mixed[1]).toBeLessThanOrEqual(mixed[2]);
  });

  it("puts a missing cue midway to the next known one", () => {
    expect(at(["first", "not spoken", "check"])).toEqual([10, 63, 115]);
  });

  it("works without word timings", () => {
    expect(resolveReveals(["a", "b"], [], 0, 100, 30)).toEqual([0, 50]);
    expect(resolveReveals([], words, 0, 100, 30)).toEqual([]);
  });
});

describe("chapterMarks", () => {
  it("starts a mark when the chapter changes, with the first at frame 0", () => {
    const scenes = [{ chapter: "Intro" }, {}, { chapter: "Intro" }, { chapter: "Design" }, { chapter: "Budget" }];
    expect(chapterMarks(scenes, [4, 100, 200, 300, 400])).toEqual([
      { label: "Intro", start: 0 },
      { label: "Design", start: 300 },
      { label: "Budget", start: 400 },
    ]);
  });

  it("is empty when no scene has a chapter", () => {
    expect(chapterMarks([{}, {}], [0, 10])).toEqual([]);
  });
});

describe("layoutDiagram", () => {
  it("puts each node one column after its furthest upstream node", () => {
    const { columns, nodes } = layoutDiagram(4, [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 3 }]);
    expect(columns).toBe(3);
    expect(nodes.map((n) => n.column)).toEqual([0, 1, 1, 2]);
    expect(nodes.map((n) => n.rowsInColumn)).toEqual([1, 2, 2, 1]);
    expect(new Set([nodes[1].row, nodes[2].row]).size).toBe(2);
  });

  it("survives cycles and bad edges", () => {
    const { columns, nodes } = layoutDiagram(3, [{ from: 0, to: 1 }, { from: 1, to: 0 }, { from: 2, to: 9 }, { from: 1, to: 1 }]);
    expect(nodes).toHaveLength(3);
    expect(columns).toBeGreaterThan(0);
    for (const n of nodes) expect(n.column).toBeLessThan(columns);
  });

  it("wraps nodes without edges into a grid", () => {
    const { nodes } = layoutDiagram(6, []);
    expect(Math.max(...nodes.map((n) => n.row))).toBeGreaterThan(0);
    expect(layoutDiagram(0, [])).toEqual({ columns: 0, nodes: [] });
  });
});

describe("slide media placement", () => {
  it("puts recordings in a window, whatever the slide kind", () => {
    expect(slideMediaMode("cards", "uploaded")).toBe("frame");
    expect(slideMediaMode("media", "generated")).toBe("frame");
    expect(slideMediaMode("media", "none")).toBe("frame");
  });

  it("floats stills beside text and dims them behind grids", () => {
    expect(slideMediaMode("statement", "generated")).toBe("side");
    expect(slideMediaMode("steps", "generated")).toBe("side");
    expect(slideMediaMode("cards", "generated")).toBe("backdrop");
    expect(slideMediaMode("diagram", "generated")).toBe("backdrop");
    expect(slideMediaMode("statement", "none")).toBe("none");
  });

  it("gives every placement a box that stays in frame", () => {
    for (const portrait of [true, false]) {
      for (const hasItems of [true, false]) {
        for (const mode of ["side", "frame"] as const) {
          const [x, y, w, h] = slideMediaBox(mode, hasItems, portrait).split(" ").map(Number);
          expect(x + w).toBeLessThanOrEqual(1.0001);
          expect(y + h).toBeLessThanOrEqual(1.0001);
        }
      }
    }
    expect(slideMediaBox("backdrop", true, false)).toBe("");
  });
});

describe("explainer storyboards", () => {
  const raw = (over: Partial<LlmScene> & { content?: LlmScene["content"] }): LlmScene => ({
    purpose: "point",
    layout: "slide",
    narration: "The gateway checks the token and then the service answers.",
    visual: { type: "animated_text", description: "A slide" },
    ...over,
  });
  const map = (scenes: LlmScene[], explainer = true) => mapLlmStoryboard({ title: "T", hook: "H", scenes }, { explainer });

  it("maps a diagram slide, dropping edges that point nowhere", () => {
    const r = map([
      raw({
        content: {
          slideKind: "diagram",
          heading: "How a request flows",
          chapter: "Design",
          items: [
            { title: "Gateway", body: "", tag: "Edge", cue: "gateway" },
            { title: "Service", body: "", tag: "", cue: "service" },
          ],
          edges: [{ from: 0, to: 1 }, { from: 0, to: 5 }, { from: 1, to: 1 }],
        },
      }),
    ]);
    expect(r.errors).toEqual([]);
    const s = r.value!.scenes[0];
    expect(s).toMatchObject({ layout: "slide", slideKind: "diagram", chapter: "Design", edges: [{ from: 0, to: 1 }] });
    if (s.layout === "slide") expect(s.items[0]).toEqual({ title: "Gateway", tag: "Edge", cue: "gateway" });
  });

  it("turns anything else into a slide, and keeps only stills and recordings as media", () => {
    const r = map([raw({ layout: "cinematic_image", title: "Big idea", visual: { type: "generated_video", description: "x", wantsMotionClip: true, art: "starfield" } })]);
    const s = r.value!.scenes[0];
    expect(s).toMatchObject({ layout: "slide", slideKind: "statement", heading: "Big idea", transitionIn: "crossfade" });
    expect(s.visual).toMatchObject({ type: "animated_text", wantsMotionClip: false });
    expect(s.visual.art).toBeUndefined();
  });

  it("downgrades an empty grid to a statement", () => {
    expect(map([raw({ content: { slideKind: "cards", heading: "Nothing here" } })]).value!.scenes[0]).toMatchObject({ slideKind: "statement" });
  });

  it("allows long storyboards only for explainers", () => {
    const many = Array.from({ length: 70 }, () => raw({}));
    expect(map(many).value!.scenes).toHaveLength(60);
    expect(map(many, false).value!.scenes).toHaveLength(24);
  });

  it("doesn't turn slides into something else outside the preset", () => {
    expect(map([raw({ layout: "fact_card", content: { fact: "A fact" } })], false).value!.scenes[0].layout).toBe("fact_card");
  });
});

describe("splitHeading", () => {
  it("doesn't say the accent twice", () => {
    expect(splitHeading("Four layers guard every login", "every login")).toEqual({ heading: "Four layers guard", accent: "every login" });
    expect(splitHeading("Every action must be", "provable")).toEqual({ heading: "Every action must be", accent: "provable" });
    expect(splitHeading("Provable", "provable")).toEqual({ heading: "Provable", accent: undefined });
    expect(splitHeading("Just a heading")).toEqual({ heading: "Just a heading" });
  });
});

describe("withLengthDefaults", () => {
  const prompt = "How a bank stays secure";

  it("switches long videos to a landscape explainer", () => {
    expect(withLengthDefaults({ prompt, durationSeconds: 300 })).toMatchObject({ quality: "explainer", durationSeconds: 300, aspectRatio: "16:9" });
    expect(withLengthDefaults({ prompt, durationSeconds: 300, quality: "hybrid", aspectRatio: "9:16", captions: true })).toMatchObject({ quality: "explainer", aspectRatio: "16:9", captions: true });
    expect(withLengthDefaults({ prompt, durationSeconds: 300, aspectRatio: "1:1" }).aspectRatio).toBe("1:1");
  });

  it("reads the length from the prompt while the form holds its default", () => {
    expect(withLengthDefaults({ prompt: "Make a 10 minute video about banks", quality: "hybrid", durationSeconds: 30 })).toMatchObject({ quality: "explainer", durationSeconds: 600 });
    expect(withLengthDefaults({ prompt: "Make a 10 minute video about banks", durationSeconds: 60 }).quality).toBeUndefined();
  });

  it("leaves shorter videos and explainers alone", () => {
    const short = { prompt, durationSeconds: 180 };
    expect(withLengthDefaults(short)).toBe(short);
    const explainer = { prompt, durationSeconds: 300, quality: "explainer" as const, aspectRatio: "9:16" as const };
    expect(withLengthDefaults(explainer)).toBe(explainer);
  });

  it("lets validation reject a long video on another specific preset", () => {
    const premium = { prompt, durationSeconds: 300, quality: "premium" as const };
    expect(withLengthDefaults(premium)).toBe(premium);
    expect(() => VideoRequest.parse(withLengthDefaults(premium))).toThrow(/explainer/);
  });
});

describe("captions", () => {
  it("are always on, even for a request that asks otherwise", () => {
    expect(VideoRequest.parse({ prompt: "Explain it" }).captions).toBe(true);
    expect(VideoRequest.parse({ prompt: "Explain it", captions: false }).captions).toBe(true);
  });
});

describe("explainer length", () => {
  it("allows 15 minutes only with the explainer preset", () => {
    expect(VideoRequest.parse({ prompt: "Explain it", quality: "explainer", durationSeconds: 900 }).durationSeconds).toBe(900);
    expect(() => VideoRequest.parse({ prompt: "Explain it", quality: "hybrid", durationSeconds: 600 })).toThrow(/explainer/);
    expect(() => VideoRequest.parse({ prompt: "Explain it", quality: "explainer", durationSeconds: 901 })).toThrow();
    expect(VideoRequest.parse({ prompt: "Explain it", durationSeconds: 180 }).durationSeconds).toBe(180);
  });

  it("scales the slide count with the length", () => {
    expect(explainerSceneCount(10)).toBe(3);
    expect(explainerSceneCount(70)).toBe(5);
    expect(explainerSceneCount(600)).toBe(43);
    expect(explainerSceneCount(900)).toBe(60);
  });
});
