#!/usr/bin/env node
/**
 * CLI for automation. Calls exactly the same pipeline/operations modules as
 * the web UI.
 */
import "../config/env";
import { Command } from "commander";
import path from "node:path";
import type { PipelineEvent } from "../pipeline/pipeline";

const program = new Command();
program.name("video-studio").description("Prompt-to-video studio: generate, edit (Remotion Studio) and render short videos.");

const printer = (e: PipelineEvent) => {
  if (e.status === "progress") {
    const pct = e.progress !== undefined ? ` ${Math.round(e.progress * 100)}%` : "";
    process.stdout.write(`\r  … ${e.stage}${pct} ${e.message ?? ""}`.padEnd(80));
    return;
  }
  if (e.status === "skipped" && e.message === "already done") return;
  const icon = { running: "▶", done: "✓", failed: "✗", skipped: "–" }[e.status] ?? "·";
  process.stdout.write(`\r${icon} ${e.stage}${e.message ? `: ${e.message}` : ""}`.padEnd(80) + (e.status === "running" ? "" : "\n"));
};

const fail = (err: unknown) => {
  const e = err as Error & { breakdown?: unknown };
  console.error(`\n✗ ${e.message}`);
  if (e.name === "BudgetApprovalRequired" && e.breakdown) console.error("  Planned spend:", JSON.stringify(e.breakdown, null, 2));
  const clips = (e as { clips?: unknown }).clips;
  if (e.name === "ClipApprovalRequired" && clips) console.error("  Planned clips:", JSON.stringify(clips, null, 2));
  process.exitCode = 1;
};

program
  .command("demo")
  .description("Render the three offline demo projects (no API keys needed)")
  .option("--only <names...>", "only these demos (lightning, two-moons, productivity)")
  .option("--fresh", "rebuild demo projects from scratch (discards edits to them)")
  .option("--no-export", "skip final/clean exports (draft preview only)")
  .action(async (o) => {
    try {
      const { runDemos } = await import("../pipeline/demo");
      const res = await runDemos({ only: o.only, fresh: o.fresh, skipExport: o.export === false, onEvent: printer });
      console.log("\nDemo projects:");
      for (const r of res) console.log(`  ${r.id}  [${r.status}]  ${path.join(r.dir, "output")}`);
      console.log("\nOpen them in Remotion Studio with: npm run studio");
    } catch (e) {
      fail(e);
    }
  });

