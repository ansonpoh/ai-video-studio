import { startCliJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const KINDS = new Set(["draft", "final", "clean", "audio", "thumbnail", "captions"]);

/** Re-renders outputs from the editable composition (no AI calls). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const body = (await req.json().catch(() => ({}))) as { kinds?: string[] };
    const kinds = (body.kinds?.length ? body.kinds : ["final", "clean", "audio", "thumbnail", "captions"]).filter((k) => KINDS.has(k));
    if (!kinds.length) return json({ error: "No valid output kinds" }, 400);
    const label = kinds.includes("final") ? "Rendering final video" : `Rendering ${kinds.join(", ")}`;
    return json({ job: startCliJob({ projectId: id, kind: "render", label, args: ["render", "--id", id, "--kind", ...kinds] }) }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
