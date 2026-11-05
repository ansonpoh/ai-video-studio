import type { FontPairing, ThemeName } from "../../schemas/catalog";

export type Theme = {
  name: ThemeName;
  background: string;
  backgroundAlt: string;
  primary: string;
  accent: string;
  text: string;
  muted: string;
  /** Overlay gradient that keeps text readable over imagery. */
  scrim: string;
  grain: number;
};

export const THEME_TOKENS: Record<ThemeName, Theme> = {
  storm: { name: "storm", background: "#070b18", backgroundAlt: "#141c3a", primary: "#8ab4ff", accent: "#ffe066", text: "#f4f7ff", muted: "#9aa6c7", scrim: "rgba(4,6,16,0.72)", grain: 0.05 },
  cosmic: { name: "cosmic", background: "#04030c", backgroundAlt: "#1a1033", primary: "#c9b6ff", accent: "#ffb86b", text: "#fbf8ff", muted: "#a59bc4", scrim: "rgba(3,2,10,0.7)", grain: 0.06 },
  vivid: { name: "vivid", background: "#ff4d2e", backgroundAlt: "#ffd23f", primary: "#1b1b3a", accent: "#ffffff", text: "#ffffff", muted: "#ffe9e0", scrim: "rgba(20,10,40,0.35)", grain: 0.0 },
  "clean-light": { name: "clean-light", background: "#f6f4ef", backgroundAlt: "#e8e3d8", primary: "#1f2937", accent: "#2563eb", text: "#111827", muted: "#6b7280", scrim: "rgba(246,244,239,0.75)", grain: 0.02 },
  noir: { name: "noir", background: "#0b0b0b", backgroundAlt: "#1c1c1c", primary: "#e5e5e5", accent: "#e11d48", text: "#fafafa", muted: "#a3a3a3", scrim: "rgba(0,0,0,0.7)", grain: 0.08 },
  warm: { name: "warm", background: "#2a1610", backgroundAlt: "#5a2e1c", primary: "#ffcf99", accent: "#ff7a45", text: "#fff6ec", muted: "#e0bfa3", scrim: "rgba(30,12,6,0.65)", grain: 0.05 },
  tech: { name: "tech", background: "#060f14", backgroundAlt: "#0b2a33", primary: "#5eead4", accent: "#a3e635", text: "#ecfeff", muted: "#7fb4be", scrim: "rgba(2,10,14,0.7)", grain: 0.03 },
  nature: { name: "nature", background: "#0d1f16", backgroundAlt: "#1f4030", primary: "#b7e4c7", accent: "#ffd166", text: "#f1faee", muted: "#a7c4b5", scrim: "rgba(6,16,10,0.65)", grain: 0.04 },
};

export const FONT_STACKS: Record<FontPairing, { display: string; body: string; displayWeight: number; uppercase: boolean }> = {
  "modern-sans": { display: "Inter, sans-serif", body: "Inter, sans-serif", displayWeight: 800, uppercase: false },
  "cinematic-serif": { display: "'Playfair Display', serif", body: "Inter, sans-serif", displayWeight: 700, uppercase: false },
  "bold-display": { display: "Anton, Impact, sans-serif", body: "Montserrat, sans-serif", displayWeight: 400, uppercase: true },
  "tech-grotesk": { display: "'Space Grotesk', sans-serif", body: "'Space Grotesk', sans-serif", displayWeight: 700, uppercase: false },
  editorial: { display: "Fraunces, serif", body: "Inter, sans-serif", displayWeight: 600, uppercase: false },
  "friendly-rounded": { display: "Montserrat, sans-serif", body: "Montserrat, sans-serif", displayWeight: 800, uppercase: false },
};

export const getTheme = (name: string | undefined): Theme => THEME_TOKENS[(name as ThemeName) ?? "storm"] ?? THEME_TOKENS.storm;
