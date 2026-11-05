/**
 * User-provided, licensed music library. Put audio files in music/ and
 * optionally a music/library.json describing them:
 *   [{ "file": "calm-piano.mp3", "moods": ["relaxed"], "license": "Artlist, licence #123" }]
 * Files without an entry are usable but recorded with license "user-provided (unverified)".
 * The studio never downloads music from the internet.
 */
import fs from "node:fs";
import path from "node:path";
import { musicDir } from "../pipeline/store";
import type { MusicMood } from "../schemas/catalog";

export type Track = { file: string; path: string; moods: string[]; license: string };

export const listLibrary = (): Track[] => {
  const dir = musicDir();
  if (!fs.existsSync(dir)) return [];
  let meta: { file: string; moods?: string[]; license?: string }[] = [];
  const metaFile = path.join(dir, "library.json");
  if (fs.existsSync(metaFile)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
      meta = [];
    }
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f))
    .map((file) => {
      const m = meta.find((x) => x.file === file);
      return { file, path: path.join(dir, file), moods: m?.moods ?? [], license: m?.license ?? "user-provided (unverified)" };
    });
};

export const pickTrack = (mood: MusicMood, explicit?: string): Track | null => {
  const lib = listLibrary();
  if (explicit && explicit !== "auto" && explicit !== "none") return lib.find((t) => t.file === explicit) ?? null;
  return lib.find((t) => t.moods.includes(mood)) ?? null;
};
