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
import { isUtilityNonPaymentScheme } from '../parser/payload-parser.js';

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

  // Special Handling for Benign Non-Payment Utility QR Codes (Wi-Fi, mailto, tel, etc.):
  // These do not initiate UPI payment transactions and must NOT be flagged as payment scams.
  if (isUtilityNonPaymentScheme(ctx.parsed)) {
    const scheme =
      (ctx.parsed.fields.kind === 'other' && ctx.parsed.fields.other.detectedScheme) ||
      'utility';
    return {
      score: 0,
      category: 'SAFE',
      reasons: [],
      confidenceNote: `Not a payment QR code (${scheme}). This is a utility code (such as Wi-Fi, email, or telephone) that does not initiate a payment transaction and is not flagged as a scam.`,
      disclaimer: config.defaultDisclaimer,
      isSafeWithCaveat: false,
      isNonPaymentQr: true,
      scoreBreakdown: {
        ruleScore: 0,
        mlProbability: 0,
        mlScore: 0,
        mlWeight: config.mlWeight,
        communityPenalty: 0,
        rawCombinedScore: 0,
        finalScore: 0
      },
      features,
      modelVersion: model.version,
      evaluatedAt: new Date().toISOString(),
      isOfflineEvaluation: isOffline,
      parsed: ctx.parsed
    };
  }

  // 1. Run ML inference
  const mlProbability = predictRandomForest(model, features);
  const mlScore = Math.round(mlProbability * 100);

  // 2. Additional community penalty with decay weighting if present
  let communityPenalty = 0;
  if (ctx.community && ctx.community.reportCount > 0) {
    const effectiveWeight = ctx.community.decayedScore ?? ctx.community.reportCount;
    communityPenalty = Math.min(25, Math.round(effectiveWeight * 8));
  }

  // 3. Weighted blend
  const rawCombined =
    ruleRiskScore * config.ruleWeight +
    mlScore * config.mlWeight +
    communityPenalty;

  let finalScore = Math.min(100, Math.max(0, Math.round(rawCombined)));

  // 4. Critical Rule Override:
  // If the deterministic rule engine triggers any rule with severity 'critical',
  // the rule engine overrides the statistical ML model to prevent score dilution.
  // The result is strictly guaranteed to be at minimum HIGH_RISK (score >= 75).
  const hasCriticalRule = triggeredRules.some((r) => r.severity === 'critical');
  let isCriticalRuleOverride = false;

  if (hasCriticalRule && finalScore < 75) {
    finalScore = Math.max(75, ruleRiskScore);
    isCriticalRuleOverride = true;
  }

  // 5. Categorization: 0-30 Safe, 31-70 Suspicious, 71-100 High Risk
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
  // If evidence is insufficient or no registered-name check ran, explicitly state unverified recipient identity.
  let confidenceNote = '';
  const hasUnknownPsp = triggeredRules.some((r) => r.id === 'RULE_UNKNOWN_PSP');
  const hasRegisteredNameCheck = Boolean(
    ctx.pspLookup && ctx.pspLookup.isValid && ctx.pspLookup.registeredName
  );

  if (category === 'SAFE') {
    if (!hasRegisteredNameCheck) {
      confidenceNote = 'No major risk indicators found; recipient identity NOT independently verified';
    } else {
      confidenceNote = `No major risk indicators found; bank-registered recipient identity verified as "${ctx.pspLookup!.registeredName}".`;
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
    finalScore,
    ...(isCriticalRuleOverride ? { isCriticalRuleOverride: true } : {})
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
