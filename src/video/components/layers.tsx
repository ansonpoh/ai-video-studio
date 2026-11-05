/**
 * Editable layers. Every component here is created with Interactive.create(),
 * so each instance in a generated project's editable/Video.tsx shows up in
 * Remotion Studio as its own timeline item with typed controls. Position,
 * scale, rotation and opacity come from the built-in transform schema; the
 * schemas below add the content and appearance controls.
 */
import React, { type CSSProperties } from "react";
import { Img, Interactive, getInputProps, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { Video } from "@remotion/media";
import type { Caption } from "@remotion/captions";
import { ANIMATION_PRESETS, MEDIA_MOTIONS, PROCEDURAL_ART, type AnimationPreset, type MediaMotion, type ProceduralArt } from "../../schemas/catalog";
import { cameraMove, entrance, wordProgress } from "../animations/presets";
import { ART_COMPONENTS } from "../arts";
import { boolField, colorField, enumField, numberField, stringField } from "./schema-helpers";
import { fitFontSize } from "./text-fit";

const fill: CSSProperties = { position: "absolute", inset: 0 };
const flags = () => {
  try {
    return getInputProps() as { hideCaptions?: boolean };
  } catch {
    return {};
  }
};

/* ------------------------------------------------------------------ */
/* Media: still images with camera motion, or video clips             */
/* ------------------------------------------------------------------ */

type MediaLayerProps = {
  src: string;
  mediaType: string;
  motion: string;
  motionStrength: number;
  darken: number;
  blur: number;
  style?: CSSProperties;
};

const MediaLayerInner: React.FC<MediaLayerProps> = ({ src, mediaType, motion, motionStrength, darken, blur, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cam = cameraMove(motion as MediaMotion, frame / Math.max(1, durationInFrames - 1), motionStrength);
  const media: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", filter: blur ? `blur(${blur}px)` : undefined };
  return (
    <div style={{ ...fill, overflow: "hidden", ...style }}>
      <div style={{ ...fill, scale: `${cam.scale}`, translate: `${cam.x}px ${cam.y}px` }}>
        {mediaType === "video" ? <Video src={src} muted loop style={media} /> : <Img src={src} style={media} />}
      </div>
      {darken > 0 ? <div style={{ ...fill, background: `linear-gradient(180deg, rgba(0,0,0,${darken * 0.7}) 0%, rgba(0,0,0,${darken * 0.15}) 40%, rgba(0,0,0,${darken}) 100%)` }} /> : null}
    </div>
  );
};

export const MediaLayer = Interactive.create({
  Component: MediaLayerInner,
  layout: "none",
  schema: {
    src: { type: "asset", assetType: "image", default: undefined, description: "Image or clip" },
    mediaType: enumField(["image", "video"] as const, "image", "Media type"),
    motion: enumField(MEDIA_MOTIONS, "push-in", "Camera motion"),
    motionStrength: numberField(0.08, "Motion strength", { min: 0, max: 0.4, step: 0.01 }),
    darken: numberField(0.35, "Darken for text", { min: 0, max: 1, step: 0.05 }),
    blur: numberField(0, "Blur", { min: 0, max: 40, step: 1 }),
  },
});

/* ------------------------------------------------------------------ */
/* Procedural art / diagrams                                           */
/* ------------------------------------------------------------------ */

type ArtLayerProps = {
  art: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  labels: string;
  seed: number;
  labelFont: string;
  titleSafe?: boolean;
  captionSafe?: boolean;
  style?: CSSProperties;
};

const ArtLayerInner: React.FC<ArtLayerProps> = ({ art, primaryColor, accentColor, backgroundColor, labels, seed, labelFont, titleSafe, captionSafe, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const Comp = ART_COMPONENTS[art as ProceduralArt] ?? ART_COMPONENTS["aurora-gradient"];
  return (
    <div style={{ ...fill, overflow: "hidden", ...style }}>
      <Comp
        p={{
          frame,
          fps,
          width,
          height,
          durationInFrames,
          primary: primaryColor,
          accent: accentColor,
          background: backgroundColor,
          labels: labels ? labels.split("|").map((l) => l.trim()) : [],
          seed,
          labelFont,
          reserveTop: titleSafe ? 0.2 : 0,
          reserveBand: captionSafe ? [0.66, 0.84] : undefined,
        }}
      />
    </div>
  );
};

export const ArtLayer = Interactive.create({
  Component: ArtLayerInner,
  layout: "none",
  schema: {
    art: enumField(PROCEDURAL_ART, "aurora-gradient", "Artwork"),
    primaryColor: colorField("#8ab4ff", "Primary colour"),
    accentColor: colorField("#ffe066", "Accent colour"),
    backgroundColor: colorField("#070b18", "Background"),
    labels: stringField("", "Labels (separate with |)"),
    seed: numberField(1, "Variation seed", { min: 0, max: 9999, step: 1 }),
    labelFont: { type: "font-family", default: "Inter, sans-serif", description: "Label font" },
    titleSafe: boolField(false, "Keep top clear for title"),
    captionSafe: boolField(false, "Keep caption area clear"),
  },
});

/* ------------------------------------------------------------------ */
/* Text                                                                 */
/* ------------------------------------------------------------------ */

type TextLayerProps = {
  children: React.ReactNode;
  animation: string;
  boxWidth: number;
  maxLines: number;
  uppercase: boolean;
  highlightColor: string;
  shadow: number;
  style?: CSSProperties;
};

const textContent = (children: React.ReactNode) => (typeof children === "string" ? children : Array.isArray(children) ? children.join("") : String(children ?? ""));

const TextLayerInner: React.FC<TextLayerProps> = ({ children, animation, boxWidth, maxLines, uppercase, highlightColor, shadow, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const text = textContent(children);
  const preset = animation as AnimationPreset;
  const requested = Number(style?.fontSize ?? 80);
  const box = Math.min(boxWidth, width * 0.92);
  const fontSize = fitFontSize(text, requested, box, maxLines, String(style?.fontFamily ?? ""), uppercase);
  const anim = entrance(preset, frame, fps, 0, durationInFrames);
  // *word* marks emphasis: rendered in the highlight colour
  const words = text.split(/\s+/).filter(Boolean);
  const perWord = preset === "word-stagger" || preset === "typewriter";
  return (
    <div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          width: box,
          textAlign: "center",
          lineHeight: 1.08,
          textTransform: uppercase ? "uppercase" : undefined,
          textShadow: shadow ? `0 ${4 * shadow}px ${24 * shadow}px rgba(0,0,0,${0.55 * Math.min(1, shadow)})` : undefined,
          ...style,
          fontSize,
          ...anim,
          translate: [style?.translate, anim.translate].filter(Boolean).join(" ") ? combineTranslate(style?.translate as string | undefined, anim.translate as string | undefined) : undefined,
        }}
      >
        {words.map((w, i) => {
          const emph = /^\*.*\*[.,!?:;]*$/.test(w);
          const clean = w.replace(/\*/g, "");
          const wp = perWord ? wordProgress(preset, frame, fps, i) : 1;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                color: emph ? highlightColor : undefined,
                opacity: wp,
                translate: perWord ? `0px ${(1 - wp) * 0.35 * fontSize}px` : undefined,
              }}
            >
              {clean}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const combineTranslate = (a?: string, b?: string) => {
  const parse = (s?: string) => {
    if (!s) return [0, 0];
    const m = s.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const [ax, ay] = parse(a);
  const [bx, by] = parse(b);
  return `${ax + bx}px ${ay + by}px`;
};

export const TextLayer = Interactive.create({
  Component: TextLayerInner,
  layout: "none",
  schema: {
    ...Interactive.textSchema,
    ...Interactive.backgroundSchema,
    ...Interactive.borderRadiusSchema,
    children: { type: "string", default: "", description: "Text (wrap a word in *stars* to highlight)" },
    animation: enumField(ANIMATION_PRESETS, "fade-up", "Entrance animation"),
    boxWidth: numberField(900, "Text box width", { min: 200, max: 1900, step: 10 }),
    maxLines: numberField(3, "Max lines before shrinking", { min: 1, max: 8, step: 1 }),
    uppercase: boolField(false, "Uppercase"),
    highlightColor: colorField("#ffe066", "Highlight colour"),
    shadow: numberField(1, "Shadow", { min: 0, max: 3, step: 0.1 }),
  },
});

/* ------------------------------------------------------------------ */
/* Captions                                                             */
/* ------------------------------------------------------------------ */

type CaptionLayerProps = {
  captions: Caption[];
  captionStyle: string;
  wordsPerGroup: number;
  highlightColor: string;
  boxColor: string;
  uppercase: boolean;
  style?: CSSProperties;
};

export const groupCaptions = (captions: Caption[], wordsPerGroup: number) => {
  const pages: Caption[][] = [];
  let cur: Caption[] = [];
  captions.forEach((c, i) => {
    const prev = captions[i - 1];
    const gap = prev ? c.startMs - prev.endMs : 0;
    const prevEndsSentence = prev ? /[.!?;:]$/.test(prev.text.trim()) : false;
    if (cur.length >= wordsPerGroup || (cur.length > 0 && (gap > 350 || prevEndsSentence))) {
      pages.push(cur);
      cur = [];
    }
    cur.push(c);
  });
  if (cur.length) pages.push(cur);
  return pages;
};

const CaptionLayerInner: React.FC<CaptionLayerProps> = ({ captions, captionStyle, wordsPerGroup, highlightColor, boxColor, uppercase, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (flags().hideCaptions || !captions?.length) return null;
  const ms = (frame / fps) * 1000;
  const pages = groupCaptions(captions, Math.max(1, Math.round(wordsPerGroup)));
  const page = pages.find((p, i) => {
    const end = pages[i + 1] ? Math.min(pages[i + 1][0].startMs, p[p.length - 1].endMs + 600) : p[p.length - 1].endMs + 400;
    return ms >= p[0].startMs - 60 && ms < end;
  });
  if (!page) return null;
  const pageStart = page[0].startMs;
  const pop = interpolate(ms, [pageStart - 60, pageStart + 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
  const s = captionStyle;
  const requested = Number(style?.fontSize ?? 64);
  const text = page.map((c) => c.text.trim()).join(" ");
  const fontSize = fitFontSize(text, requested, width * 0.84, s === "cinematic" || s === "minimal" ? 2 : 3, String(style?.fontFamily ?? ""), uppercase);
  return (
    <div style={{ ...fill, display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          maxWidth: width * 0.86,
          textAlign: "center",
          lineHeight: 1.15,
          textTransform: uppercase ? "uppercase" : undefined,
          padding: s === "minimal" ? "10px 22px" : undefined,
          borderRadius: 18,
          backgroundColor: s === "minimal" ? boxColor : undefined,
          // outline + shadow keep captions readable on bright footage
          WebkitTextStroke: s === "bold" ? "4px rgba(0,0,0,0.7)" : undefined,
          paintOrder: s === "bold" ? "stroke fill" : undefined,
          textShadow: s === "bold" ? "0 5px 0 rgba(0,0,0,0.45), 0 0 22px rgba(0,0,0,0.4)" : s === "karaoke" ? undefined : "0 2px 14px rgba(0,0,0,0.55)",
          ...style,
          fontSize,
          scale: s === "bold" || s === "word-highlight" ? `${0.85 + 0.15 * pop}` : undefined,
          opacity: s === "cinematic" ? interpolate(ms, [pageStart - 60, pageStart + 220], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1,
        }}
      >
        {page.map((c, i) => {
          const active = ms >= c.startMs && ms < c.endMs + 40;
          const spoken = ms >= c.startMs;
          const karaokeFill = interpolate(ms, [c.startMs, Math.max(c.startMs + 1, c.endMs)], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const base: CSSProperties = { display: "inline-block", margin: "0 0.14em", whiteSpace: "pre" };
          const word = c.text.trim();
          if (s === "word-highlight") {
            return (
              <span key={i} style={{ ...base, padding: "0 0.18em", borderRadius: 12, backgroundColor: active ? highlightColor : "transparent", color: active ? boxColor : undefined }}>
                {word}
              </span>
            );
          }
          if (s === "karaoke") {
            return (
              <span
                key={i}
                style={{
                  ...base,
                  backgroundImage: `linear-gradient(90deg, ${highlightColor} ${karaokeFill}%, ${String(style?.color ?? "#fff")} ${karaokeFill}%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {word}
              </span>
            );
          }
          if (s === "bold") {
            return (
              <span key={i} style={{ ...base, color: active ? highlightColor : undefined, scale: active ? "1.08" : "1" }}>
                {word}
              </span>
            );
          }
          return (
            <span key={i} style={{ ...base, opacity: s === "cinematic" ? 1 : spoken ? 1 : 0.85 }}>
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const CaptionLayer = Interactive.create({
  Component: CaptionLayerInner,
  layout: "none",
  schema: {
    ...Interactive.captionsSchema,
    ...Interactive.textSchema,
    captionStyle: enumField(["minimal", "bold", "word-highlight", "karaoke", "cinematic"] as const, "bold", "Caption style"),
    wordsPerGroup: numberField(3, "Words per caption", { min: 1, max: 12, step: 1 }),
    highlightColor: colorField("#ffe066", "Highlight colour"),
    boxColor: colorField("rgba(0,0,0,0.55)", "Box colour"),
    uppercase: boolField(false, "Uppercase"),
  },
});

/* ------------------------------------------------------------------ */
/* Film look: vignette, grain, colour wash                              */
/* ------------------------------------------------------------------ */

type FilmLookProps = { vignette: number; grain: number; tint: string; tintAmount: number; style?: CSSProperties };

const FilmLookInner: React.FC<FilmLookProps> = ({ vignette, grain, tint, tintAmount, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...fill, pointerEvents: "none", ...style }}>
      {tintAmount > 0 ? <div style={{ ...fill, backgroundColor: tint, opacity: tintAmount, mixBlendMode: "soft-light" }} /> : null}
      {vignette > 0 ? <div style={{ ...fill, background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${vignette}) 100%)` }} /> : null}
      {grain > 0 ? (
        <svg width="100%" height="100%" style={{ ...fill, opacity: grain, mixBlendMode: "overlay" }}>
          <filter id={`grain-${frame % 4}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 13} />
          </filter>
          <rect width="100%" height="100%" filter={`url(#grain-${frame % 4})`} />
        </svg>
      ) : null}
    </div>
  );
};

export const FilmLook = Interactive.create({
  Component: FilmLookInner,
  layout: "none",
  schema: {
    vignette: numberField(0.55, "Vignette", { min: 0, max: 1, step: 0.05 }),
    grain: numberField(0.06, "Grain", { min: 0, max: 0.4, step: 0.01 }),
    tint: colorField("#000000", "Colour wash"),
    tintAmount: numberField(0, "Colour wash amount", { min: 0, max: 1, step: 0.05 }),
  },
});

/* ------------------------------------------------------------------ */
/* Solid / gradient backdrop                                            */
/* ------------------------------------------------------------------ */

type BackdropProps = { colorA: string; colorB: string; angle: number; style?: CSSProperties };
const BackdropInner: React.FC<BackdropProps> = ({ colorA, colorB, angle, style }) => (
  <div style={{ ...fill, background: `linear-gradient(${angle}deg, ${colorA}, ${colorB})`, ...style }} />
);
export const Backdrop = Interactive.create({
  Component: BackdropInner,
  layout: "none",
  schema: {
    colorA: colorField("#111111", "Colour A"),
    colorB: colorField("#333333", "Colour B"),
    angle: numberField(160, "Angle", { min: 0, max: 360, step: 1 }),
  },
});
