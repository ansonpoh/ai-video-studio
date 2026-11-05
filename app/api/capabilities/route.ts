import { createOptions, json } from "../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers are configured (names and booleans only, never key values). */
export async function GET() {
  return json(createOptions());
}
