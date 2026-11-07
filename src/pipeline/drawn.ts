/**
 * The drawn preset's storyboard: one LLM call per scene, a browser layout check
 * over all of them, and a limited number of fixes for the scenes that failed.
 */
import type { CreativeDirection, Scene } from "../schemas/storyboard";
import type { VideoRequest } from "../schemas/options";
import type { CostReport, LlmProvider, Script } from "../providers/types";
import type { DrawnLayoutReport, LayoutIssue } from "../rendering/svg-layout";
import { FONT_STACKS, THEME_TOKENS } from "../video/themes/themes";
import type { DrawnTokens } from "../video/scenes/drawn-svg";

export const MAX_FIX_ROUNDS = 2;
const CONCURRENCY = 4;

/** A drawing holds several beats, so a scene runs about 12 seconds. */
export const drawnSceneCount = (seconds: number) => Math.min(60, Math.max(3, Math.round(seconds / 12)));

/** Rough spend for the budget check: about 5k tokens of output a scene, plus fixes. */
export const estimateDrawnUsd = (scenes: number, outputPerMTok: number) => (scenes * 1.3 * 5000 * outputPerMTok) / 1e6;

export const drawnTokens = (d: CreativeDirection): DrawnTokens => {
  const theme = THEME_TOKENS[d.visualStyle.theme];
  const fonts = FONT_STACKS[d.visualStyle.fontPairing];
  const pal = d.visualStyle.palette;
  return { bg: pal.background, primary: pal.primary, accent: pal.accent, text: pal.text, muted: theme.muted, panel: theme.backgroundAlt, display: fonts.display, body: fonts.body };
};

export type DrawOptions = {
  llm: LlmProvider;
  request: VideoRequest;
  direction: CreativeDirection;
  script: Script;
  width: number;
  height: number;
  /** Absent when no browser is available, as in tests; drawings then go unmeasured. */
  check?: (scenes: { id: string; svg: string }[]) => Promise<DrawnLayoutReport>;
  onCost: (description: string, cost: CostReport) => void;
  onProgress: (done: number, total: number, message: string) => void;
  log: (level: "info" | "warn", message: string) => void;
};

export type DrawResult = { scenes: Scene[]; layout: { rounds: number; fixedScenes: string[]; remaining: Record<string, LayoutIssue[]>; firstPassFailures: string[] } };

const svgOf = (s: Scene) => (s.layout === "drawn" ? s.svg : "");
const errorsIn = (issues: LayoutIssue[] | undefined) => (issues ?? []).filter((i) => i.severity === "error");

export const drawScenes = async (o: DrawOptions): Promise<DrawResult> => {
  const { llm, request, direction, script, width, height } = o;
  if (!llm.drawScene) throw new Error(`${llm.name} can't draw scenes`);
  const draw = llm.drawScene.bind(llm);
  const total = script.beats.length;
  const scenes: Scene[] = new Array(total);
  let done = 0;

  const one = async (i: number, extra: { reference?: string; previous?: { svg: string; issues: string[] } }, label: string) => {
    const res = await draw(request, direction, script, i, { width, height, ...extra });
    o.onCost(`${label} s${String(i + 1).padStart(2, "0")}`, res.cost);
    scenes[i] = res.scene;
  };

  // The first scene sets the style, and the second writes the prompt cache the rest read.
  await one(0, {}, "draw");
  o.onProgress(++done, total, "scene 1 drawn; it sets the style for the rest");
  const reference = svgOf(scenes[0]);
  if (total > 1) {
    await one(1, { reference }, "draw");
    o.onProgress(++done, total, "scene 2 drawn");
  }
  const queue = Array.from({ length: Math.max(0, total - 2) }, (_, k) => k + 2);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        await one(i, { reference }, "draw");
        o.onProgress(++done, total, `scene ${i + 1} drawn`);
      }
    }),
  );

  if (!o.check) return { scenes, layout: { rounds: 0, fixedScenes: [], remaining: {}, firstPassFailures: [] } };

  const fixed = new Set<string>();
  let firstPassFailures: string[] = [];
  let rounds = 0;
  let report = await o.check(scenes.map((s) => ({ id: s.id, svg: svgOf(s) })));
  for (;;) {
    const failing = scenes.map((s, i) => ({ s, i })).filter(({ s }) => errorsIn(report[s.id]).length);
    if (rounds === 0) firstPassFailures = failing.map(({ s }) => s.id);
    if (!failing.length || rounds >= MAX_FIX_ROUNDS) break;
    rounds++;
    o.log("info", `layout check: ${failing.map(({ s }) => `${s.id} (${errorsIn(report[s.id]).length})`).join(", ")} need a fix, round ${rounds}`);
    const todo = [...failing];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
        for (let f = todo.shift(); f; f = todo.shift()) {
          const previous = { svg: svgOf(f.s), issues: errorsIn(report[f.s.id]).map((x) => x.detail) };
          await one(f.i, { reference: f.i === 0 ? undefined : reference, previous }, `fix round ${rounds}`);
          fixed.add(f.s.id);
        }
      }),
    );
    const again = await o.check(scenes.map((s) => ({ id: s.id, svg: svgOf(s) })));
    report = again;
  }
  const remaining = Object.fromEntries(Object.entries(report).filter(([, v]) => v.length));
  for (const [id, issues] of Object.entries(remaining)) for (const i of issues) o.log("warn", `${id}: ${i.kind}: ${i.detail}`);
  return { scenes, layout: { rounds, fixedScenes: [...fixed], remaining, firstPassFailures } };
};
