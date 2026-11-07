/**
 * Turns "reveal this item when the narrator says X" into frame numbers, using
 * the narration's word timings. Pure and deterministic, like the timeline.
 */
import type { Word } from "../captions";

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

/** Index of the first word of `cue` at or after `from`, or -1. */
const findCue = (words: string[], cue: string[], from: number) => {
  for (let i = from; i + cue.length <= words.length; i++) {
    if (cue.every((c, k) => words[i + k] === c)) return i;
  }
  return -1;
};

/**
 * One frame per item, relative to the scene start and never decreasing. Cues
 * are searched in order, so a repeated word can't reveal an item too early.
 * An item whose cue isn't found is spaced evenly through what remains.
 */
export const resolveReveals = (cues: (string | undefined)[], words: Word[], narrationOffsetFrames: number, narrationFrames: number, fps: number): number[] => {
  const spoken = words.map((w) => tokens(w.text).join(""));
  const found: (number | null)[] = [];
  let cursor = 0;
  for (const cue of cues) {
    const wanted = tokens(cue ?? "");
    const at = wanted.length ? findCue(spoken, wanted, cursor) : -1;
    if (at < 0) {
      found.push(null);
      continue;
    }
    cursor = at + wanted.length;
    found.push(narrationOffsetFrames + Math.round((words[at].startMs / 1000) * fps));
  }
  const end = narrationOffsetFrames + narrationFrames;
  const out: number[] = [];
  found.forEach((frame, i) => {
    const prev = i ? out[i - 1] : narrationOffsetFrames;
    if (frame !== null) {
      out.push(Math.max(prev, Math.min(end, frame)));
      return;
    }
    if (i === 0) {
      out.push(narrationOffsetFrames);
      return;
    }
    // Share the time up to the next known cue, or to the end, evenly among the items still to place.
    const next = found.slice(i + 1).findIndex((f) => f !== null);
    const until = next >= 0 ? (found[i + 1 + next] as number) : end;
    const shares = (next >= 0 ? next : cues.length - i - 1) + 2;
    out.push(Math.round(prev + Math.max(0, until - prev) / shares));
  });
  return out;
};

export type ChapterMark = { label: string; start: number };

/** Chapter start frames; a scene with no chapter continues the one before it. */
export const chapterMarks = (scenes: { chapter?: string }[], starts: number[]): ChapterMark[] => {
  const marks: ChapterMark[] = [];
  scenes.forEach((s, i) => {
    const label = s.chapter?.trim();
    if (label && marks[marks.length - 1]?.label !== label) marks.push({ label, start: i === 0 && !marks.length ? 0 : starts[i] });
  });
  if (marks.length) marks[0].start = 0;
  return marks;
};
