/**
 * Layout-specific scene layers (listicle numbers, fact cards, comparisons...).
 * Each is one editable Studio element whose content fields are typed controls.
 */
import React, { type CSSProperties } from "react";
import { Interactive, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { ANIMATION_PRESETS, type AnimationPreset } from "../../schemas/catalog";
import { entrance } from "../animations/presets";
import { colorField, enumField, numberField, stringField } from "../components/schema-helpers";
import { fitFontSize } from "../components/text-fit";

const fill: CSSProperties = { position: "absolute", inset: 0 };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const themeSchema = {
  accentColor: colorField("#ffe066", "Accent colour"),
  textColor: colorField("#ffffff", "Text colour"),
  panelColor: colorField("rgba(10,12,24,0.72)", "Panel colour"),
  displayFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Display font" },
  bodyFont: { type: "font-family" as const, default: "Inter, sans-serif", description: "Body font" },
  animation: enumField(ANIMATION_PRESETS, "fade-up", "Entrance animation"),
};
type ThemeProps = { accentColor: string; textColor: string; panelColor: string; displayFont: string; bodyFont: string; animation: string; style?: CSSProperties };

const useAnim = (animation: string, delay = 0) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return { frame, fps, durationInFrames, a: entrance(animation as AnimationPreset, frame, fps, delay, durationInFrames) };
};

