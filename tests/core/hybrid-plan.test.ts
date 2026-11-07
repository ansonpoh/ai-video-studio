/**
 * Hybrid preset planning: which scenes get real clips, which stay animated
 * stills, and what that costs. Pure planning, no network.
 */
import { describe, expect, it } from "vitest";
import { Scene } from "../../src/schemas/storyboard";
import { VideoRequest } from "../../src/schemas/options";
import { planAssets, pickClipScenes } from "../../src/pipeline/assets";
import { createMockProviders, MockVideo } from "../../src/providers/mocks";
import { emptyManifest } from "../../src/pipeline/store";
import { STAGES } from "../../src/schemas/project";

const scene = (n: number, extra: Record<string, unknown> = {}) =>
  Scene.parse({
    id: `s${String(n).padStart(2, "0")}`,
    purpose: n === 1 ? "hook" : "point",
    narration: "words",
    layout: "cinematic_image",
    visual: { type: "generated_image", description: `scene ${n}`, prompt: `scene ${n}` },
    ...extra,
  });

// 12 scenes ~ a one-minute video: s04 and s08 want motion, s06 is a diagram.
const scenes = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  if (n === 6) return scene(n, { layout: "diagram", labels: [], visual: { type: "diagram", description: "d", art: "orbit-diagram" } });
  if (n === 4 || n === 8) return scene(n, { visual: { type: "generated_image", description: `scene ${n}`, prompt: `scene ${n}`, wantsMotionClip: true } });
  return scene(n);
});

const req = (o: Record<string, unknown> = {}) => VideoRequest.parse({ prompt: "a one minute explainer", ...o });

describe("hybrid clip selection", () => {
  it("is the default preset and animates the hook plus the two flagged key moments", () => {
    const r = req();
    expect(r.quality).toBe("hybrid");
    const picks = pickClipScenes(scenes, r, createMockProviders(), false);
    expect([...picks].filter(([, t]) => t === "hero").map(([id]) => id)).toEqual(["s01", "s04", "s08"]);
  });

  it("spreads cheap background clips over the remaining full-bleed scenes, never diagrams", () => {
    const providers = { ...createMockProviders(), videoBackground: new MockVideo() };
    const picks = pickClipScenes(scenes, req(), providers, false);
    const bg = [...picks].filter(([, t]) => t === "background").map(([id]) => id);
    expect(bg).toHaveLength(2);
    expect(bg).not.toContain("s06");
    expect(bg.some((id) => ["s01", "s04", "s08"].includes(id))).toBe(false);
  });

  it("adds no background clips without a cheap model, and none at all when clips are skipped", () => {
    expect([...pickClipScenes(scenes, req(), createMockProviders(), false).values()]).not.toContain("background");
    expect(pickClipScenes(scenes, req({ clipApproval: "skipped" }), createMockProviders(), false).size).toBe(0);
    expect(pickClipScenes(scenes, req({ quality: "economy" }), createMockProviders(), false).size).toBe(0);
  });

  it("plans stills for every other scene, with the still's cost tracked separately", () => {
    const plans = planAssets({ scenes, request: req(), providers: createMockProviders(), manifest: { scenes: [] } as never, offlineDemo: false });
    expect(plans.filter((p) => p.source === "ai-video").map((p) => p.sceneId)).toEqual(["s01", "s04", "s08"]);
    expect(plans.filter((p) => p.source === "ai-image")).toHaveLength(8);
    expect(plans.find((p) => p.sceneId === "s06")?.source).toBe("live-art");
    for (const p of plans.filter((x) => x.source === "ai-video")) expect(p.stillUsd).toBeDefined();
  });
});

describe("manifest migration", () => {
  it("new projects include the clips stage between assets and narration", () => {
    const names = emptyManifest().stages.map((s) => s.name);
    expect(names.indexOf("clips")).toBe(names.indexOf("assets") + 1);
    expect(STAGES).toContain("clips");
  });
});
