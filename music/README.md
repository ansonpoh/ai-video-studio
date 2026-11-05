# Music library

The studio only uses music you put here. It never downloads tracks from the internet.

1. Copy audio files you are licensed to use (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`) into this folder.
2. Optionally describe them in `music/library.json` so "auto" can pick a track by mood and the licence is recorded in the project:

```json
[
  { "file": "calm-piano.mp3", "moods": ["relaxed", "inspiring"], "license": "Artlist licence #123" },
  { "file": "pulse.mp3", "moods": ["energetic", "tech"], "license": "Own composition" }
]
```

The moods are listed in `src/schemas/catalog.ts` (`MUSIC_MOODS`). A file without an entry can still be chosen by name (`--music pulse.mp3`), and is recorded as "user-provided (unverified)".

If no track matches the video's mood, the studio synthesises a simple placeholder bed locally. That is what the offline demos use. It has no third-party rights, but it is a placeholder: swap in a real track for anything you publish.

Background music is automatically lowered (ducked) while narration plays. You can change the volume, ducking level and fades in Remotion Studio on the "Music" element.

Everything in this folder except this README and `demo/` is git-ignored, so your licensed tracks stay local.
