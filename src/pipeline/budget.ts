/**
 * Generation cost controls: quality presets, spend estimates, and the
 * approval gate that stops expensive batches from starting silently.
 */
import type { QualityPreset, VideoRequest } from "../schemas/options";
import type { CostEntry, PipelineManifest } from "../schemas/project";
import { env } from "../config/env";

export type PresetRules = {
  imageQuality: "low" | "medium" | "high";
  /** Premium clips (VIDEO_MODEL): the hook plus the scenes that most need real motion. */
  maxVideoClips: number;
  /** Cheap clips (VIDEO_BACKGROUND_MODEL) for background shots; 0 or no model = animated stills. */
  backgroundClips: number;
  /** Prefer generated imagery on this share of non-diagram scenes (rest use motion graphics). */
  generatedImageShare: number;
  soundEffects: boolean;
  /** Generate stills on the budget image model (IMAGE_BUDGET_MODEL) when one is configured. */
  budgetImages?: boolean;
};

export const PRESETS: Record<QualityPreset, PresetRules> = {
  economy: { imageQuality: "low", maxVideoClips: 0, backgroundClips: 0, generatedImageShare: 0.6, soundEffects: false },
  hybrid: { imageQuality: "medium", maxVideoClips: 3, backgroundClips: 2, generatedImageShare: 1, soundEffects: true },
  balanced: { imageQuality: "medium", maxVideoClips: 2, backgroundClips: 0, generatedImageShare: 0.8, soundEffects: true },
  premium: { imageQuality: "high", maxVideoClips: 5, backgroundClips: 0, generatedImageShare: 1, soundEffects: true },
  explainer: { imageQuality: "medium", maxVideoClips: 0, backgroundClips: 0, generatedImageShare: 1, soundEffects: false, budgetImages: true },
  drawn: { imageQuality: "low", maxVideoClips: 0, backgroundClips: 0, generatedImageShare: 0, soundEffects: false },
};

export type PlannedCost = { category: CostEntry["category"]; provider: string; description: string; estimatedUsd: number };

export class BudgetApprovalRequired extends Error {
  constructor(
    public estimateUsd: number,
    public budgetUsd: number,
    public breakdown: PlannedCost[],
  ) {
    super(
      `Estimated spend $${estimateUsd.toFixed(2)} exceeds the $${budgetUsd.toFixed(2)} limit. Re-run with approval (CLI: --approve-spend ${Math.ceil(estimateUsd * 100) / 100}; UI: confirm the estimate) or choose a cheaper preset.`,
    );
    this.name = "BudgetApprovalRequired";
  }
}

/**
 * Storyboard preview gate: stills are made, clips are planned but not paid
 * for until the user approves (or skips) them. The message format is parsed
 * by src/web/jobs.ts.
 */
export class ClipApprovalRequired extends Error {
  constructor(
    public clips: { sceneId: string; tier: "hero" | "background"; model: string; estimatedUsd: number }[],
    public estimateUsd: number,
  ) {
    super(
      `Storyboard ready for review: ${clips.length} AI clip(s) planned (about $${estimateUsd.toFixed(2)}). Check the stills, then approve the clips (CLI: resume --clips approve; UI: Approve clips) or skip them and keep animated stills (--clips skip).`,
    );
    this.name = "ClipApprovalRequired";
  }
}

export const budgetFor = (req: VideoRequest) => req.budgetUsd ?? env().MAX_GENERATION_BUDGET_USD;

export const spentSoFar = (m: PipelineManifest) => m.costs.filter((c) => !c.cached).reduce((a, c) => a + (c.actualUsd ?? c.estimatedUsd), 0);

/**
 * Throws BudgetApprovalRequired when (already spent + planned) exceeds the
 * budget and the user has not approved at least that amount.
 */
export const enforceBudget = (req: VideoRequest, manifest: PipelineManifest, planned: PlannedCost[]) => {
  const budget = budgetFor(req);
  const total = spentSoFar(manifest) + planned.reduce((a, p) => a + p.estimatedUsd, 0);
  const approved = req.approveSpendUsd ?? 0;
  if (total > budget + 1e-9 && total > approved + 1e-9) throw new BudgetApprovalRequired(total, budget, planned);
  return { total, budget };
};

export const recordCost = (m: PipelineManifest, entry: Omit<CostEntry, "at" | "cached"> & { cached?: boolean }) => {
  m.costs.push({ at: new Date().toISOString(), cached: false, ...entry });
};

export const costSummary = (m: PipelineManifest) => {
  const by: Record<string, number> = {};
  for (const c of m.costs) by[c.category] = (by[c.category] ?? 0) + (c.cached ? 0 : c.actualUsd ?? c.estimatedUsd);
  return { totalUsd: Object.values(by).reduce((a, b) => a + b, 0), byCategory: by, cachedHits: m.costs.filter((c) => c.cached).length };
};
