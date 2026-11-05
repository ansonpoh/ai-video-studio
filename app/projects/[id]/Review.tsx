"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewPayload } from "../../../src/web/server";
import { BudgetApproval, ModeBadge, Progress, StageList, StatusBadge, Toast, fileUrl, fmtDuration, post, usd, type Budget } from "../../_components/ui";

type Capability = { name: string; available: boolean; detail: string; envVars: string[] };
type Pending = { pending: true; id: string; job: ReviewPayload["job"]; progress: ReviewPayload["progress"] };
type Data = ReviewPayload | Pending;
type SceneT = ReviewPayload["scenes"][number];
type AssetT = NonNullable<SceneT["assets"]>["history"][number];
type ToastT = { kind: "error" | "success" | "info"; text: string } | null;
type Approval = { budget: Budget; retry: (usd: number) => Promise<void> } | null;

const isPending = (d: Data | null): d is Pending => Boolean(d && "pending" in d);

const thumbClass = (ratio: string) => ({ "16:9": "landscape", "1:1": "square", "4:5": "portrait45" })[ratio] ?? "";

const isVideoAsset = (a: AssetT) => a.kind === "generated_video" || a.kind === "stock_video" || (a.kind === "uploaded" && a.mediaType === "video");

const ASSET_LABEL: Record<string, string> = {
  generated_image: "AI image",
  generated_video: "AI clip",
  stock_image: "Stock photo",
  stock_video: "Stock clip",
  procedural_image: "Procedural still",
  uploaded: "Your upload",
};

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function Review({ id, initial, capabilities, captionStyles }: { id: string; initial: ReviewPayload | null; capabilities: Capability[]; captionStyles: readonly string[] }) {
  const [data, setData] = useState<Data | null>(initial);
  const [toast, setToast] = useState<ToastT>(null);
  const [approval, setApproval] = useState<Approval>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ url: string; running: boolean; starting?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((t: ToastT) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (t) toastTimer.current = setTimeout(() => setToast(null), t.kind === "error" ? 9000 : 5000);
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, [id]);

  const job = data?.job ?? null;
  const progress = data?.progress ?? null;
  const meta = isPending(data) ? null : data?.meta;
  const recentProgress = progress ? Date.now() - new Date(progress.at).getTime() < 120_000 : false;
  const active = job?.status === "running" || isPending(data) || (meta?.status === "generating" && recentProgress);

  // live progress while a job runs; a slow refresh otherwise (CLI / Studio edits)
  useEffect(() => {
    const t = setInterval(refresh, active ? 1500 : 10_000);
    return () => clearInterval(t);
  }, [active, refresh]);

  // tell the user when a background job ends
  const lastJob = useRef<{ id: string; status: string } | null>(job ? { id: job.id, status: job.status } : null);
  useEffect(() => {
    if (!job) return;
    const prev = lastJob.current;
    if (prev && prev.id === job.id && prev.status === "running" && job.status !== "running") {
      if (job.status === "done") say({ kind: "success", text: `${job.label}: done` });
      else if (!job.budget) say({ kind: "error", text: `${job.label} failed: ${job.error ?? "see the job log"}` });
    }
    lastJob.current = { id: job.id, status: job.status };
  }, [job, say]);

  useEffect(() => {
    fetch("/api/studio", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => setStudio({ url: s.url, running: s.running }))
      .catch(() => null);
  }, []);

  /** Runs an action; 402 opens the approval dialog, 202 means a background job started. */
  const act = useCallback(
    async (key: string, url: string, body: unknown, done?: string): Promise<boolean> => {
      setBusy(key);
      try {
        const { status, data: res } = await post<{ message?: string; ok?: boolean; job?: { label: string } }>(url, body);
        if (status === 402 && res.budget) {
          setApproval({
            budget: res.budget,
            retry: async (amount) => {
              setApproval(null);
              const b = body instanceof FormData ? body : { ...(body as object), approveSpendUsd: amount };
              await act(key, url, b, done);
            },
          });
          return false;
        }
        if (status >= 400) {
          say({ kind: "error", text: res.error ?? `Request failed (${status})` });
          return false;
        }
        if (status === 202 && res.job) say({ kind: "info", text: `${res.job.label}… running in the background` });
        else say({ kind: res.ok === false ? "error" : "success", text: res.message ?? done ?? "Done" });
        await refresh();
        return res.ok !== false;
      } finally {
        setBusy(null);
      }
    },
    [refresh, say],
  );

  const capOn = (prefix: string) => Boolean(capabilities.find((c) => c.name.startsWith(prefix))?.available);

  if (!data) return null;

  if (isPending(data)) {
    return (
      <main className="page">
        <div className="panel" style={{ maxWidth: 760 }}>
          <div className="panel-head">
            <h2>{job?.status === "failed" ? "Could not create the project" : "Creating project…"}</h2>
          </div>
          {job?.status === "failed" ? (
            <div className="notice danger">
              <span>✗</span>
              <div className="grow">{job.error}</div>
            </div>
          ) : (
            <Progress indeterminate />
          )}
          {job?.logTail && <pre className="log" style={{ marginTop: 14 }}>{job.logTail}</pre>}
          <p style={{ marginTop: 14 }}>
            <Link href="/new">← Back to the create screen</Link>
          </p>
        </div>
      </main>
    );
  }

  const d = data as ReviewPayload;
  const m = d.meta;
  const offlineProject = m.mode === "offline-demo" || m.request.offline;
  const running = job?.status === "running";
  const locked = running || Boolean(busy);
  const imagesOn = capOn("AI images") && !offlineProject;
  const clipsOn = capOn("AI video") && !offlineProject;
  const llmOn = capOn("Script") && !offlineProject;
  const failedStage = d.stages.find((s) => s.status === "failed");
  const finalStale = m.status === "ready" && d.outputs.includes("final.mp4");
  const currentCaption = d.edits.captionStyle ?? m.direction?.captionStyle ?? "minimal";

  const approveJob = async (amount: number) => {
    if (!job) return;
    await act("approve", `/api/projects/${id}/resume`, { approveSpendUsd: amount, retryJobId: job.kind === "regenerate" ? job.id : undefined });
  };

  const launchStudio = async () => {
    setStudio((s) => ({ url: s?.url ?? "http://localhost:3001", running: false, starting: true }));
    const { status, data: r } = await post<{ url: string; running: boolean; started: boolean }>("/api/studio");
    if (status >= 400) {
      setStudio((s) => (s ? { ...s, starting: false } : s));
      return say({ kind: "error", text: r.error ?? "Could not start Remotion Studio" });
    }
    // wait for the port to open
    for (let i = 0; i < 40; i++) {
      const s = await fetch("/api/studio", { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (s?.running) {
        setStudio({ url: s.url, running: true });
        window.open(`${s.url}/${id}`, "_blank", "noopener");
        return;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    setStudio({ url: r.url, running: false });
    say({ kind: "error", text: "Studio did not start within a minute; see .cache/jobs/studio.log" });
  };

  return (
    <main className="page">
      <div className="review-head">
        <div style={{ minWidth: 0 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            <Link href="/">Library</Link> / <span className="mono">{m.id}</span>
          </div>
          <h1>{m.title}</h1>
          <div className="row" style={{ gap: 6 }}>
            <StatusBadge status={m.status} running={running} />
            <ModeBadge mode={m.mode} />
            <span className="badge outline">{m.request.aspectRatio}</span>
            {m.durationSeconds ? <span className="badge outline">{fmtDuration(m.durationSeconds)}</span> : null}
            <span className="badge outline" style={{ textTransform: "capitalize" }}>
              {m.request.quality}
            </span>
            <span className="small faint">created {ago(m.createdAt)}</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" disabled={locked} onClick={() => act("resume", `/api/projects/${id}/resume`, {})} title="Run any unfinished pipeline stages">
            Resume pipeline
          </button>
          <button className="btn primary" disabled={locked || !d.editable.exists} onClick={() => act("render", `/api/projects/${id}/render`, { kinds: ["final", "clean", "audio", "thumbnail", "captions"] })}>
            Render final
          </button>
        </div>
      </div>

      {(running || (m.status === "generating" && recentProgress)) && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h2>{job?.label ?? "Generating"}</h2>
            <span className="hint">{progress ? `${progress.stage}${progress.message ? `: ${progress.message}` : ""}` : "starting…"}</span>
          </div>
          <Progress value={progress?.progress} indeterminate={!progress?.progress} />
        </div>
      )}

      {job?.status === "failed" && job.budget && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <BudgetApproval budget={job.budget} busy={locked} onApprove={approveJob} title={`${job.label} is waiting for your approval`} />
        </div>
      )}
      {job?.status === "failed" && !job.budget && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          <span>✗</span>
          <div className="grow">
            <b>{job.label} failed</b>
            <p>{job.error}</p>
          </div>
          <button className="btn sm" disabled={locked} onClick={() => act("resume", `/api/projects/${id}/resume`, job.kind === "regenerate" ? { retryJobId: job.id } : {})}>
            Retry
          </button>
        </div>
      )}
      {failedStage && !(job?.status === "failed") && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          <span>✗</span>
          <div className="grow">
            <b>Stage “{failedStage.name}” failed</b>
            <p>{failedStage.error}</p>
          </div>
        </div>
      )}
      {d.editable.userModified && (
        <div className="notice info" style={{ marginBottom: 16 }}>
          <span>✎</span>
          <div className="grow">
            <b>editable/Video.tsx has your own edits.</b>
            <p>Regenerating a scene patches only that scene&apos;s elements, so your Studio changes elsewhere are kept. Render final to bake them into the MP4.</p>
          </div>
        </div>
      )}
      {finalStale && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <span>↻</span>
          <div className="grow">The project changed since final.mp4 was rendered. The preview shows the last render; click “Render final” to update it.</div>
        </div>
      )}

      <div className="review-layout">
        <div className="review-side">
          <div className="player">
            {d.video ? (
              <video key={`${d.video.file}-${d.video.version}`} controls preload="metadata" playsInline poster={d.downloads.some((x) => x.file === "output/thumbnail.png") ? fileUrl(id, "output/thumbnail.png", `?v=${d.video.version}`) : undefined} style={{ aspectRatio: `${m.width} / ${m.height}` }}>
                <source src={fileUrl(id, d.video.file, `?v=${d.video.version}`)} type="video/mp4" />
              </video>
            ) : (
              <div className="none">{running ? "The preview appears after the draft render." : "No render yet."}</div>
            )}
          </div>
          {d.video && (
            <div className="small muted" style={{ marginTop: -8 }}>
              Showing {d.video.isFinal ? "final.mp4" : "draft.mp4 (draft preview)"}
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>Disclosure & review</h2>
              {m.requiresReview && <span className="badge warn">Needs review</span>}
            </div>
            <div className="notice" style={{ marginBottom: m.contentFlags.length ? 12 : 0 }}>
              <span>ⓘ</span>
              <div className="grow">
                <b>{m.disclosure.label || "No disclosure label yet"}</b>
                <p className="small muted">
                  AI script: {m.disclosure.containsAiScript ? "yes" : "no"} · AI media: {m.disclosure.containsAiGeneratedMedia ? "yes" : "no"} · AI voice: {m.disclosure.containsAiVoice ? "yes" : "no"}
                </p>
              </div>
            </div>
            {m.contentFlags.length === 0 ? (
              <p className="small muted" style={{ margin: "10px 0 0" }}>
                No content flags.
              </p>
            ) : (
              <div>
                {m.contentFlags.map((f, i) => (
                  <div key={i} className="flag">
                    <span className={`badge ${f.severity === "blocker" ? "danger" : f.severity === "review" ? "warn" : ""}`}>{f.severity}</span>
                    <div>
                      <b>{f.kind}</b>
                      {f.sceneId ? <span className="mono faint"> {f.sceneId}</span> : null}
                      <div className="muted">{f.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Downloads</h2>
            </div>
            {d.downloads.length ? (
              <div className="downloads">
                {d.downloads.map((f) => (
                  <a key={f.file} href={fileUrl(id, f.file, "?download=1")}>
                    <span>{f.label}</span>
                    <span>{f.file.split(".").pop()}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Nothing rendered yet.
              </p>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-head" style={{ padding: "16px 16px 0", marginBottom: 4 }}>
              <h2>Storyboard</h2>
              <span className="hint">
                {d.scenes.length} scenes · v{m.storyboardVersion}
              </span>
            </div>
            {d.scenes.length === 0 && <p className="muted" style={{ padding: 16, margin: 0 }}>The storyboard appears once the script stage finishes.</p>}
            {d.scenes.map((s) => (
              <SceneCard key={s.id} id={id} scene={s} ratio={m.request.aspectRatio} fps={m.fps} locked={locked} busy={busy} act={act} can={{ image: imagesOn, clip: clipsOn, rewrite: llmOn }} />
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Project settings</h2>
              <span className="hint">patched into editable/Video.tsx</span>
            </div>
            <ProjectSettings id={id} locked={locked} act={act} captionsEnabled={m.request.captions} currentCaption={currentCaption} captionStyles={captionStyles} voice={d.edits.voiceId ?? m.request.voiceId ?? ""} ttsLive={capOn("Narration") && !offlineProject} />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Open in Remotion Studio</h2>
              {studio?.running && <span className="badge ok">running on :3001</span>}
            </div>
            <dl className="kv">
              <dt>Command</dt>
              <dd>
                <code>npm run studio</code>
              </dd>
              <dt>Composition</dt>
              <dd>
                <code>{m.id}</code>
              </dd>
              <dt>Source</dt>
              <dd>
                <code>projects/{m.id}/{d.editable.path}</code>
              </dd>
            </dl>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" disabled={studio?.starting} onClick={launchStudio}>
                {studio?.starting ? "Starting Studio…" : studio?.running ? "Open Studio" : "Launch Studio"}
              </button>
              {studio?.running && (
                <a href={`${studio.url}/${m.id}`} target="_blank" rel="noreferrer" className="small">
                  {studio.url}/{m.id}
                </a>
              )}
            </div>
            <p className="small faint" style={{ margin: "10px 0 0" }}>
              Edits you save in Studio are kept: regeneration only touches the elements of the scene you regenerate.
            </p>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Pipeline</h2>
              <span className="hint">{d.stages.filter((s) => s.status === "done" || s.status === "skipped").length} / {d.stages.length} stages</span>
            </div>
            <StageList stages={d.stages} current={progress} />
            {job && (
              <details style={{ marginTop: 14 }}>
                <summary>
                  Last job: {job.label} · {job.status} · {ago(job.startedAt)}
                </summary>
                <pre className="log">{job.logTail || "(no output yet)"}</pre>
              </details>
            )}
            {d.log.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary>Pipeline log ({d.log.length})</summary>
                <pre className="log">{d.log.map((l) => `${l.at.slice(11, 19)} ${l.level.padEnd(5)} ${l.stage}: ${l.message}`).join("\n")}</pre>
              </details>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Costs</h2>
              <span className="hint">{d.costs.cachedHits} cached hits</span>
            </div>
            <div className="estimate">
              <span className="amt">{usd(d.costs.totalUsd)}</span>
              <span className="small muted">
                budget {m.request.budgetUsd !== undefined ? usd(m.request.budgetUsd) : "default"}
                {m.request.approveSpendUsd !== undefined ? ` · approved ${usd(m.request.approveSpendUsd)}` : ""}
              </span>
            </div>
            {Object.keys(d.costs.byCategory).length > 0 ? (
              <table className="simple" style={{ marginTop: 10 }}>
                <tbody>
                  {Object.entries(d.costs.byCategory).map(([k, v]) => (
                    <tr key={k}>
                      <td className="muted">{k}</td>
                      <td className="num">{usd(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted" style={{ margin: "10px 0 0" }}>
                No paid calls recorded.
              </p>
            )}
            <dl className="kv" style={{ marginTop: 14 }}>
              {Object.entries(m.providers).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd className="small">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {approval && (
        <div className="modal-backdrop" onClick={() => setApproval(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <BudgetApproval budget={approval.budget} busy={Boolean(busy)} onApprove={approval.retry} onCancel={() => setApproval(null)} />
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}

type Act = (key: string, url: string, body: unknown, done?: string) => Promise<boolean>;

function ProjectSettings({ id, locked, act, captionsEnabled, currentCaption, captionStyles, voice, ttsLive }: { id: string; locked: boolean; act: Act; captionsEnabled: boolean; currentCaption: string; captionStyles: readonly string[]; voice: string; ttsLive: boolean }) {
  const [caption, setCaption] = useState(currentCaption);
  const [voiceId, setVoiceId] = useState(voice);
  useEffect(() => setCaption(currentCaption), [currentCaption]);
  return (
    <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Caption style</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!captionsEnabled}>
            {captionStyles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn" disabled={locked || !captionsEnabled || caption === currentCaption} onClick={() => act("caption", `/api/projects/${id}/caption-style`, { style: caption })}>
            Apply
          </button>
        </div>
        <span className="field-help">{captionsEnabled ? "Restyles every scene's captions; timings stay." : "Captions are off for this project."}</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Narration voice</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="ElevenLabs voice id" />
          <button className="btn" disabled={locked || !voiceId.trim() || voiceId.trim() === voice} onClick={() => act("voice", `/api/projects/${id}/voice`, { voiceId: voiceId.trim() })}>
            Apply
          </button>
        </div>
        <span className="field-help">{ttsLive ? "Re-synthesizes narration for all scenes (costs apply)." : "Narration is silent here (no ElevenLabs); only timing is rebuilt."}</span>
      </div>
    </div>
  );
}

type Drawer = null | "edit" | "rewrite" | "versions";

function SceneCard({ id, scene: s, ratio, fps, locked, busy, act, can }: { id: string; scene: SceneT; ratio: string; fps: number; locked: boolean; busy: string | null; act: Act; can: { image: boolean; clip: boolean; rewrite: boolean } }) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [title, setTitle] = useState(s.title ?? "");
  const [ost, setOst] = useState(s.onScreenText ?? "");
  const [narr, setNarr] = useState(s.narration);
  const [instruction, setInstruction] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (drawer !== "edit") {
      setTitle(s.title ?? "");
      setOst(s.onScreenText ?? "");
      setNarr(s.narration);
    }
  }, [s.title, s.onScreenText, s.narration, drawer]);

  const history = s.assets?.history ?? [];
  const current = history.find((h) => h.id === s.assets?.currentAssetId) ?? null;
  const k = (what: string) => `${s.id}:${what}`;
  const working = (what: string) => busy === k(what);

  const regen = (what: string, extra: Record<string, unknown> = {}) => act(k(what), `/api/projects/${id}/regenerate`, { what, sceneId: s.id, ...extra });

  const saveEdit = async () => {
    const body: Record<string, string> = { sceneId: s.id };
    if (title !== (s.title ?? "")) body.title = title;
    if (ost !== (s.onScreenText ?? "")) body.onScreenText = ost;
    if (narr !== s.narration) body.narration = narr;
    if (Object.keys(body).length === 1) return setDrawer(null);
    if (await act(k("edit"), `/api/projects/${id}/edit`, body)) setDrawer(null);
  };

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.set("sceneId", s.id);
    fd.set("file", f);
    await act(k("replace"), `/api/projects/${id}/replace`, fd);
    if (fileInput.current) fileInput.current.value = "";
  };

  const thumb = () => {
    if (current) {
      const src = fileUrl(id, current.file);
      return isVideoAsset(current) ? <video src={src} muted loop playsInline preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => null)} onMouseLeave={(e) => e.currentTarget.pause()} /> : <img src={src} alt={s.visual.description} loading="lazy" />;
    }
    if (s.previewFrame) return <img src={fileUrl(id, s.previewFrame)} alt={s.visual.description} loading="lazy" />;
    return <div className="art">Live motion graphics{s.visual.art ? ` · ${s.visual.art}` : ""}</div>;
  };

  return (
    <div className="scene">
      <div className={`scene-thumb ${thumbClass(ratio)}`}>
        {thumb()}
        <span className="badge tag">{current ? ASSET_LABEL[current.kind] : s.previewFrame ? "Preview frame" : "Motion graphics"}</span>
      </div>
      <div className="scene-main">
        <div className="scene-top">
          <span className="sid">{s.id}</span>
          <span className="badge outline">{s.layout.replace(/_/g, " ")}</span>
          <span className="badge outline">{s.purpose}</span>
          {s.span && <span className="small faint">{(s.span.durationInFrames / fps).toFixed(1)}s</span>}
          {s.edited && <span className="badge accent">edited</span>}
          {s.narrationSegment?.timing === "estimated" && <span className="badge outline" title="No narration audio; caption timing is estimated">silent</span>}
        </div>
        {s.title && <div className="stitle">{s.title}</div>}
        <p className="scene-narr">{s.narration || <span className="faint">(no narration)</span>}</p>
        {s.onScreenText && <div className="scene-ost">On screen: “{s.onScreenText}”</div>}
        {s.assets?.lastError && (
          <div className="notice danger small">
            <span>✗</span>
            <div className="grow">Last media attempt failed: {s.assets.lastError}</div>
          </div>
        )}

        <div className="scene-actions">
          <button className={`btn sm${drawer === "edit" ? " primary" : ""}`} disabled={locked} onClick={() => setDrawer(drawer === "edit" ? null : "edit")}>
            Edit text
          </button>
          <button className="btn sm" disabled={locked || !can.image} title={can.image ? "Generate a new image for this scene" : "Image generation is not configured (OPENAI_API_KEY) or the project is offline"} onClick={() => regen("image")}>
            {working("image") ? "Starting…" : "New image"}
          </button>
          <button className="btn sm" disabled={locked || !can.clip} title={can.clip ? "Generate an AI video clip" : "Video clips are not configured (FAL_KEY) or the project is offline"} onClick={() => regen("clip")}>
            New clip
          </button>
          <button className="btn sm" disabled={locked} title="Re-synthesize this scene's narration and caption timing" onClick={() => regen("narration")}>
            Redo narration
          </button>
          <button className={`btn sm${drawer === "rewrite" ? " primary" : ""}`} disabled={locked || !can.rewrite} title={can.rewrite ? "Rewrite this scene with an instruction" : "Rewrites need ANTHROPIC_API_KEY (and a non-offline project)"} onClick={() => setDrawer(drawer === "rewrite" ? null : "rewrite")}>
            Rewrite…
          </button>
          <button className="btn sm" disabled={locked} onClick={() => fileInput.current?.click()}>
            {working("replace") ? "Uploading…" : "Replace media"}
          </button>
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className={`btn sm${drawer === "versions" ? " primary" : ""}`} disabled={locked && drawer !== "versions"} onClick={() => setDrawer(drawer === "versions" ? null : "versions")}>
            Versions ({history.length})
          </button>
        </div>

        {drawer === "edit" && (
          <div className="scene-drawer">
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="field">
                <span>Title</span>
                <input type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>On-screen text</span>
                <input type="text" value={ost} maxLength={140} onChange={(e) => setOst(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Narration</span>
              <textarea value={narr} onChange={(e) => setNarr(e.target.value)} rows={3} />
              <span className="field-help">Changing narration re-synthesizes this scene&apos;s voice and caption timing; other scenes are untouched.</span>
            </label>
            <div className="row">
              <button className="btn primary sm" disabled={locked} onClick={saveEdit}>
                {working("edit") ? "Saving…" : "Save"}
              </button>
              <button className="btn ghost sm" onClick={() => setDrawer(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {drawer === "rewrite" && (
          <div className="scene-drawer">
            <label className="field">
              <span>Instruction</span>
              <input type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. make it punchier and mention the speed of light" />
            </label>
            <div className="row">
              <button
                className="btn primary sm"
                disabled={locked || !instruction.trim()}
                onClick={async () => {
                  if (await regen("script", { instruction: instruction.trim() })) setDrawer(null);
                }}
              >
                Rewrite scene
              </button>
              <span className="small faint">Creates a new storyboard version; manual text edits to this scene are replaced.</span>
            </div>
          </div>
        )}

        {drawer === "versions" && (
          <div className="scene-drawer">
            <div className="versions">
              <div className={`version${!s.assets?.currentAssetId ? " current" : ""}`}>
                <div className="vph" />
                <div className="vinfo">
                  <div>
                    <b>Live motion graphics</b>
                  </div>
                  <div className="faint">Rendered by the composition, no media file</div>
                </div>
                {!s.assets?.currentAssetId ? (
                  <span className="badge accent">current</span>
                ) : (
                  <button className="btn sm" disabled={locked} onClick={() => act(k("revert"), `/api/projects/${id}/revert`, { sceneId: s.id, assetId: "none" })}>
                    Use
                  </button>
                )}
              </div>
              {[...history].reverse().map((a) => (
                <div key={a.id} className={`version${a.id === s.assets?.currentAssetId ? " current" : ""}`}>
                  {isVideoAsset(a) ? <video className="vph" src={fileUrl(id, a.file)} muted preload="metadata" /> : <img src={fileUrl(id, a.file)} alt="" loading="lazy" />}
                  <div className="vinfo">
                    <div>
                      <b>{ASSET_LABEL[a.kind]}</b> <span className="mono faint">{a.file.split("/").pop()}</span>
                    </div>
                    <div className="faint">
                      {ago(a.createdAt)}
                      {a.costUsd ? ` · ${usd(a.costUsd)}` : ""}
                      {"provider" in a ? ` · ${a.provider}` : ""}
                      {a.kind === "uploaded" ? ` · ${a.originalName}` : ""}
                    </div>
                  </div>
                  {a.id === s.assets?.currentAssetId ? (
                    <span className="badge accent">current</span>
                  ) : (
                    <button className="btn sm" disabled={locked} onClick={() => act(k("revert"), `/api/projects/${id}/revert`, { sceneId: s.id, assetId: a.id })}>
                      Use
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
