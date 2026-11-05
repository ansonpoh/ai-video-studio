/**
 * `npm run demo`: builds the three offline demo projects through the same
 * pipeline as live generation, with predefined storyboards and no paid
 * provider calls. Existing demo projects keep their editable compositions
 * (so Studio edits survive); pass fresh=true to rebuild from scratch.
 */
import fs from "node:fs";
import { DEMOS } from "./demos";
import { createProject, runPipeline, type PipelineEvent } from "./pipeline";
import { P, store } from "./store";
import type { Providers } from "../providers/types";
import { MissingCredentialsError } from "../providers/types";
import { silentTts } from "../audio/silent";

export const offlineProviders = (): Providers => {
  const fail = () => {
    throw new MissingCredentialsError("Script & storyboard generation", ["ANTHROPIC_API_KEY"]);
  };
  return {
    llm: { name: "none", model: "none", direction: fail, script: fail, storyboard: fail, rewriteScene: fail },
    images: null,
    video: null,
    stock: null,
    tts: silentTts,
    sfx: null,
  };
};

export const runDemos = async (opts: { only?: string[]; fresh?: boolean; skipExport?: boolean; onEvent?: (e: PipelineEvent) => void } = {}) => {
  const results: { id: string; status: string; dir: string }[] = [];
  for (const demo of DEMOS) {
    if (opts.only?.length && !opts.only.some((o) => demo.id.includes(o))) continue;
    const exists = fs.existsSync(P(demo.id).metadata);
    if (exists && opts.fresh) fs.rmSync(P(demo.id).dir, { recursive: true, force: true });
    if (!exists || opts.fresh) {
      createProject(demo.request, { id: demo.id, mode: "offline-demo", providers: { llm: "predefined storyboard (no API call)", images: "procedural (local)", video: "none", stock: "none", tts: "silent demo (estimated timing)", music: "procedural (local)" } });
    } else {
      // keep everything the user edited; just make sure later stages run again
      const m = store.manifest(demo.id);
      for (const s of m.stages) if (["preview", "quality", "save", "export"].includes(s.name)) s.status = "pending";
      store.saveManifest(demo.id, m);
    }
    const meta = await runPipeline(demo.id, {
      providers: offlineProviders(),
      preset: { direction: demo.direction, storyboard: demo.storyboard, source: "demo" },
      offlineDemo: true,
      skipExport: opts.skipExport,
      onEvent: opts.onEvent,
    });
    results.push({ id: demo.id, status: meta.status, dir: P(demo.id).dir });
  }
  return results;
};
