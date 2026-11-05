"use client";
/** Small presentational pieces shared by the create and review screens. */
import type { ReactNode } from "react";

export const fileUrl = (id: string, rel: string, extra = "") => `/api/projects/${id}/files/${rel.split("/").map(encodeURIComponent).join("/")}${extra}`;

export const usd = (n: number | undefined | null) => `$${(n ?? 0).toFixed(n && n < 0.01 && n > 0 ? 3 : 2)}`;

export const fmtDuration = (s: number | null | undefined) => {
  if (!s && s !== 0) return "–";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${s.toFixed(1)}s`;
};

const STATUS: Record<string, { cls: string; label: string }> = {
  draft: { cls: "", label: "Draft" },
  generating: { cls: "accent", label: "Generating" },
  ready: { cls: "ok", label: "Ready" },
  rendered: { cls: "ok", label: "Rendered" },
  failed: { cls: "danger", label: "Failed" },
  "needs-review": { cls: "warn", label: "Needs review" },
};

export function StatusBadge({ status, running }: { status: string; running?: boolean }) {
  if (running) {
    return (
      <span className="badge accent">
        <span className="dot pulse" /> Working
      </span>
    );
  }
  const s = STATUS[status] ?? { cls: "", label: status };
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`dot${status === "generating" ? " pulse" : ""}`} /> {s.label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  if (mode === "offline-demo") return <span className="badge outline">Offline demo</span>;
  if (mode === "mixed") return <span className="badge outline">Offline</span>;
  return <span className="badge accent">Live</span>;
}

export function Progress({ value, indeterminate }: { value?: number; indeterminate?: boolean }) {
  return (
    <div className={`progress${indeterminate ? " indeterminate" : ""}`}>
      <div style={{ width: `${Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100)}%` }} />
    </div>
  );
}

export type Stage = { name: string; status: string; error?: string; note?: string; attempts?: number };

const ICON: Record<string, string> = { done: "✓", failed: "✗", running: "●", skipped: "–", pending: "○" };

export function StageList({ stages, current }: { stages: Stage[]; current?: { stage: string; progress?: number; message?: string } | null }) {
  return (
    <div className="stages">
      {stages.map((s) => {
        const live = current && current.stage === s.name && s.status === "running";
        return (
          <div key={s.name} className={`stage ${s.status}`} title={s.error ?? s.note ?? ""}>
            <span className="s-ico">{ICON[s.status] ?? "·"}</span>
            <span style={{ minWidth: 0 }}>
              {s.name}
              {live && current?.progress !== undefined ? ` ${Math.round(current.progress * 100)}%` : ""}
              {s.error ? <span className="s-note">{s.error}</span> : s.note ? <span className="s-note">{s.note}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type Budget = { estimateUsd: number; budgetUsd: number; approveUsd: number; breakdown: { category: string; provider: string; description: string; estimatedUsd: number }[] };

export function BudgetApproval({ budget, onApprove, onCancel, busy, title }: { budget: Budget; onApprove: (usd: number) => void; onCancel?: () => void; busy?: boolean; title?: ReactNode }) {
  const planned = budget.breakdown.reduce((a, b) => a + b.estimatedUsd, 0);
  return (
    <div className="stack">
      <div className="notice warn">
        <span>⚠</span>
        <div className="grow">
          <b>{title ?? "Approval needed before spending"}</b>
          <p>
            Estimated total {usd(budget.estimateUsd)} exceeds this project&apos;s {usd(budget.budgetUsd)} limit. Nothing has been spent on this step yet.
          </p>
        </div>
      </div>
      {budget.breakdown.length > 0 && (
        <table className="simple">
          <thead>
            <tr>
              <th>Planned</th>
              <th>Provider</th>
              <th className="num">Estimate</th>
            </tr>
          </thead>
          <tbody>
            {budget.breakdown.map((b, i) => (
              <tr key={i}>
                <td>
                  <span className="badge outline" style={{ marginRight: 6 }}>
                    {b.category}
                  </span>
                  {b.description}
                </td>
                <td className="muted">{b.provider}</td>
                <td className="num">{usd(b.estimatedUsd)}</td>
              </tr>
            ))}
            {Math.abs(planned - budget.estimateUsd) > 0.005 && (
              <tr>
                <td colSpan={2} className="muted">
                  Already spent on this project
                </td>
                <td className="num">{usd(budget.estimateUsd - planned)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <div className="row">
        <button className="btn ok" disabled={busy} onClick={() => onApprove(budget.approveUsd)}>
          Approve {usd(budget.approveUsd)} and continue
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Not now
          </button>
        )}
        <span className="small faint">Or pick a cheaper quality preset / visual mode.</span>
      </div>
    </div>
  );
}

export function Toast({ toast, onClose }: { toast: { kind: "error" | "success" | "info"; text: string } | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role="status" onClick={onClose}>
      {toast.text}
    </div>
  );
}

/** POST JSON (or FormData) and return parsed JSON with the status. */
export async function post<T = Record<string, unknown>>(url: string, body?: unknown): Promise<{ status: number; data: T & { error?: string; budget?: Budget } }> {
  const init: RequestInit = { method: "POST" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return { status: res.status, data };
}
