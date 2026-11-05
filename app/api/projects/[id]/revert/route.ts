import { selectAsset } from "../../../../../src/pipeline/operations";
import { runningJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Switches a scene to an earlier asset version ("none" = live motion graphics). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const b = (await req.json()) as { sceneId?: string; assetId?: string };
    if (!b.sceneId || !/^s\d{2}$/.test(b.sceneId) || !b.assetId) return json({ error: "sceneId and assetId are required" }, 400);
    const busy = runningJob(id);
    if (busy) return json({ error: `Wait for "${busy.label}" to finish first.` }, 409);
    return json(await selectAsset(id, b.sceneId, b.assetId));
  } catch (e) {
    return errorResponse(e);
  }
}
