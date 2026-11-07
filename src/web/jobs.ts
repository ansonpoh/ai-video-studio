/**
 * Background jobs for the web UI. Long operations (make, resume, render,
 * regeneration) run as detached CLI processes so they survive page reloads and
 * use exactly the same code path as the command line. Each job writes a JSON
 * record and a log next to the project:
 *   projects/<id>/.pipeline/jobs/<jobId>.json
 *   projects/<id>/.pipeline/jobs/<jobId>.log
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ROOT, P, cacheDir, writeJsonAtomic } from "../pipeline/store";

export type JobKind = "make" | "resume" | "render" | "regenerate" | "studio";
export type JobStatus = "running" | "done" | "failed";

export type Job = {
  id: string;
  projectId: string | null;
  kind: JobKind;
  label: string;
  args: string[];
  pid: number | null;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  status: JobStatus;
};

export type BudgetRequest = { estimateUsd: number; budgetUsd: number; approveUsd: number; breakdown: { category: string; provider: string; description: string; estimatedUsd: number }[] };

export type ClipReview = { count: number; estimateUsd: number; clips: { sceneId: string; tier: "hero" | "background"; model: string; estimatedUsd: number }[] };
export type JobView = Job & { logTail: string; budget: BudgetRequest | null; clipReview: ClipReview | null; error: string | null };

const jobsDir = (projectId: string | null) => (projectId ? path.join(P(projectId).dir, ".pipeline", "jobs") : path.join(cacheDir(), "jobs"));
const jobFile = (projectId: string | null, jobId: string) => path.join(jobsDir(projectId), `${jobId}.json`);
export const jobLogFile = (projectId: string | null, jobId: string) => path.join(jobsDir(projectId), `${jobId}.log`);

const tsxCli = () => {
  const direct = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  return fs.existsSync(direct) ? direct : null;
};

const alive = (pid: number | null) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

const readJob = (file: string): Job | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Job;
  } catch {
    return null;
  }
};

const readAll = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** Progress lines use carriage returns; keep only the last state of each line. */
const cleanLog = (s: string) =>
  s
    .split("\n")
    .map((line) => {
      const parts = line.split("\r");
      return parts[parts.length - 1].trimEnd();
    })
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n");

/** Recovers the BudgetApprovalRequired details the CLI prints on failure. */
export const parseBudget = (log: string): BudgetRequest | null => {
  const m = /Estimated spend \$([\d.]+) exceeds the \$([\d.]+) limit/.exec(log);
  if (!m) return null;
  const estimateUsd = Number(m[1]);
  let breakdown: BudgetRequest["breakdown"] = [];
  const at = log.indexOf("Planned spend:");
  if (at >= 0) {
    const start = log.indexOf("[", at);
    const end = log.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        breakdown = JSON.parse(log.slice(start, end + 1));
      } catch {
        breakdown = [];
      }
    }
  }
  return { estimateUsd, budgetUsd: Number(m[2]), approveUsd: Math.ceil(estimateUsd * 100) / 100, breakdown };
};

/** Recovers the ClipApprovalRequired details (storyboard preview before paying for clips). */
export const parseClipReview = (log: string): ClipReview | null => {
  const m = /Storyboard ready for review: (\d+) AI clip\(s\) planned \(about \$([\d.]+)\)/.exec(log);
  if (!m) return null;
  let clips: ClipReview["clips"] = [];
  const at = log.indexOf("Planned clips:");
  if (at >= 0) {
    const start = log.indexOf("[", at);
    const end = log.lastIndexOf("]");
    try {
      if (start >= 0 && end > start) clips = JSON.parse(log.slice(start, end + 1));
    } catch {
      clips = [];
    }
  }
  return { count: Number(m[1]), estimateUsd: Number(m[2]), clips };
};

const errorOf = (log: string) => {
  const lines = log.split(/\r|\n/);
  const line = [...lines].reverse().find((l) => l.startsWith("✗ ") && !/^✗ [a-z-]+: /.test(l)) ?? [...lines].reverse().find((l) => l.startsWith("✗ "));
  if (line) return line.slice(2).trim();
  const stack = lines.find((l) => /^(Error|TypeError|ReferenceError|SyntaxError)[:\s]/.test(l.trim()));
  return stack?.trim() ?? null;
};

