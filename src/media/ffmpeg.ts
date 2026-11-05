/**
 * Locates ffmpeg/ffprobe: FFMPEG_PATH/FFPROBE_PATH, then a system install,
 * then the binaries bundled with Remotion's compositor (no extra install needed).
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const onPath = (bin: string) => {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const compositorDir = () => {
  const candidates = [
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-win32-x64-msvc",
  ];
  for (const c of candidates) {
    try {
      return path.dirname(require.resolve(`${c}/package.json`));
    } catch {
      /* not installed */
    }
  }
  return null;
};

const resolveBin = (name: "ffmpeg" | "ffprobe") => {
  const env = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (env) return { bin: env, env: process.env };
  if (onPath(name)) return { bin: name, env: process.env };
  const dir = compositorDir();
  if (dir) {
    const bin = path.join(dir, process.platform === "win32" ? `${name}.exe` : name);
    if (fs.existsSync(bin)) return { bin, env: { ...process.env, LD_LIBRARY_PATH: [dir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"), DYLD_LIBRARY_PATH: dir } };
  }
  throw new Error(`${name} not found. Install ffmpeg or set ${name.toUpperCase()}_PATH.`);
};

export const run = (name: "ffmpeg" | "ffprobe", args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const { bin, env } = resolveBin(name);
    execFile(bin, args, { env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${name} failed: ${stderr.split("\n").slice(-6).join("\n")}`));
      else resolve({ stdout, stderr });
    });
  });

export const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
export const ffprobeJson = async (file: string) => {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  return JSON.parse(stdout) as {
    format: { duration?: string; size?: string };
    streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; duration?: string; nb_frames?: string; codec_name?: string; sample_rate?: string }[];
  };
};

export const mediaDurationSeconds = async (file: string) => Number((await ffprobeJson(file)).format.duration ?? 0);
