import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { replaceMedia } from "../../../../../src/pipeline/operations";
import { cacheDir } from "../../../../../src/pipeline/store";
import { runningJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ALLOWED = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)$/i;

/** Replaces a scene's media with an uploaded image or clip (multipart: sceneId, file). */
export async function POST(req: Request, { params }: Ctx) {
  let tmpDir: string | null = null;
  try {
    const { id } = await params;
    requireProject(id);
    const form = await req.formData();
    const sceneId = String(form.get("sceneId") ?? "");
    const file = form.get("file");
    if (!/^s\d{2}$/.test(sceneId)) return json({ error: "sceneId is required" }, 400);
    if (!file || typeof file === "string") return json({ error: "Attach an image or video file" }, 400);
    const name = path.basename(file.name).replace(/[^\w.-]+/g, "_").slice(-100) || "upload";
    if (!ALLOWED.test(name)) return json({ error: "Unsupported file type (png, jpg, webp, gif, mp4, mov, webm, m4v)" }, 400);
    const busy = runningJob(id);
    if (busy) return json({ error: `Wait for "${busy.label}" to finish first.` }, 409);
    tmpDir = path.join(cacheDir(), "uploads", crypto.randomBytes(6).toString("hex"));
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, name);
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    return json(await replaceMedia(id, sceneId, tmp));
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
