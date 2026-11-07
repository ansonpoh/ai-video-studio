/**
 * The "drawn" preset's visuals: SVG written by the LLM, with a few data-*
 * attributes that say when each part appears. This module has no DOM or Node
 * dependency, so the renderer, the layout check and the tests share one parser.
 *
 * The SVG is parsed against an allowlist instead of being injected as markup,
 * so model output can't run scripts or load anything from outside the project.
 */

export type SvgNode = { tag: string; attrs: Record<string, string>; children: (SvgNode | string)[] };
export type ParsedSvg = { root?: SvgNode; errors: string[]; dropped: string[] };

const TAGS = new Set(["svg", "g", "defs", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "marker", "use", "pattern", "filter", "feGaussianBlur", "feDropShadow", "feOffset", "feMerge", "feMergeNode", "feFlood", "feComposite", "feBlend", "title"]);

const ATTRS = new Set(
  "id x y x1 y1 x2 y2 cx cy r rx ry fx fy dx dy d points width height transform opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline clip-path clip-rule mask filter marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient viewBox preserveAspectRatio gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity patternUnits patternTransform href in in2 result mode operator stdDeviation flood-color flood-opacity".split(" "),
);

const MOTION_ATTRS = new Set(["data-beat", "data-anim", "data-delay", "data-dur", "data-exit", "data-dim", "data-loop", "data-speed", "data-count", "data-prefix", "data-suffix", "data-decimals", "data-bg"]);

