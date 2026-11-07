# Video Studio

A local-first studio that turns a prompt into a finished short video, then lets you edit it visually in [Remotion Studio](https://www.remotion.dev/docs/studio) and re-render without losing your changes.

```
prompt → creative direction → script → storyboard (validated) → visuals → narration
       → timing → captions → animation → editable Remotion project → render → quality checks → export
```

The web UI and the CLI both call the same pipeline (`src/pipeline`), so anything you can do in one you can do in the other.

## Quick start

```bash
npm install
npm run demo        # renders three offline demo videos, no API keys needed
npm run studio      # open every project in Remotion Studio and edit it visually
npm run dev         # web UI on http://localhost:3000
```

You need Node 20+. Rendering uses Remotion's bundled Chrome Headless Shell and ffmpeg. If Remotion can't download its browser (for example, on a locked-down network), set `REMOTION_BROWSER_EXECUTABLE` in `.env` to an existing `chrome-headless-shell` binary.

## The demos

`npm run demo` builds three projects through the full pipeline. It uses hand-written storyboards, procedural artwork, synthesised placeholder music and procedural sound effects, and never calls a paid service.

| Project | Style | What it shows |
|---|---|---|
| `demo-lightning` | Educational, stormy | Diagrams, a number counter, word-highlight captions, thunder sound effects |
| `demo-two-moons` | Cinematic, speculative | A "Speculative scenario" label on every scene, serif captions, slow transitions |
| `demo-productivity` | Listicle, bright | Numbered list cards, bold captions, fast pacing |

The demos run in silent-narration mode, so caption timing is estimated from the text, and the videos have music and effects but no voice. Outputs are written to `projects/<id>/output/`. Run `npm run demo -- --fresh` to rebuild them from scratch; by default, your Studio edits to the demos are kept.

## API keys

Copy `.env.example` to `.env`. Every key is optional; each one switches on a capability. Keys are only read on the server and are never sent to the browser. `npm run status` shows what's configured.

| Key | Enables | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Creative direction, script, storyboard and scene rewrites from any prompt | Only the demos (or `--llm mock`) work |
| `ELEVENLABS_API_KEY` | Narration with word-level timing; generated sound effects | Silent narration with estimated caption timing; procedural sound effects |
| `OPENAI_API_KEY` | Generated images (`OPENAI_IMAGE_MODEL`, default `gpt-image-2`) | Procedural artwork and motion graphics |
| `PEXELS_API_KEY` | Licensed stock photos and clips, with credits written to `credits.txt` | No stock media |
| `VIDEO_PROVIDER_API_KEY` / `FAL_KEY` | Image-to-video clips via fal.ai (`VIDEO_MODEL`, plus the optional cheaper `VIDEO_BACKGROUND_MODEL`) | Still images with camera motion |

An Anthropic API key is billed separately from a Claude subscription.

## Making videos

From the web UI: **New video** → write the prompt → choose the options → **Generate**. The review page shows live progress and the result.

From the CLI:

```bash
npm run make -- -p "Why do cats purr? Fun, 30 seconds" --style playful --aspect 9:16
npm run make -- -p "5 habits for better sleep" --captions karaoke --music calm-piano.mp3
npm run make -- -p "Explain black holes" --offline        # procedural visuals, silent narration
npm run make -- -p "Explain black holes" --llm mock        # fully offline test run
```

Useful options:
- `--duration`, `--aspect` (9:16, 16:9, 1:1, 4:5), `--style` and `--quality` (economy, hybrid (default), balanced or premium).
- `--clips approve|skip` decides the AI clips up front; by default the run stops after the stills so you can review them (see below).
- `--visual-mode` (auto, ai_only, stock_preferred or procedural_only) and `--captions <style>` (or `--no-captions`).
- `--no-narration`, `--voice <elevenlabs voice id>`, `--music <file|auto|none>` and `--sfx`.
- `--budget <usd>`, `--approve-spend <usd>` and `-o <dir>` (copies the outputs to that folder).

If a run stops (missing key, failed provider, budget approval), fix the cause and run `npm run cli -- resume --id <id>`. It picks up from the stage that didn't finish.

## Editing

Each project has its own composition at `projects/<id>/editable/Video.tsx`. Every scene, text, caption block, media layer and audio track in it is a named element with literal values, so Remotion Studio can edit it visually and save the changes back to the file.

```bash
npm run studio      # composition id = project id
```

In Studio you can:
- Change text, fonts, colours, positions, scale and animation presets.
- Trim scenes (sequence length) and change transitions.
- Edit caption words and timings, caption style and placement.
- Swap media files, and change the music volume, ducking and fades.
- Change narration volume, and any artwork's colours, labels and variation seed.

You can also edit the file by hand. Rendering always reads this file, including the total duration, so what you see in Studio is what gets exported.

### What survives regeneration

The studio never rewrites an edited composition. Partial regeneration patches only the named elements involved, using the TypeScript AST, and leaves everything else byte-for-byte identical.

| Action | What changes in `Video.tsx` | What is kept |
|---|---|---|
| Regenerate image or clip, replace media, revert | The scene's `visual` source (other visual props are kept if it stays a media layer) | Everything else, including that scene's text, captions and timing |
| Edit narration, regenerate narration, change voice | The scene's `narration` source, caption words and scene length; music ducking ranges | Caption styling, text, visuals and other scenes |
| Edit title or on-screen text | The scene's title or layout element | Everything else |
| Rewrite a scene (`--what script`) | That whole scene | All other scenes |
| Change caption style | Each caption element (the styling resets to the new style) | Everything else |

AI output is never overwritten either. Storyboard versions are kept in `history/`, your text edits live in `edits.json`, and every asset version stays in `assets.json`, so you can revert. To start a composition over, delete `editable/Video.tsx` and run `npm run render:video -- --id <id>` (it is regenerated from the storyboard, your text edits and the current assets).

### Partial regeneration (CLI)

```bash
npm run regen -- --id <id> --what image --scene s03
npm run regen -- --id <id> --what clip --scene s01 --approve-spend 1
npm run regen -- --id <id> --what scene-style --scene s02 --style "watercolour, soft light"
npm run regen -- --id <id> --what narration --scene s04
npm run regen -- --id <id> --what script --scene s05 --instruction "make it punchier"
npm run regen -- --id <id> --what captions --style karaoke
npm run cli -- replace --id <id> --scene s02 --file ~/Pictures/mine.jpg
npm run cli -- revert --id <id> --scene s02 --asset <assetId>     # or --asset art for live motion graphics
npm run render:video -- --id <id>                                 # final, caption-free, thumbnail, SRT
npm run export -- --id <id> -o ~/Desktop/videos
```

## Exports

`projects/<id>/output/` contains:
- `final.mp4`: H.264, with captions.
- `clean.mp4`: the same video without burned-in captions.
- `thumbnail.png` and `audio-mix.mp3`.

`projects/<id>/captions/` contains `captions.srt` and `timings.json` (word, cue and scene timings). Both are generated from the editable composition, so caption edits made in Studio are included. `audio/narration.mp3` is the continuous narration track, when there is one.

Every render goes through automatic quality checks:
- Format: resolution, aspect ratio, frame rate and duration.
- Media: audio stream, audio and video sync, and missing media files.
- Layout: scene count, transitions, text overflow risk, caption safe area, and blank or flat frames.

Results and sampled frames go to `output/quality.json`, `output/frames/` and `output/contact-sheet.jpg`.

## Costs and budgets

| Preset | Images | AI clips | Sound effects |
|---|---|---|---|
| Economy | low quality, about 60% of scenes | none | no |
| **Hybrid** (default) | medium quality, every media scene, each with a camera move | the hook + 2 key moments on `VIDEO_MODEL`, plus 2 background shots on `VIDEO_BACKGROUND_MODEL` if set | yes |
| Balanced | medium quality, about 80% of scenes | up to 2 | yes |
| Premium | high quality, every media scene | up to 5 | yes |

Before anything is generated, the pipeline plans every asset and estimates the spend using the `PRICE_*` values in `.env`. If the estimate exceeds the budget (`MAX_GENERATION_BUDGET_USD`, or `--budget`), it stops before spending and shows the breakdown. Approve with `--approve-spend <usd>`, or with the button in the web UI.

### Storyboard preview before clips

Clips are the expensive part, so the pipeline makes every still first and then pauses (stage `clips`, project status "draft"). The review page shows the stills and which scenes will become clips, with the estimate. Fix or regenerate any still you don't like (each clip starts from its still), then press **Approve clips** or **Skip clips, keep animated stills**. From the CLI: `npm run cli -- resume --id <id> --clips approve` (or `skip`).

A one-minute hybrid video is about 12 stills at $0.06 and 3 Kling 2.5 Turbo clips of 5 s at $0.07/s, roughly $1.80 before narration. Clips run three at a time.

Background clip models checked on fal (Nov 2026 list prices; set `VIDEO_BACKGROUND_MODEL` and `PRICE_VIDEO_BACKGROUND_PER_SECOND`):

| Model id | Price | Notes |
|---|---|---|
| `minimax/h3-max-turbo/image-to-video` | $0.04/s at 768P | cheapest; 5 s ≈ $0.20 |
| `fal-ai/ltx-2/image-to-video/fast` | $0.04/s at 1080p | minimum 6 s, so ≈ $0.24 a clip |
| `fal-ai/wan-25-preview/image-to-video` | $0.10/s at 720p ($0.05 at 480p) | |
| `minimax/h3-max/image-to-video` | $0.08/s at 768P | |
| `fal-ai/kling-video/v3/standard/image-to-video` | $0.084/s (audio off, which the studio sets) | higher quality hero option |

Generated images, clips and narration are cached by content in `.cache/`, so identical requests never pay twice. "Regenerate" always asks for a fresh variant. Actual and estimated costs per project are in `manifest.json` (`npm run status -- --id <id>`).

## Content integrity

Each project records what was AI-generated (imagery, voice, script) and produces a disclosure label, for example "Contains AI-generated imagery, AI voice". The pipeline also flags:
- Factual claims that need checking (no retrieval is configured, so they are flagged, not verified).
- Time-sensitive topics and mentions of real people.
- Speculative or fictional content, which also gets an on-screen label.
- Stock media that needs credits.

Flagged projects are marked "needs review" rather than "rendered".

## Project layout

```
projects/<id>/
  metadata.json        request, creative direction, status, disclosure, content flags
  storyboard.json      latest storyboard (history/ keeps every version)
  edits.json           your text, voice and caption-style edits
  assets.json          every visual asset version, narration segments, music, sfx
  manifest.json        pipeline stages, costs, logs, renders
  assets/ audio/       media files
  editable/Video.tsx   the Remotion composition you edit
  captions/ output/    exports
```

## Development

```bash
npm test            # vitest: pipeline with mock providers, AST patching, timing, captions, budgets, providers
npm run typecheck
```

The tests run without the network or a browser. Provider adapters are tested against mocked SDK clients and HTTP responses.

## Known limitations

- The live provider integrations (Anthropic, OpenAI images, fal.ai, Pexels, ElevenLabs) are written against the current SDKs and APIs and covered by mocked tests, but haven't been exercised end to end with real keys in this repository. The fal model input fields and the Pexels resize parameters are the most likely to need adjusting.
- Fact checking doesn't use retrieval. Claims are flagged for review, not verified.
- The procedural placeholder music is functional but basic; use licensed tracks for anything you publish (see `music/README.md`).
- Studio can only edit the props that each component exposes. Structural changes (adding a new scene) are done by editing `Video.tsx` by hand or rewriting a scene.
