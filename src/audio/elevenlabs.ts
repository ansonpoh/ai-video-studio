/**
 * ElevenLabs narration (with character-level timestamps -> word timings) and
 * sound effects, plus the SilentTts fallback used when no key is configured.
 * SilentTts is clearly labelled: real=false, timing "estimated", audio null.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { alignmentToWords, estimateWordTimings, type Word } from "../captions";
import { mediaDurationSeconds } from "../media/ffmpeg";
import { estimateSpeechSeconds } from "../rendering/timeline";
import { ProviderError, type SfxProvider, type SpeechRequest, type SpeechResult, type TtsProvider } from "../providers/types";

const API = "https://api.elevenlabs.io/v1";

export type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
export type TimestampsResponse = { audio_base64: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };

/** Pure: response alignment -> words (prefers the original-text alignment so caption text matches the script). */
export const wordsFromTimestamps = (r: Pick<TimestampsResponse, "alignment" | "normalized_alignment">): Word[] => {
  const a = r.alignment ?? r.normalized_alignment;
  if (!a || !a.characters?.length) return [];
  return alignmentToWords(a);
};

/** Pure: last character end time in seconds (fallback duration). */
export const alignmentEndSeconds = (r: Pick<TimestampsResponse, "alignment" | "normalized_alignment">): number => {
  const a = r.alignment ?? r.normalized_alignment;
  const ends = a?.character_end_times_seconds ?? [];
  return ends.length ? ends[ends.length - 1] : 0;
};

const httpError = async (provider: string, res: Response): Promise<ProviderError> => {
  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const j = JSON.parse(body) as { detail?: { message?: string; status?: string } | string };
    detail = typeof j.detail === "string" ? j.detail : (j.detail?.message ?? detail);
  } catch {
    /* not json */
  }
  const msg = res.status === 401 ? "authentication failed - check ELEVENLABS_API_KEY" : `HTTP ${res.status}: ${detail}`;
  return new ProviderError(provider, msg, res.status === 429 || res.status >= 500, res.status);
};

const post = async (provider: string, url: string, key: string, body: unknown, fetchImpl: typeof fetch): Promise<Response> => {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) {
    throw new ProviderError(provider, `network error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  if (!res.ok) throw await httpError(provider, res);
  return res;
};

/** Measures an mp3 buffer with ffprobe via a temp file. Returns 0 on failure. */
const measureMp3 = async (audio: Buffer): Promise<number> => {
  const file = path.join(os.tmpdir(), `ai-video-studio-tts-${randomUUID()}.mp3`);
  try {
    await fs.writeFile(file, audio);
    const d = await mediaDurationSeconds(file);
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0;
  } finally {
    await fs.rm(file, { force: true }).catch(() => undefined);
  }
};

export type ElevenLabsOptions = { apiKey?: string; voiceId?: string; model?: string; fetchImpl?: typeof fetch };

export class ElevenLabsTts implements TtsProvider {
  readonly name = "elevenlabs";
  readonly real = true;
  readonly model: string;
  private readonly key: string;
  private readonly voiceId: string;
  private readonly pricePer1k: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ElevenLabsOptions = {}) {
    const e = env();
    const key = opts.apiKey ?? e.ELEVENLABS_API_KEY;
    if (!key) throw new ProviderError("elevenlabs", "ELEVENLABS_API_KEY is not set", false);
    this.key = key;
    this.voiceId = opts.voiceId ?? e.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
    this.model = opts.model ?? e.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
    this.pricePer1k = e.PRICE_TTS_PER_1K_CHARS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  estimateUsd(text: string) {
    return (text.length / 1000) * this.pricePer1k;
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const voiceId = req.voiceId || this.voiceId;
    const url = `${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
    const body: Record<string, unknown> = {
      text: req.text,
      model_id: this.model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    };
    // previous/next text improve prosody continuity across per-scene requests.
    if (req.previousText) body.previous_text = req.previousText;
    if (req.nextText) body.next_text = req.nextText;
    const res = await post(this.name, url, this.key, body, this.fetchImpl);
    const json = (await res.json()) as TimestampsResponse;
    if (!json.audio_base64) throw new ProviderError(this.name, "response contained no audio", true);
    const audio = Buffer.from(json.audio_base64, "base64");
    const words = wordsFromTimestamps(json);
    const measured = await measureMp3(audio);
    const durationSeconds = measured > 0 ? measured : alignmentEndSeconds(json);
    const usd = this.estimateUsd(req.text);
    return {
      audio,
      extension: "mp3",
      durationSeconds,
      words,
      timing: words.length ? "tts-alignment" : "estimated",
      voiceId,
      cost: { estimatedUsd: usd, actualUsd: usd, description: `ElevenLabs ${this.model}: ${req.text.length} chars (price assumption)` },
    };
  }
}

export class ElevenLabsSfx implements SfxProvider {
  readonly name = "elevenlabs-sfx";
  private readonly key: string;
  private readonly pricePerSecond: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    const e = env();
    const key = opts.apiKey ?? e.ELEVENLABS_API_KEY;
    if (!key) throw new ProviderError("elevenlabs-sfx", "ELEVENLABS_API_KEY is not set", false);
    this.key = key;
    this.pricePerSecond = e.PRICE_SFX_PER_SECOND;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  estimateUsd(seconds: number) {
    return Math.max(0.5, seconds) * this.pricePerSecond;
  }

  async generate(prompt: string, seconds: number) {
    // The API accepts 0.5-30 s.
    const duration = Math.min(30, Math.max(0.5, Math.round(seconds * 10) / 10));
    const res = await post(this.name, `${API}/sound-generation`, this.key, { text: prompt, duration_seconds: duration, prompt_influence: 0.4 }, this.fetchImpl);
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new ProviderError(this.name, "empty audio returned", true);
    const usd = this.estimateUsd(duration);
    return { audio, cost: { estimatedUsd: usd, actualUsd: usd, description: `ElevenLabs sound effect ${duration}s (price assumption)` } };
  }
}

/** No-audio fallback: estimated word timings so captions still work. Clearly not real speech. */
export class SilentTts implements TtsProvider {
  readonly name = "silent";
  readonly real = false;

  estimateUsd() {
    return 0;
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const seconds = estimateSpeechSeconds(req.text);
    return {
      audio: null,
      extension: "mp3",
      durationSeconds: seconds,
      words: estimateWordTimings(req.text, seconds * 1000),
      timing: "estimated",
      cost: { estimatedUsd: 0, actualUsd: 0, description: "silent mode (no narration audio; estimated caption timing)" },
    };
  }
}
