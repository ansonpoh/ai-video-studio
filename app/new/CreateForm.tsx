"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateOptions } from "../../src/web/server";
import { BudgetApproval, Progress, StageList, post, usd, type Budget, type Stage } from "../_components/ui";

type Props = CreateOptions & {
  options: { aspectRatios: readonly string[]; styles: readonly string[]; qualities: readonly string[]; visualModes: readonly string[]; captionStyles: readonly string[] };
};

const QUALITY_TEXT: Record<string, string> = {
  economy: "Low-detail AI images on most scenes, motion graphics elsewhere, no video clips. Cheapest.",
  hybrid: "Recommended. AI stills with camera moves on most scenes, real AI clips for the hook and 2 key moments. You review the stills before paying for clips.",
  balanced: "Medium-quality images, up to 2 AI video clips, sound effects.",
  premium: "High-quality images on every scene, up to 5 AI video clips, sound effects.",
  explainer: "Narrated slides with panels and diagrams that appear as they're spoken, a few cheap AI stills, and a chapter bar. No clips or music. Up to 15 minutes.",
};

const MODE_TEXT: Record<string, string> = {
  auto: "Mix generated images, motion graphics, stock and clips",
  ai_only: "Only AI-generated or programmatic visuals (no stock)",
  stock_preferred: "Prefer licensed stock media, fall back to generated",
  procedural_only: "Motion graphics only, no paid media calls",
};

const RATIO_TEXT: Record<string, string> = { "9:16": "Vertical", "16:9": "Landscape", "1:1": "Square", "4:5": "Portrait" };

const label = (s: string) => s.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

type Started = { id: string; jobId: string };
type Poll = {
  pending?: boolean;
  meta?: { status: string };
  stages?: Stage[];
  progress?: { stage: string; status: string; progress?: number; message?: string } | null;
  job?: { id: string; status: string; error: string | null; budget: Budget | null; logTail: string } | null;
};

