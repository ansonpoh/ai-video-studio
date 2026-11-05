import fs from "node:fs";
import { P } from "../../../../src/pipeline/store";
import { latestJob } from "../../../../src/web/jobs";
import { errorResponse, json, readProgress, reviewPayload } from "../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const p = P(id);
    if (!fs.existsSync(p.metadata)) {
      // a make job may still be starting up before the project exists
      const job = fs.existsSync(p.dir) ? latestJob(id) : null;
      if (!job) return json({ error: `Project ${id} not found` }, 404);
      return json({ pending: true, id, job, progress: readProgress(id) });
    }
    return json(reviewPayload(id));
  } catch (e) {
    return errorResponse(e);
  }
}
