"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectCard } from "../../src/web/server";
import { ModeBadge, StatusBadge, fileUrl, fmtDuration } from "./ui";

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function LibraryGrid({ initial }: { initial: ProjectCard[] }) {
  const [projects, setProjects] = useState(initial);
  const active = projects.some((p) => p.running || p.status === "generating");

  // refresh while something is generating so status and thumbnails update
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/projects", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setProjects((await r.json()).projects);
    }, 3000);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="lib-grid">
      {projects.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} className="card proj-card">
          <div className="proj-thumb">
            {p.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(p.id, p.thumbnail)} alt="" loading="lazy" />
            ) : (
              <span className="placeholder">{p.running || p.status === "generating" ? "Generating…" : "No preview yet"}</span>
            )}
            <span className="badge ratio">{p.aspectRatio}</span>
          </div>
          <div className="proj-body">
            <div className="proj-title">{p.title}</div>
            <div className="row" style={{ gap: 6 }}>
              <StatusBadge status={p.status} running={p.running} />
              <ModeBadge mode={p.mode} />
              {p.requiresReview && p.status !== "needs-review" && <span className="badge warn">Review flags</span>}
            </div>
            <div className="proj-meta">
              {p.durationSeconds ? (
                <>
                  <span>{fmtDuration(p.durationSeconds)}</span>
                  <span>·</span>
                </>
              ) : null}
              <span>{date(p.createdAt)}</span>
              <span>·</span>
              <span style={{ textTransform: "capitalize" }}>{p.quality}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
