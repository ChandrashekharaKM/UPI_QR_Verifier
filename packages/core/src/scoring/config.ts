export interface ScoringConfig {
  readonly safeThresholdMax: number;        // 30
  readonly suspiciousThresholdMax: number;  // 70
  readonly ruleWeight: number;              // 0.65
  readonly mlWeight: number;                // 0.35
  readonly defaultDisclaimer: string;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  safeThresholdMax: 30,
  suspiciousThresholdMax: 70,
  ruleWeight: 0.65,
  mlWeight: 0.35,
  defaultDisclaimer:
    'Risk-warning tool: This score is a heuristic estimation based on URL patterns, VPA parameters, and community intelligence. It is NOT a guarantee of payment safety. Always verify the payee before authorizing any UPI transaction.'
};
