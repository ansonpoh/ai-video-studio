/**
 * Procedural art library: animated, resolution-independent visuals drawn with
 * SVG. Used for diagram / motion-graphics scenes, as the offline demo's
 * "image provider", and as an always-available fallback backdrop.
 */
import React from "react";
import { interpolate, random, Easing } from "remotion";
import { noise2D } from "@remotion/noise";
import type { ProceduralArt } from "../../schemas/catalog";

export type ArtProps = {
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  primary: string;
  accent: string;
  background: string;
  labels: string[];
  seed: number;
  labelFont: string;
  /** Fraction of the height at the top kept clear for the scene title (labels there are skipped). */
  reserveTop?: number;
  /** Band (fractions of the height) kept clear for captions; labels inside it are skipped. */
  reserveBand?: [number, number];
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const r = (seed: number, i: number, salt = 0) => random(`${seed}-${i}-${salt}`);
const ease = Easing.bezier(0.16, 1, 0.3, 1);

/* ---------------------------------------------------------------- helpers */

const Stars: React.FC<{ p: ArtProps; count?: number; maxY?: number }> = ({ p, count = 260, maxY = 1 }) => (
  <g>
    {Array.from({ length: count }).map((_, i) => {
      const x = r(p.seed, i, 1) * p.width;
      const y = r(p.seed, i, 2) * p.height * maxY;
      const size = 0.6 + r(p.seed, i, 3) ** 3 * 3.2;
      const tw = 0.55 + 0.45 * Math.sin(p.frame / (8 + r(p.seed, i, 4) * 20) + i);
      return <circle key={i} cx={x} cy={y} r={size} fill="#ffffff" opacity={tw * (0.35 + r(p.seed, i, 5) * 0.65)} />;
    })}
  </g>
);

const Label: React.FC<{ p: ArtProps; x: number; y: number; text?: string; delay: number; size?: number; color?: string; anchor?: "start" | "middle" | "end" }> = ({
  p,
  x,
  y,
  text,
  delay,
  size,
  color,
  anchor = "middle",
}) => {
  if (!text) return null;
  if (p.reserveTop && y < p.height * p.reserveTop) return null;
  if (p.reserveBand && y > p.height * p.reserveBand[0] && y < p.height * p.reserveBand[1]) return null;
  const t = interpolate(p.frame, [delay, delay + p.fps * 0.5], [0, 1], { ...clamp, easing: ease });
  const fs = size ?? Math.round(p.width * 0.045);
  return (
    <g opacity={t} transform={`translate(0 ${(1 - t) * 24})`}>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontFamily={p.labelFont}
        fontWeight={700}
        fontSize={fs}
        fill={color ?? "#ffffff"}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={fs * 0.12}
        paintOrder="stroke"
      >
        {text}
      </text>
    </g>
  );
};

const boltPath = (seed: number, x0: number, y0: number, x1: number, y1: number, segments: number, jitter: number) => {
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const x = x0 + (x1 - x0) * t + (r(seed, i, 9) - 0.5) * jitter;
    const y = y0 + (y1 - y0) * t + (r(seed, i, 10) - 0.5) * jitter * 0.25;
    pts.push([x, y]);
  }
  pts.push([x1, y1]);
  return pts;
};
const toD = (pts: [number, number][]) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const polyLength = (pts: [number, number][]) => pts.slice(1).reduce((acc, [x, y], i) => acc + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

const Cloud: React.FC<{ cx: number; cy: number; w: number; fill: string; seed: number; frame: number; opacity?: number }> = ({ cx, cy, w, fill, seed, frame, opacity = 1 }) => (
  <g opacity={opacity}>
    {Array.from({ length: 9 }).map((_, i) => {
      const ox = (r(seed, i, 20) - 0.5) * w;
      const oy = (r(seed, i, 21) - 0.5) * w * 0.22;
      const rad = w * (0.16 + r(seed, i, 22) * 0.16);
      const drift = Math.sin(frame / 40 + i) * w * 0.01;
      return <circle key={i} cx={cx + ox + drift} cy={cy + oy} r={rad} fill={fill} />;
    })}
  </g>
);

const SkyGradient: React.FC<{ id: string; stops: [number, string][] }> = ({ id, stops }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    {stops.map(([o, c]) => (
      <stop key={o} offset={o} stopColor={c} />
    ))}
  </linearGradient>
);

const Svg: React.FC<{ p: ArtProps; children: React.ReactNode }> = ({ p, children }) => (
  <svg width={p.width} height={p.height} viewBox={`0 0 ${p.width} ${p.height}`} style={{ position: "absolute", inset: 0 }}>
    <defs>
      <filter id="blur-lg" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={p.width * 0.03} />
      </filter>
      <filter id="blur-md" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={p.width * 0.012} />
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={p.width * 0.008} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {children}
  </svg>
);

/* ------------------------------------------------------------- weather */

const StormClouds: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame } = p;
  const flashFrames = [Math.round(p.fps * 1.2), Math.round(p.fps * 3.4), Math.round(p.fps * 6.1)];
  const flash = Math.max(...flashFrames.map((f) => interpolate(frame, [f, f + 2, f + 10], [0, 1, 0], clamp)));
  return (
    <Svg p={p}>
      <SkyGradient id="storm-sky" stops={[[0, "#03050c"], [0.45, "#121a33"], [1, "#2a3352"]]} />
      <rect width={W} height={H} fill="url(#storm-sky)" />
      <g filter="url(#blur-lg)">
        {Array.from({ length: 16 }).map((_, i) => {
          const y = H * (0.05 + r(p.seed, i, 30) * 0.55);
          const x = ((r(p.seed, i, 31) * W * 1.6 + frame * (0.4 + r(p.seed, i, 32)) * (i % 2 ? 1 : -1)) % (W * 1.6)) - W * 0.3;
          const shade = Math.round(30 + r(p.seed, i, 33) * 40);
          return <ellipse key={i} cx={x} cy={y} rx={W * (0.35 + r(p.seed, i, 34) * 0.3)} ry={H * 0.07} fill={`rgb(${shade},${shade + 6},${shade + 22})`} opacity={0.85} />;
        })}
      </g>
      <ellipse cx={W * 0.6} cy={H * 0.28} rx={W * 0.4} ry={H * 0.12} fill="#b9c8ff" opacity={flash * 0.6} filter="url(#blur-lg)" />
      <g stroke="#9fb0d8" strokeWidth={2} opacity={0.35}>
        {Array.from({ length: 140 }).map((_, i) => {
          const x = r(p.seed, i, 40) * W * 1.2 - W * 0.1;
          const y = ((r(p.seed, i, 41) * H + frame * (38 + r(p.seed, i, 42) * 20)) % (H * 1.1)) - H * 0.05;
          return <line key={i} x1={x} y1={y} x2={x - 18} y2={y + 70} />;
        })}
      </g>
      <rect width={W} height={H} fill="#dfe6ff" opacity={flash * 0.18} />
    </Svg>
  );
};

