/**
 * Draws a "drawn" scene: an SVG from the storyboard, with each marked part
 * animating on its own beat. The beat frames are a literal in the editable
 * composition, so they can be retimed in Remotion Studio.
 */
import React, { useMemo, type CSSProperties } from "react";
import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colorField, stringField } from "../components/schema-helpers";
import { countText, hasMotion, motionAt, parseSvg, resolveValue, type DrawnTokens, type SvgNode } from "./drawn-svg";

const SHAPES = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"]);
const CONTAINERS_WITHOUT_MOTION = new Set(["defs", "clipPath", "mask", "marker", "pattern", "filter", "linearGradient", "radialGradient"]);

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const reactAttrs = (node: SvgNode, scope: string, tokens: DrawnTokens) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attrs)) {
    if (k.startsWith("data-")) continue;
    out[camel(k)] = resolveValue(v, k, scope, tokens);
  }
  return out;
};

type RenderCtx = { frame: number; fps: number; beats: number[]; scope: string; tokens: DrawnTokens };

const renderChildren = (node: SvgNode, ctx: RenderCtx, draw: number | undefined, keyPrefix: string, words?: { progress: number; total: number; seen: { n: number } }): React.ReactNode[] =>
  node.children.map((child, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof child !== "string") return renderNode(child, ctx, key, draw, words);
    if (!words) return child;
    // Words arrive one at a time, keeping the spaces so the line doesn't reflow.
    return child.split(/(\s+)/).map((part, k) => {
      if (!part.trim()) return part;
      const index = words.seen.n++;
      const shown = Math.min(1, Math.max(0, words.progress * words.total - index));
      return (
        <tspan key={`${key}-${k}`} fillOpacity={shown}>
          {part}
        </tspan>
      );
    });
  });

const countWords = (node: SvgNode): number => node.children.reduce<number>((a, c) => a + (typeof c === "string" ? c.split(/\s+/).filter(Boolean).length : countWords(c)), 0);

const renderNode = (node: SvgNode, ctx: RenderCtx, key: string, inheritedDraw?: number, words?: { progress: number; total: number; seen: { n: number } }): React.ReactNode => {
  const attrs = reactAttrs(node, ctx.scope, ctx.tokens);
  const Tag = node.tag as React.ElementType;
  if (CONTAINERS_WITHOUT_MOTION.has(node.tag)) {
    return (
      <Tag key={key} {...attrs}>
        {renderChildren(node, ctx, undefined, key)}
      </Tag>
    );
  }
  const state = hasMotion(node.attrs) ? motionAt(node.attrs, ctx.frame, ctx.fps, ctx.beats) : null;
  const draw = state?.draw ?? inheritedDraw;
  const extra: Record<string, unknown> = {};
  if (SHAPES.has(node.tag) && draw !== undefined) {
    extra.pathLength = 1;
    extra.strokeDasharray = 1;
    extra.strokeDashoffset = 1 - draw;
    extra.fillOpacity = draw * Number(node.attrs["fill-opacity"] ?? 1);
    // Arrowheads and round caps would otherwise show before the line reaches them.
    if (draw <= 0) extra.visibility = "hidden";
  }
  if (state?.flow !== undefined) extra.strokeDashoffset = state.flow;

  let inner: React.ReactNode;
  if (state?.count !== undefined) inner = countText(node.attrs, state.count);
  else if (state?.words !== undefined) inner = renderChildren(node, ctx, draw, key, { progress: state.words, total: Math.max(1, countWords(node)), seen: { n: 0 } });
  else inner = renderChildren(node, ctx, draw, key, words);

  const el = (
    <Tag key={key} {...attrs} {...extra}>
      {inner}
    </Tag>
  );
  const textInDraw = (node.tag === "text" || node.tag === "use") && draw !== undefined;
  if (!state && !textInDraw) return el;
  if (node.tag === "tspan") return el;
  // A wrapper, because a CSS transform on the element itself would replace its transform attribute.
  const style: CSSProperties = {
    opacity: (state?.opacity ?? 1) * (textInDraw ? (draw as number) : 1),
    transform: state?.transform,
    transformBox: state?.transform ? "fill-box" : undefined,
    transformOrigin: state?.transform ? (state.transformOrigin ?? "50% 50%") : undefined,
    clipPath: state?.clipPath,
  };
  return (
    <g key={`${key}-m`} style={style}>
      {el}
    </g>
  );
};

type DrawnProps = {
  svg: string;
  beatsJson: string;
  scope: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  panelColor: string;
  displayFont: string;
  bodyFont: string;
  style?: CSSProperties;
};

const DrawnInner: React.FC<DrawnProps> = ({ svg, beatsJson, scope, backgroundColor, primaryColor, accentColor, textColor, mutedColor, panelColor, displayFont, bodyFont, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const parsed = useMemo(() => parseSvg(svg), [svg]);
  const beats = useMemo(() => {
    try {
      return JSON.parse(beatsJson) as number[];
    } catch {
      return [];
    }
  }, [beatsJson]);
  if (!parsed.root) return null;
  const tokens: DrawnTokens = { bg: backgroundColor, primary: primaryColor, accent: accentColor, text: textColor, muted: mutedColor, panel: panelColor, display: displayFont, body: bodyFont };
  const ctx: RenderCtx = { frame, fps, beats, scope, tokens };
  // A slow push-in, so nothing sits perfectly still between beats.
  const push = interpolate(frame, [0, durationInFrames], [1, 1.02], { extrapolateRight: "clamp" });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", scale: `${push}`, ...style }}>
      {renderChildren(parsed.root, ctx, undefined, scope)}
    </svg>
  );
};

export const DrawnLayer = Interactive.create({
  Component: DrawnInner,
  layout: "none",
  schema: {
    svg: stringField("<svg></svg>", "The drawing, as SVG"),
    beatsJson: stringField("[]", "The frame each beat happens on, as JSON"),
    scope: stringField("s", "Prefix that keeps this drawing's ids separate"),
    backgroundColor: colorField("#050708", "Background colour"),
    primaryColor: colorField("#5eead4", "Primary colour"),
    accentColor: colorField("#38bdf8", "Accent colour"),
    textColor: colorField("#f8fafc", "Text colour"),
    mutedColor: colorField("#94a3b8", "Secondary text colour"),
    panelColor: colorField("#111a1f", "Panel colour"),
    displayFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Display font" },
    bodyFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Body font" },
  },
});
