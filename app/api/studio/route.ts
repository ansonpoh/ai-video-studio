import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT, cacheDir } from "../../../src/pipeline/store";
import { errorResponse, json } from "../../../src/web/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORT = 3001;
const run = promisify(execFile);

const listening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.setTimeout(800, () => {
      s.destroy();
      resolve(false);
    });
  });

const stateFile = () => path.join(cacheDir(), "jobs", "studio.json");

/** Our Studio process, if it is still alive. */
const studioPid = () => {
  try {
    const { pid } = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as { pid: number };
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
};

/** Running = the Studio we started is alive and its port answers (other tools may hold the port). */
const status = async () => {
  const open = await listening(PORT);
  const ours = studioPid() !== null;
  return { running: open && ours, portBusy: open && !ours, starting: ours && !open };
};

export async function GET() {
  return json({ ...(await status()), port: PORT, url: `http://localhost:${PORT}` });
}

/** Registers every project in the Studio and starts `remotion studio` on port 3001 (detached). */
export async function POST() {
  try {
    const url = `http://localhost:${PORT}`;
    const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
    await run(process.execPath, [tsx, "src/cli/index.ts", "sync-studio"], { cwd: ROOT, timeout: 60_000 });
    const st = await status();
    if (st.running || st.starting) return json({ started: false, running: st.running, url });
    if (st.portBusy) return json({ error: `Port ${PORT} is in use by another process (a render in progress can hold it briefly). Run "npm run studio" in a terminal instead, or try again later.` }, 409);
    const logDir = path.join(cacheDir(), "jobs");
    fs.mkdirSync(logDir, { recursive: true });
    const out = fs.openSync(path.join(logDir, "studio.log"), "a");
    const cli = path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js");
    const child = spawn(process.execPath, [cli, "studio", "src/video/index.ts", "--port", String(PORT), "--no-open"], { cwd: ROOT, detached: true, stdio: ["ignore", out, out], env: { ...process.env, BROWSER: "none" } });
    fs.closeSync(out);
    child.unref();
    fs.writeFileSync(stateFile(), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
    return json({ started: true, running: false, url, pid: child.pid }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