const LightningBolt: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const main = boltPath(p.seed, W * 0.58, H * 0.2, W * 0.42, H * 0.86, 22, W * 0.22);
  const b1 = boltPath(p.seed + 1, main[7][0], main[7][1], W * 0.85, H * 0.55, 10, W * 0.12);
  const b2 = boltPath(p.seed + 2, main[12][0], main[12][1], W * 0.15, H * 0.66, 9, W * 0.12);
  const drawStart = fps * 0.5;
  const draw = interpolate(frame, [drawStart, drawStart + fps * 0.45], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const flicker = frame > drawStart + fps * 0.45 ? 0.75 + 0.25 * Math.sin(frame * 1.7) * Math.cos(frame * 0.9) : 1;
  const flash = interpolate(frame, [drawStart + fps * 0.42, drawStart + fps * 0.5, drawStart + fps * 1.1], [0, 1, 0.08], clamp);
  const L = polyLength(main);
  return (
    <Svg p={p}>
      <SkyGradient id="bolt-sky" stops={[[0, "#05060f"], [0.6, "#151b38"], [1, "#0b0d18"]]} />
      <rect width={W} height={H} fill="url(#bolt-sky)" />
      <rect width={W} height={H} fill="#6f7fd6" opacity={flash * 0.35} />
      <g filter="url(#blur-lg)" opacity={0.9}>
        <Cloud cx={W * 0.55} cy={H * 0.16} w={W * 1.1} fill="#262d4d" seed={p.seed} frame={frame} />
      </g>
      <g filter="url(#glow)" opacity={flicker}>
        {[b1, b2].map((b, i) => (
          <path key={i} d={toD(b)} stroke="#cfd8ff" strokeWidth={W * 0.004} fill="none" strokeDasharray={polyLength(b)} strokeDashoffset={polyLength(b) * (1 - interpolate(draw, [0.35 + i * 0.2, 1], [0, 1], clamp))} />
        ))}
        <path d={toD(main)} stroke="#ffffff" strokeWidth={W * 0.011} fill="none" strokeLinejoin="round" strokeDasharray={L} strokeDashoffset={L * (1 - draw)} />
        <path d={toD(main)} stroke={p.accent} strokeWidth={W * 0.03} fill="none" opacity={0.35} strokeDasharray={L} strokeDashoffset={L * (1 - draw)} />
      </g>
      <path d={`M0 ${H * 0.88} Q ${W * 0.3} ${H * 0.84} ${W * 0.5} ${H * 0.87} T ${W} ${H * 0.86} V ${H} H 0 Z`} fill="#03040a" />
      <ellipse cx={W * 0.42} cy={H * 0.87} rx={W * 0.25} ry={H * 0.02} fill={p.accent} opacity={flash * 0.6} filter="url(#blur-md)" />
      <Label p={p} x={W / 2} y={H * 0.95} text={p.labels[0]} delay={fps * 1.4} />
    </Svg>
  );
};

