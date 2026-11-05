import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Studio",
  description: "Local-first prompt-to-video studio: storyboard, review, edit and render.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden />
            Video Studio
          </Link>
          <nav className="nav">
            <Link href="/">Library</Link>
            <Link href="/new">New video</Link>
          </nav>
          <div className="spacer" />
          <Link href="/new" className="btn primary sm">
            + Create
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
