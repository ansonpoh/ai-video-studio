import { VideoRequest, type VideoRequestInput } from "../../../src/schemas/options";
import { withLengthDefaults } from "../../../src/pipeline/explainer";
import { newProjectId } from "../../../src/pipeline/store";
import { startCliJob } from "../../../src/web/jobs";
import { errorResponse, json, projectCards } from "../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ projects: projectCards() });
  } catch (e) {
    return errorResponse(e);
  }
}

type CreateBody = Record<string, unknown> & { llm?: "anthropic" | "mock"; skipExport?: boolean };

/** Validates the request, then starts `make` as a background CLI job with a pre-allocated id. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;
    const { llm, skipExport, ...input } = body;
    const parsed = VideoRequest.safeParse(withLengthDefaults(input as VideoRequestInput));
    if (!parsed.success) return json({ error: parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") }, 400);
    const r = parsed.data;
    const id = newProjectId(r.prompt);
    const args = ["make", "--id", id, "--prompt", r.prompt, "--duration", String(r.durationSeconds), "--aspect", r.aspectRatio, "--style", r.style, "--quality", r.quality, "--visual-mode", r.visualMode, "--music", r.music];
    if (!r.captions) args.push("--no-captions");
    else if (r.captionStyle !== "auto") args.push("--captions", r.captionStyle);
    if (!r.narration) args.push("--no-narration");
    if (r.voiceId) args.push("--voice", r.voiceId);
    if (r.budgetUsd !== undefined) args.push("--budget", String(r.budgetUsd));
    if (r.approveSpendUsd !== undefined) args.push("--approve-spend", String(r.approveSpendUsd));
    if (r.clipApproval !== "ask") args.push("--clips", r.clipApproval === "approved" ? "approve" : "skip");
    if (r.soundEffects) args.push("--sfx");
    if (r.offline) args.push("--offline");
    if (llm === "mock" || llm === "anthropic") args.push("--llm", llm);
    if (skipExport) args.push("--skip-export");
    const job = startCliJob({ projectId: id, kind: "make", label: "Generating video", args });
    return json({ id, job }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
