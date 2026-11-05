import { store } from "../../../../../src/pipeline/store";
import { getJob, startCliJob, withApproval } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Resumes the pipeline from the first unfinished stage, optionally approving
 * a spend. With retryJobId, re-runs that (regenerate) job with the approval.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const body = (await req.json().catch(() => ({}))) as { approveSpendUsd?: number; retryJobId?: string };
    const approve = body.approveSpendUsd !== undefined ? Number(body.approveSpendUsd) : undefined;
    if (approve !== undefined && (!Number.isFinite(approve) || approve < 0)) return json({ error: "approveSpendUsd must be a positive number" }, 400);
    const retry = body.retryJobId ? getJob(id, body.retryJobId) : null;
    if (retry && retry.kind === "regenerate") {
      const args = approve !== undefined ? withApproval(retry.args, approve) : retry.args;
      return json({ job: startCliJob({ projectId: id, kind: "regenerate", label: retry.label, args }) }, 202);
    }
    const args = ["resume", "--id", id];
    if (approve !== undefined) args.push("--approve-spend", String(approve));
    // keep the script engine the project was started with
    if (/^mock/.test(store.metadata(id).providers.llm ?? "")) args.push("--llm", "mock");
    const label = approve !== undefined ? `Resuming with $${approve.toFixed(2)} approved` : "Resuming pipeline";
    return json({ job: startCliJob({ projectId: id, kind: "resume", label, args }) }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
