import { setCaptionStyle } from "../../../../../src/pipeline/operations";
import { CaptionStyleName } from "../../../../../src/schemas/options";
import { runningJob } from "../../../../../src/web/jobs";
import { errorResponse, json, requireProject } from "../../../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    requireProject(id);
    const b = (await req.json()) as { style?: string };
    const style = CaptionStyleName.safeParse(b.style);
    if (!style.success) return json({ error: `Unknown caption style. Use one of: ${CaptionStyleName.options.join(", ")}` }, 400);
    const busy = runningJob(id);
    if (busy) return json({ error: `Wait for "${busy.label}" to finish first.` }, 409);
    return json(setCaptionStyle(id, style.data));
  } catch (e) {
    return errorResponse(e);
  }
}