const ChargeSeparation: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const cloudY = H * 0.3;
  const plus = (x: number, y: number, s: number, c: string, key: string) => (
    <g key={key} stroke={c} strokeWidth={s * 0.28} strokeLinecap="round">
      <line x1={x - s} y1={y} x2={x + s} y2={y} />
      <line x1={x} y1={y - s} x2={x} y2={y + s} />
    </g>
  );
  const minus = (x: number, y: number, s: number, c: string, key: string) => (
    <line key={key} x1={x - s} y1={y} x2={x + s} y2={y} stroke={c} strokeWidth={s * 0.28} strokeLinecap="round" />
  );
  const appear = (i: number, base: number) => interpolate(frame, [base + i * 3, base + i * 3 + 8], [0, 1], clamp);
  const s = W * 0.028;
  const fieldPulse = (frame / fps) % 1.2;
  return (
    <Svg p={p}>
      <SkyGradient id="cs-sky" stops={[[0, "#0a1024"], [1, "#1c2747"]]} />
      <rect width={W} height={H} fill="url(#cs-sky)" />
      <g filter="url(#blur-md)">
        <Cloud cx={W * 0.5} cy={cloudY} w={W * 0.95} fill="#3a4466" seed={p.seed} frame={frame} />
      </g>
      <Cloud cx={W * 0.5} cy={cloudY} w={W * 0.85} fill="#4a5578" seed={p.seed + 3} frame={frame} opacity={0.9} />
      {Array.from({ length: 7 }).map((_, i) => (
        <g key={`p${i}`} opacity={appear(i, fps * 0.4)}>{plus(W * (0.22 + i * 0.093), cloudY - H * 0.07 + Math.sin(i * 2) * 10, s, "#ff8a8a", `p${i}`)}</g>
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <g key={`m${i}`} opacity={appear(i, fps * 1.2)}>{minus(W * (0.22 + i * 0.093), cloudY + H * 0.08 + Math.cos(i * 2) * 10, s, "#8ad4ff", `m${i}`)}</g>
      ))}
      <rect x={0} y={H * 0.8} width={W} height={H * 0.2} fill="#0b1220" />
      <line x1={0} y1={H * 0.8} x2={W} y2={H * 0.8} stroke="#33415f" strokeWidth={4} />
      {Array.from({ length: 8 }).map((_, i) => (
        <g key={`g${i}`} opacity={appear(i, fps * 2)}>{plus(W * (0.12 + i * 0.11), H * 0.86, s * 0.9, "#ff8a8a", `g${i}`)}</g>
      ))}
      <g opacity={interpolate(frame, [fps * 2.6, fps * 3.2], [0, 1], clamp)}>
        {Array.from({ length: 5 }).map((_, i) => {
          const x = W * (0.25 + i * 0.125);
          const y0 = cloudY + H * 0.13;
          const y1 = H * 0.78;
          const head = y1 - (y1 - y0) * (((fieldPulse + i * 0.2) % 1.2) / 1.2);
          return (
            <g key={i} stroke={p.accent} strokeWidth={5} opacity={0.75}>
              <line x1={x} y1={y1} x2={x} y2={y0} strokeDasharray="14 18" strokeDashoffset={-frame * 3} />
              <polygon points={`${x - 16},${head + 22} ${x + 16},${head + 22} ${x},${head - 8}`} fill={p.accent} stroke="none" />
            </g>
          );
        })}
      </g>
      <Label p={p} x={W / 2} y={cloudY - H * 0.15} text={p.labels[0]} delay={fps * 0.7} color="#ffb3b3" />
      <Label p={p} x={W / 2} y={cloudY + H * 0.2} text={p.labels[1]} delay={fps * 1.5} color="#b3e5ff" />
      <Label p={p} x={W / 2} y={H * 0.94} text={p.labels[2]} delay={fps * 2.3} color="#ffb3b3" />
    </Svg>
  );
};

const SteppedLeader: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const leader = boltPath(p.seed + 7, W * 0.5, H * 0.24, W * 0.62, H * 0.66, 14, W * 0.18);
  const steps = Math.floor(interpolate(frame, [fps * 0.3, fps * 2.6], [0, leader.length], clamp));
  const shown = leader.slice(0, Math.max(1, steps));
  const streamer = interpolate(frame, [fps * 2.0, fps * 2.7], [0, 1], { ...clamp, easing: ease });
  const towerX = W * 0.62;
  const groundY = H * 0.8;
  const connect = interpolate(frame, [fps * 2.7, fps * 2.8, fps * 3.6], [0, 1, 0.15], clamp);
  return (
    <Svg p={p}>
      <SkyGradient id="sl-sky" stops={[[0, "#070b1a"], [1, "#1a2140"]]} />
      <rect width={W} height={H} fill="url(#sl-sky)" />
      <rect width={W} height={H} fill="#c6d0ff" opacity={connect * 0.25} />
      <g filter="url(#blur-md)">
        <Cloud cx={W * 0.5} cy={H * 0.17} w={W * 1.05} fill="#30395c" seed={p.seed} frame={frame} />
      </g>
      <g filter="url(#glow)">
        <path d={toD(shown)} stroke="#dfe6ff" strokeWidth={W * 0.006} fill="none" strokeLinejoin="round" opacity={0.9} />
        {shown.slice(-1).map(([x, y]) => (
          <circle key="tip" cx={x} cy={y} r={W * 0.012} fill={p.accent} />
        ))}
        <line x1={towerX} y1={groundY - H * 0.08} x2={towerX} y2={groundY - H * 0.08 - (groundY - H * 0.08 - H * 0.66) * streamer} stroke={p.accent} strokeWidth={W * 0.006} />
        {connect > 0.01 ? <path d={toD([...leader, [towerX, groundY - H * 0.08]])} stroke="#ffffff" strokeWidth={W * 0.014} fill="none" opacity={connect} /> : null}
      </g>
      <rect x={0} y={groundY} width={W} height={H - groundY} fill="#060912" />
      <rect x={towerX - W * 0.015} y={groundY - H * 0.08} width={W * 0.03} height={H * 0.08} fill="#1d2438" />
      <Label p={p} x={W * 0.3} y={H * 0.42} text={p.labels[0]} delay={fps * 0.8} anchor="middle" />
      <Label p={p} x={W * 0.3} y={H * 0.72} text={p.labels[1]} delay={fps * 2.1} anchor="middle" color={p.accent} />
      <Label p={p} x={W / 2} y={H * 0.92} text={p.labels[2]} delay={fps * 2.9} />
    </Svg>
  );
};

const ThunderWave: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const cx = W * 0.5;
  const cy = H * 0.48;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill="#080a14" />
      <radialGradient id="tw-core">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.3" stopColor={p.accent} />
        <stop offset="1" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
      {Array.from({ length: 7 }).map((_, i) => {
        const t = ((frame / fps) * 0.7 + i / 7) % 1;
        return <circle key={i} cx={cx} cy={cy} r={t * W * 0.75} fill="none" stroke={p.primary} strokeWidth={W * 0.012 * (1 - t)} opacity={(1 - t) * 0.9} />;
      })}
      <rect x={cx - W * 0.008} y={H * 0.24} width={W * 0.016} height={H * 0.48} rx={W * 0.008} fill="#ffffff" filter="url(#glow)" opacity={0.65 + 0.1 * Math.sin(frame)} />
      <circle cx={cx} cy={cy} r={W * 0.25} fill="url(#tw-core)" opacity={0.5} />
      <Label p={p} x={cx} y={H * 0.1} text={p.labels[0]} delay={fps * 0.4} color={p.accent} size={W * 0.07} />
      <Label p={p} x={cx} y={H * 0.92} text={p.labels[1]} delay={fps * 1.2} />
    </Svg>
  );
};

