import fs from "node:fs";
import path from "node:path";
import { musicDir } from "../../../src/pipeline/store";
import { listLibrary } from "../../../src/audio/music-library";
import { errorResponse, json } from "../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ tracks: listLibrary().map((t) => ({ file: t.file, moods: t.moods, license: t.license })) });
}

/** Adds a music file to the local library (music/), so a project can use it by name. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ error: "Attach an audio file" }, 400);
    const name = path.basename(file.name).replace(/[^\w.-]+/g, "_").slice(-100);
    if (!/\.(mp3|wav|m4a|aac|ogg)$/i.test(name) || name.startsWith(".")) return json({ error: "Use an mp3, wav, m4a, aac or ogg file" }, 400);
    fs.mkdirSync(musicDir(), { recursive: true });
    fs.writeFileSync(path.join(musicDir(), name), Buffer.from(await file.arrayBuffer()));
    return json({ file: name }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
