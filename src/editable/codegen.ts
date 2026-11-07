/**
 * Generates projects/<id>/editable/Video.tsx: an explicit, literal Remotion
 * composition where every scene, text, caption, media and audio element is
 * its own named JSX node with inline values. That is what makes the project
 * visually editable in Remotion Studio (Studio rewrites these literals in
 * place), and why edits survive: the generator never rewrites this file once
 * it exists unless asked to (see editable/store.ts).
 */
import type { Caption } from "@remotion/captions";
import type { CreativeDirection, Scene } from "../schemas/storyboard";
import type { Asset, AssetManifest } from "../schemas/project";
import type { CaptionStyleName } from "../schemas/options";
import type { ProceduralArt, ThemeName, TransitionName } from "../schemas/catalog";
import { FONT_STACKS, THEME_TOKENS } from "../video/themes/themes";
import type { Timeline } from "../rendering/timeline";
import { chapterMarks, resolveReveals } from "../rendering/reveals";
import { slideMediaBox, slideMediaMode } from "../video/scenes/slide-layout";
import { wordsToCaptions } from "../captions";

export type CodegenInput = {
  projectId: string;
  componentName: string;
  width: number;
  height: number;
  fps: number;
  direction: CreativeDirection;
  scenes: Scene[];
  manifest: AssetManifest;
  timeline: Timeline;
  captionStyle: CaptionStyleName;
  captionsEnabled: boolean;
  musicVolume: number;
  speculativeLabel?: string;
  /** Small label on the first scene, e.g. "Offline demo · silent narration". */
  notice?: string;
};

export const componentNameFor = (projectId: string) => `Video_${projectId.replace(/[^a-zA-Z0-9]/g, "_")}`;

/* -------------------------------------------------------------- literals */

