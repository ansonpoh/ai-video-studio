/**
 * Explainer slides: headings, cards, steps and diagrams that reveal in step
 * with the narration, plus the chapter bar across the bottom of the video.
 * Reveal frames are literals in the editable composition (itemsJson), so they
 * can be retimed in Remotion Studio.
 */
import React, { type CSSProperties } from "react";
import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { boolField, colorField, enumField, stringField } from "../components/schema-helpers";
import { fitFontSize } from "../components/text-fit";
import { layoutDiagram, type DiagramEdge, type SlideKind, type SlideMediaMode } from "./slide-layout";

type Item = { title: string; body?: string; tag?: string; at: number };

const fill: CSSProperties = { position: "absolute", inset: 0 };
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const parse = <T,>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};
const widthOf = (box: number) => Math.max(1, box);

type SlideProps = {
  kind: string;
  kicker: string;
  heading: string;
  headingAccent: string;
  itemsJson: string;
  edgesJson: string;
  mediaMode: string;
  hasMedia: boolean;
  mediaHint: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  panelColor: string;
  displayFont: string;
  bodyFont: string;
  style?: CSSProperties;
};

const SlideInner: React.FC<SlideProps> = (props) => {
  const { kicker, heading, headingAccent, itemsJson, edgesJson, hasMedia, mediaHint, primaryColor, accentColor, textColor, mutedColor, panelColor, displayFont, bodyFont, style } = props;
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const kind = props.kind as SlideKind;
  const mode = props.mediaMode as SlideMediaMode;
  const portrait = height > width;
  const s = portrait ? width / 1080 : width / 1920;
  const items = parse<Item[]>(itemsJson, []);
  const edges = parse<DiagramEdge[]>(edgesJson, []);
  const margin = (portrait ? 70 : 110) * s;

  const show = (at: number) => interpolate(frame, [at, at + fps * 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const isActive = (i: number) => frame >= items[i].at && (i === items.length - 1 || frame < items[i + 1].at);
  const enter = (p: number): CSSProperties => ({ opacity: p, translate: `0px ${(1 - p) * 18 * s}px` });
  const headingIn = enter(show(2));

  const beside = mode === "side" || mode === "frame";
  // A frame leaves the full width above it for the heading; a floating still shares the column.
  const columnWidth = portrait ? width - margin * 2 : mode === "side" ? width * 0.4 : mode === "frame" && items.length ? width * 0.345 : width - margin * 2;
  const headingWidth = portrait || mode === "frame" || !beside ? width - margin * 2 : columnWidth;
  const big = kind === "statement";
  const headingSize = fitFontSize(`${heading} ${headingAccent}`, (big ? (portrait ? 84 : 92) : portrait ? 60 : 64) * s, widthOf(headingWidth), big ? 4 : 2, displayFont);

  const headingBlock = (
    <div style={{ ...headingIn, width: headingWidth }}>
      {kicker ? <div style={{ fontFamily: bodyFont, fontSize: 24 * s, fontWeight: 700, letterSpacing: 4 * s, textTransform: "uppercase", color: primaryColor, marginBottom: 18 * s }}>{kicker}</div> : null}
      <div style={{ fontFamily: displayFont, fontSize: headingSize, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 * s, color: textColor }}>
        {heading}
        {headingAccent ? (
          <>
            {big ? <br /> : " "}
            <span style={{ backgroundImage: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{headingAccent}</span>
          </>
        ) : null}
      </div>
    </div>
  );

  const list = (numbered: boolean) => {
    const full = columnWidth > width * 0.6;
    const size = (full ? (items.length > 5 ? 32 : 38) : items.length > 4 ? 26 : 31) * s;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: (items.length > 5 ? 10 : 16) * s, width: columnWidth }}>
        {items.map((item, i) => {
          const active = isActive(i);
          // Steps are visible from the start and light up in turn; bullets arrive one at a time.
          const p = numbered ? 1 : show(item.at);
          const reached = frame >= item.at;
          return (
            <div
              key={i}
              style={{
                ...enter(p),
                display: "flex",
                gap: 18 * s,
                alignItems: "flex-start",
                padding: numbered ? `${14 * s}px ${18 * s}px` : 0,
                borderRadius: 14 * s,
                backgroundColor: numbered && active ? `${primaryColor}22` : "transparent",
                opacity: numbered ? (active ? 1 : reached ? 0.75 : 0.42) : p,
              }}
            >
              <div
                style={
                  numbered
                    ? { flex: "none", width: 38 * s, height: 38 * s, borderRadius: 19 * s, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: bodyFont, fontWeight: 700, fontSize: 19 * s, color: active ? "#04110f" : textColor, backgroundColor: active ? primaryColor : panelColor }
                    : { flex: "none", width: 11 * s, height: 11 * s, marginTop: size * 0.48, borderRadius: 6 * s, backgroundColor: primaryColor }
                }
              >
                {numbered ? i + 1 : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: bodyFont, fontSize: size, fontWeight: 600, lineHeight: 1.25, color: textColor }}>{item.title}</div>
                {item.body ? <div style={{ fontFamily: bodyFont, fontSize: size * 0.72, lineHeight: 1.35, color: mutedColor, marginTop: 5 * s }}>{item.body}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const cards = () => {
    const columns = portrait ? (items.length > 4 ? 2 : 1) : items.length <= 3 ? Math.max(1, items.length) : items.length === 4 ? 2 : 3;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 22 * s, width: width - margin * 2 }}>
        {items.map((item, i) => {
          const active = isActive(i);
          return (
            <div
              key={i}
              style={{
                ...enter(show(item.at)),
                backgroundColor: panelColor,
                border: `${1.5 * s}px solid ${active ? primaryColor : "rgba(255,255,255,0.09)"}`,
                borderRadius: 18 * s,
                padding: `${36 * s}px ${36 * s}px`,
              }}
            >
              {item.tag ? <div style={{ display: "inline-block", fontFamily: bodyFont, fontSize: 21 * s, fontWeight: 700, color: accentColor, marginBottom: 14 * s }}>{item.tag}</div> : null}
              <div style={{ fontFamily: bodyFont, fontSize: 37 * s, fontWeight: 700, lineHeight: 1.2, color: textColor }}>{item.title}</div>
              {item.body ? <div style={{ fontFamily: bodyFont, fontSize: 26 * s, lineHeight: 1.35, color: mutedColor, marginTop: 12 * s }}>{item.body}</div> : null}
            </div>
          );
        })}
      </div>
    );
  };

  const diagram = () => {
    const { columns, nodes } = layoutDiagram(items.length, edges);
    const top = (portrait ? 300 : 230) * s;
    const areaW = width - margin * 2;
    const areaH = height - top - 190 * s;
    const major = portrait ? areaH : areaW;
    const minor = portrait ? areaW : areaH;
    const slot = major / Math.max(1, columns);
    const nodeW = portrait ? Math.min(420 * s, areaW * 0.46) : Math.min(400 * s, slot * 0.8);
    const nodeH = 132 * s;
    const place = nodes.map((n) => {
      const along = slot * (n.column + 0.5);
      const across = (minor / n.rowsInColumn) * (n.row + 0.5);
      return portrait ? { x: margin + across, y: top + along } : { x: margin + along, y: top + across };
    });
    return (
      <>
        <svg width={width} height={height} style={{ ...fill, overflow: "visible" }}>
          {edges.map((e, k) => {
            const a = place[e.from];
            const b = place[e.to];
            if (!a || !b || !items[e.to]) return null;
            const p = show(Math.max(items[e.from].at, items[e.to].at));
            const d = portrait
              ? `M${a.x} ${a.y + nodeH / 2} C${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - nodeH / 2}`
              : `M${a.x + nodeW / 2} ${a.y} C${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x - nodeW / 2} ${b.y}`;
            return <path key={k} d={d} pathLength={1} fill="none" stroke={primaryColor} strokeOpacity={0.75} strokeWidth={2.5 * s} strokeDasharray={1} strokeDashoffset={1 - p} />;
          })}
        </svg>
        {items.map((item, i) => {
          const p = show(item.at);
          const active = isActive(i);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: place[i].x - nodeW / 2,
                top: place[i].y - nodeH / 2,
                width: nodeW,
                height: nodeH,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                opacity: p,
                scale: `${0.94 + 0.06 * p}`,
                padding: `0 ${18 * s}px`,
                backgroundColor: "#0c1417",
                border: `${1.5 * s}px solid ${active ? primaryColor : "rgba(255,255,255,0.14)"}`,
                boxShadow: active ? `0 0 ${28 * s}px ${primaryColor}55` : undefined,
                borderRadius: 14 * s,
              }}
            >
              <div style={{ fontFamily: bodyFont, fontSize: fitFontSize(item.title, 30 * s, nodeW - 36 * s, 2, bodyFont), fontWeight: 700, lineHeight: 1.15, color: textColor }}>{item.title}</div>
              {item.tag || item.body ? <div style={{ fontFamily: bodyFont, fontSize: 20 * s, lineHeight: 1.2, color: mutedColor, marginTop: 5 * s, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.tag ?? item.body}</div> : null}
            </div>
          );
        })}
      </>
    );
  };

  const numbered = kind !== "statement";
  let body: React.ReactNode;
  if (beside) {
    const contentTop = portrait ? height * (mode === "side" ? 0.46 : 0.56) : mode === "frame" ? height * 0.2 : 0;
    body = (
      <>
        {mode === "frame" || portrait ? <div style={{ position: "absolute", left: margin, top: (portrait ? 80 : 70) * s }}>{mode === "frame" ? headingBlock : null}</div> : null}
        <div
          style={{
            position: "absolute",
            left: margin,
            top: contentTop,
            bottom: mode === "side" && !portrait ? 160 * s : undefined,
            display: "flex",
            flexDirection: "column",
            justifyContent: mode === "side" && !portrait ? "center" : "flex-start",
            gap: 34 * s,
          }}
        >
          {mode === "side" ? headingBlock : null}
          {items.length ? list(numbered) : null}
        </div>
        {mode === "frame" && !hasMedia ? (
          <div
            style={{
              position: "absolute",
              left: width * (portrait ? 0.05 : items.length ? 0.42 : 0.1),
              top: height * 0.2,
              width: width * (portrait ? 0.9 : items.length ? 0.52 : 0.8),
              height: height * (portrait ? 0.34 : 0.62),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              boxSizing: "border-box",
              padding: 40 * s,
              border: `${2 * s}px dashed rgba(255,255,255,0.25)`,
              borderRadius: 18 * s,
              fontFamily: bodyFont,
              fontSize: 26 * s,
              color: mutedColor,
            }}
          >
            {mediaHint || "Add a screen recording here"}
          </div>
        ) : null}
      </>
    );
  } else if (kind === "cards") {
    body = (
      <>
        <div style={{ position: "absolute", left: margin, top: 80 * s }}>{headingBlock}</div>
        <div style={{ position: "absolute", left: margin, top: 230 * s, bottom: 170 * s, display: "flex", alignItems: "center" }}>{cards()}</div>
      </>
    );
  } else if (kind === "diagram") {
    body = (
      <>
        <div style={{ position: "absolute", left: margin, top: 80 * s }}>{headingBlock}</div>
        {diagram()}
      </>
    );
  } else if (kind !== "statement" && items.length) {
    body = (
      <>
        <div style={{ position: "absolute", left: margin, top: 80 * s }}>{headingBlock}</div>
        <div style={{ position: "absolute", left: margin, top: 230 * s, bottom: 170 * s, display: "flex", alignItems: "center" }}>{list(true)}</div>
      </>
    );
  } else {
    body = (
      <div style={{ position: "absolute", left: margin, top: 0, bottom: 160 * s, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36 * s }}>
        {headingBlock}
        {items.length ? list(false) : null}
      </div>
    );
  }
  return <div style={{ ...fill, pointerEvents: "none", ...style }}>{body}</div>;
};

export const SlideLayer = Interactive.create({
  Component: SlideInner,
  layout: "none",
  schema: {
    kind: enumField(["statement", "cards", "steps", "diagram", "media"] as const, "statement", "Slide kind"),
    kicker: stringField("", "Small label above the heading"),
    heading: stringField("", "Heading"),
    headingAccent: stringField("", "Highlighted part of the heading"),
    itemsJson: stringField("[]", 'Items as JSON; "at" is the frame each one appears'),
    edgesJson: stringField("[]", "Diagram arrows as JSON"),
    mediaMode: enumField(["none", "backdrop", "side", "frame"] as const, "none", "Media placement"),
    hasMedia: boolField(false, "Scene has media"),
    mediaHint: stringField("", "Shown while no media is set"),
    primaryColor: colorField("#5eead4", "Primary colour"),
    accentColor: colorField("#38bdf8", "Accent colour"),
    textColor: colorField("#f8fafc", "Text colour"),
    mutedColor: colorField("#94a3b8", "Secondary text colour"),
    panelColor: colorField("rgba(255,255,255,0.05)", "Panel colour"),
    displayFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Display font" },
    bodyFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Body font" },
  },
});

/* ---------------------------------------------------------- Chapter bar */

type ChapterBarProps = { chaptersJson: string; activeColor: string; textColor: string; font: string; style?: CSSProperties };

const ChapterBarInner: React.FC<ChapterBarProps> = ({ chaptersJson, activeColor, textColor, font, style }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const chapters = parse<{ label: string; start: number }[]>(chaptersJson, []);
  if (chapters.length < 2) return null;
  const s = height > width ? width / 1080 : width / 1920;
  return (
    <div style={{ position: "absolute", left: 96 * s, right: 96 * s, bottom: 30 * s, display: "flex", gap: 8 * s, pointerEvents: "none", ...style }}>
      {chapters.map((c, i) => {
        const end = chapters[i + 1]?.start ?? durationInFrames;
        const progress = interpolate(frame, [c.start, Math.max(c.start + 1, end)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const active = frame >= c.start && frame < end;
        return (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 2 * s, backgroundColor: "rgba(255,255,255,0.16)" }}>
              <div style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: activeColor }} />
            </div>
            <div
              style={{
                marginTop: 9 * s,
                fontFamily: font,
                fontSize: 16 * s,
                fontWeight: 700,
                letterSpacing: 2 * s,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: textColor,
                opacity: active ? 1 : progress >= 1 ? 0.55 : 0.28,
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ChapterBar = Interactive.create({
  Component: ChapterBarInner,
  layout: "none",
  schema: {
    chaptersJson: stringField("[]", 'Chapters as JSON; "start" is the frame each begins'),
    activeColor: colorField("#5eead4", "Progress colour"),
    textColor: colorField("#ffffff", "Label colour"),
    font: { type: "font-family" as const, default: "Inter, sans-serif", description: "Font" },
  },
});
