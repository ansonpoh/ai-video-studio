/**
 * Rule-based content integrity checks. These never invent sources; they flag
 * what a human should review before publishing.
 */
import type { ContentFlag } from "../schemas/project";
import type { CreativeDirection, Scene } from "../schemas/storyboard";
import type { PromptHints } from "../providers/types";

const STAT_RE = /\b\d[\d,.]*\s?(%|percent|million|billion|trillion|thousand|times|x\b|km|kg|°|degrees|kelvin|years?)/i;
const QUOTE_RE = /["“”]/;

export const checkContent = (opts: {
  direction: CreativeDirection;
  scenes: Scene[];
  hints: PromptHints;
  retrievalAvailable: boolean;
  usesGeneratedMedia: boolean;
  usesStock: boolean;
}): ContentFlag[] => {
  const flags: ContentFlag[] = [];
  const { direction, scenes, hints } = opts;
  const factual = ["factual", "instructional", "promotional"].includes(direction.contentKind);

  for (const s of scenes) {
    for (const c of s.claims) {
      if (c.kind === "statistic" && !c.sourceUrl) flags.push({ severity: "review", kind: "statistic-needs-source", sceneId: s.id, message: `Statistic without a source: "${c.text}"` });
      if (c.kind === "quote" && !c.sourceUrl) flags.push({ severity: "review", kind: "quote-needs-source", sceneId: s.id, message: `Quote without a source: "${c.text}"` });
      if (c.kind === "fact" && c.confidence < 0.6) flags.push({ severity: "review", kind: "unsupported-claim", sceneId: s.id, message: `Low-confidence claim: "${c.text}"` });
      if (c.kind === "speculation") flags.push({ severity: "info", kind: "speculation", sceneId: s.id, message: `Speculative: "${c.text}" (labelled on screen)` });
    }
    // Numbers in narration that no claim covers.
    if (factual && STAT_RE.test(s.narration) && !s.claims.some((c) => c.kind === "statistic" || c.kind === "fact")) {
      flags.push({ severity: "review", kind: "statistic-needs-source", sceneId: s.id, message: `Narration contains a figure with no recorded claim: "${s.narration.match(STAT_RE)?.[0]}"` });
    }
    if (QUOTE_RE.test(s.narration) && !s.claims.some((c) => c.kind === "quote")) {
      flags.push({ severity: "review", kind: "quote-needs-source", sceneId: s.id, message: "Narration appears to quote someone; add the source or rephrase." });
    }
    if (s.layout === "quote" && !s.claims.some((c) => c.kind === "quote" && c.sourceUrl) && direction.contentKind !== "fiction") {
      flags.push({ severity: "review", kind: "quote-needs-source", sceneId: s.id, message: `Quote card "${s.quote.slice(0, 60)}" needs a verifiable source.` });
    }
    const prompt = `${s.visual.prompt ?? ""} ${s.visual.description}`;
    if (/\b(photo(realistic)?|realistic)\b/i.test(prompt) && /\b(president|ceo|celebrity|minister|actor|singer)\b/i.test(prompt)) {
      flags.push({ severity: "review", kind: "misleading-visual", sceneId: s.id, message: "Photorealistic depiction of a public figure: generated imagery could mislead." });
    }
  }
  if (hints.mentionsRealPerson) flags.push({ severity: "review", kind: "real-person", message: "The prompt mentions a real person. Do not generate their likeness or clone their voice without authorization." });
  if ((direction.timeSensitive || hints.timeSensitive) && !opts.retrievalAvailable)
    flags.push({ severity: "review", kind: "time-sensitive", message: "Topic is time-sensitive and no retrieval provider is configured: facts may be outdated and must be checked." });
  if (direction.contentKind === "fiction") flags.push({ severity: "info", kind: "fiction", message: "Fictional content: keep it labelled as fiction when publishing." });
  if (opts.usesGeneratedMedia) flags.push({ severity: "info", kind: "synthetic-media", message: "Contains AI-generated media. Use the platform's AI-content label when publishing." });
  if (opts.usesStock) flags.push({ severity: "info", kind: "licensing", message: "Contains Pexels stock media: attribution is stored in assets.json and credits.txt." });
  if (factual && direction.needsFactCheck && !scenes.some((s) => s.claims.some((c) => c.sourceUrl)))
    flags.push({ severity: "review", kind: "unsupported-claim", message: "Informational video with no cited sources. Verify the facts before publishing." });
  return flags;
};

export const requiresReview = (flags: ContentFlag[]) => flags.some((f) => f.severity !== "info");