const str = (s: string) => JSON.stringify(s);
/** JSX text children: strip characters that would need escaping. */
const jsxText = (s: string) => s.replace(/[{}]/g, "").replace(/</g, "‹").replace(/>/g, "›").replace(/\s+/g, " ").trim();
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
const styleObj = (o: Record<string, string | number | undefined>) =>
  `{{${Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? num(v) : str(v as string)}`)
    .join(", ")}}}`;
/** A string as an expression attribute, safe for quotes and backslashes (plain attributes have no escapes). */
const strExpr = (s: string) => `{${JSON.stringify(s)}}`;
const captionsLiteral = (caps: Caption[], indent: string) =>
  `[\n${caps
    .map((c) => `${indent}  {text: ${str(c.text)}, startMs: ${c.startMs}, endMs: ${c.endMs}, timestampMs: ${c.timestampMs ?? "null"}, confidence: null}`)
    .join(",\n")}\n${indent}]`;

const TRANSITION_CODE: Record<TransitionName, string | null> = {
  crossfade: "fade()",
  "slide-up": 'slide({direction: "from-bottom"})',
  "slide-left": 'slide({direction: "from-right"})',
  wipe: 'wipe({direction: "from-left"})',
  "zoom-through": "zoomThrough()",
  "blur-dissolve": "blurDissolve()",
  flash: "flash()",
  "dip-to-black": "dipToBlack()",
  cut: null,
};

const DEFAULT_ART: Record<ThemeName, ProceduralArt> = {
  storm: "storm-clouds",
  cosmic: "starfield",
  vivid: "aurora-gradient",
  "clean-light": "aurora-gradient",
  noir: "aurora-gradient",
  warm: "sunrise",
  tech: "particle-network",
  nature: "ocean-depths",
};

/* -------------------------------------------------------------- styling */

export const captionStyleFor = (style: CaptionStyleName, d: CreativeDirection, height: number) => {
  const fonts = FONT_STACKS[d.visualStyle.fontPairing];
  const lift = `0px -${Math.round(height * 0.2)}px`;
  switch (style) {
    case "minimal":
      return { style: { fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 50, color: "#ffffff", translate: lift }, uppercase: false, words: 6 };
    case "cinematic":
      return { style: { fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: lift }, uppercase: false, words: 7 };
    case "word-highlight":
      return { style: { fontFamily: fonts.body, fontWeight: 800, fontSize: 70, color: "#ffffff", translate: lift }, uppercase: false, words: 4 };
    case "karaoke":
      return { style: { fontFamily: fonts.body, fontWeight: 900, fontSize: 72, color: "#ffffff", translate: lift }, uppercase: false, words: 5 };
    case "bold":
    default:
      return {
        style: { fontFamily: fonts.uppercase ? fonts.display : "Montserrat, sans-serif", fontWeight: 900, fontSize: fonts.uppercase ? 92 : 78, color: "#ffffff", translate: lift },
        uppercase: true,
        words: 3,
      };
  }
};

const currentAsset = (manifest: AssetManifest, sceneId: string): Asset | undefined => {
  const entry = manifest.scenes.find((s) => s.sceneId === sceneId);
  if (!entry?.currentAssetId) return undefined;
  return entry.history.find((a) => a.id === entry.currentAssetId);
};

const STILL_MOVES = ["push-in", "pan-left", "pull-out", "pan-up", "parallax", "pan-right"] as const;
const isVideoAsset = (a: Asset) => a.kind === "generated_video" || a.kind === "stock_video" || (a.kind === "uploaded" && a.mediaType === "video");

/** The latest still before this scene: plain slides show it as a faint ghost, so a section keeps its look at no extra cost. */
const earlierStill = (manifest: AssetManifest, sceneId: string) =>
  [...manifest.scenes]
    .filter((s) => s.sceneId < sceneId)
    .sort((a, b) => b.sceneId.localeCompare(a.sceneId))
    .map((s) => currentAsset(manifest, s.sceneId))
    .find((a) => a?.kind === "generated_image");

const slideMediaOf = (asset: Asset | undefined) => (!asset ? ("none" as const) : asset.kind === "uploaded" ? ("uploaded" as const) : ("generated" as const));

/** Reveal frames follow the narration; call again whenever the narration changes. */
const slideItems = (x: SceneCodeInput) => {
  if (x.scene.layout !== "slide") return [];
  const { items } = x.scene;
  const seg = x.manifest.narration.find((n) => n.sceneId === x.scene.id);
  const at = resolveReveals(items.map((i) => i.cue), seg?.words ?? [], x.timing.narrationOffsetFrames, x.timing.narrationFrames, x.fps);
  return items.map((i, k) => ({ title: i.title, ...(i.body ? { body: i.body } : {}), ...(i.tag ? { tag: i.tag } : {}), at: at[k] }));
};

export const chaptersLiteral = (scenes: Scene[], startFrames: number[]) => JSON.stringify(chapterMarks(scenes, startFrames));

/* -------------------------------------------------------------- per-scene */

export type SceneCodeInput = Omit<CodegenInput, "scenes" | "timeline"> & { scene: Scene; index: number; timing: Timeline["scenes"][number]; isLast: boolean };

export const sceneVisualCode = (x: SceneCodeInput, indent: string) => {
  const { scene, direction: d, manifest, projectId } = x;
  const theme = THEME_TOKENS[d.visualStyle.theme];
  const pal = d.visualStyle.palette;
  const fonts = FONT_STACKS[d.visualStyle.fontPairing];
  const asset = currentAsset(manifest, scene.id);
  const id = scene.id;
  const labels = scene.layout === "diagram" ? scene.labels.join(" | ") : "";
  const art = scene.visual.art ?? (scene.layout === "mixed_media" ? scene.overlayArt : undefined) ?? DEFAULT_ART[d.visualStyle.theme];
  const artNode = (name: string, extraStyle: Record<string, string | number> = {}) =>
    `${indent}<ArtLayer name=${str(name)} art=${str(art)} primaryColor=${str(pal.primary)} accentColor=${str(pal.accent)} backgroundColor=${str(pal.background)} labels=${str(labels)} seed={${x.index + 1}} labelFont=${str(fonts.body)}${scene.onScreenText ?? scene.title ? " titleSafe" : ""}${x.captionsEnabled && scene.narration.trim() ? " captionSafe" : ""} style=${styleObj({ translate: "0px 0px", scale: 1, ...extraStyle })} />`;
  const darken = ["cinematic_image", "video_clip", "mixed_media"].includes(scene.layout) ? 0.35 : 0.55;
  const lines: string[] = [];
  if (scene.layout === "slide") {
    lines.push(`${indent}<Backdrop name=${str(`${id} backdrop`)} colorA=${str(pal.background)} colorB=${str(pal.background)} angle={160} style=${styleObj({})} />`);
    if (!asset) {
      const ghost = earlierStill(manifest, id);
      if (ghost) {
        lines.push(
          `${indent}<MediaLayer name=${str(`${id} visual`)} src={staticFile(${str(`${projectId}/${ghost.file}`)})} mediaType="image" motion="parallax" motionStrength={0.03} darken={0} blur={3} box=${str(slideMediaBox("side", true, x.height > x.width))} chrome="none" chromeLabel="" blackPoint={1.25} edgeFade={0.6} style=${styleObj({ translate: "0px 0px", scale: 1, opacity: 0.2 })} />`,
        );
      }
      return lines;
    }
    const mode = slideMediaMode(scene.slideKind, slideMediaOf(asset));
    const box = slideMediaBox(mode, scene.items.length > 0, x.height > x.width);
    const framed = mode === "frame";
    const motion = framed ? "static" : scene.visual.motion === "static" ? "push-in" : scene.visual.motion;
    const src = `staticFile(${str(`${projectId}/${asset.file}`)})`;
    lines.push(
      `${indent}<MediaLayer name=${str(`${id} visual`)} src={${src}} mediaType=${str(isVideoAsset(asset) ? "video" : "image")} motion=${str(motion)} motionStrength={${framed ? 0 : 0.04}} darken={${mode === "backdrop" ? 0.85 : 0}} blur={0} box=${str(box)} chrome=${str(framed ? "browser" : "none")} chromeLabel=${strExpr(scene.mediaHint ?? "")} blackPoint={${framed ? 1 : 1.25}} edgeFade={${framed ? 0 : mode === "backdrop" ? 0.5 : 0.6}} style=${styleObj({ translate: "0px 0px", scale: 1 })} />`,
    );
    return lines;
  }
  const useArtOnly = !asset || (scene.layout === "diagram" && asset.kind !== "uploaded");
  const cardLayout = !["cinematic_image", "video_clip", "mixed_media", "diagram", "text_reveal"].includes(scene.layout);
  if (cardLayout) {
    lines.push(`${indent}<Backdrop name=${str(`${id} backdrop`)} colorA=${str(theme.background)} colorB=${str(theme.backgroundAlt)} angle={160} style=${styleObj({})} />`);
  }
  if (useArtOnly) {
    lines.push(artNode(`${id} visual`, cardLayout ? { opacity: 0.22, filter: "blur(10px)" } : {}));
  } else {
    const src = `staticFile(${str(`${projectId}/${asset.file}`)})`;
    const video = isVideoAsset(asset);
    // A still never sits frozen: if the storyboard said "static", give it a gentle camera move (varied per scene).
    const motion = !video && scene.visual.motion === "static" ? STILL_MOVES[x.index % STILL_MOVES.length] : scene.visual.motion;
    const strength = motion === "static" ? 0 : video ? 0.04 : 0.1;
    lines.push(
      `${indent}<MediaLayer name=${str(`${id} visual`)} src={${src}} mediaType=${str(video ? "video" : "image")} motion=${str(motion)} motionStrength={${strength}} darken={${darken}} blur={0} style=${styleObj({ translate: "0px 0px", scale: 1 })} />`,
    );
    if (scene.layout === "mixed_media") lines.push(artNode(`${id} overlay`, { opacity: 0.55 }));
  }
  return lines;
};

export const sceneLayoutCode = (x: SceneCodeInput, indent: string): string[] => {
  const { scene, direction: d, height } = x;
  const pal = d.visualStyle.palette;
  const fonts = FONT_STACKS[d.visualStyle.fontPairing];
  const theme = THEME_TOKENS[d.visualStyle.theme];
  const panel = theme.name === "clean-light" ? "rgba(255,255,255,0.86)" : theme.name === "vivid" ? "rgba(27,27,58,0.82)" : "rgba(8,10,22,0.66)";
  const common = `accentColor=${str(pal.accent)} textColor=${str(pal.text)} panelColor=${str(panel)} displayFont=${str(fonts.display)} bodyFont=${str(fonts.body)} animation=${str(scene.animationPreset)}`;
  const id = scene.id;
  const t0 = `style=${styleObj({ translate: "0px 0px", scale: 1 })}`;
  const title = scene.onScreenText ?? scene.title;
  const titleNode = (y: number, size: number, anim = scene.animationPreset) =>
    title
      ? `${indent}<TextLayer name=${str(`${id} title`)} animation=${str(anim)} boxWidth={${Math.round(x.width * 0.86)}} maxLines={3} uppercase={${fonts.uppercase}} highlightColor=${str(pal.accent)} shadow={1} style=${styleObj({
          fontFamily: fonts.display,
          fontWeight: fonts.displayWeight,
          fontSize: size,
          color: pal.text,
          translate: `0px ${Math.round(y)}px`,
        })}>${jsxText(title)}</TextLayer>`
      : null;
  const L = scene;
  const out: (string | null)[] = [];
  switch (L.layout) {
    case "slide": {
      const asset = currentAsset(x.manifest, id);
      const mode = slideMediaMode(L.slideKind, slideMediaOf(asset));
      out.push(
        `${indent}<SlideLayer name=${str(`${id} layout`)} kind=${str(L.slideKind)} kicker=${strExpr(L.kicker ?? "")} heading=${strExpr(L.heading)} headingAccent=${strExpr(L.headingAccent ?? "")} itemsJson=${strExpr(JSON.stringify(slideItems(x)))} edgesJson=${strExpr(JSON.stringify(L.edges))} mediaMode=${str(mode)} hasMedia={${Boolean(asset)}} mediaHint=${strExpr(L.mediaHint ?? "")} primaryColor=${str(pal.primary)} accentColor=${str(pal.accent)} textColor=${str(pal.text)} mutedColor=${str(theme.muted)} panelColor=${str("rgba(255,255,255,0.05)")} displayFont=${str(fonts.display)} bodyFont=${str(fonts.body)} ${t0} />`,
      );
      break;
    }
    case "cinematic_image":
    case "video_clip":
    case "mixed_media":
      out.push(titleNode(-height * 0.24, fonts.uppercase ? 104 : 88));
      break;
    case "diagram":
      out.push(titleNode(-height * 0.36, fonts.uppercase ? 84 : 70));
      break;
    case "text_reveal":
      out.push(titleNode(-height * 0.04, fonts.uppercase ? 130 : 112, scene.animationPreset === "fade-up" ? "word-stagger" : scene.animationPreset));
      break;
    case "listicle":
      out.push(`${indent}<ListicleScene name=${str(`${id} layout`)} number={${L.number}} heading=${str(L.heading)} body=${str(L.body ?? "")} ${common} ${t0} />`);
      break;
    case "fact_card":
      out.push(`${indent}<FactCardScene name=${str(`${id} layout`)} label=${str(L.label)} fact=${str(L.fact)} ${common} ${t0} />`);
      break;
    case "comparison":
      out.push(`${indent}<ComparisonScene name=${str(`${id} layout`)} leftLabel=${str(L.leftLabel)} rightLabel=${str(L.rightLabel)} leftText=${str(L.leftText)} rightText=${str(L.rightText)} ${common} ${t0} />`);
      break;
    case "timeline":
      out.push(titleNode(-height * 0.36, 72));
      out.push(`${indent}<TimelineScene name=${str(`${id} layout`)} points=${str(L.points.join(" | "))} ${common} ${t0} />`);
      break;
    case "quote":
      out.push(`${indent}<QuoteScene name=${str(`${id} layout`)} quote=${str(L.quote)} attribution=${str(L.attribution)} ${common} ${t0} />`);
      break;
    case "product_showcase":
      out.push(`${indent}<ProductShowcaseScene name=${str(`${id} layout`)} productName=${str(L.productName)} tagline=${str(L.tagline)} features=${str(L.features.join(" | "))} ${common} ${t0} />`);
      break;
    case "number_counter":
      out.push(`${indent}<NumberCounterScene name=${str(`${id} layout`)} value={${L.value}} prefix=${str(L.prefix)} suffix=${str(L.suffix)} label=${str(L.label)} decimals={${L.decimals}} ${common} ${t0} />`);
      break;
    case "infographic":
      out.push(titleNode(-height * 0.34, 72));
      out.push(`${indent}<AnimatedInfographicScene name=${str(`${id} layout`)} stats=${str(L.stats.map((s) => `${s.label}=${s.value}=${s.display}`).join(" | "))} ${common} ${t0} />`);
      break;
    case "outro":
      out.push(`${indent}<OutroScene name=${str(`${id} layout`)} cta=${str(L.cta)} handle=${str("")} ${common} ${t0} />`);
      break;
  }
  const speculative = scene.claims.some((c) => c.kind === "speculation") || (x.index === 0 && x.speculativeLabel);
  if (speculative) {
    out.push(
      `${indent}<Chip name=${str(`${id} label`)} color=${str(pal.accent)} textColor=${str(pal.background)} fontFamily=${str(fonts.body)} style=${styleObj({ translate: `0px ${Math.round(height * 0.06)}px` })}>${jsxText(x.speculativeLabel ?? "Speculative")}</Chip>`,
    );
  }
  if (x.index === 0 && x.notice) {
    out.push(
      `${indent}<Chip name=${str(`${id} notice`)} color=${str("rgba(0,0,0,0.6)")} textColor=${str("#ffffff")} fontFamily=${str("Inter, sans-serif")} style=${styleObj({ translate: `0px ${Math.round(height * 0.045)}px`, fontSize: 24 })}>${jsxText(x.notice)}</Chip>`,
    );
  }
  return out.filter((l): l is string => Boolean(l));
};

export const sceneAudioCaptionCode = (x: SceneCodeInput, indent: string): string[] => {
  const seg = x.manifest.narration.find((n) => n.sceneId === x.scene.id);
  const lines: string[] = [];
  const offsetMs = Math.round((x.timing.narrationOffsetFrames / x.fps) * 1000);
  if (seg?.file) {
    lines.push(`${indent}<Audio name=${str(`${x.scene.id} narration`)} src={staticFile(${str(`${x.projectId}/${seg.file}`)})} from={${x.timing.narrationOffsetFrames}} volume={1} />`);
  }
  if (x.captionsEnabled && seg && seg.words.length) {
    const cs = captionStyleFor(x.captionStyle, x.direction, x.height);
    const caps = wordsToCaptions(seg.words, offsetMs);
    const highlight = x.direction.visualStyle.palette.accent;
    lines.push(
      `${indent}<CaptionLayer name=${str(`${x.scene.id} captions`)} captionStyle=${str(x.captionStyle)} wordsPerGroup={${cs.words}} highlightColor=${str(highlight)} boxColor=${str("rgba(0,0,0,0.55)")} uppercase={${cs.uppercase}} style=${styleObj(cs.style)} captions={${captionsLiteral(caps, indent)}} />`,
    );
  }
  return lines;
};

export const sceneSequenceCode = (x: SceneCodeInput) => {
  const ind = "          ";
  const label = (x.scene.title ?? x.scene.onScreenText ?? x.scene.purpose).replace(/["\n]/g, "").slice(0, 40);
  return [
    `        <TransitionSeries.Sequence name=${str(`${x.scene.id} · ${label}`)} durationInFrames={${x.timing.durationInFrames}}>`,
    ...sceneVisualCode(x, ind),
    ...sceneLayoutCode(x, ind),
    ...sceneAudioCaptionCode(x, ind),
    `        </TransitionSeries.Sequence>`,
  ].join("\n");
};

export const transitionCode = (t: TransitionName, frames: number) => {
  const p = TRANSITION_CODE[t];
  if (!p || frames <= 0) return null;
  return `        <TransitionSeries.Transition presentation={${p}} timing={linearTiming({durationInFrames: ${frames}})} />`;
};

export const duckRangesFor = (timeline: Timeline, manifest: AssetManifest) =>
  timeline.scenes
    .filter((s) => manifest.narration.find((n) => n.sceneId === s.id)?.file)
    .map((s) => [s.startFrame + s.narrationOffsetFrames, s.startFrame + s.narrationOffsetFrames + s.narrationFrames] as [number, number]);

/* -------------------------------------------------------------- file */

export const generateEditableComposition = (input: CodegenInput): string => {
  const d = input.direction;
  const theme = THEME_TOKENS[d.visualStyle.theme];
  const seqs: string[] = [];
  input.scenes.forEach((scene, index) => {
    const timing = input.timeline.scenes[index];
    if (index > 0) {
      const t = transitionCode(scene.transitionIn, timing.transitionInFrames);
      if (t) seqs.push(t);
    }
    seqs.push(sceneSequenceCode({ ...input, scene, index, timing, isLast: index === input.scenes.length - 1 }));
  });
  const music = input.manifest.music;
  const duck = duckRangesFor(input.timeline, input.manifest);
  const sfx = input.manifest.sfx
    .map((cue) => {
      const t = input.timeline.scenes.find((s) => s.id === cue.sceneId);
      if (!t) return null;
      return `        <Audio name=${str(`${cue.sceneId} sfx ${cue.kind}`)} src={staticFile(${str(`${input.projectId}/${cue.file}`)})} from={${Math.max(0, t.startFrame)}} volume={0.45} />`;
    })
    .filter(Boolean);
  const vignette = ["clean-light", "vivid"].includes(theme.name) ? 0.15 : 0.5;
  const chapters = chaptersLiteral(input.scenes, input.timeline.scenes.map((s) => s.startFrame));
  const chapterBar = chapters !== "[]" ? `\n      <ChapterBar name="Chapter bar" chaptersJson=${strExpr(chapters)} activeColor=${str(d.visualStyle.palette.primary)} textColor=${str(d.visualStyle.palette.text)} font=${str(FONT_STACKS[d.visualStyle.fontPairing].body)} style=${styleObj({})} />` : "";
  return `/**
 * Editable composition for project "${input.projectId}".
 * Generated once by the video studio, then owned by you: open it in Remotion
 * Studio (npm run studio) and edit text, colours, positions, timing, captions
 * and media visually. Studio writes your changes back into this file.
 * Regenerating a single scene only patches that scene's named elements.
 */