program
  .command("make")
  .description("Generate a new video from a prompt")
  .requiredOption("-p, --prompt <text>", "what the video is about")
  .option("-d, --duration <seconds>", "target duration", (v) => Number(v))
  .option("-s, --style <style>", "auto | cinematic | educational | bold-modern | minimal | documentary | playful | luxury | retro | tech")
  .option("-a, --aspect <ratio>", "9:16 | 16:9 | 1:1 | 4:5")
  .option("-q, --quality <preset>", "economy | hybrid | balanced | premium | explainer (default hybrid)")
  .option("--clips <choice>", "ask (default: stop after the storyboard stills) | approve | skip")
  .option("--visual-mode <mode>", "auto | ai_only | stock_preferred | procedural_only")
  .option("--captions <style>", "auto | minimal | bold | word-highlight | karaoke | cinematic")
  .option("--no-captions", "disable captions")
  .option("--no-narration", "disable narration")
  .option("--voice <id>", "ElevenLabs voice id")
  .option("--music <file|auto|none>", "music file from music/ (auto picks by mood)")
  .option("--llm <provider>", "anthropic | mock (mock = offline, deterministic)")
  .option("--budget <usd>", "spending limit for this project", (v) => Number(v))
  .option("--approve-spend <usd>", "approve spending up to this amount", (v) => Number(v))
  .option("--sfx", "generate sound effects")
  .option("--offline", "never call paid providers (procedural visuals, silent narration)")
  .option("--skip-export", "stop after the draft preview")
  .option("-o, --output <dir>", "also copy final outputs to this directory")
  .option("--id <id>", "project id to create (default: derived from the prompt)")
  .action(async (o) => {
    try {
      const { makeVideo } = await import("../pipeline/operations");
      const res = await makeVideo(
        {
          prompt: o.prompt,
          durationSeconds: o.duration,
          style: o.style,
          // Explainers default to landscape, like a presentation.
          aspectRatio: o.aspect ?? (o.quality === "explainer" ? "16:9" : undefined),
          quality: o.quality,
          visualMode: o.visualMode,
          captionStyle: typeof o.captions === "string" ? o.captions : undefined,
          captions: o.captions !== false,
          narration: o.narration !== false,
          voiceId: o.voice,
          music: o.music,
          budgetUsd: o.budget,
          approveSpendUsd: o.approveSpend,
          clipApproval: o.clips === "approve" ? "approved" : o.clips === "skip" ? "skipped" : undefined,
          soundEffects: Boolean(o.sfx),
          offline: Boolean(o.offline),
        },
        { id: o.id, llm: o.llm, skipExport: Boolean(o.skipExport), outputDir: o.output, onEvent: printer },
      );
      console.log(`\nProject ${res.id} [${res.status}]\n  ${res.dir}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("resume")
  .description("Resume a project's pipeline from the first unfinished stage")
  .requiredOption("--id <id>")
  .option("--approve-spend <usd>", "approve spending up to this amount", (v) => Number(v))
  .option("--clips <choice>", "after the storyboard preview: approve | skip the planned AI clips")
  .option("--llm <provider>")
  .option("--skip-export", "stop after the draft preview")
  .action(async (o) => {
    try {
      const { resumeProject } = await import("../pipeline/operations");
      const r = await resumeProject(o.id, { approveSpendUsd: o.approveSpend, clips: o.clips === "approve" || o.clips === "skip" ? o.clips : undefined, llm: o.llm, onEvent: printer, skipExport: Boolean(o.skipExport) });
      console.log(`\n${r.id} [${r.status}]`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("render")
  .description("Re-render a project from its editable composition (no AI calls)")
  .requiredOption("--id <id>")
  .option("--kind <kinds...>", "draft | final | clean | audio | thumbnail | captions", ["final", "clean", "thumbnail", "captions"])
  .action(async (o) => {
    try {
      const { renderOutputs } = await import("../pipeline/operations");
      const files = await renderOutputs(o.id, o.kind, (p) => process.stdout.write(`\r  ${p.stage} ${Math.round(p.progress * 100)}%`.padEnd(60)));
      console.log("\n" + files.map((f) => `  ${f}`).join("\n"));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("regenerate")
  .description("Partially regenerate a project")
  .requiredOption("--id <id>")
  .requiredOption("--what <target>", "image | clip | narration | script | visuals | scene-style | captions")
  .option("--scene <sceneId>", "scene id, e.g. s03")
  .option("--style <text>", "new visual style for scene-style")
  .option("--instruction <text>", "instruction for script rewrites")
  .option("--approve-spend <usd>", "approve spending up to this amount", (v) => Number(v))
  .option("--llm <provider>", "anthropic | mock")
  .option("--render", "render final outputs afterwards")
  .action(async (o) => {
    try {
      const ops = await import("../pipeline/operations");
      const r = await ops.regenerate(o.id, { what: o.what, sceneId: o.scene, style: o.style, instruction: o.instruction, approveSpendUsd: o.approveSpend, llm: o.llm });
      console.log(r.message);
      if (o.render) await ops.renderOutputs(o.id, ["final", "clean", "thumbnail", "captions"]);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("replace")
  .description("Replace a scene's media with your own image or clip")
  .requiredOption("--id <id>")
  .requiredOption("--scene <sceneId>")
  .requiredOption("--file <path>")
  .action(async (o) => {
    try {
      const { replaceMedia } = await import("../pipeline/operations");
      const r = await replaceMedia(o.id, o.scene, path.resolve(o.file));
      console.log(r.message);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("revert")
  .description("Switch a scene back to an earlier asset version")
  .requiredOption("--id <id>")
  .requiredOption("--scene <sceneId>")
  .requiredOption("--asset <assetId>")
  .action(async (o) => {
    try {
      const { selectAsset } = await import("../pipeline/operations");
      console.log((await selectAsset(o.id, o.scene, o.asset)).message);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("export")
  .description("Export final MP4, caption-free MP4, SRT, timings and audio")
  .requiredOption("--id <id>")
  .option("-o, --output <dir>", "copy exports to this directory")
  .action(async (o) => {
    try {
      const { renderOutputs, copyOutputs } = await import("../pipeline/operations");
      const files = await renderOutputs(o.id, ["final", "clean", "audio", "thumbnail", "captions"]);
      if (o.output) copyOutputs(o.id, o.output);
      console.log(files.map((f) => `  ${f}`).join("\n"));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("list")
  .description("List projects")
  .action(async () => {
    const { store } = await import("../pipeline/store");
    for (const m of store.list()) console.log(`${m.id.padEnd(48)} ${m.status.padEnd(12)} ${(m.durationSeconds ?? 0).toFixed(1).padStart(5)}s  ${m.title}`);
  });

program
  .command("status")
  .description("Show a project's pipeline stages, costs and content flags, or the configured capabilities")
  .option("--id <id>")
  .action(async (o) => {
    if (!o.id) {
      const { capabilities } = await import("../config/env");
      for (const c of capabilities()) console.log(`${c.available ? "✓" : "✗"} ${c.name.padEnd(30)} ${c.detail}`);
      return;
    }
    const { store } = await import("../pipeline/store");
    const { costSummary } = await import("../pipeline/budget");
    const meta = store.metadata(o.id);
    const m = store.manifest(o.id);
    console.log(`${meta.title} [${meta.status}] ${meta.mode}`);
    for (const s of m.stages) console.log(`  ${s.status.padEnd(8)} ${s.name.padEnd(12)} ${s.error ?? s.note ?? ""}`);
    console.log("Costs:", JSON.stringify(costSummary(m)));
    for (const f of meta.contentFlags) console.log(`  [${f.severity}] ${f.kind}${f.sceneId ? ` ${f.sceneId}` : ""}: ${f.message}`);
  });

program
  .command("sync-studio")
  .description("Register every project's editable composition in Remotion Studio")
  .action(async () => {
    const { syncStudioRegistry } = await import("../editable/registry");
    const entries = syncStudioRegistry();
    console.log(`Studio registry: ${entries.length} project(s)`);
  });

// Renderer/browser handles can keep the event loop alive after a command finishes; exit explicitly.
program
  .parseAsync(process.argv)
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    fail(e);
    process.exit(1);
  });
