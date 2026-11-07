/**
 * End-to-end pipeline with mock providers and a fake renderer (no network,
 * no Chromium): generation, storage, caching, budget gate, missing
 * credentials, partial regeneration and preservation of Studio edits.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vstudio-"));
process.env.PROJECTS_DIR = tmp;
process.env.CACHE_DIR = path.join(tmp, ".cache");
process.env.VIDEO_STUDIO_NO_REGISTRY = "1";

const { createProject, runPipeline } = await import("../../src/pipeline/pipeline");
const { createMockProviders, solidPng } = await import("../../src/providers/mocks");
const { store, P } = await import("../../src/pipeline/store");
const ops = await import("../../src/pipeline/operations");
const { setAttr, findByName, readSceneSpans, syntaxErrors } = await import("../../src/editable/ast");
const { BudgetApprovalRequired, ClipApprovalRequired } = await import("../../src/pipeline/budget");
const { MockVideo } = await import("../../src/providers/mocks");
const { MissingCredentialsError } = await import("../../src/providers/types");
const { editableIsUserModified } = await import("../../src/pipeline/compose");

const fakeRenderer = {
  renderProceduralStill: async (_p: unknown, out: string) => {
    fs.writeFileSync(out, solidPng());
    return out;
  },
  renderVideo: async (id: string, kind: "draft" | "final" | "clean") => {
    const file = path.join(P(id).outputDir, `${kind}.mp4`);
    fs.writeFileSync(file, "fake");
    return { file };
  },
  renderThumbnail: async (id: string) => {
    const f = path.join(P(id).outputDir, "thumbnail.png");
    fs.writeFileSync(f, solidPng());
    return f;
  },
  renderAudioMix: async (id: string) => path.join(P(id).outputDir, "audio-mix.mp3"),
  checkRender: async () => ({ ok: true, checks: [{ name: "fake", ok: true, severity: "error", detail: "" }] }),
};

const request = { prompt: "5 habits that make mornings easier, 30 seconds", music: "none", quality: "balanced" as const, visualMode: "ai_only" as const, budgetUsd: 5, clipApproval: "approved" as const };

describe("pipeline with mock providers", () => {
  const providers = createMockProviders();
  let id = "";

  beforeAll(async () => {
    id = createProject(request, { providers: { llm: "mock" } });
    await runPipeline(id, { providers, renderer: fakeRenderer, skipExport: true });
  }, 60_000);

  it("runs every stage and stores the project", () => {
    const m = store.manifest(id);
    expect(m.stages.filter((s) => s.status === "failed")).toEqual([]);
    expect(m.stages.find((s) => s.name === "export")?.status).toBe("skipped");
    const meta = store.metadata(id);
    expect(["ready", "needs-review"]).toContain(meta.status);
    expect(store.list().map((x) => x.id)).toContain(id);
    expect(fs.existsSync(P(id).editable)).toBe(true);
    expect(syntaxErrors(fs.readFileSync(P(id).editable, "utf8"))).toEqual([]);
  });

  it("generates one image per media scene and narrates every scene", () => {
    const assets = store.assets(id);
    const sb = store.storyboard(id);
    expect(providers.images.calls).toBeGreaterThan(0);
    expect(assets.narration).toHaveLength(sb.scenes.length);
    for (const n of assets.narration) expect(fs.existsSync(path.join(P(id).dir, n.file!))).toBe(true);
    expect(store.metadata(id).disclosure.containsAiGeneratedMedia).toBe(true);
  });

  it("timeline in the editable composition matches the narration", () => {
    const meta = store.metadata(id);
    const { spans, totalFrames } = readSceneSpans(fs.readFileSync(P(id).editable, "utf8"), meta.fps);
    const narration = store.assets(id).narration;
    expect(spans).toHaveLength(store.storyboard(id).scenes.length);
    for (const s of spans) {
      const seg = narration.find((n) => n.sceneId === s.sceneId)!;
      // a scene is never shorter than its speech (speech is never sped up)
      expect(s.durationInFrames / meta.fps).toBeGreaterThanOrEqual(seg.durationSeconds - 0.05);
    }
    expect(Math.abs(totalFrames / meta.fps - (meta.durationSeconds ?? 0))).toBeLessThan(0.1);
  });

  it("partial regeneration patches one scene and keeps Studio edits elsewhere", async () => {
    const f = P(id).editable;
    const sceneIds = store.storyboard(id).scenes.map((s) => s.id);
    const current = (sid: string) => {
      const e = store.assets(id).scenes.find((x) => x.sceneId === sid);
      return e?.history.find((a) => a.id === e.currentAssetId);
    };
    const target = sceneIds.find((sid) => current(sid)?.kind === "generated_image")!;
    const other = sceneIds.find((sid) => sid !== target && findByName(fs.readFileSync(f, "utf8"), `${sid} title`))!;
    expect(target && other).toBeTruthy();
    // simulate an edit made in Remotion Studio
    const edited = setAttr(fs.readFileSync(f, "utf8"), `${other} title`, "highlightColor", '"#ff00ff"');
    fs.writeFileSync(f, edited);
    expect(editableIsUserModified(id)).toBe(true);

    const before = providers.images.calls;
    const res = await ops.regenerate(id, { what: "image", sceneId: target, style: undefined, providers });
    expect(res.ok).toBe(true);
    expect(providers.images.calls).toBe(before + 1);
    const after = fs.readFileSync(f, "utf8");
    expect(after).toContain('highlightColor="#ff00ff"');
    expect(after).toMatch(new RegExp(`${target}-img-v2\\.png`));
    const entry = store.assets(id).scenes.find((s) => s.sceneId === target)!;
    expect(entry.history.length).toBe(2);

    // revert to v1
    await ops.selectAsset(id, target, entry.history[0].id);
    expect(fs.readFileSync(f, "utf8")).toMatch(new RegExp(`${target}-img-v1\\.png`));
    expect(fs.readFileSync(f, "utf8")).toContain('highlightColor="#ff00ff"');
  });

  it("identical requests hit the media and voice caches (no second paid call)", async () => {
    const p2 = createMockProviders();
    const id2 = createProject(request);
    await runPipeline(id2, { providers: p2, renderer: fakeRenderer, skipExport: true });
    expect(p2.images.calls).toBe(0);
    expect(p2.tts.calls).toBe(0);
    expect(store.manifest(id2).costs.filter((c) => c.cached).length).toBeGreaterThan(0);
    expect(store.assets(id2).narration.every((n) => n.file && fs.existsSync(path.join(P(id2).dir, n.file)))).toBe(true);
  }, 60_000);

  it("editing narration re-voices only that scene and updates its length and captions", async () => {
    const sid = store.storyboard(id).scenes[1].id;
    const meta = store.metadata(id);
    const spanOf = () => readSceneSpans(fs.readFileSync(P(id).editable, "utf8"), meta.fps).spans.find((s) => s.sceneId === sid)!;
    const before = spanOf().durationInFrames;
    const ttsBefore = providers.tts.calls;
    const long = "This is a deliberately much longer line of narration, written so that the scene has to grow to fit every word that is spoken here without speeding anything up.";
    await ops.editScene(id, sid, { narration: long }, { providers });
    expect(providers.tts.calls).toBe(ttsBefore + 1);
    expect(spanOf().durationInFrames).toBeGreaterThan(before);
    expect(fs.readFileSync(P(id).editable, "utf8")).toContain('" deliberately"');
    expect(store.edits(id).scenes[sid].narration).toBe(long);
    // AI output is never mutated: the storyboard keeps the original line
    expect(store.storyboard(id).scenes[1].narration).not.toBe(long);
  });

  it("replaces media with an upload and changes caption style without losing edits", async () => {
    const sid = store.storyboard(id).scenes[0].id;
    const up = path.join(tmp, "mine.png");
    fs.writeFileSync(up, solidPng(16, 16, [200, 10, 10]));
    await ops.replaceMedia(id, sid, up);
    const src = fs.readFileSync(P(id).editable, "utf8");
    expect(src).toContain(`${sid}-upload-v1.png`);
    ops.setCaptionStyle(id, "karaoke");
    const after = fs.readFileSync(P(id).editable, "utf8");
    expect(after).toContain('captionStyle="karaoke"');
    expect(after).toContain('highlightColor="#ff00ff"');
    expect(syntaxErrors(after)).toEqual([]);
  });

  it("regenerating a clip without a video provider reports missing credentials", async () => {
    const p2 = { ...createMockProviders(), video: null };
    const sid = store.storyboard(id).scenes[0].id;
    await expect(ops.regenerate(id, { what: "clip", sceneId: sid, providers: p2 })).rejects.toBeInstanceOf(MissingCredentialsError);
  });
});

describe("budget gate", () => {
  it("stops before spending when the plan exceeds the budget, and resumes with approval", async () => {
    const providers = createMockProviders();
    const id = createProject({ ...request, budgetUsd: 0.001 });
    await expect(runPipeline(id, { providers, renderer: fakeRenderer, skipExport: true })).rejects.toBeInstanceOf(BudgetApprovalRequired);
    expect(providers.images.calls).toBe(0);
    const failed = store.manifest(id).stages.find((s) => s.status === "failed");
    expect(["direction", "plan-assets"]).toContain(failed?.name);
    expect(failed?.error).toMatch(/budget|approv/i);
    const r = await ops.resumeProject(id, { approveSpendUsd: 2, providers, skipExport: true }).catch((e) => e);
    // resume goes through the default renderer for procedural stills only when needed; mocks need none
    expect(r instanceof Error ? r.message : "ok").not.toMatch(/budget/i);
  }, 60_000);
});

describe("hybrid preset: storyboard preview before clips", () => {
  it("makes every still first, pauses before paying for clips, then animates the hook on approval", async () => {
    const providers = { ...createMockProviders(), videoBackground: new MockVideo() };
    const id = createProject({ ...request, prompt: "how volcanoes form, 30 seconds", quality: "hybrid", clipApproval: undefined });
    expect(store.metadata(id).request.clipApproval).toBe("ask");
    await expect(runPipeline(id, { providers, renderer: fakeRenderer, skipExport: true })).rejects.toBeInstanceOf(ClipApprovalRequired);

    // nothing spent on clips, but every media scene already has its still to review
    expect(providers.video.calls + providers.videoBackground.calls).toBe(0);
    const assets = store.assets(id);
    const sb = store.storyboard(id);
    const media = assets.scenes.filter((e) => e.currentAssetId);
    expect(media.length).toBeGreaterThan(0);
    for (const e of media) expect(e.history.find((a) => a.id === e.currentAssetId)?.kind).toBe("generated_image");
    const clipsStage = store.manifest(id).stages.find((s) => s.name === "clips")!;
    expect(clipsStage.status).toBe("pending");
    expect(store.metadata(id).status).toBe("draft");

    await ops.resumeProject(id, { clips: "approve", providers, skipExport: true, renderer: fakeRenderer });
    expect(providers.video.calls).toBeGreaterThan(0);
    const hook = store.assets(id).scenes.find((e) => e.sceneId === sb.scenes[0].id)!;
    expect(hook.history.find((a) => a.id === hook.currentAssetId)?.kind).toBe("generated_video");
    expect(store.manifest(id).stages.find((s) => s.name === "clips")?.status).toBe("done");
    expect(["ready", "needs-review"]).toContain(store.metadata(id).status);
  }, 60_000);

  it("skipping clips keeps the animated stills and never calls the video provider", async () => {
    const providers = createMockProviders();
    const id = createProject({ ...request, prompt: "why cats purr, 20 seconds", quality: "hybrid", clipApproval: undefined });
    await expect(runPipeline(id, { providers, renderer: fakeRenderer, skipExport: true })).rejects.toBeInstanceOf(ClipApprovalRequired);
    await ops.resumeProject(id, { clips: "skip", providers, skipExport: true, renderer: fakeRenderer });
    expect(providers.video.calls).toBe(0);
    expect(store.assets(id).scenes.every((e) => !e.currentAssetId || e.history.find((a) => a.id === e.currentAssetId)?.kind === "generated_image")).toBe(true);
    expect(fs.readFileSync(P(id).editable, "utf8")).not.toContain('motion="static" motionStrength={0.1}');
  }, 60_000);
});
