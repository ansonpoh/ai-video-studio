/**
 * Chooses concrete adapters from the environment. Anything without a key
 * degrades to an honest fallback (null => pipeline uses procedural visuals;
 * SilentTts => estimated caption timing). The LLM is special: there is no
 * silent fallback for arbitrary prompts, so without ANTHROPIC_API_KEY we return
 * a provider that throws MissingCredentialsError when (and only when) a method
 * is called - the offline demo path never calls it and keeps working.
 */
import { env, falImageKey, videoKey, type Env } from "../config/env";
import { AnthropicLlm } from "../ai/providers/anthropic";
import { MockLlm } from "../ai/providers/mock";
import { OpenAiImages } from "../media/images/openai";
import { FalImages } from "../media/images/fal";
import { FalVideo } from "../media/video/fal";
import { PexelsStock } from "../media/stock/pexels";
import { ElevenLabsSfx, ElevenLabsTts, SilentTts } from "../audio/elevenlabs";
import { EdgeTts } from "../audio/edge";
import { FallbackTts } from "../audio/fallback";
import { MissingCredentialsError, type LlmProvider, type Providers } from "./types";

export type CreateProvidersOptions = {
  /** Force offline: no paid/network providers at all. */
  offline?: boolean;
  llm?: "anthropic" | "mock";
  /** Default true. */
  allowStock?: boolean;
  /** Default true. */
  allowVideo?: boolean;
  /** Override env (tests). */
  env?: Env;
};

/** LLM placeholder that fails loudly, and only when used. */
export class UnavailableLlm implements LlmProvider {
  readonly name = "unavailable";
  readonly model: string;
  constructor(model = "none") {
    this.model = model;
  }
  private fail(): never {
    throw new MissingCredentialsError("Script & storyboard generation", ["ANTHROPIC_API_KEY"]);
  }
  async direction(): Promise<never> {
    this.fail();
  }
  async script(): Promise<never> {
    this.fail();
  }
  async storyboard(): Promise<never> {
    this.fail();
  }
  async rewriteScene(): Promise<never> {
    this.fail();
  }
  async reviewClaims(): Promise<never> {
    this.fail();
  }
}

export const createProviders = (opts: CreateProvidersOptions = {}): Providers => {
  const e = opts.env ?? env();
  const offline = Boolean(opts.offline);
  const allowStock = opts.allowStock ?? true;
  const allowVideo = opts.allowVideo ?? true;

  let llm: LlmProvider;
  if (opts.llm === "mock") llm = new MockLlm();
  else if (!offline && e.ANTHROPIC_API_KEY) llm = new AnthropicLlm({ apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL, effort: e.ANTHROPIC_EFFORT });
  else llm = new UnavailableLlm(e.ANTHROPIC_MODEL);

  if (offline) return { llm, images: null, video: null, stock: null, tts: new SilentTts(), sfx: null };

  const vk = videoKey(e);
  const falOn = allowVideo && vk && (e.VIDEO_PROVIDER ?? "fal") === "fal";
  const imageKey = falImageKey(e);
  const imagesBudget = imageKey ? new FalImages({ apiKey: imageKey, model: e.IMAGE_BUDGET_MODEL, pricePerMegapixel: e.PRICE_IMAGE_BUDGET_PER_MP }) : null;
  return {
    llm,
    images: e.OPENAI_API_KEY ? new OpenAiImages({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_IMAGE_MODEL }) : imagesBudget,
    imagesBudget,
    video: falOn ? new FalVideo({ apiKey: vk, model: e.VIDEO_MODEL }) : null,
    videoBackground: falOn && e.VIDEO_BACKGROUND_MODEL ? new FalVideo({ apiKey: vk, model: e.VIDEO_BACKGROUND_MODEL, pricePerSecond: e.PRICE_VIDEO_BACKGROUND_PER_SECOND }) : null,
    stock: allowStock && e.PEXELS_API_KEY ? new PexelsStock({ apiKey: e.PEXELS_API_KEY }) : null,
    tts: e.ELEVENLABS_API_KEY ? new FallbackTts(new ElevenLabsTts({ apiKey: e.ELEVENLABS_API_KEY, voiceId: e.ELEVENLABS_VOICE_ID, model: e.ELEVENLABS_MODEL }), new EdgeTts({ voice: e.EDGE_TTS_VOICE })) : new SilentTts(),
    sfx: e.ELEVENLABS_API_KEY ? new ElevenLabsSfx({ apiKey: e.ELEVENLABS_API_KEY }) : null,
  };
};

/** Human-readable one-liners per capability (safe to log/show: no secrets). */
export const providerSummary = (p: Providers): Record<string, string> => ({
  llm: p.llm.name === "unavailable" ? "unavailable (set ANTHROPIC_API_KEY)" : p.llm.name === "mock" ? `mock (${p.llm.model}, offline placeholder content)` : `${p.llm.name}:${p.llm.model}`,
  images: p.images ? `${p.images.name}:${p.images.model}` : "off (procedural motion graphics)",
  video: p.video ? `${p.video.name}:${p.video.model}` : "off (animated stills)",
  videoBackground: p.videoBackground ? `${p.videoBackground.name}:${p.videoBackground.model}` : "off (animated stills)",
  stock: p.stock ? p.stock.name : "off",
  tts: p.tts.real ? p.tts.name : `${p.tts.name} (no narration audio; estimated caption timing)`,
  sfx: p.sfx ? p.sfx.name : "off",
});
