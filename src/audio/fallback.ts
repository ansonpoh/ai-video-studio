/**
 * ElevenLabs while its credits last, then a free voice. A video should keep one
 * voice, so prepare() checks the balance first and switches the whole run when
 * the script won't fit. If credits still run out mid-run, the provider stays on
 * the fallback, and the narration stage redoes the scenes already voiced.
 */
import { OutOfCreditsError } from "./elevenlabs";
import type { SpeechRequest, SpeechResult, TtsProvider } from "../providers/types";

export class FallbackTts implements TtsProvider {
  readonly real = true;
  private exhausted = false;

  constructor(
    private readonly primary: Pick<TtsProvider, "name" | "estimateUsd" | "synthesize"> & { remainingCharacters(): Promise<number | null> },
    private readonly fallback: TtsProvider,
  ) {}

  get name() {
    return this.exhausted ? this.fallback.name : this.primary.name;
  }

  estimateUsd(text: string) {
    return this.exhausted ? this.fallback.estimateUsd(text) : this.primary.estimateUsd(text);
  }

  async prepare(totalChars: number): Promise<string | null> {
    this.exhausted = false;
    const left = await this.primary.remainingCharacters();
    if (left === null || left >= totalChars) return null;
    this.exhausted = true;
    return `${this.primary.name} has ${left} characters left but this narration needs ${totalChars}; using ${this.fallback.name} for the whole video`;
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    if (this.exhausted) return this.fallback.synthesize(req);
    try {
      return await this.primary.synthesize(req);
    } catch (err) {
      if (!(err instanceof OutOfCreditsError)) throw err;
      this.exhausted = true;
      return this.fallback.synthesize(req);
    }
  }
}
