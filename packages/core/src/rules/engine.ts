import type { RuleContext, RuleFunction, RuleResult } from '../types/rules.js';
import {
  ruleNonUpiScheme,
  ruleHttpNotHttps,
  ruleIpAddressUrl,
  ruleShortenedUrl,
  ruleSuspiciousTld,
  rulePunycodeDomain
} from './rules-protocol.js';
import {
  ruleUnknownPsp,
  ruleVpaHighEntropy,
  ruleVpaExcessiveDigits,
  ruleVpaImpersonation
} from './rules-vpa.js';
import {
  ruleMissingPayeeName,
  ruleNameVpaMismatch,
  ruleUrgencyKeywords
} from './rules-payee.js';
import {
  ruleHighAmount,
  ruleRoundBaitAmount,
  ruleRefundVerifyNote,
  ruleMissingMcBusiness
} from './rules-transaction.js';
import {
  ruleDuplicateParameters,
  ruleUnknownParameters,
  ruleOversizedPayload,
  ruleInvalidCurrency
} from './rules-payload.js';
import {
  ruleCommunityHighReports,
  ruleCommunityRecentReports
} from './rules-community.js';

export const ALL_RULES: readonly RuleFunction[] = [
  // Protocol & URL
  ruleNonUpiScheme,
  ruleHttpNotHttps,
  ruleIpAddressUrl,
  ruleShortenedUrl,
  ruleSuspiciousTld,
  rulePunycodeDomain,
  // VPA & PSP
  ruleUnknownPsp,
  ruleVpaHighEntropy,
  ruleVpaExcessiveDigits,
  ruleVpaImpersonation,
  // Payee
  ruleMissingPayeeName,
  ruleNameVpaMismatch,
  ruleUrgencyKeywords,
  // Transaction
  ruleHighAmount,
  ruleRoundBaitAmount,
  ruleRefundVerifyNote,
  ruleMissingMcBusiness,
  // Integrity
  ruleDuplicateParameters,
  ruleUnknownParameters,
  ruleOversizedPayload,
  ruleInvalidCurrency,
  // Community
  ruleCommunityHighReports,
  ruleCommunityRecentReports
];

export interface RuleEvaluationResult {
  readonly allResults: readonly RuleResult[];
  readonly triggeredRules: readonly RuleResult[];
  readonly ruleRiskScore: number; // 0 to 100
}

/**
 * Evaluates all security rules against the parsed payload and context.
 */
export function evaluateRules(
  ctx: RuleContext,
  customRules: readonly RuleFunction[] = ALL_RULES
): RuleEvaluationResult {
  const allResults: RuleResult[] = [];
  const triggeredRules: RuleResult[] = [];

  for (const ruleFn of customRules) {
    const res = ruleFn(ctx);
    allResults.push(res);
    if (res.triggered) {
      triggeredRules.push(res);
    }
  }

  // Calculate deterministic rule risk score:
  // Starts with max weight of triggered rules, then accumulates remaining weights with diminishing returns
  if (triggeredRules.length === 0) {
    return {
      allResults,
      triggeredRules,
      ruleRiskScore: 0
    };
  }

  const sortedWeights = triggeredRules
    .map((r) => r.weight)
    .sort((a, b) => b - a);

  const highestWeight = sortedWeights[0] ?? 0;
  let accumulated = highestWeight;

  for (let i = 1; i < sortedWeights.length; i++) {
    const w = sortedWeights[i] ?? 0;
    // Diminishing factor based on remaining headroom
    const headroom = 100 - accumulated;
    accumulated += (w / 100) * (headroom * 0.45);
  }

  const ruleRiskScore = Math.min(100, Math.round(accumulated));

  return {
    allResults,
    triggeredRules,
    ruleRiskScore
  };
}