/* ---------------------------------------------------------------- space */

const Starfield: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame } = p;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill="#03020a" />
      <g filter="url(#blur-lg)" opacity={0.75}>
        <ellipse cx={W * (0.3 + Math.sin(frame / 200) * 0.03)} cy={H * 0.3} rx={W * 0.6} ry={H * 0.16} fill={p.primary} opacity={0.35} />
        <ellipse cx={W * 0.75} cy={H * 0.65} rx={W * 0.5} ry={H * 0.14} fill={p.accent} opacity={0.22} />
        <ellipse cx={W * 0.4} cy={H * 0.8} rx={W * 0.45} ry={H * 0.1} fill="#3b2a8f" opacity={0.4} />
      </g>
      <g transform={`translate(${-frame * 0.3} 0)`}>
        <Stars p={p} count={320} />
      </g>
    </Svg>
  );
};

const Planet: React.FC<{ cx: number; cy: number; rad: number; frame: number; seed: number; id: string }> = ({ cx, cy, rad, frame, seed, id }) => (
  <g>
    <defs>
      <radialGradient id={`${id}-ocean`} cx="0.35" cy="0.35" r="0.8">
        <stop offset="0" stopColor="#4fa3ff" />
        <stop offset="0.6" stopColor="#1559b5" />
        <stop offset="1" stopColor="#061a3d" />
      </radialGradient>
      <radialGradient id={`${id}-shade`} cx="0.25" cy="0.3" r="0.95">
        <stop offset="0.45" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(0,0,10,0.92)" />
      </radialGradient>
      <clipPath id={`${id}-clip`}>
        <circle cx={cx} cy={cy} r={rad} />
      </clipPath>
    </defs>
    <circle cx={cx} cy={cy} r={rad * 1.06} fill="#6fb7ff" opacity={0.25} filter="url(#blur-md)" />
    <circle cx={cx} cy={cy} r={rad} fill={`url(#${id}-ocean)`} />
    <g clipPath={`url(#${id}-clip)`}>
      {Array.from({ length: 14 }).map((_, i) => {
        const base = r(seed, i, 50) * rad * 4;
        const x = cx - rad * 2 + ((base + frame * 0.9) % (rad * 4));
        const y = cy + (r(seed, i, 51) - 0.5) * rad * 1.5;
        return <ellipse key={i} cx={x} cy={y} rx={rad * (0.15 + r(seed, i, 52) * 0.25)} ry={rad * (0.08 + r(seed, i, 53) * 0.15)} fill={i % 3 === 0 ? "#c2b280" : "#3f8f4a"} opacity={0.9} />;
      })}
      {Array.from({ length: 10 }).map((_, i) => {
        const x = cx - rad * 2 + ((r(seed, i, 60) * rad * 4 + frame * 1.4) % (rad * 4));
        const y = cy + (r(seed, i, 61) - 0.5) * rad * 1.8;
        return <ellipse key={`c${i}`} cx={x} cy={y} rx={rad * 0.3} ry={rad * 0.04} fill="#ffffff" opacity={0.55} />;
      })}
      <circle cx={cx} cy={cy} r={rad} fill={`url(#${id}-shade)`} />
    </g>
  </g>
);

const Moon: React.FC<{ cx: number; cy: number; rad: number; tint: string; seed: number }> = ({ cx, cy, rad, tint, seed }) => (
  <g>
    <circle cx={cx} cy={cy} r={rad * 1.5} fill={tint} opacity={0.18} filter="url(#blur-md)" />
    <circle cx={cx} cy={cy} r={rad} fill={tint} />
    {Array.from({ length: 6 }).map((_, i) => (
      <circle key={i} cx={cx + (r(seed, i, 70) - 0.5) * rad * 1.2} cy={cy + (r(seed, i, 71) - 0.5) * rad * 1.2} r={rad * (0.08 + r(seed, i, 72) * 0.14)} fill="#000000" opacity={0.12} />
    ))}
    <circle cx={cx + rad * 0.35} cy={cy + rad * 0.25} r={rad} fill="#000010" opacity={0.35} />
  </g>
);

const EarthTwoMoons: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const R = W * 0.3;
  const a1 = (frame / fps) * 0.35 + 0.4;
  const a2 = (frame / fps) * 0.22 + 2.6;
  const m1 = { x: cx + Math.cos(a1) * W * 0.44, y: cy + Math.sin(a1) * H * 0.12, z: Math.sin(a1) };
  const m2 = { x: cx + Math.cos(a2) * W * 0.4, y: cy - Math.sin(a2) * H * 0.2, z: -Math.sin(a2) };
  const moon = (m: typeof m1, rad: number, tint: string, seed: number) => <Moon cx={m.x} cy={m.y} rad={rad * (0.85 + 0.15 * m.z)} tint={tint} seed={seed} />;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill="#02020a" />
      <Stars p={p} count={300} />
      <ellipse cx={cx} cy={cy} rx={W * 0.44} ry={H * 0.12} fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} strokeDasharray="6 10" />
      {m1.z < 0 ? moon(m1, W * 0.06, "#d9d4c7", 1) : null}
      {m2.z < 0 ? moon(m2, W * 0.04, "#e3a87a", 2) : null}
      <Planet cx={cx} cy={cy} rad={R} frame={frame} seed={p.seed} id="earth" />
      {m1.z >= 0 ? moon(m1, W * 0.06, "#d9d4c7", 1) : null}
      {m2.z >= 0 ? moon(m2, W * 0.04, "#e3a87a", 2) : null}
      <Label p={p} x={cx} y={H * 0.85} text={p.labels[0]} delay={fps * 0.8} />
    </Svg>
  );
};

