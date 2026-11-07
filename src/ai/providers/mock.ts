/**
 * Offline, deterministic LLM. Used by tests and by the explicit `--llm mock`
 * CLI mode. It never calls a network service and it does not pretend to know
 * facts: narration is generic, template-driven copy built from the prompt and
 * the parsed hints, and the provider identifies itself as name "mock",
 * model "mock-offline" so the UI/manifest can label the output clearly.
 *
 * Scenes are built in the same flat shape the Anthropic adapter receives and
 * pass through the same `mapLlmStoryboard` repair/validation, so the mock
 * exercises the real mapping path.
 */
import type { CostReport, LlmProvider, PromptHints, Script, ScriptBeat } from "../../providers/types";
import { ProviderError } from "../../providers/types";
import type { VideoRequest } from "../../schemas/options";
import type { CreativeDirection, Scene } from "../../schemas/storyboard";
import type { ProceduralArt, ThemeName, VideoFormat } from "../../schemas/catalog";
import { suggestArts } from "../prompt-parser";
import { mapLlmDirection, mapLlmScene, mapLlmStoryboard, validateScene, type LlmDirection, type LlmScene } from "./anthropic";
import { mapDrawnScene } from "../drawn-prompt";

const ZERO = (what: string): CostReport => ({ estimatedUsd: 0, actualUsd: 0, description: `mock-offline ${what} (no API call)` });

const PALETTES: Record<ThemeName, { background: string; primary: string; accent: string; text: string }> = {
  storm: { background: "#070b18", primary: "#8ab4ff", accent: "#ffe066", text: "#f4f7ff" },
  cosmic: { background: "#04030c", primary: "#c9b6ff", accent: "#ffb86b", text: "#fbf8ff" },
  vivid: { background: "#ff4d2e", primary: "#1b1b3a", accent: "#ffffff", text: "#ffffff" },
  "clean-light": { background: "#f6f4ef", primary: "#1f2937", accent: "#2563eb", text: "#111827" },
  noir: { background: "#0b0b0b", primary: "#e5e5e5", accent: "#e11d48", text: "#fafafa" },
  warm: { background: "#2a1610", primary: "#ffcf99", accent: "#ff7a45", text: "#fff6ec" },
  tech: { background: "#060f14", primary: "#5eead4", accent: "#a3e635", text: "#ecfeff" },
  nature: { background: "#0d1f16", primary: "#b7e4c7", accent: "#ffd166", text: "#f1faee" },
};

const ART_THEME: Partial<Record<ProceduralArt, ThemeName>> = {
  starfield: "cosmic", "orbit-diagram": "cosmic", eclipse: "cosmic", "earth-two-moons": "cosmic", "two-moons-horizon": "cosmic", tides: "cosmic",
  "ocean-depths": "nature", sunrise: "warm", "storm-clouds": "storm", "lightning-bolt": "storm", "charge-separation": "storm", "thunder-wave": "storm",
  "particle-network": "tech", "wireframe-globe": "tech", "bar-chart": "clean-light", "flow-arrows": "clean-light",
  checklist: "clean-light", "focus-timer": "clean-light", "phone-focus": "noir", "calendar-blocks": "clean-light",
};

/** "Make a 30-second video about five useful AI tools for students" -> "five useful AI tools for students". */
export const extractTopic = (prompt: string): string => {
  let t = prompt.trim().replace(/[.!?]+$/, "");
  t = t.replace(/^(please\s+)?(make|create|generate|produce|write|give me|i want|build)\s+(me\s+)?(an?\s+)?/i, "");
  t = t.replace(/^(\d+|one|two|three|four|five|six|ten|twenty|thirty|forty[- ]five|sixty)[\s-]*(seconds?|secs?|s|minutes?|mins?)\b[\s-]*/i, "");
  t = t.replace(/^(short|quick|vertical|cinematic|fun|tiktok|youtube|instagram|reels?)\s+/gi, "");
  t = t.replace(/^(video|clip|short|reel|explainer|story|tiktok|ad)\s+(about|on|explaining|showing|for|of)\s+/i, "");
  t = t.replace(/^(about|on|explaining)\s+/i, "");
  t = t.replace(/\s+for\s+(tiktok|reels|shorts|youtube( shorts)?|instagram)\s*$/i, "");
  return t.trim() || prompt.trim();
};

