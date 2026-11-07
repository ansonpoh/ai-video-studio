/**
 * Automatic layout check for drawn scenes. SVG text doesn't wrap and nothing
 * stops shapes colliding, so the model's drawings are measured in real Chrome,
 * with the real fonts, and every problem comes back as a sentence the model can
 * act on. Runs before narration, so a bad drawing costs one fix, not a re-render.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openBrowser } from "@remotion/renderer";
import { drawnSafeArea, finalMarkup, parseSvg, type DrawnTokens } from "../video/scenes/drawn-svg";

export type LayoutSeverity = "error" | "warn";
export type LayoutIssue = { kind: string; severity: LayoutSeverity; detail: string };
export type DrawnLayoutInput = { id: string; svg: string };
export type DrawnLayoutReport = Record<string, LayoutIssue[]>;
export type DrawnLayoutOpts = { width: number; height: number; tokens: DrawnTokens };

const FONT_FILES: [RegExp, string, string, string][] = [
  [/Inter/, "Inter", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "100 900"],
  [/Playfair/, "Playfair Display", "@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2", "400 900"],
  [/Anton/, "Anton", "@fontsource/anton/files/anton-latin-400-normal.woff2", "400"],
  [/Bebas/, "Bebas Neue", "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2", "400"],
  [/Space Grotesk/, "Space Grotesk", "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2", "300 700"],
  [/Montserrat/, "Montserrat", "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2", "100 900"],
  [/Fraunces/, "Fraunces", "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", "100 900"],
];

const fontFaces = (tokens: DrawnTokens) =>
  FONT_FILES.filter(([re]) => re.test(tokens.display) || re.test(tokens.body))
    .map(([, family, file, weight]) => {
      const data = fs.readFileSync(path.join(process.cwd(), "node_modules", file)).toString("base64");
      return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');}`;
    })
    .join("\n");

/** Runs inside Chrome, so it's plain JavaScript in a string rather than compiled code. */
const MEASURE = String.raw`
const OUT = {};
const CFG = window.__CFG;
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (s) => { const m = /^rgba?\(([^)]+)\)/.exec(s || ""); if (!m) return null; const p = m[1].split(/[ ,\/]+/).map(Number); return { c: p.slice(0, 3), a: p[3] === undefined ? 1 : p[3] }; };
const blend = (top, a, under) => top.map((v, i) => v * a + under[i] * (1 - a));
const short = (s) => { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > 38 ? s.slice(0, 36) + "…" : s; };
const overlap = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; };
const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
const round = (r) => Math.round(r.left) + "," + Math.round(r.top) + " to " + Math.round(r.right) + "," + Math.round(r.bottom);
const HIDDEN = "defs,clipPath,mask,marker,symbol,pattern,filter,linearGradient,radialGradient";
const DRAWABLE = "text,rect,circle,ellipse,line,polyline,polygon,path,use";

const run = () => {
  for (const svg of document.querySelectorAll("svg[data-scene]")) {
    const id = svg.getAttribute("data-scene");
    const issues = [];
    const add = (kind, severity, detail) => { if (!issues.some((i) => i.detail === detail)) issues.push({ kind, severity, detail }); };
    const S = CFG.width / (CFG.height > CFG.width ? 1080 : 1920);
    const safe = CFG.safe;
    const box = svg.getBoundingClientRect();
    const items = [...svg.querySelectorAll(DRAWABLE)].filter((el) => !el.closest(HIDDEN) && el.tagName !== "tspan").map((el, order) => {
      const r = el.getBoundingClientRect();
      const rect = { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
      let start = 0, end = Infinity, bg = false;
      for (let a = el; a && a !== svg; a = a.parentElement) {
        if (a.hasAttribute("data-beat")) start = Math.max(start, Number(a.getAttribute("data-beat")));
        if (a.hasAttribute("data-exit")) end = Math.min(end, Number(a.getAttribute("data-exit")));
        if (a.hasAttribute("data-bg")) bg = true;
      }
      const cs = getComputedStyle(el);
      const tag = el.tagName;
      const canvasArea = CFG.width * CFG.height;
      if (tag !== "text" && area(rect) > canvasArea * 0.8) bg = true;
      return { el, tag, rect, start, end, bg, order, cs, text: tag === "text" ? el.textContent : "" };
    });
    const together = (a, b) => a.start < b.end && b.start < a.end;
    const texts = items.filter((i) => i.tag === "text" && i.text.trim());
    const fg = items.filter((i) => !i.bg);
    const containerKinds = new Set(["rect", "circle", "ellipse"]);
    const hasPaint = (i) => { const f = rgb(i.cs.fill); return i.cs.fill.startsWith("url") || (f && f.a > 0 && Number(i.cs.fillOpacity) > 0) || (i.cs.stroke !== "none" && Number(i.cs.strokeWidth.replace("px", "")) > 0); };

    if (fg.length < 3) add("too empty", "error", "the drawing has fewer than 3 visible elements");
    if (!fg.some((i) => i.start === 0)) add("empty start", "error", "nothing is on screen until the first beat fires; put at least the heading or the main shape on screen from the start");
    if (fg.length) {
      const u = { left: Math.min(...fg.map((i) => i.rect.left)), top: Math.min(...fg.map((i) => i.rect.top)), right: Math.max(...fg.map((i) => i.rect.right)), bottom: Math.max(...fg.map((i) => i.rect.bottom)) };
      const used = area(u) / ((safe.right - safe.left) * (safe.bottom - safe.top));
      if (used < 0.25) add("too empty", "warn", "content only fills " + Math.round(used * 100) + "% of the safe area, so the frame looks empty; make the main subject larger");
    }

    for (const i of fg) {
      const name = i.tag === "text" ? 'text "' + short(i.text) + '"' : "<" + i.tag + ">";
      const r = i.rect;
      if (r.left < -2 || r.top < -2 || r.right > CFG.width + 2 || r.bottom > CFG.height + 2) add("off canvas", "error", name + " runs off the canvas (" + round(r) + "). Canvas is " + CFG.width + "x" + CFG.height + ". Mark full-bleed background art with data-bg=\"1\"");
      else if (r.bottom > safe.bottom + 2) add("caption zone", "error", name + " reaches y=" + Math.round(r.bottom) + ", into the caption zone; everything except data-bg art must stay above y=" + safe.bottom);
      else if (i.tag === "text" && (r.left < safe.left - 2 || r.right > safe.right + 2 || r.top < safe.top - 2)) add("text margin", "error", name + " is outside the safe margins (" + round(r) + "); keep text within x " + safe.left + " to " + safe.right + " and below y=" + safe.top);
    }

    for (const t of texts) {
      const size = parseFloat(t.cs.fontSize) || 0;
      const ctm = t.el.getScreenCTM();
      const shown = size * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
      if (shown < 26 * S) add("small text", "error", 'text "' + short(t.text) + '" is ' + Math.round(shown) + "px; the minimum is " + Math.round(26 * S) + "px");
      const w = t.rect.right - t.rect.left, h = t.rect.bottom - t.rect.top, cy = (t.rect.top + t.rect.bottom) / 2;
      // The tightest shape under the text's start, middle or end is what it sits on. Probing all three finds a long label whose middle has already left its box.
      const probes = [t.rect.left + w * 0.05, t.rect.left + w * 0.5, t.rect.right - w * 0.05];
      const holders = items.filter((c) => c !== t && containerKinds.has(c.tag) && hasPaint(c) && together(c, t) && c.order < t.order && c.rect.top <= cy && c.rect.bottom >= cy && c.rect.bottom - c.rect.top >= h * 0.8 && probes.some((x) => c.rect.left <= x && c.rect.right >= x)).sort((a, b) => area(a.rect) - area(b.rect));
      t.holders = holders.filter((c) => c.rect.left <= t.rect.left + 3 && c.rect.right >= t.rect.right - 3);
      const holder = holders[0];
      if (holder && !holder.bg) {
        const over = Math.max(holder.rect.left - t.rect.left, t.rect.right - holder.rect.right);
        if (over > 3) add("text overflow", "error", 'text "' + short(t.text) + '" sticks out of its <' + holder.tag + "> by " + Math.round(over) + "px (text " + round(t.rect) + ", shape " + round(holder.rect) + "); shorten it, split it onto two lines with tspans, or widen the shape");
      }
      // Contrast against whatever the text sits on, blending see-through panels over the shapes below them.
      const fill = rgb(t.cs.fill);
      if (fill && fill.a > 0) {
        let under = rgb(CFG.background).c;
        let unknown = false;
        for (const c of [...holders].reverse()) {
          if (c.cs.fill.startsWith("url")) { unknown = true; continue; }
          const p = rgb(c.cs.fill);
          if (p && p.a > 0) under = blend(p.c, p.a * Number(c.cs.fillOpacity) * Number(c.cs.opacity), under);
        }
        const ratio = contrast(fill.c, under);
        if (!unknown && ratio < 3) add("contrast", "error", 'text "' + short(t.text) + '" has contrast ' + ratio.toFixed(1) + ":1 against what is behind it; it needs at least 3:1");
      }
    }

    for (let a = 0; a < texts.length; a++) {
      for (let b = a + 1; b < texts.length; b++) {
        if (!together(texts[a], texts[b])) continue;
        const ra = texts[a].rect, rb = texts[b].rect;
        const shrink = (r) => { const h = (r.bottom - r.top) * 0.18; return { left: r.left, right: r.right, top: r.top + h, bottom: r.bottom - h }; };
        const o = overlap(shrink(ra), shrink(rb));
        if (o > 0.08 * Math.min(area(shrink(ra)), area(shrink(rb)))) add("text collision", "error", 'text "' + short(texts[a].text) + '" overlaps "' + short(texts[b].text) + '" (' + round(ra) + " and " + round(rb) + ")");
      }
    }

    for (const t of texts) {
      const tight = { left: t.rect.left, right: t.rect.right, top: t.rect.top + (t.rect.bottom - t.rect.top) * 0.18, bottom: t.rect.bottom - (t.rect.bottom - t.rect.top) * 0.18 };
      for (const s of fg) {
        if (s === t || !together(s, t)) continue;
        const stroked = s.tag === "line" || (["polyline", "path"].includes(s.tag) && (s.cs.fill === "none" || (rgb(s.cs.fill) || { a: 1 }).a === 0));
        // A line that passes behind the label's own filled backing doesn't touch the text.
        const backed = t.holders.some((h) => h.order > s.order && !h.bg);
        if (stroked && !backed && s.cs.stroke !== "none" && typeof s.el.getTotalLength === "function") {
          let hits = 0;
          const ctm = s.el.getScreenCTM();
          const len = s.el.getTotalLength();
          for (let k = 0; k <= 80; k++) {
            const p = s.el.getPointAtLength((len * k) / 80);
            const x = ctm.a * p.x + ctm.c * p.y + ctm.e - box.left;
            const y = ctm.b * p.x + ctm.d * p.y + ctm.f - box.top;
            if (x >= tight.left && x <= tight.right && y >= tight.top && y <= tight.bottom) hits++;
          }
          if (hits >= 2) add("line through text", "error", "a <" + s.tag + '> line runs through text "' + short(t.text) + '"; route it around the text or move the text');
        }
        if (containerKinds.has(s.tag) && s.order > t.order && s.cs.fill !== "none" && Number(s.cs.fillOpacity) * Number(s.cs.opacity) > 0.6 && overlap(tight, s.rect) > 0.3 * area(tight)) add("covered text", "error", 'a <' + s.tag + '> drawn later covers text "' + short(t.text) + '"; put the text after the shape');
      }
    }
    OUT[id] = issues;
  }
  document.getElementById("result").textContent = btoa(unescape(encodeURIComponent(JSON.stringify(OUT))));
};
document.fonts.ready.then(() => Promise.all(CFG.families.map((f) => document.fonts.load("700 40px '" + f + "'")))).then(run, run);
`;

