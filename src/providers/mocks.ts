/**
 * In-memory provider mocks for tests. No network, deterministic outputs, and
 * call counters so tests can assert caching / no-regeneration.
 */
import zlib from "node:zlib";
import { estimateWordTimings } from "../captions";
import { estimateSpeechSeconds } from "../rendering/timeline";
import type {
  ImageProvider,
  ImageRequest,
  ImageResult,
  Providers,
  SfxProvider,
  SpeechRequest,
  SpeechResult,
  StockCandidate,
  StockProvider,
  TtsProvider,
  VideoClipRequest,
  VideoClipResult,
  VideoProvider,
} from "./types";
import { MockLlm } from "../ai/providers/mock";

/* ---------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A valid RGB PNG of a solid colour (default 8x8). */
export const solidPng = (width = 8, height = 8, rgb: [number, number, number] = [40, 80, 160]): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

/* ---------------------------------------------------------------- WAV */

/** A valid 16-bit mono PCM WAV of silence. */
export const silentWav = (seconds: number, sampleRate = 16000): Buffer => {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16); // PCM chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28); // byte rate
  b.writeUInt16LE(2, 32); // block align
  b.writeUInt16LE(16, 34); // bits per sample
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataBytes, 40);
  return b;
};
export const wavDurationSeconds = (wav: Buffer) => wav.readUInt32LE(40) / wav.readUInt32LE(28);

/* ---------------------------------------------------------------- mocks */

const free = (description: string) => ({ estimatedUsd: 0, actualUsd: 0, description });

export class MockImages implements ImageProvider {
  readonly name = "mock-images";
  readonly model = "mock-image-1";
  calls = 0;
  prompts: string[] = [];
  estimateUsd() {
    return 0.01;
  }
  async generate(req: ImageRequest): Promise<ImageResult> {
    this.calls++;
    this.prompts.push(req.prompt);
    return { data: solidPng(), extension: "png", model: this.model, cost: free("mock image") };
  }
}

export class MockVideo implements VideoProvider {
  readonly name = "mock-video";
  readonly model = "mock-video-1";
  calls = 0;
  requests: VideoClipRequest[] = [];
  estimateUsd(req: VideoClipRequest) {
    return 0.1 * req.durationSeconds;
  }
  async generate(req: VideoClipRequest): Promise<VideoClipResult> {
    this.calls++;
    this.requests.push(req);
    // Not a playable video: tests that render must not rely on mock clips.
    return { data: Buffer.from("MOCK-VIDEO"), model: this.model, cost: free("mock clip") };
  }
}

export const MOCK_STOCK_CANDIDATES: StockCandidate[] = [
  { kind: "image", id: "mock-photo-1", url: "mock://photo-1.png", pageUrl: "https://www.pexels.com/photo/ocean-waves-at-sunset-1/", width: 1080, height: 1920, author: "Mock Author", authorUrl: "https://www.pexels.com/@mock", description: "ocean waves at sunset" },
  { kind: "image", id: "mock-photo-2", url: "mock://photo-2.png", pageUrl: "https://www.pexels.com/photo/city-street-at-night-2/", width: 1920, height: 1080, author: "Mock Author", authorUrl: "https://www.pexels.com/@mock", description: "city street at night" },
  { kind: "video", id: "mock-video-1", url: "mock://video-1.mp4", pageUrl: "https://www.pexels.com/video/forest-aerial-3/", width: 1080, height: 1920, durationSeconds: 12, author: "Mock Author", authorUrl: "https://www.pexels.com/@mock", description: "forest aerial" },
];

export class MockStock implements StockProvider {
  readonly name = "mock-stock";
  readonly license = "Mock license (tests only)";
  searches = 0;
  downloads = 0;
  constructor(private readonly candidates: StockCandidate[] = MOCK_STOCK_CANDIDATES) {}
  async search(_query: string, opts: { kind: "image" | "video" }) {
    this.searches++;
    return this.candidates.filter((c) => c.kind === opts.kind).map((c) => ({ ...c }));
  }
  async download(_c: StockCandidate) {
    this.downloads++;
    return solidPng();
  }
  attribution(c: StockCandidate) {
    return `${c.kind === "video" ? "Video" : "Photo"} by ${c.author} (mock)`;
  }
}

/** Deterministic "real" TTS: silent WAV whose length matches the estimated speech; word timings are exact for that WAV. */
export class MockTts implements TtsProvider {
  readonly name: string = "mock-tts";
  readonly real = true;
  calls = 0;
  texts: string[] = [];
  estimateUsd(text: string) {
    return text.length / 1000 * 0.2;
  }
  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    this.calls++;
    this.texts.push(req.text);
    const seconds = Math.max(0.5, Math.round(estimateSpeechSeconds(req.text) * 100) / 100);
    const audio = silentWav(seconds);
    const durationSeconds = wavDurationSeconds(audio);
    return {
      audio,
      extension: "wav",
      durationSeconds,
      words: estimateWordTimings(req.text, durationSeconds * 1000),
      timing: "tts-alignment",
      voiceId: req.voiceId ?? "mock-voice",
      cost: free("mock tts"),
    };
  }
}

export class MockSfx implements SfxProvider {
  readonly name = "mock-sfx";
  calls = 0;
  estimateUsd(seconds: number) {
    return seconds * 0.01;
  }
  async generate(_prompt: string, seconds: number) {
    this.calls++;
    return { audio: silentWav(seconds), cost: free("mock sfx") };
  }
}

export type MockProviders = Providers & {
  llm: MockLlm;
  images: MockImages;
  video: MockVideo;
  stock: MockStock;
  tts: MockTts;
  sfx: MockSfx;
};

/** Full set of mocks with counters. */
export const createMockProviders = (): MockProviders => ({
  llm: new MockLlm(),
  images: new MockImages(),
  video: new MockVideo(),
  stock: new MockStock(),
  tts: new MockTts(),
  sfx: new MockSfx(),
});
