import { regenerate } from "../../../../../src/pipeline/operations";
import { CaptionStyleName } from "../../../../../src/schemas/options";
import { startCliJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Body = { what?: string; sceneId?: string; instruction?: string; style?: string; approveSpendUsd?: number };

const SLOW = new Set(["image", "clip", "narration", "script", "visuals", "scene-style"]);
const LABEL: Record<string, string> = {
  image: "New image",
  clip: "New video clip",
  narration: "Regenerating narration",
  script: "Rewriting scene",
  visuals: "Re-resolving visuals",
  "scene-style": "Restyling scene",
};

/**
 * Partial regeneration. Provider-bound work runs as a background CLI job;
 * caption rebuilds are quick and run in-process.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const b = (await req.json()) as Body;
    const what = b.what ?? "";
    if (b.sceneId !== undefined && !/^s\d{2}$/.test(b.sceneId)) return json({ error: "Invalid scene id" }, 400);
    if (what === "captions") {
      const style = b.style ? CaptionStyleName.parse(b.style) : undefined;
      return json(await regenerate(id, { what: "captions", sceneId: b.sceneId, style }));
    }
    if (!SLOW.has(what)) return json({ error: `Unknown regeneration target "${what}"` }, 400);
    if (what === "script" && !b.instruction?.trim()) return json({ error: "An instruction is required to rewrite a scene" }, 400);
    if (what === "scene-style" && !b.style?.trim()) return json({ error: "A style is required" }, 400);
    const args = ["regenerate", "--id", id, "--what", what];
    if (b.sceneId) args.push("--scene", b.sceneId);
    if (b.instruction) args.push("--instruction", b.instruction.trim());
    if (b.style) args.push("--style", b.style.trim());
    if (b.approveSpendUsd !== undefined) args.push("--approve-spend", String(Number(b.approveSpendUsd)));
    const label = `${LABEL[what]}${b.sceneId ? ` (${b.sceneId})` : ""}`;
    return json({ job: startCliJob({ projectId: id, kind: "regenerate", label, args }) }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
