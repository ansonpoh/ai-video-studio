import type { Caption } from "@remotion/captions";

export type Word = { text: string; startMs: number; endMs: number };

/** ElevenLabs character alignment -> word timings (ms). */
export const alignmentToWords = (alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] => {
  const words: Word[] = [];
  let cur: Word | null = null;
  alignment.characters.forEach((ch, i) => {
    const start = Math.round(alignment.character_start_times_seconds[i] * 1000);
    const end = Math.round(alignment.character_end_times_seconds[i] * 1000);
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: ch, startMs: start, endMs: end };
    else {
      cur.text += ch;
      cur.endMs = end;
    }
  });
  if (cur) words.push(cur);
  return words;
};

/**
 * Evenly distributes words over a duration, weighting by word length and
 * adding pauses after punctuation. Only used when real alignment is not
 * available, and always labelled `timing: "estimated"`.
 */
export const estimateWordTimings = (text: string, durationMs: number): Word[] => {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => Math.max(2, t.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.!?;:,—]$/.test(t) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return tokens.map((t, i) => {
    const span = (weights[i] / total) * durationMs;
    const pause = /[.!?;:,—]$/.test(t) ? Math.min(span * 0.35, 220) : 0;
    const w = { text: t, startMs: Math.round(cursor), endMs: Math.round(cursor + span - pause) };
    cursor += span;
    return w;
  });
};

export const wordsToCaptions = (words: Word[], offsetMs = 0): Caption[] =>
  words.map((w, i) => ({
    text: i === 0 ? w.text : ` ${w.text}`,
    startMs: Math.round(w.startMs + offsetMs),
    endMs: Math.round(w.endMs + offsetMs),
    timestampMs: Math.round((w.startMs + w.endMs) / 2 + offsetMs),
    confidence: null,
  }));

const pad = (n: number, l = 2) => String(n).padStart(l, "0");
export const msToSrtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t % 1000, 3)}`;
};

/** Groups global word timings into readable subtitle cues (<= maxChars, <= maxMs, breaks at sentence ends). */
export const buildCues = (words: Word[], maxChars = 42, maxMs = 3200) => {
  const cues: { startMs: number; endMs: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, text: cur.map((w) => w.text).join(" ") });
    cur = [];
  };
  for (const w of words) {
    const text = [...cur.map((c) => c.text), w.text].join(" ");
    if (cur.length && (text.length > maxChars || w.endMs - cur[0].startMs > maxMs)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  // avoid overlaps and give each cue a minimum on-screen time
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    cues[i].endMs = Math.max(cues[i].endMs, cues[i].startMs + 700);
    if (next && cues[i].endMs > next.startMs - 20) cues[i].endMs = next.startMs - 20;
  }
  return cues;
};

export const toSrt = (cues: { startMs: number; endMs: number; text: string }[]) =>
  cues.map((c, i) => `${i + 1}\n${msToSrtTime(c.startMs)} --> ${msToSrtTime(c.endMs)}\n${c.text}\n`).join("\n");

export const parseSrt = (srt: string) =>
  srt
    .replace(/\r/g, "")
    .split(/\n\n+/)
    .map((block) => block.trim().split("\n"))
    .filter((lines) => lines.length >= 3)
    .map((lines) => {
      const [a, b] = lines[1].split("-->").map((s) => s.trim());
      const toMs = (s: string) => {
        const m = s.match(/(\d+):(\d+):(\d+),(\d+)/);
        if (!m) return 0;
        return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
      };
      return { startMs: toMs(a), endMs: toMs(b), text: lines.slice(2).join(" ") };
    });

/**
 * Re-applies user-edited caption text to existing word timings. If the word
 * count is unchanged, timings stay word-accurate; otherwise the new words are
 * spread across the original span.
 */
export const retextWords = (words: Word[], newText: string): Word[] => {
  const tokens = newText.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (tokens.length === words.length) return words.map((w, i) => ({ ...w, text: tokens[i] }));
  const start = words[0].startMs;
  const end = words[words.length - 1].endMs;
  return estimateWordTimings(newText, end - start).map((w) => ({ ...w, startMs: w.startMs + start, endMs: w.endMs + start }));
};
