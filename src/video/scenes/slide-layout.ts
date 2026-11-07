/**
 * Pure geometry for explainer slides, shared by the code generator and the
 * renderer so both agree on where a slide's media sits.
 */

export type SlideKind = "statement" | "cards" | "steps" | "diagram" | "media";

/**
 * - none: no media on this slide.
 * - backdrop: a dimmed still behind the content.
 * - side: a still floating beside the content.
 * - frame: a screen recording or image inside a browser window.
 */
export type SlideMediaMode = "none" | "backdrop" | "side" | "frame";

export const slideMediaMode = (kind: SlideKind, media: "none" | "generated" | "uploaded"): SlideMediaMode => {
  if (kind === "media" || media === "uploaded") return "frame";
  if (media === "none") return "none";
  return kind === "cards" || kind === "diagram" ? "backdrop" : "side";
};

/** Media position as fractions of the frame: "x y width height". Empty means full frame. */
export const slideMediaBox = (mode: SlideMediaMode, hasItems: boolean, portrait: boolean): string => {
  if (mode === "side") return portrait ? "0 0.04 1 0.4" : "0.46 0 0.54 0.94";
  if (mode === "frame") {
    if (portrait) return "0.05 0.2 0.9 0.34";
    return hasItems ? "0.42 0.2 0.52 0.66" : "0.1 0.2 0.8 0.66";
  }
  return "";
};

export type DiagramEdge = { from: number; to: number };
export type DiagramNode = { column: number; row: number; rowsInColumn: number };

/**
 * Left-to-right layers: a node sits one column after its furthest upstream
 * node. Cycles and bad indexes are tolerated. With no edges, nodes wrap into
 * rows of at most four.
 */
export const layoutDiagram = (count: number, edges: DiagramEdge[]): { columns: number; nodes: DiagramNode[] } => {
  if (count <= 0) return { columns: 0, nodes: [] };
  const valid = edges.filter((e) => e.from !== e.to && e.from >= 0 && e.to >= 0 && e.from < count && e.to < count);
  let columnOf = new Array<number>(count).fill(0);
  if (!valid.length) {
    const perRow = Math.min(4, Math.ceil(Math.sqrt(count)) + (count > 2 ? 1 : 0));
    const rows = Math.ceil(count / perRow);
    columnOf = columnOf.map((_, i) => i % perRow);
    const nodes = columnOf.map((column, i) => ({ column, row: Math.floor(i / perRow), rowsInColumn: rows }));
    return { columns: Math.min(perRow, count), nodes };
  }
  // Relaxing `count` times settles any acyclic graph; the cap stops cycles growing forever.
  for (let pass = 0; pass < count; pass++) {
    for (const e of valid) columnOf[e.to] = Math.min(count - 1, Math.max(columnOf[e.to], columnOf[e.from] + 1));
  }
  const seen = new Map<number, number>();
  const rowOf = columnOf.map((c) => {
    const row = seen.get(c) ?? 0;
    seen.set(c, row + 1);
    return row;
  });
  // Remove empty columns that cycles can leave behind.
  const used = [...seen.keys()].sort((a, b) => a - b);
  return {
    columns: used.length,
    nodes: columnOf.map((c, i) => ({ column: used.indexOf(c), row: rowOf[i], rowsInColumn: seen.get(c) ?? 1 })),
  };
};
