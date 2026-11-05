import { describe, expect, it } from "vitest";
import { buildTimeline, estimateSpeechSeconds } from "../../src/rendering/timeline";
import { buildCues, estimateWordTimings, msToSrtTime, parseSrt, toSrt, wordsToCaptions } from "../../src/captions";
import { listElements, readSceneSpans, setAttr, removeElement, syntaxErrors } from "../../src/editable/ast";
import { enforceBudget, BudgetApprovalRequired } from "../../src/pipeline/budget";
import { emptyManifest } from "../../src/pipeline/store";
import { VideoRequest, RESOLUTIONS } from "../../src/schemas/options";

describe("timeline", () => {
  const scenes = [
    { id: "s01", narrationSeconds: 3, transitionIn: "cut" as const },
    { id: "s02", narrationSeconds: 4, transitionIn: "crossfade" as const },
    { id: "s03", narrationSeconds: 2.5, transitionIn: "wipe" as const },
  ];

  it("never makes a scene shorter than its narration and accounts for transition overlap", () => {
    const tl = buildTimeline({ fps: 30, targetSeconds: 5, pacing: "measured", scenes });
    tl.scenes.forEach((s, i) => {
      expect(s.durationInFrames).toBeGreaterThanOrEqual(s.narrationOffsetFrames + Math.round(scenes[i].narrationSeconds * 30));
    });
    // total = sum(durations) - sum(transition overlaps)
    const sum = tl.scenes.reduce((a, s) => a + s.durationInFrames, 0) - tl.scenes.reduce((a, s) => a + s.transitionInFrames, 0);
    expect(tl.totalFrames).toBe(sum);
    expect(tl.warnings.join(" ")).toMatch(/target|longer/i);
  });

  it("adds bounded holds when narration is shorter than the target", () => {
    const tl = buildTimeline({ fps: 30, targetSeconds: 60, pacing: "measured", scenes });
    expect(tl.totalFrames / 30).toBeLessThan(60);
    expect(tl.totalFrames / 30).toBeGreaterThan(tl.naturalSeconds);
  });

  it("estimates speech duration from word count", () => {
    expect(estimateSpeechSeconds("one two three four five six seven eight nine ten")).toBeGreaterThan(3);
  });
});

describe("captions", () => {
  const words = estimateWordTimings("Lightning is about five times hotter than the Sun.", 3000);

  it("spreads word timings across the duration in order", () => {
    expect(words).toHaveLength(9);
    expect(words[0].startMs).toBeGreaterThanOrEqual(0);
    expect(words.at(-1)!.endMs).toBeLessThanOrEqual(3000);
    for (let i = 1; i < words.length; i++) expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].endMs - 1);
  });

  it("offsets captions for scene-relative placement", () => {
    const caps = wordsToCaptions(words, 500);
    expect(caps[0].startMs).toBe(words[0].startMs + 500);
    expect(caps[1].text.startsWith(" ")).toBe(true);
  });

  it("formats and round-trips SRT", () => {
    expect(msToSrtTime(3723004)).toBe("01:02:03,004");
    const cues = buildCues(words);
    const srt = toSrt(cues);
    expect(srt).toMatch(/^1\n00:00:00,\d{3} --> /);
    const back = parseSrt(srt);
    expect(back.map((c) => c.text).join(" ")).toBe(cues.map((c) => c.text).join(" "));
  });
});

describe("editable AST patching", () => {
  const src = `export const V = () => (
  <TransitionSeries name="Scenes">
    <TransitionSeries.Sequence name="s01 · Intro" durationInFrames={2 * fps}>
      <TextLayer name="s01 title" style={{fontSize: 70}}>Hello</TextLayer>
      <Chip name="s01 label">Speculative</Chip>
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
    <TransitionSeries.Sequence name="s02 · Next" durationInFrames={90}>
      <TextLayer name="s02 title">World</TextLayer>
    </TransitionSeries.Sequence>
  </TransitionSeries>
);`;

  it("changes only the targeted attribute", () => {
    const out = setAttr(src, "s01 title", "animation", '"fade-up"');
    expect(out.replace(' animation="fade-up"', "")).toBe(src);
    const out2 = setAttr(src, "s02 title", "style", "{{fontSize: 40}}");
    expect(out2).toContain('<TextLayer name="s02 title" style={{fontSize: 40}}>World</TextLayer>');
    expect(out2.split("s02 title")[0]).toBe(src.split("s02 title")[0]);
  });

  it("reads scene spans including fps expressions and transition overlap", () => {
    const { spans, totalFrames } = readSceneSpans(src, 30);
    expect(spans.map((s) => [s.sceneId, s.startFrame, s.durationInFrames])).toEqual([
      ["s01", 0, 60],
      ["s02", 48, 90],
    ]);
    expect(totalFrames).toBe(138);
  });

  it("removes an element cleanly and keeps the code valid", () => {
    const out = removeElement(src, "s01 label");
    expect(out).not.toContain("Speculative");
    expect(syntaxErrors(out)).toEqual([]);
    expect(listElements(out).filter((e) => e.name).length).toBe(listElements(src).filter((e) => e.name).length - 1);
  });

  it("reports syntax errors from hand edits", () => {
    expect(syntaxErrors(src.replace("</TextLayer>", ""))).not.toEqual([]);
  });
});

describe("budget and render config", () => {
  it("requires approval above the budget", () => {
    const req = VideoRequest.parse({ prompt: "a test video", budgetUsd: 1 });
    const planned = [{ category: "image" as const, provider: "p", description: "d", estimatedUsd: 2 }];
    expect(() => enforceBudget(req, emptyManifest(), planned)).toThrow(BudgetApprovalRequired);
    expect(enforceBudget({ ...req, approveSpendUsd: 2.5 }, emptyManifest(), planned).total).toBe(2);
  });

  it("maps aspect ratios to render sizes", () => {
    expect(RESOLUTIONS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(RESOLUTIONS["16:9"]).toEqual({ width: 1920, height: 1080 });
    const req = VideoRequest.parse({ prompt: "a test video" });
    expect(req.fps).toBe(30);
    expect(req.aspectRatio).toBe("9:16");
  });
});