const TwoMoonsHorizon: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const rise = interpolate(frame, [0, fps * 6], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const ridge = (offset: number, amp: number, y: number, fill: string, speed: number, key: string) => {
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = (i / 24) * W;
      const yy = y + noise2D(`ridge-${key}`, i / 5 + offset, 0) * amp - Math.abs(Math.sin(i * 0.7 + offset)) * amp * 0.4;
      pts.push(`${x.toFixed(1)},${yy.toFixed(1)}`);
    }
    return <polygon key={key} points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill={fill} transform={`translate(${-frame * speed} 0)`} />;
  };
  return (
    <Svg p={p}>
      <SkyGradient id="tmh-sky" stops={[[0, "#050414"], [0.55, "#1d1640"], [0.78, "#5a3a6b"], [1, "#22152f"]]} />
      <rect width={W} height={H} fill="url(#tmh-sky)" />
      <Stars p={p} count={220} maxY={0.6} />
      <Moon cx={W * 0.36} cy={H * (0.45 - 0.06 * rise)} rad={W * 0.17} tint="#ece6d6" seed={3} />
      <Moon cx={W * 0.76} cy={H * (0.42 - 0.04 * rise)} rad={W * 0.075} tint="#f0b48a" seed={4} />
      <rect x={0} y={H * 0.62} width={W} height={H * 0.2} fill="#ffcf9e" opacity={0.08} filter="url(#blur-lg)" />
      {ridge(0, H * 0.05, H * 0.68, "#2b1d3d", 0.1, "a")}
      {ridge(3, H * 0.06, H * 0.74, "#1a1128", 0.25, "b")}
      {ridge(7, H * 0.04, H * 0.82, "#0c0814", 0.45, "c")}
      <Label p={p} x={W / 2} y={H * 0.93} text={p.labels[0]} delay={fps * 1} />
    </Svg>
  );
};

