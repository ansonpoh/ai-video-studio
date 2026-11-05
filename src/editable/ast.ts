/**
 * Surgical reads and writes on the editable composition source, using the
 * TypeScript compiler API. Patches touch only the named element/attribute the
 * operation is about; everything else (including the user's Studio edits)
 * stays byte-for-byte identical.
 */
import * as ts from "typescript";

export type JsxEl = {
  tag: string;
  name: string | null;
  start: number;
  end: number;
  openingEnd: number; // position before ">" or "/>" of the opening tag
  attrs: Map<string, { start: number; end: number; init: ts.JsxAttributeValue | undefined; node: ts.JsxAttribute }>;
  node: ts.JsxElement | ts.JsxSelfClosingElement;
};

const parse = (src: string) => ts.createSourceFile("Video.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const attrsOf = (opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
  const m: JsxEl["attrs"] = new Map();
  for (const p of opening.attributes.properties) {
    if (ts.isJsxAttribute(p)) m.set(p.name.getText(), { start: p.getStart(), end: p.getEnd(), init: p.initializer, node: p });
  }
  return m;
};

const literalString = (init: ts.JsxAttributeValue | undefined): string | null => {
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) return init.expression.text;
  return null;
};

export const listElements = (src: string): JsxEl[] => {
  const sf = parse(src);
  const out: JsxEl[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const opening = ts.isJsxElement(n) ? n.openingElement : n;
      const attrs = attrsOf(opening);
      const nameAttr = attrs.get("name");
      out.push({
        tag: opening.tagName.getText(),
        name: literalString(nameAttr?.init),
        start: n.getStart(),
        end: n.getEnd(),
        openingEnd: opening.getEnd() - (ts.isJsxSelfClosingElement(opening) ? 2 : 1),
        attrs,
        node: n,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

export const findByName = (src: string, name: string) => listElements(src).find((e) => e.name === name);
export const findSceneSequence = (src: string, sceneId: string) =>
  listElements(src).find((e) => e.tag === "TransitionSeries.Sequence" && (e.name ?? "").startsWith(`${sceneId} ·`));

/** Replace or add an attribute value. `valueCode` is JSX attribute value code, e.g. `{42}` or `"text"`. */
export const setAttr = (src: string, elName: string, attr: string, valueCode: string, finder?: (s: string) => JsxEl | undefined): string => {
  const el = finder ? finder(src) : findByName(src, elName);
  if (!el) throw new Error(`Element "${elName}" not found in editable composition`);
  const a = el.attrs.get(attr);
  if (a) return src.slice(0, a.start) + `${attr}=${valueCode}` + src.slice(a.end);
  const rest = src.slice(el.openingEnd);
  const ws = /^\s*/.exec(rest)![0];
  const sep = ws.includes("\n") ? ws : rest.slice(ws.length).startsWith("/") ? " " : "";
  return src.slice(0, el.openingEnd).replace(/\s*$/, "") + ` ${attr}=${valueCode}` + sep + rest.slice(ws.length);
};

export const replaceElement = (src: string, elName: string, code: string) => {
  const el = findByName(src, elName);
  if (!el) throw new Error(`Element "${elName}" not found`);
  return src.slice(0, el.start) + code.trim() + src.slice(el.end);
};

export const removeElement = (src: string, elName: string) => {
  const el = findByName(src, elName);
  if (!el) return src;
  let start = el.start;
  while (start > 0 && src[start - 1] === " ") start--;
  let end = el.end;
  if (src[end] === "\n") end++;
  return src.slice(0, start) + src.slice(end);
};

/** Insert code just before the closing tag of the named element (as its last child). */
export const appendChild = (src: string, el: JsxEl, code: string) => {
  if (!ts.isJsxElement(el.node)) throw new Error("Cannot append to a self-closing element");
  const closeStart = el.node.closingElement.getStart();
  let lineStart = closeStart;
  while (lineStart > 0 && src[lineStart - 1] === " ") lineStart--;
  return src.slice(0, lineStart) + code.replace(/\s+$/, "") + "\n" + src.slice(lineStart);
};

export const insertAfter = (src: string, el: JsxEl, code: string) => src.slice(0, el.end) + "\n" + code.replace(/\s+$/, "") + src.slice(el.end);

/** Evaluates the restricted numeric expressions Studio writes: 42, 2 * fps, fps * 2, durationInFrames - 1 etc. */
export const evalNumber = (expr: ts.Expression | undefined, fps: number): number | null => {
  if (!expr) return null;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (ts.isParenthesizedExpression(expr)) return evalNumber(expr.expression, fps);
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken) {
    const v = evalNumber(expr.operand, fps);
    return v === null ? null : -v;
  }
  if (ts.isIdentifier(expr) && expr.text === "fps") return fps;
  if (ts.isBinaryExpression(expr)) {
    const l = evalNumber(expr.left, fps);
    const r = evalNumber(expr.right, fps);
    if (l === null || r === null) return null;
    switch (expr.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken:
        return l * r;
      case ts.SyntaxKind.PlusToken:
        return l + r;
      case ts.SyntaxKind.MinusToken:
        return l - r;
      case ts.SyntaxKind.SlashToken:
        return l / r;
    }
  }
  return null;
};

export const attrNumber = (el: JsxEl, attr: string, fps: number): number | null => {
  const a = el.attrs.get(attr);
  if (!a?.init || !ts.isJsxExpression(a.init)) return null;
  return evalNumber(a.init.expression, fps);
};

export const attrString = (el: JsxEl, attr: string) => literalString(el.attrs.get(attr)?.init);

const transitionFrames = (el: JsxEl, fps: number): number => {
  const timing = el.attrs.get("timing");
  if (!timing?.init || !ts.isJsxExpression(timing.init) || !timing.init.expression) return 0;
  let found = 0;
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && n.name.getText() === "durationInFrames") found = evalNumber(n.initializer, fps) ?? 0;
    ts.forEachChild(n, visit);
  };
  visit(timing.init.expression);
  return found;
};

export type SceneSpan = { sceneId: string; name: string; startFrame: number; durationInFrames: number; transitionInFrames: number };

/** Reads the scene layout of the "Scenes" TransitionSeries as the user currently has it. */
export const readSceneSpans = (src: string, fps: number): { spans: SceneSpan[]; totalFrames: number } => {
  const els = listElements(src);
  const series = els.find((e) => e.tag === "TransitionSeries" && e.name === "Scenes");
  if (!series || !ts.isJsxElement(series.node)) return { spans: [], totalFrames: 0 };
  const spans: SceneSpan[] = [];
  let cursor = 0;
  let pendingTransition = 0;
  for (const child of series.node.children) {
    if (!(ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))) continue;
    const el = els.find((e) => e.start === child.getStart());
    if (!el) continue;
    if (el.tag === "TransitionSeries.Transition") {
      pendingTransition = transitionFrames(el, fps);
    } else if (el.tag === "TransitionSeries.Sequence") {
      const dur = attrNumber(el, "durationInFrames", fps) ?? 0;
      const start = spans.length ? cursor - pendingTransition : 0;
      spans.push({ sceneId: (el.name ?? "").split(" ·")[0], name: el.name ?? "", startFrame: start, durationInFrames: dur, transitionInFrames: spans.length ? pendingTransition : 0 });
      cursor = start + dur;
      pendingTransition = 0;
    }
  }
  return { spans, totalFrames: cursor };
};