import {staticFile, Track} from "remotion";
import {Audio} from "@remotion/media";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import {blurDissolve, dipToBlack, flash, zoomThrough} from "../../../src/video/animations/transitions";
import {
  AnimatedInfographicScene,
  ArtLayer,
  Backdrop,
  CaptionLayer,
  ChapterBar,
  Chip,
  ComparisonScene,
  FactCardScene,
  FilmLook,
  ListicleScene,
  MediaLayer,
  MusicBed,
  NumberCounterScene,
  OutroScene,
  ProductShowcaseScene,
  QuoteScene,
  SlideLayer,
  TextLayer,
  TimelineScene,
} from "../../../src/video/scenes";


export const ${input.componentName} = () => {
  return (
    <>
      <TransitionSeries name="Scenes">
${seqs.join("\n")}
      </TransitionSeries>
      <FilmLook name="Film look" vignette={${vignette}} grain={${theme.grain}} tint=${str(d.visualStyle.palette.primary)} tintAmount={0} />${chapterBar}
      <Track name="Music">
        ${music ? `<MusicBed name="Music" src={staticFile(${str(`${input.projectId}/${music.file}`)})} volume={${input.musicVolume}} duckTo={${Number((input.musicVolume * 0.4).toFixed(3))}} fadeInSeconds={1} fadeOutSeconds={2} muted={false} duckRanges={${JSON.stringify(duck)}} />` : "{/* no music selected */}"}
      </Track>
      <Track name="Sound effects">
${sfx.length ? sfx.join("\n") : "        {/* no sound effects */}"}
      </Track>
    </>
  );
};
`;
};
