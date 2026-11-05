import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { P } from "../../../../../../src/pipeline/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; path: string[] }> };

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".srt": "application/x-subrip; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
};

const notFound = () => new Response("Not found", { status: 404 });

/** Resolves a request path inside the project directory, refusing anything that escapes it. */
const resolveFile = (id: string, parts: string[]) => {
  let dir: string;
  try {
    dir = P(id).dir; // rejects malformed ids
  } catch {
    return null;
  }
  if (!parts.length || parts.some((s) => !s || s.startsWith(".") || s.includes("\\") || s.includes("\0"))) return null;
  const file = path.resolve(dir, ...parts);
  if (!file.startsWith(dir + path.sep)) return null;
  try {
    const real = fs.realpathSync(file);
    const realDir = fs.realpathSync(dir);
    if (!real.startsWith(realDir + path.sep)) return null;
    const st = fs.statSync(real);
    return st.isFile() ? { file: real, size: st.size, mtime: st.mtime } : null;
  } catch {
    return null;
  }
};

const stream = (file: string) => Readable.toWeb(fs.createReadStream(file)) as ReadableStream;

/** Range responses are served in bounded chunks from a buffer so they carry an exact Content-Length. */
const MAX_CHUNK = 4 * 1024 * 1024;
const readRange = (file: string, start: number, end: number) => {
  const buf = Buffer.alloc(end - start + 1);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf;
};

async function handle(req: Request, { params }: Ctx, head: boolean) {
  const { id, path: parts } = await params;
  const f = resolveFile(id, parts.map((p) => decodeURIComponent(p)));
  if (!f) return notFound();
  const url = new URL(req.url);
  const headers = new Headers({
    "content-type": TYPES[path.extname(f.file).toLowerCase()] ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "last-modified": f.mtime.toUTCString(),
    "cache-control": "no-cache",
    etag: `"${f.size.toString(16)}-${Math.round(f.mtime.getTime()).toString(16)}"`,
  });
  if (url.searchParams.has("download")) headers.set("content-disposition", `attachment; filename="${id}-${path.basename(f.file)}"`);

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start: number, end: number;
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${f.size}` } });
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), f.size - 1) : f.size - 1;
    } else {
      // suffix range: last N bytes
      start = Math.max(0, f.size - Number(m[2]));
      end = f.size - 1;
    }
    if (start >= f.size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${f.size}` } });
    end = Math.min(end, start + MAX_CHUNK - 1);
    headers.set("content-range", `bytes ${start}-${end}/${f.size}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(head ? null : new Uint8Array(readRange(f.file, start, end)), { status: 206, headers });
  }
  headers.set("content-length", String(f.size));
  return new Response(head ? null : stream(f.file), { status: 200, headers });
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx, false);
}

export async function HEAD(req: Request, ctx: Ctx) {
  return handle(req, ctx, true);
}
