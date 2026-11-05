import fs from "node:fs";
import { notFound } from "next/navigation";
import { P } from "../../../src/pipeline/store";
import { CaptionStyleName } from "../../../src/schemas/options";
import { publicCapabilities } from "../../../src/config/env";
import { latestJob } from "../../../src/web/jobs";
import { reviewPayload } from "../../../src/web/server";
import { Review } from "./Review";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `${id} · Video Studio` };
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  let p: ReturnType<typeof P>;
  try {
    p = P(id);
  } catch {
    notFound();
  }
  const exists = fs.existsSync(p.metadata);
  if (!exists && !(fs.existsSync(p.dir) && latestJob(id))) notFound();
  return <Review id={id} initial={exists ? reviewPayload(id) : null} capabilities={publicCapabilities()} captionStyles={CaptionStyleName.options} />;
}