export function CreateForm({ options, capabilities, music, presets, prices }: Props) {
  const router = useRouter();
  const cap = (prefix: string) => capabilities.find((c) => c.name.startsWith(prefix));
  const hasLlm = Boolean(cap("Script")?.available);

  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(30);
  const [aspect, setAspect] = useState("9:16");
  const [style, setStyle] = useState("auto");
  const [quality, setQuality] = useState("hybrid");
  const [visualMode, setVisualMode] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState("auto");
  const [narration, setNarration] = useState(true);
  const [voiceId, setVoiceId] = useState("");
  const [musicChoice, setMusicChoice] = useState("auto");
  const [tracks, setTracks] = useState(music);
  const [budget, setBudget] = useState<string>(String(prices.defaultBudgetUsd));
  const [sfx, setSfx] = useState(false);
  const [offline, setOffline] = useState(!hasLlm);
  const [llm, setLlm] = useState<"anthropic" | "mock">(hasLlm ? "anthropic" : "mock");
  const [skipExport, setSkipExport] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState<Started | null>(null);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [approving, setApproving] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);

  const live = (prefix: string) => !offline && Boolean(cap(prefix)?.available);

  const choosePreset = (q: string) => {
    setQuality(q);
    if (q === "explainer") {
      setAspect("16:9");
      setSfx(false);
      setMusicChoice("none");
    } else {
      setDuration((d) => Math.min(d, 180));
    }
  };

  /** Rough guide only; the pipeline computes the real estimate after the storyboard and asks for approval if it exceeds the budget. */
  const estimate = useMemo(() => {
    const rules = presets[quality as keyof typeof presets];
    const scenes = Math.max(2, Math.round(duration / 5));
    const lines: { what: string; usd: number }[] = [];
    if (llm === "anthropic" && !offline && hasLlm) lines.push({ what: "Script & storyboard", usd: prices.llmRun });
    if (live("AI images") && visualMode !== "procedural_only" && visualMode !== "stock_preferred") {
      // Explainers use about one still per 75 seconds; the rest are slides drawn in code.
      const n = "budgetImages" in rules && rules.budgetImages ? Math.max(3, Math.round(duration / 75)) : Math.round(scenes * rules.generatedImageShare);
      if ("budgetImages" in rules && rules.budgetImages) lines.push({ what: `~${n} images (budget)`, usd: n * prices.budgetImage });
      else lines.push({ what: `~${n} images (${rules.imageQuality})`, usd: n * prices.image[rules.imageQuality] });
    }
    if (live("AI video") && visualMode !== "procedural_only" && rules.maxVideoClips > 0) {
      const n = Math.min(rules.maxVideoClips, scenes);
      lines.push({ what: `up to ${n} video clips`, usd: n * prices.clipSeconds * prices.videoPerSecond });
      if (rules.backgroundClips > 0 && prices.backgroundVideoPerSecond !== null) {
        const b = Math.min(rules.backgroundClips, Math.max(0, scenes - n));
        if (b) lines.push({ what: `up to ${b} background clips (cheaper model)`, usd: b * prices.clipSeconds * prices.backgroundVideoPerSecond });
      }
    }
    if (narration && live("Narration")) lines.push({ what: "Narration", usd: ((duration * 15) / 1000) * prices.ttsPer1kChars });
    if (sfx && live("Sound")) lines.push({ what: "Sound effects", usd: scenes * 2 * prices.sfxPerSecond });
    return { lines, total: lines.reduce((a, l) => a + l.usd, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, duration, llm, offline, visualMode, narration, sfx, capabilities]);

  // follow the job until the plan (and its estimate) is through, then go to the review screen
  useEffect(() => {
    if (!started) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/projects/${started.id}`, { cache: "no-store" }).catch(() => null);
      if (!r || stop) return;
      if (r.ok) {
        const d = (await r.json()) as Poll;
        setPoll(d);
        const planned = d.stages?.find((s) => s.name === "plan-assets")?.status === "done";
        const ended = d.job && d.job.status !== "running";
        if (planned || (ended && !d.job?.budget)) {
          router.push(`/projects/${started.id}`);
          return;
        }
      }
      if (!stop) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [started, router]);

  const submit = async () => {
    setError(null);
    if (prompt.trim().length < 3) return setError("Describe the video you want (at least a few words).");
    setSubmitting(true);
    const body = {
      prompt: prompt.trim(),
      durationSeconds: duration,
      aspectRatio: aspect,
      style,
      quality,
      visualMode,
      captions,
      captionStyle: captions ? captionStyle : "auto",
      narration,
      voiceId: voiceId.trim() || undefined,
      music: musicChoice,
      budgetUsd: budget === "" ? undefined : Number(budget),
      soundEffects: sfx,
      offline,
      llm,
      skipExport,
    };
    const { status, data } = await post<{ id: string; job: { id: string } }>("/api/projects", body);
    setSubmitting(false);
    if (status >= 400) return setError(data.error ?? "Could not start");
    setStarted({ id: data.id, jobId: data.job.id });
  };

  const approve = async (amount: number) => {
    if (!started) return;
    setApproving(true);
    const { status, data } = await post(`/api/projects/${started.id}/resume`, { approveSpendUsd: amount });
    setApproving(false);
    if (status >= 400) return setError(data.error ?? "Could not resume");
    setPoll(null);
    setStarted({ ...started });
  };

  const uploadMusic = async (f: File) => {
    const fd = new FormData();
    fd.set("file", f);
    const { status, data } = await post<{ file: string }>("/api/music", fd);
    if (status >= 400) return setError(data.error ?? "Upload failed");
    setTracks((t) => [...t.filter((x) => x.file !== data.file), { file: data.file, moods: [], license: "user-provided (unverified)" }]);
    setMusicChoice(data.file);
  };

  if (started) {
    const job = poll?.job;
    const failed = job?.status === "failed";
    return (
      <div className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-head">
          <h2>{failed ? (job?.budget ? "Waiting for your approval" : "Generation stopped") : "Planning your video…"}</h2>
          <a className="btn sm" href={`/projects/${started.id}`}>
            Open review screen
          </a>
        </div>
        {!failed && (
          <div className="stack" style={{ marginBottom: 16 }}>
            <Progress indeterminate={!poll?.progress?.progress} value={poll?.progress?.progress} />
            <span className="small muted">
              {poll?.progress ? `${poll.progress.stage}${poll.progress.message ? `: ${poll.progress.message}` : ""}` : "Starting the pipeline…"}
            </span>
          </div>
        )}
        {failed && job?.budget && <BudgetApproval budget={job.budget} busy={approving} onApprove={approve} />}
        {failed && !job?.budget && (
          <div className="notice danger">
            <span>✗</span>
            <div className="grow">
              <b>{job?.error}</b>
            </div>
          </div>
        )}
        {poll?.stages && (
          <div style={{ marginTop: 16 }}>
            <StageList stages={poll.stages} current={poll.progress} />
          </div>
        )}
        {job?.logTail && (
          <details style={{ marginTop: 14 }}>
            <summary>Job log</summary>
            <pre className="log">{job.logTail}</pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="create-layout">
      <div className="stack" style={{ gap: 16 }}>
        <div className="panel prompt-box">
          <label className="field">
            <span>Prompt</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. A 30-second explainer on why octopuses have three hearts, playful tone, for curious kids" autoFocus />
          </label>
          {!hasLlm && llm === "anthropic" && (
            <div className="notice warn" style={{ marginTop: 12 }}>
              <span>⚠</span>
              <div className="grow">Script generation needs ANTHROPIC_API_KEY. Pick the offline script engine to try the pipeline with placeholder content.</div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Format</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Duration: {duration}s</span>
              <input
                type="range"
                min={5}
                max={900}
                step={5}
                value={duration}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  // Only explainers run past 3 minutes.
                  if (next > 180 && quality !== "explainer") choosePreset("explainer");
                  setDuration(next);
                }}
              />
            </label>
            <div className="field span-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="field-label">Aspect ratio</span>
              <div className="seg">
                {options.aspectRatios.map((r) => (
                  <button key={r} type="button" className={aspect === r ? "on" : ""} onClick={() => setAspect(r)} title={RATIO_TEXT[r]}>
                    {r} <span className="faint small">{RATIO_TEXT[r]}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Visual style</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {options.styles.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span>Visual sources</span>
              <select value={visualMode} onChange={(e) => setVisualMode(e.target.value)}>
                {options.visualModes.map((m) => (
                  <option key={m} value={m}>
                    {label(m)}: {MODE_TEXT[m]}
                  </option>
                ))}
              </select>
            </label>
            <div className="field span-3" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="field-label">Quality preset</span>
              <div className="preset-cards">
                {options.qualities.map((q) => (
                  <button key={q} type="button" className={`preset${quality === q ? " on" : ""}`} onClick={() => choosePreset(q)}>
                    <b>{q}</b>
                    <span>{QUALITY_TEXT[q]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Sound & captions</h2>
          </div>
          <div className="form-grid">
            <label className="check">
              <input type="checkbox" checked={narration} onChange={(e) => setNarration(e.target.checked)} />
              <span>
                <b>Narration</b>
                <small>{live("Narration") ? "ElevenLabs voice with word timing" : "Silent mode, estimated caption timing"}</small>
              </span>
            </label>
            <label className="field">
              <span>Voice id</span>
              <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="Default voice" disabled={!narration} />
            </label>
            <label className="check">
              <input type="checkbox" checked={sfx} onChange={(e) => setSfx(e.target.checked)} />
              <span>
                <b>Sound effects</b>
                <small>{live("Sound") ? "Generated (small cost)" : "Local placeholder effects"}</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              <span>
                <b>Captions</b>
                <small>Burned into final.mp4; clean.mp4 has none</small>
              </span>
            </label>
            <label className="field">
              <span>Caption style</span>
              <select value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)} disabled={!captions}>
                <option value="auto">Auto (director picks)</option>
                {options.captionStyles.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Music</span>
              <select
                value={musicChoice}
                onChange={(e) => {
                  if (e.target.value === "__upload") musicInput.current?.click();
                  else setMusicChoice(e.target.value);
                }}
              >
                <option value="auto">Auto (match the mood)</option>
                <option value="none">No music</option>
                {tracks.map((t) => (
                  <option key={t.file} value={t.file}>
                    {t.file}
                  </option>
                ))}
                <option value="__upload">Upload a file…</option>
              </select>
              <input ref={musicInput} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && uploadMusic(e.target.files[0])} />
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Providers & spending</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Budget (USD)</span>
              <input type="number" min={0} step={0.5} value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span className="field-help">The run pauses for approval if its estimate is higher.</span>
            </label>
            <label className="field">
              <span>Script engine</span>
              <select value={llm} onChange={(e) => setLlm(e.target.value as "anthropic" | "mock")}>
                <option value="anthropic" disabled={!hasLlm}>
                  Claude {hasLlm ? "" : "(not configured)"}
                </option>
                <option value="mock">Offline placeholder (deterministic)</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
              <span>
                <b>Offline mode</b>
                <small>Never call paid providers: motion graphics, silent narration</small>
              </span>
            </label>
            <label className="check span-3">
              <input type="checkbox" checked={skipExport} onChange={(e) => setSkipExport(e.target.checked)} />
              <span>
                <b>Draft only</b>
                <small>Stop after the draft preview; render the final from the review screen later</small>
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="notice danger">
            <span>✗</span>
            <div className="grow">{error}</div>
          </div>
        )}
        <div className="row">
          <button className="btn primary lg" onClick={submit} disabled={submitting || prompt.trim().length < 3 || (llm === "anthropic" && !hasLlm)}>
            {submitting ? "Starting…" : "Generate video"}
          </button>
          <span className="small muted">Runs in the background; you can leave this page.</span>
        </div>
      </div>

      <aside className="stack" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Estimate</h2>
            <span className="hint">rough guide</span>
          </div>
          <div className="estimate">
            <span className="amt">{usd(estimate.total)}</span>
            <span className="small muted">budget {budget === "" ? usd(prices.defaultBudgetUsd) : usd(Number(budget))}</span>
          </div>
          {estimate.lines.length ? (
            <table className="simple" style={{ marginTop: 10 }}>
              <tbody>
                {estimate.lines.map((l) => (
                  <tr key={l.what}>
                    <td className="muted">{l.what}</td>
                    <td className="num">{usd(l.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              No paid provider will be called with these settings.
            </p>
          )}
          <p className="small faint" style={{ margin: "10px 0 0" }}>
            The exact estimate is computed after the storyboard. If it exceeds the budget you&apos;ll see the breakdown and can approve it.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Capabilities</h2>
          </div>
          <div className="caps">
            {capabilities.map((c) => (
              <div key={c.name} className="cap">
                <span className={`ico ${c.available ? "on" : "off"}`}>{c.available ? "✓" : "–"}</span>
                <div>
                  <b>
                    {c.name}: {c.available ? "configured" : "not configured"}
                  </b>
                  <small>{c.detail}</small>
                  {!c.available && (
                    <small>
                      Set <code>{c.envVars.join(" or ")}</code> in .env
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="small faint" style={{ margin: "12px 0 0" }}>
            Keys are read on the server only and never sent to the browser.
          </p>
        </div>
      </aside>
    </div>
  );
}
