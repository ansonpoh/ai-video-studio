import Link from "next/link";
import { projectCards } from "../src/web/server";
import { LibraryGrid } from "./_components/LibraryGrid";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const projects = projectCards();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Every video is a folder in projects/ with its storyboard, assets, editable Remotion composition and renders.</p>
        </div>
        <Link href="/new" className="btn primary">
          + New video
        </Link>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <h2>No projects yet</h2>
          <p>
            Create one from a prompt, or build the offline demos with <code>npm run demo</code> (no API keys needed).
          </p>
          <p style={{ marginTop: 18 }}>
            <Link href="/new" className="btn primary">
              Create your first video
            </Link>
          </p>
        </div>
      ) : (
        <LibraryGrid initial={projects} />
      )}
    </main>
  );
}
