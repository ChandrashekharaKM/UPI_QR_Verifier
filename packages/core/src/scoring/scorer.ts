import type {
  RiskCategory,
  ReasonItem,
  ScoreBreakdown,
  VerificationResult
} from '../types/result.js';
import type { RuleResult, RuleContext } from '../types/rules.js';
import type { FeatureVector } from '../types/features.js';
import type { RandomForestModel } from '../types/model.js';
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from './config.js';
import { predictRandomForest } from '../ml/inference.js';

export interface ScoreCalculationInput {
  readonly ctx: RuleContext;
  readonly triggeredRules: readonly RuleResult[];
  readonly ruleRiskScore: number;
  readonly features: FeatureVector;
  readonly model: RandomForestModel;
  readonly config?: Partial<ScoringConfig>;
  readonly isOffline?: boolean;
}

/**
 * Calculates risk score, maps to category, formats ranked reasons, and produces confidence notes.
 */
export function calculateVerificationScore(input: ScoreCalculationInput): VerificationResult {
  const { ctx, triggeredRules, ruleRiskScore, features, model, isOffline = false } = input;
  const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...input.config };

  // 1. Run ML inference
  const mlProbability = predictRandomForest(model, features);
  const mlScore = Math.round(mlProbability * 100);

  // 2. Additional community penalty if present
  let communityPenalty = 0;
  if (ctx.community && ctx.community.reportCount > 0) {
    communityPenalty = Math.min(25, ctx.community.reportCount * 8);
  }

  // 3. Weighted blend
  const rawCombined =
    ruleRiskScore * config.ruleWeight +
    mlScore * config.mlWeight +
    communityPenalty;

  const finalScore = Math.min(100, Math.max(0, Math.round(rawCombined)));

  // 4. Categorization: 0-30 Safe, 31-70 Suspicious, 71-100 High Risk
  let category: RiskCategory;
  if (finalScore <= config.safeThresholdMax) {
    category = 'SAFE';
  } else if (finalScore <= config.suspiciousThresholdMax) {
    category = 'SUSPICIOUS';
  } else {
    category = 'HIGH_RISK';
  }

  // 5. Reasons ranked by descending impact (weight)
  const reasons: ReasonItem[] = triggeredRules
    .map((rule) => {
      let evidenceSummary: string | undefined;
      if (rule.evidence && rule.evidence.length > 0) {
        evidenceSummary = rule.evidence
          .map((e) => `${e.key}: ${String(e.value)}`)
          .join(', ');
      }
      return {
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        message: rule.message,
        impact: rule.weight,
        ...(evidenceSummary ? { evidenceSummary } : {})
      };
    })
    .sort((a, b) => b.impact - a.impact);

  // 6. Confidence Note
  // If evidence is insufficient (e.g. unknown VPA, no history, no merchant info), add explicit "Unverified" note.
  // Never show a bare "Safe": the Safe message must be "No major risk indicators found; verify the receiver before paying."
  let confidenceNote = '';
  const isUpi = ctx.parsed.kind === 'upi';
  const hasMerchant = isUpi && ctx.parsed.fields.kind === 'upi' && Boolean(ctx.parsed.fields.upi.mc);
  const hasReports = Boolean(ctx.community && ctx.community.reportCount > 0);
  const hasUnknownPsp = triggeredRules.some((r) => r.id === 'RULE_UNKNOWN_PSP');

  if (category === 'SAFE') {
    if (!hasMerchant && !hasReports) {
      confidenceNote = 'Unverified recipient: No previous history or merchant records found. No major risk indicators found; verify the receiver before paying.';
    } else {
      confidenceNote = 'No major risk indicators found; verify the receiver before paying.';
    }
  } else if (category === 'SUSPICIOUS') {
    if (hasUnknownPsp) {
      confidenceNote = 'Caution: Recipient uses an unverified PSP handle or exhibits atypical parameters. Verify identity independently.';
    } else {
      confidenceNote = 'Suspicious indicators detected. Carefully confirm the transaction purpose before entering your PIN.';
    }
  } else {
    confidenceNote = 'HIGH RISK: Critical fraud indicators or deceptive patterns detected. Do NOT proceed with payment.';
  }

  const scoreBreakdown: ScoreBreakdown = {
    ruleScore: ruleRiskScore,
    mlProbability,
    mlScore,
    mlWeight: config.mlWeight,
    communityPenalty,
    rawCombinedScore: Math.round(rawCombined * 10) / 10,
    finalScore
  };

  return {
    score: finalScore,
    category,
    reasons,
    confidenceNote,
    disclaimer: config.defaultDisclaimer,
    isSafeWithCaveat: category === 'SAFE',
    scoreBreakdown,
    features,
    modelVersion: model.version,
    evaluatedAt: new Date().toISOString(),
    isOfflineEvaluation: isOffline,
    parsed: ctx.parsed
  };
}
