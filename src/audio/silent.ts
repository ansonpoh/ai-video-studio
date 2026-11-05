/** Silent narration for offline/demo mode: no audio, estimated word timing (clearly labelled). */
import type { TtsProvider } from "../providers/types";
import { estimateWordTimings } from "../captions";
import { estimateSpeechSeconds } from "../rendering/timeline";

export const silentTts: TtsProvider = {
  name: "silent",
  real: false,
  estimateUsd: () => 0,
  async synthesize({ text }) {
    const seconds = estimateSpeechSeconds(text);
    return { audio: null, extension: "mp3", durationSeconds: seconds, words: estimateWordTimings(text, seconds * 1000), timing: "estimated", cost: { estimatedUsd: 0, description: "silent" } };
  },
};
