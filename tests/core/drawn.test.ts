/**
 * The drawn preset: the SVG allowlist, the motion model, scene mapping, the fix
 * loop, and (when Remotion's Chrome is installed) the real layout check.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasMotion, motionAt, motionProblems, parseSvg, resolveValue, serializeSvg, type DrawnTokens } from "../../src/video/scenes/drawn-svg";
import { mapDrawnScene } from "../../src/ai/drawn-prompt";
import { drawScenes, drawnSceneCount } from "../../src/pipeline/drawn";
import { applyPresetLook, withLengthDefaults } from "../../src/pipeline/explainer";
import { generateEditableComposition } from "../../src/editable/codegen";
import { syntaxErrors } from "../../src/editable/ast";
import { checkDrawnLayouts } from "../../src/rendering/svg-layout";
import { createMockProviders } from "../../src/providers/mocks";
import { VideoRequest } from "../../src/schemas/options";
import { CreativeDirection, Scene } from "../../src/schemas/storyboard";
import type { LayoutIssue } from "../../src/rendering/svg-layout";
import type { LlmProvider, Script } from "../../src/providers/types";

const tokens: DrawnTokens = { bg: "#050708", primary: "#5eead4", accent: "#38bdf8", text: "#f8fafc", muted: "#94a3b8", panel: "#14242b", display: "Inter, sans-serif", body: "Inter, sans-serif" };
const request = VideoRequest.parse({ prompt: "Explain lightning", quality: "drawn", aspectRatio: "16:9", durationSeconds: 36 });
const beat = { purpose: "point" as const, narration: "Warm air rises fast, and then ice crystals collide inside the cloud.", intent: "how charge builds" };
const script: Script = { title: "Lightning", hook: "", sources: [], beats: [beat, { ...beat }, { ...beat }, { ...beat }] };
const direction = CreativeDirection.parse({
  title: "Lightning",
  objective: "o",
  audience: "a",
  tone: "t",
  format: "explainer",
  contentKind: "factual",
  pacing: "measured",
  narrationStyle: "calm",
  visualStyle: { name: "n", description: "d", imageStylePrompt: "i", theme: "storm", fontPairing: "modern-sans", palette: { background: "#050708", primary: "#5eead4", accent: "#38bdf8", text: "#f8fafc" } },
  captionStyle: "minimal",
  transitionStyle: "crossfade",
  musicMood: "cinematic",
  targetSceneCount: 3,
  hookIdea: "h",
  ending: "e",
  needsFactCheck: false,
  timeSensitive: false,
});
const mockLlm = (): LlmProvider => createMockProviders().llm;

describe("SVG allowlist", () => {
  it("keeps drawing elements and motion attributes", () => {
    const { root, errors } = parseSvg(`<svg viewBox='0 0 10 10'><g data-beat='1' data-anim="rise"><rect x='1' y='2' width='3' height='4' fill='var(--primary)'/><text x='1' y='2' font-size='30'>A &amp; B</text></g></svg>`);
    expect(errors).toEqual([]);
    expect(serializeSvg(root!)).toContain('data-anim="rise"');
    expect(serializeSvg(root!)).toContain("A &amp; B");
  });

  it("drops anything that could run or load", () => {
    const { root, dropped } = parseSvg(`<svg><script>alert(1)</script><image href="https://x.test/a.png"/><foreignObject><div>hi</div></foreignObject><rect onclick="alert(1)" style="fill:url(https://x.test)" fill="url(https://x.test/a)" width="5" height="5"/><use href="https://x.test/a#b"/><use href="#ok"/></svg>`);
    expect(root).toBeDefined();
    const out = serializeSvg(root!);
    for (const bad of ["script", "image", "foreignObject", "onclick", "style", "x.test"]) expect(out).not.toContain(bad);
    expect(out).toContain('href="#ok"');
    expect(dropped).toEqual(expect.arrayContaining(["<script>", "<image>", "<foreignObject>", "onclick", "style"]));
  });

  it("reports broken markup instead of guessing", () => {
    expect(parseSvg("<svg><g></svg>").errors.length).toBeGreaterThan(0);
    expect(parseSvg("<g></g>").errors[0]).toContain("expected <svg>");
    expect(parseSvg("not svg").errors.length).toBeGreaterThan(0);
  });

  it("flags beats that don't exist and unknown animations", () => {
    const { root } = parseSvg(`<svg><g data-beat="3" data-anim="spiral"/><text data-anim="count"/></svg>`);
    const problems = motionProblems(root!, 2).join();
    expect(problems).toMatch(/data-beat="3"/);
    expect(problems).toMatch(/spiral/);
    expect(problems).toMatch(/numeric data-count/);
  });

  it("turns <symbol> into a group, because symbols clip shapes drawn around 0,0", () => {
    const { root, errors } = parseSvg("<svg><defs><symbol id='d' viewBox='0 0 9 9'><circle r='9'/></symbol></defs><use href='#d'/></svg>");
    expect(errors).toEqual([]);
    expect(serializeSvg(root!)).toContain('<g id="d"');
    expect(serializeSvg(root!)).not.toContain("symbol");
  });

  it("scopes ids, because two scenes share the page during a crossfade", () => {
    expect(resolveValue("glow", "id", "s02", tokens)).toBe("s02-glow");
    expect(resolveValue("url(#glow)", "filter", "s02", tokens)).toBe("url(#s02-glow)");
    expect(resolveValue("#glow", "href", "s02", tokens)).toBe("#s02-glow");
    expect(resolveValue("var(--primary)", "fill", "s02", tokens)).toBe("#5eead4");
  });
});

describe("motion", () => {
  const beats = [30, 60];
  it("stays hidden until its beat, then finishes", () => {
    const a = { "data-beat": "1" };
    expect(hasMotion(a)).toBe(true);
    expect(motionAt(a, 59, 30, beats).opacity).toBe(0);
    expect(motionAt(a, 90, 30, beats).opacity).toBe(1);
  });
  it("draws, counts, exits and dims on their beats", () => {
    expect(motionAt({ "data-beat": "0", "data-anim": "draw" }, 30, 30, beats).draw).toBe(0);
    expect(motionAt({ "data-beat": "0", "data-anim": "draw" }, 90, 30, beats).draw).toBe(1);
    expect(motionAt({ "data-beat": "0", "data-anim": "count" }, 120, 30, beats).count).toBe(1);
    expect(motionAt({ "data-exit": "0" }, 90, 30, beats).opacity).toBe(0);
    expect(motionAt({ "data-dim": "0" }, 90, 30, beats).opacity).toBeCloseTo(0.3);
  });
  it("is the same every time, because frames can render in any order", () => {
    const a = { "data-loop": "float", "data-beat": "0", "data-anim": "pop" };
    expect(motionAt(a, 47, 30, beats)).toEqual(motionAt(a, 47, 30, beats));
  });
});

describe("drawn scenes", () => {
  const raw = (svg: string, cue = "Warm air") => ({ heading: "How charge builds", chapter: "Charge", description: "A cloud.", beats: [{ cue, what: "air" }], svg, claims: [] });

  it("maps a valid drawing to a scene with no paid media", () => {
    const m = mapDrawnScene(raw(`<svg><rect width='5' height='5' data-beat='0'/></svg>`), 2, beat);
    expect(m.errors).toEqual([]);
    const s = Scene.parse(m.value);
    expect(s).toMatchObject({ id: "s03", layout: "drawn", narration: beat.narration, chapter: "Charge" });
    expect(s.visual.type).toBe("motion_graphics");
  });

  it("sends bad cues and broken SVG back to the model", () => {
    expect(mapDrawnScene(raw(`<svg></svg>`, "not spoken"), 0, beat).errors.join()).toContain("not in the narration");
    expect(mapDrawnScene(raw(`<svg><g></svg>`), 0, beat).errors.join()).toContain("svg:");
    expect(mapDrawnScene(raw(`<svg><g data-beat='4'/></svg>`), 0, beat).errors.join()).toContain("data-beat");
  });

  it("allows long videos and keeps the director's look", () => {
    expect(VideoRequest.safeParse({ prompt: "abc", quality: "drawn", durationSeconds: 600 }).success).toBe(true);
    expect(withLengthDefaults({ prompt: "a 10 minute video", quality: "drawn" }).quality).toBe("drawn");
    const d = applyPresetLook(direction, request);
    expect(d.visualStyle.palette).toEqual(direction.visualStyle.palette);
    expect(d).toMatchObject({ musicMood: "none", format: "explainer", targetSceneCount: drawnSceneCount(36) });
  });

  it("generates a composition with beat frames taken from the narration", async () => {
    const { scene } = await mockLlm().drawScene!(request, direction, script, 0, { width: 1920, height: 1080 });
    const code = generateEditableComposition({
      projectId: "p",
      componentName: "Video_p",
      width: 1920,
      height: 1080,
      fps: 30,
      direction,
      scenes: [scene],
      manifest: { scenes: [], narration: [{ sceneId: "s01", text: beat.narration, words: [{ text: "Warm", startMs: 0, endMs: 200 }, { text: "air", startMs: 200, endMs: 400 }, { text: "fast,", startMs: 500, endMs: 700 }, { text: "and", startMs: 2000, endMs: 2200 }, { text: "then", startMs: 2200, endMs: 2400 }], durationSeconds: 4, timing: "tts-alignment", provider: "mock" }], sfx: [] } as never,
      timeline: { fps: 30, totalFrames: 150, warnings: [], scenes: [{ id: "s01", startFrame: 0, durationInFrames: 150, transitionInFrames: 0, narrationOffsetFrames: 6, narrationFrames: 120 }] } as never,
      captionStyle: "minimal",
      captionsEnabled: true,
      musicVolume: 0.2,
    });
    expect(syntaxErrors(code)).toEqual([]);
    expect(code).toContain("<DrawnLayer");
    expect(code).toContain("  DrawnLayer,");
    expect(code).toContain('beatsJson={"[6,');
    expect(code).not.toContain("<MediaLayer");
  });
});

describe("fix loop", () => {
  const issue = (detail: string): LayoutIssue => ({ kind: "text overflow", severity: "error", detail });
  const run = async (check: (ids: string[], round: number) => Record<string, LayoutIssue[]>) => {
    const calls: { index: number; reference?: string; previous?: { svg: string; issues: string[] } }[] = [];
    const base = mockLlm();
    const llm = Object.create(base) as LlmProvider;
    llm.drawScene = async (req, d, s, index, opts) => {
      calls.push({ index, reference: opts.reference, previous: opts.previous });
      return base.drawScene!(req, d, s, index, opts);
    };
    let round = 0;
    const logs: string[] = [];
    const res = await drawScenes({
      llm,
      request,
      direction,
      script,
      width: 1920,
      height: 1080,
      check: async (scenes) => check(scenes.map((s) => s.id), round++),
      onCost: () => {},
      onProgress: () => {},
      log: (_, m) => logs.push(m),
    });
    return { res, calls, logs };
  };

  it("draws the first scene alone, then shares it as the style reference", async () => {
    const { calls, res } = await run(() => ({}));
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ index: 0 });
    expect(calls[0].reference).toBeUndefined();
    expect(calls.slice(1).every((c) => c.reference?.startsWith("<svg"))).toBe(true);
    expect(res.layout).toMatchObject({ rounds: 0, firstPassFailures: [] });
  });

  it("redraws only failing scenes, passing the problems back", async () => {
    const { calls, res } = await run((_, round): Record<string, LayoutIssue[]> => (round === 0 ? { s03: [issue("label sticks out")] } : {}));
    expect(calls).toHaveLength(5);
    expect(calls[4]).toMatchObject({ index: 2, previous: { issues: ["label sticks out"] } });
    expect(res.layout).toMatchObject({ rounds: 1, firstPassFailures: ["s03"], fixedScenes: ["s03"], remaining: {} });
  });

  it("stops after two rounds and reports what's left", async () => {
    const { calls, res, logs } = await run(() => ({ s02: [issue("still broken")] }));
    expect(calls).toHaveLength(6);
    expect(res.layout.remaining.s02).toHaveLength(1);
    expect(logs.join()).toContain("still broken");
  });

  it("ignores warnings when deciding what to redraw", async () => {
    const { calls } = await run(() => ({ s02: [{ kind: "too empty", severity: "warn", detail: "sparse" }] }));
    expect(calls).toHaveLength(4);
  });
});

const hasChrome = fs.existsSync(path.join(process.cwd(), "node_modules", ".remotion", "chrome-headless-shell"));

describe.runIf(hasChrome)("layout check in a real browser", () => {
  const check = async (body: string) => (await checkDrawnLayouts([{ id: "s01", svg: `<svg>${body}</svg>` }], { width: 1920, height: 1080, tokens })).s01;
  const label = (x: number, y: number, t: string, extra = "") => `<text x='${x}' y='${y}' font-size='40' font-family='var(--body)' fill='var(--text)' ${extra}>${t}</text>`;
  const kinds = (issues: LayoutIssue[]) => issues.filter((i) => i.severity === "error").map((i) => i.kind);
  const ok = `<rect x='200' y='200' width='1400' height='500' rx='20' fill='var(--panel)'/>${label(300, 300, "Warm air rises")}${label(300, 500, "Ice crystals")}`;
  const t = { timeout: 60000 };

  it("passes a clean drawing", t, async () => {
    expect(await check(ok)).toEqual([]);
  });
  it("catches text that overflows its box", t, async () => {
    expect(kinds(await check(`${ok}<rect x='200' y='720' width='200' height='60' fill='var(--panel)'/>${label(210, 765, "This label is far too long for its box")}`))).toContain("text overflow");
  });
  it("catches colliding text", t, async () => {
    expect(kinds(await check(`${ok}${label(320, 305, "Overlapping label")}`))).toContain("text collision");
  });
  it("ignores text that swaps places instead of overlapping", t, async () => {
    expect(kinds(await check(`${ok}<g data-beat='1' data-exit='2'>${label(300, 600, "Before")}</g><g data-beat='2'>${label(300, 600, "After")}</g>`))).not.toContain("text collision");
  });
  it("catches content in the caption zone or off the canvas", t, async () => {
    expect(kinds(await check(`${ok}${label(300, 980, "Too low")}`))).toContain("caption zone");
    expect(kinds(await check(`${ok}<rect x='1800' y='200' width='400' height='100' fill='var(--primary)'/>`))).toContain("off canvas");
  });
  it("leaves data-bg art alone", t, async () => {
    expect(await check(`<g data-bg='1'><rect x='-20' y='-20' width='1960' height='1120' fill='#0a0f12'/><circle cx='1900' cy='1000' r='300' fill='#0c1317'/></g>${ok}`)).toEqual([]);
  });
  it("catches a line through text", t, async () => {
    expect(kinds(await check(`${ok}<path d='M300 288 L700 288' fill='none' stroke='var(--accent)' stroke-width='4'/>`))).toContain("line through text");
  });
  it("catches any line type through text, but not a line behind a label's backing", t, async () => {
    expect(kinds(await check(`${ok}<line x1='300' y1='288' x2='700' y2='288' stroke='var(--accent)' stroke-width='4'/>`))).toContain("line through text");
    const label2 = `<path d='M300 760 L900 760' fill='none' stroke='var(--accent)' stroke-width='4'/><rect x='400' y='725' width='300' height='70' rx='30' fill='var(--panel)'/>${label(430, 775, "On a pill")}`;
    expect(kinds(await check(`${ok}${label2}`))).not.toContain("line through text");
    const rainOver = `<rect x='400' y='725' width='300' height='70' rx='30' fill='var(--panel)'/>${label(430, 775, "Streams")}<line x1='500' y1='700' x2='500' y2='820' stroke='var(--accent)' stroke-width='4'/>`;
    expect(kinds(await check(`${ok}${rainOver}`))).toContain("line through text");
  });
  it("catches a shape covering text", t, async () => {
    expect(kinds(await check(`${ok}<rect x='280' y='250' width='500' height='80' fill='var(--primary)'/>`))).toContain("covered text");
  });
  it("catches small and low-contrast text", t, async () => {
    expect(kinds(await check(`${ok}<text x='300' y='640' font-size='14' font-family='var(--body)' fill='var(--text)'>tiny</text>`))).toContain("small text");
    expect(kinds(await check(`${ok}<text x='800' y='640' font-size='40' font-family='var(--body)' fill='#1a2a30'>dim</text>`))).toContain("contrast");
  });
  it("reports markup that doesn't parse", t, async () => {
    const r = await checkDrawnLayouts([{ id: "s01", svg: "<svg><g></svg>" }], { width: 1920, height: 1080, tokens });
    expect(r.s01[0].kind).toBe("invalid svg");
  });
});