const Panel: React.FC<{ color: string; children: React.ReactNode; style?: CSSProperties }> = ({ color, children, style }) => (
  <div style={{ backgroundColor: color, borderRadius: 36, padding: "48px 56px", backdropFilter: "blur(14px)", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", ...style }}>{children}</div>
);

/* ---------------------------------------------------------- Listicle */

type ListicleProps = ThemeProps & { number: number; heading: string; body: string };
const ListicleInner: React.FC<ListicleProps> = ({ number, heading, body, accentColor, textColor, panelColor, displayFont, bodyFont, animation, style }) => {
  const { frame, fps, width, a } = { ...useAnim(animation), width: useVideoConfig().width };
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const count = Math.round(interpolate(frame, [0, fps * 0.4], [0, number], clamp));
  const headingSize = fitFontSize(heading, 92, width * 0.78, 3, displayFont, true);
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, ...style }}>
      <div style={{ fontFamily: displayFont, fontSize: 420, lineHeight: 0.9, color: accentColor, scale: `${0.4 + 0.6 * pop}`, rotate: `${(1 - pop) * -12}deg`, textShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        {count}
      </div>
      <div style={{ ...a, width: width * 0.82, textAlign: "center" }}>
        <div style={{ fontFamily: displayFont, fontSize: headingSize, color: textColor, textTransform: "uppercase", lineHeight: 1.02, textShadow: "0 6px 30px rgba(0,0,0,0.45)" }}>{heading}</div>
        {body ? (
          <Panel color={panelColor} style={{ marginTop: 36, padding: "28px 40px" }}>
            <div style={{ fontFamily: bodyFont, fontSize: fitFontSize(body, 46, width * 0.7, 3, bodyFont), color: textColor, fontWeight: 600, lineHeight: 1.25 }}>{body}</div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
};
export const ListicleScene = Interactive.create({
  Component: ListicleInner,
  layout: "none",
  schema: { ...themeSchema, number: numberField(1, "Number", { min: 1, max: 99, step: 1 }), heading: stringField("", "Heading"), body: stringField("", "Body") },
});

/* ---------------------------------------------------------- Fact card */

type FactProps = ThemeProps & { label: string; fact: string };
const FactInner: React.FC<FactProps> = ({ label, fact, accentColor, textColor, panelColor, displayFont, bodyFont, animation, style }) => {
  const { a, frame, fps } = useAnim(animation, 4);
  const { width } = useVideoConfig();
  const bar = interpolate(frame, [0, fps * 0.5], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <Panel color={panelColor} style={{ ...a, width: width * 0.82 }}>
        <div style={{ height: 10, width: `${bar * 40}%`, backgroundColor: accentColor, borderRadius: 6, marginBottom: 28 }} />
        <div style={{ fontFamily: bodyFont, fontWeight: 800, letterSpacing: 4, fontSize: 34, color: accentColor, textTransform: "uppercase", marginBottom: 18 }}>{label}</div>
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: fitFontSize(fact, 72, width * 0.7, 5, displayFont), color: textColor, lineHeight: 1.15 }}>{fact}</div>
      </Panel>
    </div>
  );
};
export const FactCardScene = Interactive.create({
  Component: FactInner,
  layout: "none",
  schema: { ...themeSchema, label: stringField("Did you know?", "Label"), fact: stringField("", "Fact") },
});

/* ---------------------------------------------------------- Comparison */

type CompareProps = ThemeProps & { leftLabel: string; rightLabel: string; leftText: string; rightText: string };
const CompareInner: React.FC<CompareProps> = ({ leftLabel, rightLabel, leftText, rightText, accentColor, textColor, panelColor, displayFont, bodyFont, animation, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const side = (label: string, text: string, i: number) => {
    const t = interpolate(frame, [i * fps * 0.35, i * fps * 0.35 + fps * 0.6], [0, 1], { ...clamp, easing: ease });
    const dx = portrait ? 0 : (i === 0 ? -1 : 1) * (1 - t) * 120;
    const dy = portrait ? (1 - t) * 80 : 0;
    return (
      <Panel color={panelColor} style={{ opacity: t, translate: `${dx}px ${dy}px`, flex: 1, borderTop: `10px solid ${i === 0 ? textColor : accentColor}` }}>
        <div style={{ fontFamily: displayFont, fontSize: 64, color: i === 0 ? textColor : accentColor, marginBottom: 16, fontWeight: 800 }}>{label}</div>
        <div style={{ fontFamily: bodyFont, fontSize: fitFontSize(text, 44, portrait ? width * 0.7 : width * 0.35, 4, bodyFont), color: textColor, lineHeight: 1.3, fontWeight: 500 }}>{text}</div>
      </Panel>
    );
  };
  void animation;
  return (
    <div style={{ ...fill, display: "flex", flexDirection: portrait ? "column" : "row", gap: 40, padding: portrait ? "300px 80px" : "120px 120px", justifyContent: "center", ...style }}>
      {side(leftLabel, leftText, 0)}
      <div style={{ alignSelf: "center", fontFamily: displayFont, fontSize: 56, color: accentColor, fontWeight: 900 }}>VS</div>
      {side(rightLabel, rightText, 1)}
    </div>
  );
};
export const ComparisonScene = Interactive.create({
  Component: CompareInner,
  layout: "none",
  schema: { ...themeSchema, leftLabel: stringField("Before", "Left label"), rightLabel: stringField("After", "Right label"), leftText: stringField("", "Left text"), rightText: stringField("", "Right text") },
});

/* ---------------------------------------------------------- Timeline */

type TimelineProps = ThemeProps & { points: string };
const TimelineInner: React.FC<TimelineProps> = ({ points, accentColor, textColor, panelColor, displayFont, bodyFont, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const items = points.split("|").map((p) => p.trim()).filter(Boolean);
  const line = interpolate(frame, [0, fps * 0.3 * items.length + fps * 0.4], [0, 1], clamp);
  return (
    <div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ position: "relative", width: width * 0.8, display: "flex", flexDirection: "column", gap: 56 }}>
        <div style={{ position: "absolute", left: 30, top: 20, bottom: 20, width: 8, backgroundColor: accentColor, opacity: 0.4, borderRadius: 4, scale: `1 ${line}`, transformOrigin: "top" }} />
        {items.map((it, i) => {
          const t = interpolate(frame, [fps * (0.2 + i * 0.3), fps * (0.6 + i * 0.3)], [0, 1], { ...clamp, easing: ease });
          const [head, ...rest] = it.split(":");
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 40, opacity: t, translate: `${(1 - t) * 60}px 0px` }}>
              <div style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: accentColor, flexShrink: 0, boxShadow: `0 0 0 12px ${panelColor}` }} />
              <div style={{ color: textColor }}>
                <div style={{ fontFamily: displayFont, fontSize: 58, fontWeight: 800, lineHeight: 1.05 }}>{head}</div>
                {rest.length ? <div style={{ fontFamily: bodyFont, fontSize: 38, opacity: 0.85, marginTop: 6 }}>{rest.join(":").trim()}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export const TimelineScene = Interactive.create({
  Component: TimelineInner,
  layout: "none",
  schema: { ...themeSchema, points: stringField("", "Points (separate with |, use 'Head: detail')") },
});

/* ---------------------------------------------------------- Quote */

type QuoteProps = ThemeProps & { quote: string; attribution: string };
const QuoteInner: React.FC<QuoteProps> = ({ quote, attribution, accentColor, textColor, displayFont, bodyFont, animation, style }) => {
  const { a } = useAnim(animation, 3);
  const { width } = useVideoConfig();
  return (
    <div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ ...a, width: width * 0.8 }}>
        <div style={{ fontFamily: displayFont, fontSize: 260, color: accentColor, lineHeight: 0.6, height: 120 }}>&ldquo;</div>
        <div style={{ fontFamily: displayFont, fontStyle: "italic", fontSize: fitFontSize(quote, 76, width * 0.8, 6, displayFont), color: textColor, lineHeight: 1.2 }}>{quote}</div>
        <div style={{ fontFamily: bodyFont, fontSize: 38, color: accentColor, marginTop: 40, fontWeight: 700, letterSpacing: 2 }}>— {attribution}</div>
      </div>
    </div>
  );
};
export const QuoteScene = Interactive.create({
  Component: QuoteInner,
  layout: "none",
  schema: { ...themeSchema, quote: stringField("", "Quote"), attribution: stringField("", "Attribution") },
});

/* ---------------------------------------------------------- Product */

type ProductProps = ThemeProps & { productName: string; tagline: string; features: string };
const ProductInner: React.FC<ProductProps> = ({ productName, tagline, features, accentColor, textColor, panelColor, displayFont, bodyFont, animation, style }) => {
  const { a, frame, fps } = useAnim(animation);
  const { width } = useVideoConfig();
  const list = features.split("|").map((f) => f.trim()).filter(Boolean);
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", paddingBottom: 380, ...style }}>
      <div style={{ ...a, textAlign: "center", width: width * 0.86 }}>
        <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: fitFontSize(productName, 120, width * 0.86, 2, displayFont), color: textColor, lineHeight: 1 }}>{productName}</div>
        <div style={{ fontFamily: bodyFont, fontSize: 44, color: accentColor, marginTop: 18, fontWeight: 600 }}>{tagline}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", marginTop: 40, width: width * 0.86 }}>
        {list.map((f, i) => {
          const t = interpolate(frame, [fps * (0.5 + i * 0.2), fps * (0.8 + i * 0.2)], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={i} style={{ opacity: t, scale: `${0.8 + 0.2 * t}`, backgroundColor: panelColor, color: textColor, fontFamily: bodyFont, fontSize: 36, fontWeight: 700, padding: "18px 30px", borderRadius: 999, border: `3px solid ${accentColor}` }}>
              {f}
            </div>
          );
        })}
      </div>
    </div>
  );
};
export const ProductShowcaseScene = Interactive.create({
  Component: ProductInner,
  layout: "none",
  schema: { ...themeSchema, productName: stringField("", "Product name"), tagline: stringField("", "Tagline"), features: stringField("", "Features (separate with |)") },
});