export type ReadCaption = { text: string; startMs: number; endMs: number };

/** Extracts caption arrays (scene-relative) from every CaptionLayer element. */
export const readCaptions = (src: string): Map<string, { elementName: string; captions: ReadCaption[]; hidden: boolean }> => {
  const out = new Map<string, { elementName: string; captions: ReadCaption[]; hidden: boolean }>();
  for (const el of listElements(src)) {
    if (el.tag !== "CaptionLayer" || !el.name) continue;
    const a = el.attrs.get("captions");
    if (!a?.init || !ts.isJsxExpression(a.init) || !a.init.expression || !ts.isArrayLiteralExpression(a.init.expression)) continue;
    const caps: ReadCaption[] = [];
    for (const item of a.init.expression.elements) {
      if (!ts.isObjectLiteralExpression(item)) continue;
      const c: Partial<ReadCaption> = {};
      for (const p of item.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const key = p.name.getText();
        if (key === "text" && ts.isStringLiteral(p.initializer)) c.text = p.initializer.text;
        if (key === "startMs") c.startMs = evalNumber(p.initializer, 30) ?? 0;
        if (key === "endMs") c.endMs = evalNumber(p.initializer, 30) ?? 0;
      }
      if (c.text !== undefined) caps.push({ text: c.text, startMs: c.startMs ?? 0, endMs: c.endMs ?? 0 });
    }
    const hidden = el.attrs.has("hidden") && el.attrs.get("hidden")?.init === undefined ? true : /hidden=\{true\}/.test(src.slice(el.attrs.get("hidden")?.start ?? 0, el.attrs.get("hidden")?.end ?? 0));
    out.set(el.name.split(" ")[0], { elementName: el.name, captions: caps, hidden });
  }
  return out;
};

/** Cheap syntax check so a broken hand edit is reported before bundling. */
export const syntaxErrors = (src: string) => {
  const sf = parse(src) as ts.SourceFile & { parseDiagnostics?: ts.DiagnosticWithLocation[] };
  return (sf.parseDiagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
};