const pageFor = (scenes: DrawnLayoutInput[], opts: DrawnLayoutOpts) => {
  const { width, height, tokens } = opts;
  const bodies: string[] = [];
  const preCheck: DrawnLayoutReport = {};
  for (const s of scenes) {
    const parsed = parseSvg(s.svg);
    if (!parsed.root) {
      preCheck[s.id] = parsed.errors.map((e) => ({ kind: "invalid svg", severity: "error", detail: e }));
      continue;
    }
    const inner = parsed.root.children.map((c) => (typeof c === "string" ? "" : finalMarkup(c, s.id, tokens))).join("");
    bodies.push(`<svg xmlns="http://www.w3.org/2000/svg" data-scene="${s.id}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block;overflow:visible">${inner}</svg>`);
  }
  const families = FONT_FILES.filter(([re]) => re.test(tokens.display) || re.test(tokens.body)).map(([, family]) => family);
  const cfg = { width, height, safe: drawnSafeArea(width, height), background: hexToRgb(tokens.bg), families };
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces(tokens)}
html,body{margin:0;background:${tokens.bg}}</style></head><body>${bodies.join("\n")}<pre id="result"></pre><script>window.__CFG=${JSON.stringify(cfg)};${MEASURE}</script></body></html>`;
  return { html, preCheck };
};

const hexToRgb = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : "rgb(0, 0, 0)";
};

/** Measures every drawing in one headless Chrome page. */
export const checkDrawnLayouts = async (scenes: DrawnLayoutInput[], opts: DrawnLayoutOpts): Promise<DrawnLayoutReport> => {
  const { html, preCheck } = pageFor(scenes, opts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drawn-layout-"));
  const file = path.join(dir, "check.html");
  // Chrome Headless Shell's --dump-dom never exits on Windows, so this drives a page the way a render does.
  const browser = await openBrowser("chrome", { browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null, logLevel: "error" });
  try {
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ context: () => null, logLevel: "error", indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => undefined });
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    await page.goto({ url: pathToFileURL(file).href, timeout: 60_000 });
    for (let waited = 0; waited < 60_000; waited += 100) {
      const result = await page.evaluate(() => document.getElementById("result")?.textContent ?? "");
      if (result) return { ...JSON.parse(Buffer.from(result, "base64").toString("utf8")), ...preCheck };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("The layout check page didn't produce a result");
  } finally {
    await browser.close({ silent: true }).catch(() => undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
