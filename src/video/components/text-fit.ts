/**
 * Deterministic text fitting. Uses per-font average glyph widths instead of DOM
 * measurement so results are identical in Studio, in renders and in Node tests
 * (the quality checker uses the same function to flag overflow).
 */
const WIDTH_FACTORS: [RegExp, number][] = [
  [/anton|bebas/i, 0.47],
  [/playfair|fraunces/i, 0.55],
  [/space grotesk/i, 0.58],
  [/montserrat/i, 0.62],
  [/inter/i, 0.57],
];

export const glyphFactor = (fontFamily: string | undefined) => {
  const f = fontFamily ?? "";
  for (const [re, factor] of WIDTH_FACTORS) if (re.test(f)) return factor;
  return 0.58;
};

export const wrapLines = (text: string, fontSize: number, boxWidth: number, fontFamily?: string, uppercase = false) => {
  const factor = glyphFactor(fontFamily) * (uppercase ? 1.12 : 1);
  const maxChars = Math.max(4, Math.floor(boxWidth / (fontSize * factor)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const longestWord = Math.max(0, ...words.map((w) => w.length));
  return { lines, maxChars, wordTooLong: longestWord > maxChars };
};

/** Largest font size <= requested that keeps the text within maxLines and the box width. */
export const fitFontSize = (text: string, requested: number, boxWidth: number, maxLines: number, fontFamily?: string, uppercase = false, minSize = 24) => {
  let size = requested;
  for (let i = 0; i < 40 && size > minSize; i++) {
    const { lines, wordTooLong } = wrapLines(text, size, boxWidth, fontFamily, uppercase);
    if (lines.length <= maxLines && !wordTooLong) return size;
    size = Math.floor(size * 0.94);
  }
  return Math.max(minSize, size);
};