const ANIMS = ["fade", "rise", "pop", "draw", "grow", "growx", "wipe", "words", "count"] as const;
const LOOPS = ["spin", "pulse", "float", "flow"] as const;

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only local references are allowed, so an SVG can't fetch anything. */
const safeValue = (name: string, value: string) => {
  if (name === "href" && !value.startsWith("#")) return false;
  if (/url\(\s*(?!['"]?#)/i.test(value)) return false;
  return !/javascript:|expression\(/i.test(value);
};

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Whitespace matters inside text, so it's only collapsed, never removed between tspans. */
export const parseSvg = (src: string): ParsedSvg => {
  const errors: string[] = [];
  const dropped = new Set<string>();
  const stack: { node: SvgNode; keep: boolean }[] = [];
  let root: SvgNode | undefined;
  const addText = (text: string) => {
    if (text.includes("<")) errors.push(`malformed markup near "${text.slice(text.indexOf("<"), text.indexOf("<") + 40)}"`);
    if (!text.trim()) return;
    const top = stack[stack.length - 1];
    if (top && ["text", "tspan", "title"].includes(top.node.tag)) top.node.children.push(decode(text.replace(/\s+/g, " ")));
    else if (top?.keep) errors.push(`stray text outside <text>: "${text.trim().slice(0, 40)}"`);
  };
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(src); m; m = TOKEN.exec(src)) {
    addText(src.slice(last, m.index));
    last = TOKEN.lastIndex;
    const [, rawClose, rawOpen, rawAttrs, selfClose] = m;
    // <symbol> clips to its own box, which cuts a shape drawn around 0,0 down to one corner. A group draws what the model meant.
    const close = rawClose === "symbol" ? "g" : rawClose;
    const open = rawOpen === "symbol" ? "g" : rawOpen;
    if (close) {
      const top = stack.pop();
      if (!top || top.node.tag !== close) {
        errors.push(`</${close}> doesn't match <${top?.node.tag ?? "nothing"}>`);
        if (top) stack.push(top);
      }
      continue;
    }
    if (!open) continue;
    const parent = stack[stack.length - 1];
    const keep = TAGS.has(open) && (parent?.keep ?? true);
    if (!TAGS.has(open)) dropped.add(`<${open}>`);
    const attrs: Record<string, string> = {};
    ATTR.lastIndex = 0;
    for (let a = ATTR.exec(rawAttrs ?? ""); a; a = ATTR.exec(rawAttrs ?? "")) {
      const name = a[1];
      const value = decode(a[2] ?? a[3] ?? "");
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      if ((ATTRS.has(name) || MOTION_ATTRS.has(name)) && safeValue(name, value)) attrs[name] = value;
      else dropped.add(name);
    }
    const node: SvgNode = { tag: open, attrs, children: [] };
    if (keep) {
      if (parent) parent.node.children.push(node);
      else if (!root) root = node;
      else errors.push("more than one root element");
    }
    if (!selfClose) stack.push({ node, keep });
  }
  addText(src.slice(last));
  if (stack.length) errors.push(`unclosed <${stack[stack.length - 1].node.tag}>`);
  if (!root) errors.push("no <svg> element found");
  else if (root.tag !== "svg") errors.push(`root element is <${root.tag}>, expected <svg>`);
  return { root: errors.length ? undefined : root, errors, dropped: [...dropped] };
};

export const walkSvg = (node: SvgNode, visit: (n: SvgNode) => void) => {
  visit(node);
  for (const c of node.children) if (typeof c !== "string") walkSvg(c, visit);
};

/** Mistakes the layout check can't see, because they're about timing. */
export const motionProblems = (root: SvgNode, beatCount: number): string[] => {
  const out = new Set<string>();
  walkSvg(root, (n) => {
    for (const key of ["data-beat", "data-exit", "data-dim"]) {
      const v = n.attrs[key];
      if (v !== undefined && (!/^\d+$/.test(v) || Number(v) >= beatCount)) out.add(`${key}="${v}" on <${n.tag}> is not a beat (there are ${beatCount}, numbered from 0)`);
    }
    const anim = n.attrs["data-anim"];
    if (anim && !(ANIMS as readonly string[]).includes(anim)) out.add(`unknown data-anim "${anim}"`);
    const loop = n.attrs["data-loop"];
    if (loop && !(LOOPS as readonly string[]).includes(loop)) out.add(`unknown data-loop "${loop}"`);
    if (anim === "count" && !Number.isFinite(Number(n.attrs["data-count"]))) out.add('data-anim="count" needs a numeric data-count');
  });
  return [...out];
};

export const serializeSvg = (node: SvgNode): string => {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  if (!node.children.length) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map((c) => (typeof c === "string" ? escapeXml(c) : serializeSvg(c))).join("")}</${node.tag}>`;
};

/* --------------------------------------------------------------- tokens */

export type DrawnTokens = { bg: string; primary: string; accent: string; text: string; muted: string; panel: string; display: string; body: string };

/** Resolves palette tokens and scopes ids, because two scenes share the page during a crossfade. */
export const resolveValue = (value: string, name: string, scope: string, tokens: DrawnTokens) => {
  let out = value.replace(/var\(--(bg|primary|accent|text|muted|panel|display|body)\)/g, (_, t: keyof DrawnTokens) => tokens[t]);
  if (name === "id") return `${scope}-${out}`;
  if (name === "href") return `#${scope}-${out.slice(1)}`;
  out = out.replace(/url\(\s*['"]?#([^)'"]+)['"]?\s*\)/g, (_, id) => `url(#${scope}-${id})`);
  return out;
};

export const countText = (attrs: Record<string, string>, progress: number) => {
  const decimals = Number(attrs["data-decimals"] ?? 0);
  const value = Number(attrs["data-count"] ?? 0) * progress;
  const shown = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${attrs["data-prefix"] ?? ""}${shown}${attrs["data-suffix"] ?? ""}`;
};

/** The whole picture with everything visible, for the layout check. Timing attributes stay, so it can tell what's on screen together. */
export const finalMarkup = (node: SvgNode, scope: string, tokens: DrawnTokens): string => {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(resolveValue(v, k, scope, tokens))}"`)
    .join("");
  const counted = node.attrs["data-anim"] === "count" && node.attrs["data-count"] !== undefined;
  const inner = counted ? escapeXml(countText(node.attrs, 1)) : node.children.map((c) => (typeof c === "string" ? escapeXml(c) : finalMarkup(c, scope, tokens))).join("");
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
};

/* --------------------------------------------------------------- motion */

export type MotionState = {
  opacity: number;
  transform?: string;
  transformOrigin?: string;
  clipPath?: string;
  /** 0 to 1: how much of the stroke is drawn, for this element and everything inside it. */
  draw?: number;
  /** 0 to 1: how many words have appeared. */
  words?: number;
  /** 0 to 1: how far a number has counted up. */
  count?: number;
  /** Stroke offset for a flowing dashed line. */
  flow?: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const backOut = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const DEFAULT_DUR: Record<string, number> = { draw: 0.9, count: 1.1, words: 0.9, wipe: 0.7, grow: 0.7, growx: 0.7 };

export const hasMotion = (a: Record<string, string>) => Boolean(a["data-beat"] ?? a["data-anim"] ?? a["data-exit"] ?? a["data-dim"] ?? a["data-loop"]);

/** What an element looks like on a frame. Pure, so a render is the same every time. */
export const motionAt = (a: Record<string, string>, frame: number, fps: number, beats: number[]): MotionState => {
  const state: MotionState = { opacity: 1 };
  const beat = a["data-beat"] !== undefined ? (beats[Number(a["data-beat"])] ?? 0) : null;
  const anim = a["data-anim"] ?? (beat !== null ? "fade" : undefined);
  const transforms: string[] = [];
  if (anim) {
    const start = (beat ?? 0) + Number(a["data-delay"] ?? 0) * fps;
    const dur = Math.max(0.05, Number(a["data-dur"] ?? DEFAULT_DUR[anim] ?? 0.5)) * fps;
    const raw = clamp01((frame - start) / dur);
    const p = easeOut(raw);
    switch (anim) {
      case "rise":
        state.opacity = p;
        transforms.push(`translateY(${(1 - p) * 26}px)`);
        break;
      case "pop":
        state.opacity = clamp01(raw * 3);
        transforms.push(`scale(${0.7 + 0.3 * backOut(raw)})`);
        break;
      case "draw":
        state.draw = p;
        break;
      case "grow":
        state.opacity = raw > 0 ? 1 : 0;
        state.transformOrigin = "50% 100%";
        transforms.push(`scaleY(${p})`);
        break;
      case "growx":
        state.opacity = raw > 0 ? 1 : 0;
        state.transformOrigin = "0% 50%";
        transforms.push(`scaleX(${p})`);
        break;
      case "wipe":
        state.opacity = raw > 0 ? 1 : 0;
        state.clipPath = `inset(-10% ${(1 - p) * 110 - 5}% -10% -5%)`;
        break;
      case "words":
        state.words = raw;
        break;
      case "count":
        state.opacity = clamp01(raw * 4);
        state.count = p;
        break;
      default:
        state.opacity = p;
    }
  }
  const fadeAfter = (at: string | undefined, to: number) => {
    if (at === undefined) return;
    const f = beats[Number(at)];
    if (f === undefined) return;
    state.opacity *= 1 - (1 - to) * clamp01((frame - f) / (0.35 * fps));
  };
  fadeAfter(a["data-dim"], 0.3);
  fadeAfter(a["data-exit"], 0);
  const seconds = frame / fps;
  const speed = Number(a["data-speed"] ?? 1);
  switch (a["data-loop"]) {
    case "spin":
      transforms.push(`rotate(${seconds * 30 * speed}deg)`);
      break;
    case "pulse":
      transforms.push(`scale(${1 + 0.04 * Math.sin(seconds * 2.4 * speed)})`);
      break;
    case "float":
      transforms.push(`translateY(${8 * Math.sin(seconds * 1.4 * speed)}px)`);
      break;
    case "flow":
      state.flow = -seconds * 40 * speed;
      break;
  }
  if (transforms.length) state.transform = transforms.join(" ");
  return state;
};

/** Where content has to stay so captions and the chapter bar can't cover it. */
export const drawnSafeArea = (width: number, height: number) => {
  return { left: Math.round(width * 0.04), right: Math.round(width * 0.96), top: Math.round(height * 0.05), bottom: Math.round(height * 0.82) };
};
