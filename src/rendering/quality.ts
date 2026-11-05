/**
 * Post-render quality checks: container metadata, duration, audio, scenes,
 * missing media, blank frames, text overflow risk, caption safe zones and
 * transition continuity. Also writes a contact sheet of sampled frames.
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, ffprobeJson, run } from "../media/ffmpeg";
import { readCaptions, readSceneSpans, listElements, attrString, attrNumber } from "../editable/ast";
import { P, store } from "../pipeline/store";
import { fitFontSize, wrapLines } from "../video/components/text-fit";

export type Check = { name: string; ok: boolean; severity: "error" | "warn"; detail: string };
export type QualityReport = { file: string; ok: boolean; checks: Check[]; frames: string[]; contactSheet?: string; at: string };

const parseRate = (r?: string) => {
  if (!r) return 0;
  const [a, b] = r.split("/").map(Number);
  return b ? a / b : a;
};

/** Luma statistics for sampled frames via ffmpeg signalstats. */
const frameStats = async (file: string, times: number[]) => {
  const out: { t: number; yavg: number; ymin: number; ymax: number }[] = [];
  for (const t of times) {
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", "signalstats,metadata=print", "-f", "null", "-"]);
    const g = (k: string) => Number(stderr.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`))?.[1] ?? NaN);
    out.push({ t, yavg: g("YAVG"), ymin: g("YLOW"), ymax: g("YHIGH") });
  }
  return out;
};

export const checkRender = async (id: string, file: string, opts: { expectCaptions: boolean; scale?: number } = { expectCaptions: true }): Promise<QualityReport> => {
  const meta = store.metadata(id);
  const p = P(id);
  const src = fs.readFileSync(p.editable, "utf8");
  const { spans, totalFrames } = readSceneSpans(src, meta.fps);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, severity: "error" | "warn" = "error") => checks.push({ name, ok, severity, detail });

  const probe = await ffprobeJson(file);
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  const scale = opts.scale ?? 1;
  const ew = Math.round(meta.width * scale);
  const eh = Math.round(meta.height * scale);
  add("resolution", v?.width === ew && v?.height === eh, `${v?.width}x${v?.height} (expected ${ew}x${eh})`);
  add("aspect ratio", Boolean(v?.width && v?.height && Math.abs(v.width / v.height - meta.width / meta.height) < 0.01), `${(v!.width! / v!.height!).toFixed(3)}`);
  const fps = parseRate(v?.avg_frame_rate ?? v?.r_frame_rate);
  add("frame rate", Math.abs(fps - meta.fps) < 0.05, `${fps.toFixed(2)} fps (expected ${meta.fps})`);
  const duration = Number(probe.format.duration ?? 0);
  const expected = totalFrames / meta.fps;
  add("duration", Math.abs(duration - expected) < 0.25, `${duration.toFixed(2)}s (composition ${expected.toFixed(2)}s, target ${meta.request.durationSeconds}s)`);
  if (Math.abs(expected - meta.request.durationSeconds) > meta.request.durationSeconds * 0.2)
    add("target duration", false, `Composition is ${expected.toFixed(1)}s vs target ${meta.request.durationSeconds}s`, "warn");

  const assets = store.assets(id);
  const hasNarration = assets.narration.some((n) => n.file);
  add("audio track", Boolean(a) || (!hasNarration && !assets.music), a ? `${a.codec_name} ${a.sample_rate}Hz` : "no audio stream");
  if (a && v) {
    const ad = Number(a.duration ?? duration);
    add("audio/video sync", Math.abs(ad - duration) < 0.3, `audio ${ad.toFixed(2)}s vs video ${duration.toFixed(2)}s`);
  }

  const sb = store.storyboard(id);
  const missing = sb.scenes.filter((s) => !spans.find((sp) => sp.sceneId === s.id));
  add("scenes present", missing.length === 0, missing.length ? `missing: ${missing.map((m) => m.id).join(", ")}` : `${spans.length} scenes`, missing.length ? "warn" : "error");

  const missingMedia: string[] = [];
  for (const el of listElements(src)) {
    if (!el.attrs.has("src")) continue;
    const m = src.slice(el.attrs.get("src")!.start, el.attrs.get("src")!.end).match(/staticFile\("([^"]+)"\)/);
    if (m && !fs.existsSync(path.join(p.dir, "..", m[1]))) missingMedia.push(`${el.name}: ${m[1]}`);
  }
  add("media files", missingMedia.length === 0, missingMedia.length ? missingMedia.join("; ") : "all referenced media exist");

  // transition continuity: no transition longer than an adjacent scene
  const badT = spans.filter((s, i) => s.transitionInFrames > Math.min(s.durationInFrames, spans[i - 1]?.durationInFrames ?? Infinity));
  add("transition continuity", badT.length === 0, badT.length ? `too-long transitions into ${badT.map((b) => b.sceneId).join(", ")}` : "ok");

  // text overflow risk
  const overflow: string[] = [];
  for (const el of listElements(src)) {
    if (el.tag !== "TextLayer" || !el.name) continue;
    const text = src.slice(el.node.getStart(), el.node.getEnd()).replace(/^[\s\S]*?>/, "").replace(/<\/TextLayer>$/, "").replace(/\*/g, "");
    const box = attrNumber(el, "boxWidth", meta.fps) ?? meta.width * 0.86;
    const fsMatch = src.slice(el.start, el.end).match(/fontSize:\s*(\d+)/);
    const ffMatch = src.slice(el.start, el.end).match(/fontFamily:\s*"([^"]+)"/);
    const size = fitFontSize(text, Number(fsMatch?.[1] ?? 80), box, Number(attrNumber(el, "maxLines", meta.fps) ?? 3), ffMatch?.[1]);
    if (wrapLines(text, size, box, ffMatch?.[1]).wordTooLong) overflow.push(`${el.name}`);
  }
  add("text overflow", overflow.length === 0, overflow.length ? `long words may overflow: ${overflow.join(", ")}` : "text fits its boxes", "warn");

  // captions within safe zone (lifted above the bottom ~12% UI area)
  const caps = readCaptions(src);
  if (opts.expectCaptions && meta.request.captions) {
    add("captions present", caps.size > 0 || !assets.narration.length, `${caps.size} caption tracks`);
    const unsafe: string[] = [];
    for (const el of listElements(src)) {
      if (el.tag !== "CaptionLayer") continue;
      const tr = src.slice(el.start, el.end).match(/translate:\s*"(-?\d+)px\s+(-?\d+)px"/);
      const lift = tr ? -Number(tr[2]) : 0;
      if (lift < meta.height * 0.1) unsafe.push(el.name ?? "?");
    }
    add("caption safe zone", unsafe.length === 0, unsafe.length ? `captions too low: ${unsafe.join(", ")}` : "captions sit above platform UI", "warn");
  }

  // blank frame detection at each scene midpoint
  const times = spans.map((s) => (s.startFrame + s.durationInFrames / 2) / meta.fps).filter((t) => t < duration - 0.05);
  const stats = await frameStats(file, times);
  const blank = stats.filter((s) => Number.isFinite(s.ymax) && s.ymax - s.ymin < 6);
  add("blank frames", blank.length === 0, blank.length ? `flat frames at ${blank.map((b) => b.t.toFixed(1) + "s").join(", ")}` : `${stats.length} scene midpoints have visible content`);

  // contact sheet for human inspection
  const framesDir = path.join(p.outputDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  const frames: string[] = [];
  for (const [i, t] of times.entries()) {
    const out = path.join(framesDir, `scene-${String(i + 1).padStart(2, "0")}.jpg`);
    await ffmpeg(["-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", out]);
    frames.push(out);
  }
  let contactSheet: string | undefined;
  if (frames.length) {
    contactSheet = path.join(p.outputDir, "contact-sheet.jpg");
    const cols = Math.min(frames.length, 4);
    const rows = Math.ceil(frames.length / cols);
    await ffmpeg([...frames.flatMap((f) => ["-i", f]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${(i % cols) === 0 ? "0" : Array.from({ length: i % cols }, () => "w0").join("+")}_${Math.floor(i / cols) === 0 ? "0" : Array.from({ length: Math.floor(i / cols) }, () => "h0").join("+")}`).join("|")}:fill=black`, "-frames:v", "1", contactSheet]).catch(() => {
      contactSheet = undefined;
    });
    void rows;
  }

  const report: QualityReport = { file, ok: checks.every((c) => c.ok || c.severity === "warn"), checks, frames, contactSheet, at: new Date().toISOString() };
  fs.writeFileSync(path.join(p.outputDir, "quality.json"), JSON.stringify(report, null, 2));
  void attrString;
  return report;
};