const Tides: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const grow = interpolate(frame, [fps * 0.5, fps * 3], [0.3, 1], { ...clamp, easing: ease });
  const surface = (y: number, amp: number, phase: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const x = (i / 48) * W;
      const bulge = Math.exp(-(((x - W * 0.5) / (W * 0.28)) ** 2)) * H * 0.09 * grow;
      const yy = y - bulge + Math.sin(i / 3 + frame / 10 + phase) * amp;
      pts.push(`${x.toFixed(1)},${yy.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  return (
    <Svg p={p}>
      <SkyGradient id="tide-sky" stops={[[0, "#05061a"], [1, "#16235a"]]} />
      <rect width={W} height={H} fill="url(#tide-sky)" />
      <Stars p={p} count={120} maxY={0.4} />
      <Moon cx={W * 0.5} cy={H * 0.27} rad={W * 0.09} tint="#e8e2d0" seed={5} />
      <g stroke={p.accent} strokeWidth={6} opacity={interpolate(frame, [fps, fps * 1.6], [0, 0.9], clamp)}>
        {[-1, 0, 1].map((d) => {
          const x = W * 0.5 + d * W * 0.15;
          const t = ((frame / fps) * 0.8 + (d + 1) * 0.3) % 1;
          const y = H * 0.5 - t * H * 0.18;
          return (
            <g key={d}>
              <line x1={x} y1={H * 0.52} x2={x} y2={H * 0.3} strokeDasharray="10 14" />
              <polygon points={`${x - 16},${y + 10} ${x + 16},${y + 10} ${x},${y - 18}`} fill={p.accent} stroke="none" />
            </g>
          );
        })}
      </g>
      <polygon points={`0,${H} ${surface(H * 0.6, 8, 0)} ${W},${H}`} fill="#0c3d7a" />
      <polygon points={`0,${H} ${surface(H * 0.64, 6, 1)} ${W},${H}`} fill="#0a2d5c" />
      <polygon points={`0,${H} ${surface(H * 0.7, 5, 2)} ${W},${H}`} fill="#071d3d" />
      <Label p={p} x={W / 2} y={H * 0.84} text={p.labels[0]} delay={fps * 1.2} />
      <Label p={p} x={W / 2} y={H * 0.9} text={p.labels[1]} delay={fps * 1.8} size={W * 0.035} color="#cfe1ff" />
    </Svg>
  );
};

const OrbitDiagram: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const cx = W / 2;
  const cy = H * 0.45;
  const orbits = [W * 0.2, W * 0.32, W * 0.43];
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill="#04050f" />
      <Stars p={p} count={160} />
      <circle cx={cx} cy={cy} r={W * 0.07} fill={p.accent} filter="url(#glow)" />
      {orbits.map((rad, i) => {
        const a = (frame / fps) * (0.9 - i * 0.25) + i * 2;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * 0.42;
        return (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={rad} ry={rad * 0.42} fill="none" stroke={p.primary} strokeOpacity={0.35} strokeWidth={3} strokeDasharray="8 12" />
            <circle cx={x} cy={y} r={W * (0.022 + i * 0.008)} fill={i === 1 ? "#4f9dff" : i === 0 ? "#c9c2b3" : "#e3a87a"} />
          </g>
        );
      })}
      {p.labels.map((l, i) => (
        <Label key={i} p={p} x={cx} y={H * (0.72 + i * 0.06)} text={l} delay={fps * (0.6 + i * 0.5)} size={W * 0.04} />
      ))}
    </Svg>
  );
};

const Eclipse: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, durationInFrames } = p;
  const cx = W / 2;
  const cy = H * 0.42;
  const t = interpolate(frame, [0, durationInFrames], [-1, 0.25], clamp);
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill="#020205" />
      <Stars p={p} count={140} />
      <circle cx={cx} cy={cy} r={W * 0.32} fill={p.accent} opacity={0.25 - t * 0.1} filter="url(#blur-lg)" />
      <circle cx={cx} cy={cy} r={W * 0.2} fill="#fff3c4" filter="url(#glow)" />
      <circle cx={cx + t * W * 0.5} cy={cy + t * W * 0.05} r={W * 0.205} fill="#050508" />
      <Label p={p} x={cx} y={H * 0.82} text={p.labels[0]} delay={10} />
    </Svg>
  );
};

/* -------------------------------------------------------------- generic */

const AuroraGradient: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame } = p;
  const blobs = [p.primary, p.accent, p.background, p.primary, p.accent];
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <g filter="url(#blur-lg)">
        {blobs.map((c, i) => {
          const x = W * (0.5 + 0.4 * noise2D(`ax${p.seed}`, i, frame / 160));
          const y = H * (0.5 + 0.4 * noise2D(`ay${p.seed}`, i, frame / 160));
          return <circle key={i} cx={x} cy={y} r={W * (0.35 + 0.1 * i)} fill={c} opacity={0.55} />;
        })}
      </g>
    </Svg>
  );
};

const ParticleNetwork: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const nodes = Array.from({ length: 34 }).map((_, i) => ({
    x: W * (0.08 + 0.84 * r(p.seed, i, 80)) + noise2D(`nx${p.seed}`, i, frame / 90) * W * 0.04,
    y: H * (0.08 + 0.84 * r(p.seed, i, 81)) + noise2D(`ny${p.seed}`, i, frame / 90) * H * 0.03,
  }));
  const reveal = interpolate(frame, [0, fps * 1.5], [0, 1], clamp);
  const lines: React.ReactNode[] = [];
  nodes.forEach((a, i) =>
    nodes.slice(i + 1).forEach((b, j) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < W * 0.28) lines.push(<line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.primary} strokeOpacity={(1 - d / (W * 0.28)) * 0.6 * reveal} strokeWidth={2} />);
    }),
  );
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <g filter="url(#blur-lg)" opacity={0.5}>
        <circle cx={W * 0.3} cy={H * 0.3} r={W * 0.4} fill={p.primary} opacity={0.25} />
        <circle cx={W * 0.8} cy={H * 0.75} r={W * 0.35} fill={p.accent} opacity={0.2} />
      </g>
      {lines}
      {nodes.map((n, i) => {
        const pulse = 0.6 + 0.4 * Math.sin(frame / 6 + i);
        return <circle key={i} cx={n.x} cy={n.y} r={W * 0.008 * (1 + (i % 3) * 0.4)} fill={i % 5 === 0 ? p.accent : p.primary} opacity={pulse * reveal} filter="url(#glow)" />;
      })}
    </Svg>
  );
};

const WireframeGlobe: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame } = p;
  const cx = W / 2;
  const cy = H * 0.45;
  const R = W * 0.36;
  const rot = frame / 60;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <circle cx={cx} cy={cy} r={R * 1.1} fill={p.primary} opacity={0.12} filter="url(#blur-lg)" />
      <g fill="none" stroke={p.primary} strokeWidth={2.5} strokeOpacity={0.75}>
        <circle cx={cx} cy={cy} r={R} />
        {Array.from({ length: 9 }).map((_, i) => {
          const a = rot + (i / 9) * Math.PI;
          return <ellipse key={`m${i}`} cx={cx} cy={cy} rx={Math.abs(Math.cos(a)) * R} ry={R} strokeOpacity={0.25 + 0.5 * Math.abs(Math.sin(a))} />;
        })}
        {[-0.66, -0.33, 0, 0.33, 0.66].map((lat) => (
          <ellipse key={`l${lat}`} cx={cx} cy={cy + lat * R} rx={Math.sqrt(1 - lat * lat) * R} ry={Math.sqrt(1 - lat * lat) * R * 0.12} />
        ))}
      </g>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = rot * 1.3 + i;
        const x = cx + Math.cos(a) * R * 0.8;
        const y = cy + Math.sin(i * 1.7) * R * 0.6;
        return Math.cos(a + Math.PI / 2) > 0 ? <circle key={i} cx={x} cy={y} r={W * 0.012} fill={p.accent} filter="url(#glow)" /> : null;
      })}
    </Svg>
  );
};

const BarChart: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const values = [0.35, 0.5, 0.42, 0.68, 0.9];
  const base = H * 0.78;
  const bw = W * 0.12;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <line x1={W * 0.08} y1={base} x2={W * 0.92} y2={base} stroke={p.primary} strokeOpacity={0.5} strokeWidth={4} />
      {values.map((v, i) => {
        const g = interpolate(frame, [fps * 0.3 + i * 5, fps * 1.1 + i * 5], [0, 1], { ...clamp, easing: ease });
        const h = v * H * 0.5 * g;
        const x = W * 0.12 + i * (bw + W * 0.045);
        return <rect key={i} x={x} y={base - h} width={bw} height={h} rx={bw * 0.15} fill={i === values.length - 1 ? p.accent : p.primary} opacity={0.92} />;
      })}
      <Label p={p} x={W / 2} y={H * 0.88} text={p.labels[0]} delay={fps * 1.2} />
    </Svg>
  );
};

const FlowArrows: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const stages = [0.25, 0.5, 0.75];
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      {stages.map((y, i) => {
        const a = interpolate(frame, [fps * (0.2 + i * 0.6), fps * (0.6 + i * 0.6)], [0, 1], { ...clamp, easing: ease });
        return (
          <g key={i} opacity={a}>
            <circle cx={W / 2} cy={H * y} r={W * 0.11 * (0.8 + 0.2 * a)} fill={i === 2 ? p.accent : p.primary} opacity={0.9} />
            <text x={W / 2} y={H * y + W * 0.035} textAnchor="middle" fontFamily={p.labelFont} fontWeight={800} fontSize={W * 0.09} fill={p.background}>
              {i + 1}
            </text>
            <Label p={p} x={W / 2} y={H * y + W * 0.2} text={p.labels[i]} delay={fps * (0.4 + i * 0.6)} size={W * 0.045} />
            {i < 2 ? <line x1={W / 2} y1={H * y + W * 0.25} x2={W / 2} y2={H * stages[i + 1] - W * 0.14} stroke={p.primary} strokeWidth={6} strokeDasharray="12 12" strokeDashoffset={-frame * 2} /> : null}
          </g>
        );
      })}
    </Svg>
  );
};

/* ---------------------------------------------------- lifestyle / work */

const Checklist: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const items = p.labels.length ? p.labels : ["Plan", "Focus", "Review"];
  const cardY = H * 0.28;
  const rowH = H * 0.11;
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <rect x={W * 0.1} y={cardY - H * 0.04} width={W * 0.8} height={rowH * items.length + H * 0.08} rx={W * 0.05} fill="#ffffff" opacity={0.95} />
      {items.map((label, i) => {
        const tick = interpolate(frame, [fps * (0.5 + i * 0.7), fps * (0.8 + i * 0.7)], [0, 1], { ...clamp, easing: ease });
        const y = cardY + i * rowH + rowH / 2;
        const bx = W * 0.18;
        const s = W * 0.07;
        return (
          <g key={i}>
            <rect x={bx} y={y - s / 2} width={s} height={s} rx={s * 0.22} fill={tick > 0.5 ? p.accent : "none"} stroke={tick > 0.5 ? p.accent : "#c9c9d6"} strokeWidth={5} />
            <path d={`M${bx + s * 0.22} ${y} L${bx + s * 0.43} ${y + s * 0.2} L${bx + s * 0.8} ${y - s * 0.22}`} fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" strokeDasharray={s} strokeDashoffset={s * (1 - tick)} />
            <text x={bx + s * 1.5} y={y + W * 0.02} fontFamily={p.labelFont} fontWeight={700} fontSize={W * 0.055} fill="#1b1b2f" opacity={1 - tick * 0.45}>
              {label}
            </text>
            <line x1={bx + s * 1.5} y1={y} x2={bx + s * 1.5 + W * 0.5 * tick} y2={y} stroke="#1b1b2f" strokeOpacity={0.5} strokeWidth={4} />
          </g>
        );
      })}
    </Svg>
  );
};

const PhoneFocus: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const pw = W * 0.5;
  const ph = pw * 2;
  const px = (W - pw) / 2;
  const py = H * 0.2;
  const silence = interpolate(frame, [fps * 2.2, fps * 2.8], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <rect x={px} y={py} width={pw} height={ph} rx={pw * 0.14} fill="#111827" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={6} />
      <rect x={px + pw * 0.06} y={py + pw * 0.08} width={pw * 0.88} height={ph - pw * 0.16} rx={pw * 0.09} fill={silence > 0.5 ? "#0b1020" : "#1f2a44"} />
      {Array.from({ length: 4 }).map((_, i) => {
        const pop = interpolate(frame, [fps * (0.3 + i * 0.4), fps * (0.5 + i * 0.4)], [0, 1], { ...clamp, easing: ease });
        const y = py + pw * 0.25 + i * pw * 0.28;
        return (
          <g key={i} opacity={pop * (1 - silence)} transform={`translate(${(1 - pop) * 60 + silence * W * 0.6} 0)`}>
            <rect x={px + pw * 0.12} y={y} width={pw * 0.76} height={pw * 0.2} rx={pw * 0.05} fill="#ffffff" opacity={0.92} />
            <circle cx={px + pw * 0.22} cy={y + pw * 0.1} r={pw * 0.05} fill={["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"][i]} />
            <rect x={px + pw * 0.32} y={y + pw * 0.06} width={pw * 0.45} height={pw * 0.03} rx={4} fill="#9ca3af" />
            <rect x={px + pw * 0.32} y={y + pw * 0.12} width={pw * 0.3} height={pw * 0.03} rx={4} fill="#d1d5db" />
          </g>
        );
      })}
      <g opacity={silence} transform={`translate(${W / 2} ${py + ph * 0.45}) scale(${0.6 + 0.4 * silence})`}>
        <circle r={pw * 0.2} fill={p.accent} />
        <path d={`M ${pw * 0.05} ${-pw * 0.11} A ${pw * 0.11} ${pw * 0.11} 0 1 0 ${pw * 0.09} ${pw * 0.07} A ${pw * 0.09} ${pw * 0.09} 0 1 1 ${pw * 0.05} ${-pw * 0.11} Z`} fill="#111827" />
      </g>
      <Label p={p} x={W / 2} y={py + ph + H * 0.07} text={p.labels[0]} delay={fps * 2.6} color={p.accent} />
    </Svg>
  );
};

const FocusTimer: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps, durationInFrames } = p;
  const cx = W / 2;
  const cy = H * 0.45;
  const R = W * 0.32;
  const C = 2 * Math.PI * R;
  const prog = interpolate(frame, [fps * 0.3, durationInFrames], [0, 0.85], clamp);
  const minutes = Math.max(0, 25 - Math.floor(prog * 25));
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={W * 0.04} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={p.accent} strokeWidth={W * 0.04} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * prog} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + W * 0.06} textAnchor="middle" fontFamily={p.labelFont} fontWeight={800} fontSize={W * 0.17} fill="#ffffff">
        {`${String(minutes).padStart(2, "0")}:00`}
      </text>
      <Label p={p} x={cx} y={cy + R + H * 0.1} text={p.labels[0]} delay={fps * 0.6} />
    </Svg>
  );
};

const CalendarBlocks: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps } = p;
  const cols = 7;
  const rows = 6;
  const gx = W * 0.08;
  const gy = H * 0.24;
  const cw = (W * 0.84) / cols;
  const rh = (H * 0.5) / rows;
  const colors = [p.primary, p.accent, "#ffffff"];
  return (
    <Svg p={p}>
      <rect width={W} height={H} fill={p.background} />
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <text key={i} x={gx + i * cw + cw / 2} y={gy - H * 0.02} textAnchor="middle" fontFamily={p.labelFont} fontWeight={700} fontSize={W * 0.04} fill="#ffffff" opacity={0.7}>
          {d}
        </text>
      ))}
      {Array.from({ length: cols * rows }).map((_, i) => {
        const c = i % cols;
        const row = Math.floor(i / cols);
        const filled = r(p.seed, i, 90) > 0.45;
        const t = interpolate(frame, [fps * 0.3 + i * 1.2, fps * 0.3 + i * 1.2 + 8], [0, 1], clamp);
        return (
          <g key={i}>
            <rect x={gx + c * cw + 4} y={gy + row * rh + 4} width={cw - 8} height={rh - 8} rx={10} fill="#ffffff" opacity={0.06} />
            {filled ? <rect x={gx + c * cw + 4} y={gy + row * rh + 4} width={(cw - 8) * t} height={rh - 8} rx={10} fill={colors[Math.floor(r(p.seed, i, 91) * 3)]} opacity={0.85} /> : null}
          </g>
        );
      })}
      <Label p={p} x={W / 2} y={H * 0.85} text={p.labels[0]} delay={fps * 1.5} />
    </Svg>
  );
};

const Sunrise: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame, fps, durationInFrames } = p;
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const sunY = H * (0.78 - 0.3 * t);
  return (
    <Svg p={p}>
      <SkyGradient id="sun-sky" stops={[[0, t > 0.5 ? "#3b82f6" : "#1e1b4b"], [0.6, "#f97316"], [1, "#fde68a"]]} />
      <rect width={W} height={H} fill="url(#sun-sky)" />
      <g opacity={0.35 + 0.3 * t} transform={`rotate(${frame * 0.2} ${W / 2} ${sunY})`}>
        {Array.from({ length: 14 }).map((_, i) => (
          <polygon key={i} points={`${W / 2},${sunY} ${W / 2 + Math.cos((i / 14) * Math.PI * 2) * W},${sunY + Math.sin((i / 14) * Math.PI * 2) * W} ${W / 2 + Math.cos((i / 14 + 0.025) * Math.PI * 2) * W},${sunY + Math.sin((i / 14 + 0.025) * Math.PI * 2) * W}`} fill="#fff7d6" opacity={0.25} />
        ))}
      </g>
      <circle cx={W / 2} cy={sunY} r={W * 0.16} fill="#fff1b8" filter="url(#glow)" />
      <path d={`M0 ${H * 0.8} Q ${W * 0.25} ${H * 0.74} ${W * 0.5} ${H * 0.79} T ${W} ${H * 0.77} V ${H} H0Z`} fill="#3f2a56" />
      <path d={`M0 ${H * 0.86} Q ${W * 0.35} ${H * 0.8} ${W * 0.6} ${H * 0.86} T ${W} ${H * 0.84} V ${H} H0Z`} fill="#24183a" />
      <Label p={p} x={W / 2} y={H * 0.93} text={p.labels[0]} delay={fps} />
    </Svg>
  );
};

const OceanDepths: React.FC<{ p: ArtProps }> = ({ p }) => {
  const { width: W, height: H, frame } = p;
  return (
    <Svg p={p}>
      <SkyGradient id="ocean" stops={[[0, "#38bdf8"], [0.25, "#0369a1"], [0.6, "#0c2a4d"], [1, "#020617"]]} />
      <rect width={W} height={H} fill="url(#ocean)" />
      <g opacity={0.18} filter="url(#blur-md)">
        {Array.from({ length: 7 }).map((_, i) => {
          const x = W * (0.1 + i * 0.14) + Math.sin(frame / 50 + i) * 30;
          return <polygon key={i} points={`${x},0 ${x + W * 0.06},0 ${x + W * 0.2},${H * 0.7} ${x + W * 0.05},${H * 0.7}`} fill="#e0f2fe" />;
        })}
      </g>
      {Array.from({ length: 90 }).map((_, i) => {
        const x = r(p.seed, i, 100) * W + Math.sin(frame / 30 + i) * 10;
        const y = ((r(p.seed, i, 101) * H - frame * (0.3 + r(p.seed, i, 102))) % H + H) % H;
        return <circle key={i} cx={x} cy={y} r={1.5 + r(p.seed, i, 103) * 3} fill="#bae6fd" opacity={0.25 + 0.4 * r(p.seed, i, 104)} />;
      })}
      <Label p={p} x={W / 2} y={H * 0.88} text={p.labels[0]} delay={20} />
    </Svg>
  );
};

export const ART_COMPONENTS: Record<ProceduralArt, React.FC<{ p: ArtProps }>> = {
  "storm-clouds": StormClouds,
  "lightning-bolt": LightningBolt,
  "charge-separation": ChargeSeparation,
  "stepped-leader": SteppedLeader,
  "thunder-wave": ThunderWave,
  starfield: Starfield,
  "earth-two-moons": EarthTwoMoons,
  "two-moons-horizon": TwoMoonsHorizon,
  tides: Tides,
  "orbit-diagram": OrbitDiagram,
  eclipse: Eclipse,
  "aurora-gradient": AuroraGradient,
  "particle-network": ParticleNetwork,
  "wireframe-globe": WireframeGlobe,
  "bar-chart": BarChart,
  "flow-arrows": FlowArrows,
  checklist: Checklist,
  "phone-focus": PhoneFocus,
  "focus-timer": FocusTimer,
  "calendar-blocks": CalendarBlocks,
  sunrise: Sunrise,
  "ocean-depths": OceanDepths,
};
