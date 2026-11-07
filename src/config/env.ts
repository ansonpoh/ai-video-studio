/**
 * Environment configuration (server-side only; never imported by browser code).
 * Loads .env, exposes typed settings and a capability report that explains
 * what works with the keys that are present.
 */
import "dotenv/config";
import { z } from "zod";

const num = (fallback: number) => z.preprocess((v) => (v === undefined || v === "" ? undefined : Number(v)), z.number().default(fallback));
const str = (fallback?: string) => z.preprocess((v) => (v === "" ? undefined : v), fallback === undefined ? z.string().optional() : z.string().default(fallback));

export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: str(),
  ANTHROPIC_MODEL: str("claude-opus-5-5"),
  ANTHROPIC_EFFORT: str("medium"),

  OPENAI_API_KEY: str(),
  OPENAI_IMAGE_MODEL: str("gpt-image-2"),
  OPENAI_IMAGE_QUALITY: str("medium"),

  ELEVENLABS_API_KEY: str(),
  ELEVENLABS_VOICE_ID: str("JBFqnCBsd6RMkjVDRZzb"),
  ELEVENLABS_MODEL: str("eleven_multilingual_v2"),

  PEXELS_API_KEY: str(),

  VIDEO_PROVIDER: str("fal"),
  VIDEO_PROVIDER_API_KEY: str(),
  FAL_KEY: str(),
  VIDEO_MODEL: str("fal-ai/kling-video/v2.5-turbo/pro/image-to-video"),
  /** Cheaper fal model for background shots in the hybrid preset. Empty = animated stills instead. */
  VIDEO_BACKGROUND_MODEL: str(),
  VIDEO_CLIP_SECONDS: num(5),
  VIDEO_RESOLUTION: str("720p"),

  MAX_GENERATION_BUDGET_USD: num(5),

  // Price assumptions for estimates (USD). Override when your plan differs.
  PRICE_LLM_INPUT_PER_MTOK: num(4),
  PRICE_LLM_OUTPUT_PER_MTOK: num(20),
  PRICE_IMAGE_LOW: num(0.02),
  PRICE_IMAGE_MEDIUM: num(0.06),
  PRICE_IMAGE_HIGH: num(0.2),
  PRICE_VIDEO_PER_SECOND: num(0.07),
  PRICE_VIDEO_BACKGROUND_PER_SECOND: num(0.04),
  PRICE_TTS_PER_1K_CHARS: num(0.2),
  PRICE_SFX_PER_SECOND: num(0.01),

  REMOTION_BROWSER_EXECUTABLE: str(),
  RENDER_CONCURRENCY: str(),
});
export type Env = z.infer<typeof EnvSchema>;

export const env = (): Env => EnvSchema.parse(process.env);

export const videoKey = (e = env()) => e.VIDEO_PROVIDER_API_KEY ?? e.FAL_KEY;

export type Capability = { name: string; available: boolean; provider: string; detail: string; envVars: string[] };

export const capabilities = (e = env()): Capability[] => [
  { name: "Script & storyboard (Claude)", available: Boolean(e.ANTHROPIC_API_KEY), provider: `anthropic:${e.ANTHROPIC_MODEL}`, detail: e.ANTHROPIC_API_KEY ? "Live creative direction, script and storyboard" : "Missing key: arbitrary prompts are unavailable; the offline demo still works", envVars: ["ANTHROPIC_API_KEY"] },
  { name: "AI images", available: Boolean(e.OPENAI_API_KEY), provider: `openai:${e.OPENAI_IMAGE_MODEL}`, detail: e.OPENAI_API_KEY ? "Generated scene imagery" : "Falls back to procedural motion graphics", envVars: ["OPENAI_API_KEY"] },
  { name: "AI video clips", available: Boolean(videoKey(e)), provider: `${e.VIDEO_PROVIDER}:${e.VIDEO_MODEL}`, detail: videoKey(e) ? `Image-to-video clips for the hook and key moments${e.VIDEO_BACKGROUND_MODEL ? `; background shots on ${e.VIDEO_BACKGROUND_MODEL}` : ""}` : "Animated stills are used instead", envVars: ["VIDEO_PROVIDER_API_KEY", "FAL_KEY"] },
  { name: "Stock media (Pexels)", available: Boolean(e.PEXELS_API_KEY), provider: "pexels", detail: e.PEXELS_API_KEY ? "Licensed stock photos and clips with attribution" : "Stock search disabled", envVars: ["PEXELS_API_KEY"] },
  { name: "Narration (ElevenLabs)", available: Boolean(e.ELEVENLABS_API_KEY), provider: `elevenlabs:${e.ELEVENLABS_MODEL}`, detail: e.ELEVENLABS_API_KEY ? "Voice with word-level timing for captions" : "Silent mode with estimated caption timing (clearly labelled)", envVars: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"] },
  { name: "Sound effects (ElevenLabs)", available: Boolean(e.ELEVENLABS_API_KEY), provider: "elevenlabs:sound-generation", detail: e.ELEVENLABS_API_KEY ? "Optional generated sound effects" : "No sound effects", envVars: ["ELEVENLABS_API_KEY"] },
];

/** Safe for the browser: names and booleans only, never key values. */
export const publicCapabilities = () => capabilities().map(({ name, available, provider, detail, envVars }) => ({ name, available, provider, detail, envVars }));
