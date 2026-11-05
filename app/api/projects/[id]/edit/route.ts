import { editScene } from "../../../../../src/pipeline/operations";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";
import { runningJob } from "../../../../../src/web/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Script text edits (title / on-screen text / narration), stored as user edits and patched in. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const b = (await req.json()) as { sceneId?: string; narration?: string; title?: string; onScreenText?: string; approveSpendUsd?: number };
    if (!b.sceneId || !/^s\d{2}$/.test(b.sceneId)) return json({ error: "sceneId is required" }, 400);
    const busy = runningJob(id);
    if (busy) return json({ error: `Wait for "${busy.label}" to finish before editing.` }, 409);
    const fields = Object.fromEntries((["narration", "title", "onScreenText"] as const).filter((k) => typeof b[k] === "string").map((k) => [k, b[k] as string]));
    return json(await editScene(id, b.sceneId, fields, { approveSpendUsd: b.approveSpendUsd }));
  } catch (e) {
    return errorResponse(e);
  }
}