const LIST_NOUN = /\b(tools|tips|habits|ways|reasons|facts|things|ideas|apps|steps|mistakes|secrets|hacks|tricks|books|places|foods|lessons|rules|signs|myths|questions|products|features|examples|strategies|benefits|exercises|routines|websites|gadgets|skills|methods|trends)\b/i;
const singular = (w: string) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.replace(/s$/, ""));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatFor = (hints: PromptHints): VideoFormat => {
  if (hints.listCount) return "listicle";
  if (hints.formatHint === "ad") return "promo_ad";
  if (hints.formatHint === "product") return "product_showcase";
  if (hints.formatHint === "tutorial") return "tutorial";
  if (hints.fictional || hints.formatHint === "story") return "narrative";
  if (hints.speculative || hints.formatHint === "cinematic") return "cinematic_story";
  return "explainer";
};

export class MockLlm implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-offline";
  calls = { direction: 0, script: 0, storyboard: 0, rewriteScene: 0, reviewClaims: 0 };

  async direction(req: VideoRequest, hints: PromptHints) {
    this.calls.direction++;
    const topic = extractTopic(req.prompt);
    const duration = hints.requestedDurationSeconds ?? req.durationSeconds;
    const format = formatFor(hints);
    const arts = suggestArts(req.prompt);
    const theme: ThemeName =
      (req.style === "tech" && "tech") ||
      (req.style === "minimal" && "clean-light") ||
      (req.style === "retro" && "warm") ||
      ART_THEME[arts[0]] ||
      (format === "listicle" ? "vivid" : hints.speculative ? "cosmic" : "storm");
    const cinematic = format === "cinematic_story" || format === "narrative";
    const pacing = format === "listicle" || format === "promo_ad" ? "fast" : cinematic ? "measured" : "brisk";
    const perScene = pacing === "fast" ? 3.5 : pacing === "brisk" ? 4.5 : 5.5;
    const sceneCount = hints.listCount ? hints.listCount + 2 : Math.round(duration / perScene);
    const contentKind = hints.fictional ? "fiction" : hints.speculative ? "speculative" : format === "tutorial" ? "instructional" : format === "promo_ad" || format === "product_showcase" ? "promotional" : "factual";
    const raw: LlmDirection = {
      title: cap(topic).slice(0, 60),
      objective: `Give viewers a clear, memorable take on ${topic}.`,
      audience: req.audience !== "auto" ? req.audience : "curious short-form viewers",
      tone: req.tone !== "auto" ? req.tone : cinematic ? "awe-struck and atmospheric" : "upbeat and clear",
      format,
      contentKind,
      pacing,
      narrationStyle: cinematic ? "calm, vivid, present tense" : "direct, second person, short sentences",
      visualStyle: {
        name: cinematic ? "Cinematic atmosphere" : "Bold explainer",
        description: cinematic ? "Moody cinematic stills with slow camera moves" : "Clean motion graphics mixed with bold imagery",
        imageStylePrompt: cinematic
          ? "cinematic photograph, volumetric light, rich colour grade, 35mm, shallow depth of field"
          : "crisp editorial illustration, bold shapes, soft gradients, high contrast",
        theme,
        fontPairing: cinematic ? "cinematic-serif" : format === "listicle" ? "bold-display" : theme === "tech" ? "tech-grotesk" : "modern-sans",
        palette: PALETTES[theme],
      },
      captionStyle: req.captionStyle !== "auto" ? req.captionStyle : cinematic ? "cinematic" : format === "listicle" ? "bold" : "word-highlight",
      transitionStyle: cinematic ? "blur-dissolve" : pacing === "fast" ? "slide-up" : "crossfade",
      musicMood: cinematic ? (hints.speculative ? "suspenseful" : "cinematic") : format === "listicle" ? "energetic" : "uplifting",
      targetSceneCount: sceneCount,
      hookIdea: hints.speculative ? `Open on the question itself: ${topic}?` : `Open with a bold one-line promise about ${topic}.`,
      ending: format === "listicle" ? "Quick recap and a follow prompt" : "A single memorable takeaway line",
      needsFactCheck: contentKind === "factual" || hints.mentionsRealPerson,
      timeSensitive: hints.timeSensitive,
    };
    const r = mapLlmDirection(raw, hints, req);
    if (!r.value) throw new ProviderError(this.name, `mock direction invalid: ${r.errors.join("; ")}`);
    return { direction: r.value, cost: ZERO("direction") };
  }

  async script(req: VideoRequest, direction: CreativeDirection, hints: PromptHints) {
    this.calls.script++;
    const topic = extractTopic(req.prompt);
    const beats: ScriptBeat[] = [];
    if (hints.listCount) {
      const noun = (req.prompt.match(LIST_NOUN)?.[1] ?? "ideas").toLowerCase();
      beats.push({ purpose: "hook", narration: `Here are ${hints.listCount} ${noun} worth knowing: ${topic}.`, intent: "promise the list" });
      for (let i = 1; i <= hints.listCount; i++) {
        beats.push({
          purpose: "point",
          narration: `Number ${i}. ${cap(singular(noun))} ${i} is one to try, and here is why it earns its place on this list.`,
          intent: `item:${i}`,
        });
      }
      beats.push({ purpose: "outro", narration: `Which one will you try first? Follow for more.`, intent: "call to action" });
    } else {
      const n = Math.max(3, direction.targetSceneCount);
      const spec = hints.speculative;
      const fiction = hints.fictional;
      beats.push({
        purpose: "hook",
        narration: spec ? `${cap(topic.replace(/^what if\s+/i, "What if "))}? Let's imagine it.` : fiction ? `This is a story about ${topic}.` : `Here is what most people miss about ${topic}.`,
        intent: "stop the scroll",
      });
      beats.push({ purpose: "context", narration: spec ? `This is a thought experiment, not a prediction, so let's start with what we actually know.` : `First, a little context on how it all begins.`, intent: "set the scene" });
      const middle = n - 4;
      for (let i = 0; i < Math.max(1, middle); i++) {
        beats.push({
          purpose: i === middle - 1 && middle > 2 ? "twist" : "point",
          narration: spec ? `If it happened, change number ${i + 1} would ripple outward in ways that are easy to underestimate.` : `Key idea ${i + 1}: each part builds on the one before it.`,
          intent: `point ${i + 1}`,
        });
      }
      beats.push({ purpose: "summary", narration: spec ? `It is speculation, but it shows how connected everything really is.` : `Put together, the whole picture finally makes sense.`, intent: "land the takeaway" });
      beats.push({ purpose: "outro", narration: `Follow for more short explainers like this.`, intent: "close" });
    }
    const script: Script = { title: direction.title, hook: beats[0].narration, beats, sources: [] };
    return { script, cost: ZERO("script") };
  }

  private flatScene(req: VideoRequest, direction: CreativeDirection, beat: ScriptBeat, i: number, total: number, arts: ProceduralArt[]): LlmScene {
    const topic = extractTopic(req.prompt);
    const art = arts[i % arts.length];
    const style = direction.visualStyle.imageStylePrompt;
    const imagePrompt = (subject: string) => `${subject}, ${style}, vertical portrait composition, subject centred with space for captions in the lower third, no text, no letters, no logos, no watermarks`;
    const stock = req.visualMode === "stock_preferred";
    const imageVisual = (subject: string): LlmScene["visual"] =>
      stock
        ? { type: "stock_image", description: subject, stockQuery: topic.split(/\s+/).slice(0, 4).join(" "), motion: i % 2 ? "pan-left" : "push-in" }
        : { type: "generated_image", prompt: imagePrompt(subject), description: subject, motion: i % 2 ? "pull-out" : "push-in", wantsMotionClip: i === 0 };
    const base = {
      purpose: beat.purpose,
      narration: beat.narration,
      transitionIn: direction.transitionStyle,
      claims: direction.contentKind === "speculative" ? [{ text: beat.narration, kind: "speculation" as const, confidence: 0.5 }] : [],
    };
    if (req.quality === "explainer") {
      const kinds = ["statement", "cards", "steps", "diagram"];
      const kind = kinds[i % kinds.length];
      const image = i === 0 || i === total - 1 || i % 5 === 0;
      const items = kind === "statement" ? [] : ["First part", "Second part", "Third part"].map((title) => ({ title, body: "", tag: "", cue: "" }));
      return {
        ...base,
        layout: "slide",
        title: direction.title,
        visual: image ? { type: "generated_image", prompt: `A symbolic object representing ${topic}`, description: `A symbolic object representing ${topic}` } : { type: "animated_text", description: `Slide about ${topic}` },
        content: { slideKind: kind, heading: i === 0 ? cap(topic) : `Part ${i + 1} of ${total}`, kicker: `Section ${i + 1}`, chapter: `Part ${Math.floor(i / 2) + 1}`, items, edges: kind === "diagram" ? [{ from: 0, to: 1 }, { from: 1, to: 2 }] : [] },
      };
    }
    const item = beat.intent.match(/^item:(\d+)$/);
    if (beat.purpose === "hook") {
      return { ...base, layout: "cinematic_image", onScreenText: direction.title, animationPreset: "scale-pop", visual: imageVisual(`A striking opening image about ${topic}`), sfx: "whoosh" };
    }
    if (beat.purpose === "outro" || beat.purpose === "cta" || i === total - 1) {
      return { ...base, layout: "outro", visual: { type: "motion_graphics", art: "aurora-gradient", description: "Soft closing gradient" }, content: { cta: "Follow for more" }, animationPreset: "fade-up" };
    }
    if (item) {
      const n = Number(item[1]);
      const noun = (req.prompt.match(LIST_NOUN)?.[1] ?? "idea").toLowerCase();
      return {
        ...base,
        layout: "listicle",
        content: { number: n, heading: `${cap(singular(noun))} #${n}` },
        visual: n % 2 ? imageVisual(`Illustration representing ${singular(noun)} number ${n} for ${topic}`) : { type: "motion_graphics", art, description: `Procedural ${art} backdrop` },
        animationPreset: n % 2 ? "slide-left" : "slide-right",
        sfx: "pop",
      };
    }
    if (beat.purpose === "summary") {
      return { ...base, layout: "text_reveal", visual: { type: "animated_text", description: "Kinetic typography summary" }, content: { emphasis: "whole picture" }, animationPreset: "word-stagger" };
    }
    // Rotate through varied layouts for middle beats.
    const rot = (i - 1) % 3;
    if (rot === 0) return { ...base, layout: "diagram", visual: { type: "diagram", art, description: `Diagram: ${art.replace(/-/g, " ")}` }, content: { labels: [] }, animationPreset: "mask-reveal" };
    if (rot === 1) return { ...base, layout: "cinematic_image", visual: imageVisual(`A cinematic scene illustrating ${topic}`), animationPreset: "blur-in" };
    return { ...base, layout: "fact_card", visual: { type: "motion_graphics", art, description: `Procedural ${art} backdrop` }, content: { label: direction.contentKind === "speculative" ? "Imagine" : "Key idea", fact: beat.narration.split(/[.!?]/)[0] }, animationPreset: "fade-up" };
  }

  async storyboard(req: VideoRequest, direction: CreativeDirection, script: Script) {
    this.calls.storyboard++;
    const arts = suggestArts(`${req.prompt} ${direction.objective}`);
    const pool: ProceduralArt[] = arts.length ? [...arts, "aurora-gradient"] : ["aurora-gradient", "particle-network", "flow-arrows"];
    const scenes = script.beats.map((b, i) => this.flatScene(req, direction, b, i, script.beats.length, pool));
    const disclaimer =
      direction.contentKind === "speculative"
        ? "Speculative scenario for entertainment; not a prediction."
        : direction.contentKind === "fiction"
          ? "Fictional story."
          : "Offline mock storyboard: placeholder narration, not researched content.";
    const r = mapLlmStoryboard({ title: script.title, hook: script.hook, scenes, sources: script.sources, disclaimer }, { visualMode: req.visualMode, fallbackArt: pool[0], explainer: req.quality === "explainer" });
    if (!r.value) throw new ProviderError(this.name, `mock storyboard invalid: ${r.errors.join("; ")}`);
    return { storyboard: { ...r.value, model: this.model }, cost: ZERO("storyboard") };
  }

  async rewriteScene(req: VideoRequest, direction: CreativeDirection, scenes: Scene[], sceneId: string, instruction: string) {
    this.calls.rewriteScene++;
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new ProviderError(this.name, `scene ${sceneId} not found`);
    const s = scenes[index];
    if (s.layout === "drawn") {
      const script: Script = { title: direction.title, hook: direction.hookIdea, sources: [], beats: scenes.map((x) => ({ purpose: x.purpose, narration: x.narration, intent: x.visual.description })) };
      return this.drawScene(req, direction, script, index, { width: 1920, height: 1080 });
    }
    const narrationEdit = instruction.match(/^\s*narration:\s*(.+)$/is);
    const flat: LlmScene = {
      purpose: s.purpose,
      layout: s.layout,
      title: s.title,
      narration: narrationEdit ? narrationEdit[1].trim() : s.narration,
      onScreenText: s.onScreenText,
      visual: {
        ...s.visual,
        prompt: s.visual.prompt && !narrationEdit ? `${s.visual.prompt}; revision: ${instruction}` : s.visual.prompt,
        description: narrationEdit ? s.visual.description : `${s.visual.description} (revised: ${instruction})`,
      },
      animationPreset: s.animationPreset,
      transitionIn: s.transitionIn,
      sfx: s.sfx,
      claims: s.claims,
      content: { ...(s as Record<string, unknown>) } as LlmScene["content"],
    };
    const m = mapLlmScene(flat, index, { visualMode: req.visualMode, explainer: req.quality === "explainer" }, s.layout === "listicle" ? s.number : undefined);
    const v = validateScene(m.scene);
    if (!v.value) throw new ProviderError(this.name, `mock rewrite invalid: ${v.errors.join("; ")}`);
    return { scene: v.value, cost: ZERO("scene rewrite") };
  }

  async drawScene(_req: VideoRequest, _direction: CreativeDirection, script: Script, index: number, opts: { width: number; height: number }) {
    const beat = script.beats[index];
    const words = beat.narration.split(/\s+/);
    const cues = [words.slice(0, 2).join(" "), words.slice(Math.floor(words.length / 2), Math.floor(words.length / 2) + 2).join(" ")];
    const w = opts.width;
    const svg = `<svg><text x='${w * 0.06}' y='150' font-size='64' font-weight='800' font-family='var(--display)' fill='var(--text)'>Scene ${index + 1}</text><rect x='${w * 0.1}' y='260' width='${w * 0.35}' height='300' rx='24' fill='var(--panel)' data-beat='0' data-anim='pop'/><circle cx='${w * 0.7}' cy='410' r='150' fill='var(--primary)' data-beat='1' data-anim='pop'/><path d='M${w * 0.45} 410 L${w * 0.7 - 150} 410' fill='none' stroke='var(--accent)' stroke-width='6' data-beat='1' data-anim='draw'/></svg>`;
    const m = mapDrawnScene({ heading: `Scene ${index + 1}`, chapter: index < 2 ? "Intro" : "Main", description: "A panel joined to a circle.", beats: cues.map((cue) => ({ cue, what: "part" })), svg, claims: [] }, index, beat);
    if (!m.value) throw new ProviderError(this.name, `mock drawing invalid: ${m.errors.join("; ")}`);
    return { scene: m.value, cost: ZERO("drawn scene") };
  }

  async reviewClaims(_direction: CreativeDirection, scenes: Scene[]) {
    this.calls.reviewClaims++;
    const issues: { sceneId: string; claim: string; problem: string }[] = [];
    for (const s of scenes) {
      for (const c of s.claims) {
        if ((c.kind === "statistic" || c.kind === "quote") && !c.sourceUrl) issues.push({ sceneId: s.id, claim: c.text, problem: `${c.kind} without a source` });
        else if (c.kind === "fact" && c.confidence < 0.5) issues.push({ sceneId: s.id, claim: c.text, problem: "low-confidence factual claim" });
      }
    }
    return { issues, cost: ZERO("claim review") };
  }
}