/* ---------------------------------------------------------- Number counter */

type CounterProps = ThemeProps & { value: number; prefix: string; suffix: string; label: string; decimals: number };
const CounterInner: React.FC<CounterProps> = ({ value, prefix, suffix, label, decimals, accentColor, textColor, displayFont, bodyFont, animation, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = interpolate(frame, [fps * 0.2, fps * 1.6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shown = (value * t).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const { a } = useAnim(animation, Math.round(fps * 0.8));
  const full = `${prefix}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: fitFontSize(full, 260, width * 0.9, 1, displayFont), color: accentColor, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        {prefix}
        {shown}
        {suffix}
      </div>
      <div style={{ ...a, fontFamily: bodyFont, fontWeight: 700, fontSize: fitFontSize(label, 54, width * 0.8, 3, bodyFont), color: textColor, textAlign: "center", width: width * 0.8, marginTop: 24 }}>{label}</div>
    </div>
  );
};
export const NumberCounterScene = Interactive.create({
  Component: CounterInner,
  layout: "none",
  schema: {
    ...themeSchema,
    value: numberField(100, "Value", { step: 1 }),
    prefix: stringField("", "Prefix"),
    suffix: stringField("", "Suffix"),
    label: stringField("", "Label"),
    decimals: numberField(0, "Decimals", { min: 0, max: 3, step: 1 }),
  },
});

/* ---------------------------------------------------------- Infographic */

type InfoProps = ThemeProps & { stats: string };
const InfoInner: React.FC<InfoProps> = ({ stats, accentColor, textColor, panelColor, displayFont, bodyFont, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const rows = stats
    .split("|")
    .map((s) => s.split("=").map((x) => x.trim()))
    .filter((r) => r.length >= 2)
    .map(([label, value, display]) => ({ label, value: Number(value) || 0, display: display ?? value }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <Panel color={panelColor} style={{ width: width * 0.84 }}>
        {rows.map((r, i) => {
          const t = interpolate(frame, [fps * (0.2 + i * 0.25), fps * (1 + i * 0.25)], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={i} style={{ marginBottom: i === rows.length - 1 ? 0 : 40 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, color: textColor, fontSize: 38, fontWeight: 700, marginBottom: 12 }}>
                <span>{r.label}</span>
                <span style={{ fontFamily: displayFont, color: accentColor, opacity: t }}>{r.display}</span>
              </div>
              <div style={{ height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(r.value / max) * 100 * t}%`, backgroundColor: i === 0 ? accentColor : textColor, borderRadius: 14 }} />
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
};
export const AnimatedInfographicScene = Interactive.create({
  Component: InfoInner,
  layout: "none",
  schema: { ...themeSchema, stats: stringField("", "Stats ('Label=value=display' separated by |)") },
});

/* ---------------------------------------------------------- Outro */

type OutroProps = ThemeProps & { cta: string; handle: string };
const OutroInner: React.FC<OutroProps> = ({ cta, handle, accentColor, textColor, displayFont, bodyFont, animation, style }) => {
  const { a, frame, fps } = useAnim(animation);
  const { width } = useVideoConfig();
  const ring = spring({ frame, fps, config: { damping: 14 } });
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ width: 220, height: 220, borderRadius: 110, border: `14px solid ${accentColor}`, scale: `${ring}`, marginBottom: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 0, height: 0, borderTop: "46px solid transparent", borderBottom: "46px solid transparent", borderLeft: `76px solid ${accentColor}`, marginLeft: 16 }} />
      </div>
      <div style={{ ...a, fontFamily: displayFont, fontWeight: 800, fontSize: fitFontSize(cta, 84, width * 0.84, 3, displayFont), color: textColor, textAlign: "center", width: width * 0.84, lineHeight: 1.1 }}>{cta}</div>
      {handle ? <div style={{ ...a, fontFamily: bodyFont, fontSize: 40, color: accentColor, marginTop: 30, fontWeight: 700 }}>{handle}</div> : null}
    </div>
  );
};
export const OutroScene = Interactive.create({
  Component: OutroInner,
  layout: "none",
  schema: { ...themeSchema, cta: stringField("Follow for more", "Call to action"), handle: stringField("", "Handle / URL") },
});

/* ---------------------------------------------------------- Kicker / chip */

type ChipProps = { children: React.ReactNode; color: string; textColor: string; fontFamily: string; style?: CSSProperties };
const ChipInner: React.FC<ChipProps> = ({ children, color, textColor, fontFamily, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [0, fps * 0.4], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ ...fill, display: "flex", justifyContent: "center", alignItems: "flex-start", pointerEvents: "none" }}>
      <div style={{ backgroundColor: color, color: textColor, fontFamily, fontWeight: 800, fontSize: 32, letterSpacing: 3, textTransform: "uppercase", padding: "14px 28px", borderRadius: 999, opacity: t, ...style }}>{children}</div>
    </div>
  );
};
export const Chip = Interactive.create({
  Component: ChipInner,
  layout: "none",
  schema: {
    children: { type: "string", default: "", description: "Label" },
    color: colorField("#ffe066", "Chip colour"),
    textColor: colorField("#111111", "Text colour"),
    fontFamily: { type: "font-family", default: "Inter, sans-serif", description: "Font" },
  },
});