/** Brings a job record up to date (handles processes that ended while the server was down). */
const settle = (job: Job): Job => {
  if (job.status !== "running" || alive(job.pid)) return job;
  const log = readAll(jobLogFile(job.projectId, job.id));
  const failed = Boolean(job.exitCode) || /(^|[\r\n])✗ /.test(log);
  const next: Job = { ...job, status: failed ? "failed" : "done", finishedAt: job.finishedAt ?? new Date().toISOString() };
  try {
    writeJsonAtomic(jobFile(job.projectId, job.id), next);
  } catch {
    /* read-only is fine */
  }
  return next;
};

export const view = (job: Job): JobView => {
  const j = settle(job);
  const full = readAll(jobLogFile(j.projectId, j.id));
  return {
    ...j,
    logTail: cleanLog(full.slice(-6000)),
    budget: j.status === "failed" ? parseBudget(full) : null,
    clipReview: j.status === "failed" ? parseClipReview(full) : null,
    error: j.status === "failed" ? errorOf(full) ?? `Process exited with code ${j.exitCode ?? "?"}` : null,
  };
};

export const listJobs = (projectId: string | null): Job[] => {
  const dir = jobsDir(projectId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJob(path.join(dir, f)))
    .filter((j): j is Job => Boolean(j))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
};

export const latestJob = (projectId: string | null) => {
  const [j] = listJobs(projectId);
  return j ? view(j) : null;
};

export const getJob = (projectId: string | null, jobId: string) => {
  if (!/^[a-z0-9-]{4,64}$/.test(jobId)) return null;
  const j = readJob(jobFile(projectId, jobId));
  return j ? view(j) : null;
};

export const runningJob = (projectId: string | null) => listJobs(projectId).map(settle).find((j) => j.status === "running") ?? null;

export class JobConflict extends Error {
  constructor(public job: Job) {
    super(`A ${job.kind} job is already running for this project (${job.label}). Wait for it to finish.`);
    this.name = "JobConflict";
  }
}

/** Starts `tsx src/cli/index.ts <args>` detached from the server process. */
export const startCliJob = (o: { projectId: string | null; kind: JobKind; label: string; args: string[]; allowConcurrent?: boolean }): Job => {
  if (!o.allowConcurrent) {
    const running = runningJob(o.projectId);
    if (running) throw new JobConflict(running);
  }
  const id = `${o.kind}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
  const dir = jobsDir(o.projectId);
  fs.mkdirSync(dir, { recursive: true });
  const logPath = jobLogFile(o.projectId, id);
  const out = fs.openSync(logPath, "a");
  fs.writeSync(out, `$ tsx src/cli/index.ts ${o.args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n`);
  const cli = tsxCli();
  const [cmd, argv] = cli ? [process.execPath, [cli, "src/cli/index.ts", ...o.args]] : [path.join(ROOT, "node_modules", ".bin", "tsx"), ["src/cli/index.ts", ...o.args]];
  const child = spawn(cmd, argv, {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  fs.closeSync(out);
  const job: Job = { id, projectId: o.projectId, kind: o.kind, label: o.label, args: o.args, pid: child.pid ?? null, startedAt: new Date().toISOString(), status: "running" };
  writeJsonAtomic(jobFile(o.projectId, id), job);
  child.on("error", (err) => {
    fs.appendFileSync(logPath, `\n✗ Could not start the CLI: ${err.message}\n`);
    writeJsonAtomic(jobFile(o.projectId, id), { ...job, status: "failed", exitCode: -1, finishedAt: new Date().toISOString() });
  });
  child.on("exit", (code) => {
    const current = readJob(jobFile(o.projectId, id)) ?? job;
    // the CLI reports failures via exitCode = 1
    writeJsonAtomic(jobFile(o.projectId, id), { ...current, status: code === 0 ? "done" : "failed", exitCode: code, finishedAt: new Date().toISOString() });
  });
  child.unref();
  return job;
};

/** Removes any --approve-spend flag so a job can be retried with a new approval. */
export const withApproval = (args: string[], usd: number) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--approve-spend") {
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return [...out, "--approve-spend", String(usd)];
};
