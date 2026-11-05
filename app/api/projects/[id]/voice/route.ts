import { setVoice } from "../../../../../src/pipeline/operations";
import { runningJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type Ctx = { params: Promise<{ id: string }> };

/** Changes the narration voice and re-synthesizes every scene. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const b = (await req.json()) as { voiceId?: string; approveSpendUsd?: number };
    const voiceId = b.voiceId?.trim();
    if (!voiceId || !/^[A-Za-z0-9_-]{2,64}$/.test(voiceId)) return json({ error: "Enter a valid voice id" }, 400);
    const busy = runningJob(id);
    if (busy) return json({ error: `Wait for "${busy.label}" to finish first.` }, 409);
    return json(await setVoice(id, voiceId, { approveSpendUsd: b.approveSpendUsd }));
  } catch (e) {
    return errorResponse(e);
  }
}
