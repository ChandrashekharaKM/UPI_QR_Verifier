import type { ParsedPayload } from './payload.js';
import type { RuleSeverity } from './rules.js';
import type { FeatureVector } from './features.js';

export type RiskCategory = 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';

export interface ReasonItem {
  readonly ruleId: string;
  readonly severity: RuleSeverity;
  readonly title: string;
  readonly message: string;
  readonly impact: number; // Impact points (higher impact ordered first)
  readonly evidenceSummary?: string;
}

export interface ScoreBreakdown {
  readonly ruleScore: number;          // Deterministic score (0 - 100)
  readonly mlProbability: number;      // ML scam probability (0.0 - 1.0)
  readonly mlScore: number;            // ML contribution scaled (0 - 100)
  readonly mlWeight: number;           // Weight given to ML in blend
  readonly communityPenalty: number;   // Injected community penalty
  readonly rawCombinedScore: number;   // Before clamping
  readonly finalScore: number;         // Clamped (0 - 100)
}

export interface VerificationResult {
  readonly score: number;              // 0 - 100
  readonly category: RiskCategory;     // 'SAFE' (0-30), 'SUSPICIOUS' (31-70), 'HIGH_RISK' (71-100)
  readonly reasons: readonly ReasonItem[]; // Sorted descending by impact
  readonly confidenceNote: string;     // Note on verification confidence (e.g., unverified vs known)
  readonly disclaimer: string;         // Mandatory: risk-warning tool, never a guarantee of safety
  readonly isSafeWithCaveat: boolean;  // True when 0-30, requiring cautious receiver check
  readonly scoreBreakdown: ScoreBreakdown;
  readonly features: FeatureVector;
  readonly modelVersion: string;
  readonly evaluatedAt: string;        // ISO timestamp
  readonly isOfflineEvaluation: boolean;
  readonly parsed: ParsedPayload;
}
