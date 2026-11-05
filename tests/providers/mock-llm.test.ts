import { describe, expect, it } from "vitest";
import { MockLlm, extractTopic } from "../../src/ai/providers/mock";
import { parsePromptHints } from "../../src/ai/prompt-parser";
import { VideoRequest } from "../../src/schemas/options";
import { Storyboard } from "../../src/schemas/storyboard";

const run = async (prompt: string, extra: Partial<VideoRequest> = {}) => {
  const req = VideoRequest.parse({ prompt, ...extra });
  const hints = parsePromptHints(prompt);
  const llm = new MockLlm();
  const { direction } = await llm.direction(req, hints);
  const { script } = await llm.script(req, direction, hints);
  const { storyboard } = await llm.storyboard(req, direction, script);
  Storyboard.parse({ ...storyboard, version: 1, createdAt: new Date(0).toISOString(), source: "mock" });
  return { llm, req, direction, script, storyboard };
};

describe("MockLlm", () => {
  it("identifies itself as an offline mock", () => {
    const m = new MockLlm();
    expect(m.name).toBe("mock");
    expect(m.model).toBe("mock-offline");
  });

  it("builds a listicle from a list count", async () => {
    const { direction, storyboard } = await run("Make a 30-second video about five useful AI tools for students");
    expect(direction.format).toBe("listicle");
    expect(direction.visualStyle.theme).toBe("tech");
    const items = storyboard.scenes.filter((s) => s.layout === "listicle");
    expect(items).toHaveLength(5);
    expect(items.map((s) => (s.layout === "listicle" ? s.number : 0))).toEqual([1, 2, 3, 4, 5]);
    expect(storyboard.scenes.at(-1)!.layout).toBe("outro");
    expect(storyboard.scenes.some((s) => s.visual.art === "particle-network")).toBe(true);
  });

  it("frames what-if prompts as speculative cinematic", async () => {
    const { direction, storyboard } = await run("What if Earth had two moons?");
    expect(direction.contentKind).toBe("speculative");
    expect(direction.format).toBe("cinematic_story");
    expect(storyboard.disclaimer).toMatch(/Speculative/);
    expect(storyboard.scenes.every((s) => s.claims.every((c) => c.kind === "speculation"))).toBe(true);
  });

  it("builds a varied explainer without back-to-back repeated layouts", async () => {
    const { storyboard } = await run("Explain how lightning forms", { durationSeconds: 45 });
    const layouts = storyboard.scenes.map((s) => s.layout);
    for (let i = 1; i < layouts.length; i++) expect(layouts[i]).not.toBe(layouts[i - 1]);
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(4);
    expect(storyboard.scenes.some((s) => s.visual.art === "lightning-bolt")).toBe(true);
  });

  it("respects procedural_only", async () => {
    const { storyboard } = await run("Life in the deep ocean", { visualMode: "procedural_only" });
    for (const s of storyboard.scenes) expect(["motion_graphics", "diagram", "animated_text"]).toContain(s.visual.type);
    expect(storyboard.scenes.some((s) => s.visual.art === "ocean-depths")).toBe(true);
  });

  it("rewrites a scene keeping id and purpose", async () => {
    const { llm, req, direction, storyboard } = await run("Explain how lightning forms");
    const target = storyboard.scenes[2];
    const { scene } = await llm.rewriteScene(req, direction, storyboard.scenes, target.id, "narration: A brand new line.");
    expect(scene.id).toBe(target.id);
    expect(scene.purpose).toBe(target.purpose);
    expect(scene.narration).toBe("A brand new line.");
  });

  it("extracts a topic from the prompt", () => {
    expect(extractTopic("Make a 30-second video about five useful AI tools for students")).toBe("five useful AI tools for students");
  });
});
