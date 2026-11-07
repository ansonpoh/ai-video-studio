/**
 * Free narration through Microsoft Edge's online neural voices (msedge-tts).
 * This is an unofficial endpoint: fine for personal use, but Microsoft can
 * change or block it, and commercial use should move to Azure Speech.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Readable } from "node:stream";
import { env } from "../config/env";
import { estimateWordTimings, type Word } from "../captions";
import { estimateSpeechSeconds } from "../rendering/timeline";
import { measureMp3 } from "./elevenlabs";
import { ProviderError, type SpeechRequest, type SpeechResult, type TtsProvider } from "../providers/types";

export type WordBoundary = { text: string; startMs: number; endMs: number };

/** 100-nanosecond ticks per millisecond, the unit of Edge's boundary offsets. */
const TICKS_PER_MS = 10_000;
const ATTEMPTS = 3;

/** Pure: Edge metadata chunks -> word boundaries. */
export const parseBoundaries = (chunks: string[]): WordBoundary[] =>
  chunks.flatMap((chunk) => {
    const items = (JSON.parse(chunk) as { Metadata?: { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } }[] }).Metadata ?? [];
    return items
      .filter((m) => m.Type === "WordBoundary" && m.Data?.text?.Text)
      .map((m) => {
        const start = (m.Data!.Offset ?? 0) / TICKS_PER_MS;
        return { text: m.Data!.text!.Text!, startMs: start, endMs: start + (m.Data!.Duration ?? 0) / TICKS_PER_MS };
      });
  });

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Pure: puts boundary timings on the script's own words, so captions keep the
 * script's punctuation. Returns null when the two can't be lined up.
 */
export const wordsFromBoundaries = (text: string, boundaries: WordBoundary[]): Word[] | null => {
  const words: Word[] = [];
  let b = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const want = normalise(token);
    if (!want) {
      // A standalone mark such as a dash stays on screen with the word before it.
      if (words.length) words[words.length - 1].text += ` ${token}`;
      continue;
    }
    const first = b;
    let have = "";
    while (have.length < want.length && b < boundaries.length) have += normalise(boundaries[b++].text);
    if (have !== want) return null;
    words.push({ text: token, startMs: boundaries[first].startMs, endMs: boundaries[b - 1].endMs });
  }
  return b === boundaries.length && words.length ? words : null;
};

export const escapeSsml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Reads a stream to the end; an error on the stream rejects. */
const collect = (stream: Readable) =>
  new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.once("error", reject);
    stream.once("close", () => resolve(chunks));
  });

export type EdgeSpeech = (text: string, voice: string) => Promise<{ audio: Buffer; metadata: string[] }>;

const edgeSpeech: EdgeSpeech = async (text, voice) => {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = tts.toStream(escapeSsml(text));
    const [audio, metadata] = await Promise.all([collect(audioStream), metadataStream ? collect(metadataStream) : Promise.resolve([])]);
    return { audio: Buffer.concat(audio), metadata: metadata.map((c) => c.toString("utf8")) };
  } finally {
    tts.close();
  }
};

export class EdgeTts implements TtsProvider {
  readonly name = "edge";
  readonly real = true;
  private readonly voice: string;
  private readonly speak: EdgeSpeech;

  constructor(opts: { voice?: string; speak?: EdgeSpeech } = {}) {
    this.voice = opts.voice ?? env().EDGE_TTS_VOICE ?? "en-US-AndrewMultilingualNeural";
    this.speak = opts.speak ?? edgeSpeech;
  }

  estimateUsd() {
    return 0;
  }

  /** The free endpoint sometimes drops a connection mid-sentence, so a few tries are normal. */
  private async speakWithRetries(text: string, voice: string) {
    let failure = "";
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const spoken = await this.speak(text, voice);
        if (spoken.audio.length) return spoken;
        failure = "response contained no audio";
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
    }
    throw new ProviderError(this.name, `speech failed after ${ATTEMPTS} tries: ${failure}`, true);
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    // A project may hold an ElevenLabs voice id, which means nothing here.
    const voice = req.voiceId?.endsWith("Neural") ? req.voiceId : this.voice;
    const spoken = await this.speakWithRetries(req.text, voice);
    const boundaries = parseBoundaries(spoken.metadata);
    const words = wordsFromBoundaries(req.text, boundaries);
    const measured = await measureMp3(spoken.audio);
    const durationSeconds = measured > 0 ? measured : boundaries.length ? boundaries[boundaries.length - 1].endMs / 1000 : estimateSpeechSeconds(req.text);
    return {
      audio: spoken.audio,
      extension: "mp3",
      durationSeconds,
      words: words ?? estimateWordTimings(req.text, durationSeconds * 1000),
      timing: words ? "tts-alignment" : "estimated",
      voiceId: voice,
      cost: { estimatedUsd: 0, actualUsd: 0, description: `Edge TTS ${voice}: ${req.text.length} chars (free)` },
    };
  }
}
