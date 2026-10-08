import type {
  VerificationResult,
  CommunityReputationSignal,
  RandomForestModel,
  ParsedPayload
} from './types/index.js';
import type { ScoringConfig } from './scoring/config.js';
import { parsePayload } from './parser/index.js';
import { evaluateRules } from './rules/index.js';
import { extractFeatureVector } from './features/index.js';
import { calculateVerificationScore } from './scoring/index.js';
import defaultModelData from './model/model.json' with { type: 'json' };

export interface VerifyQrOptions {
  readonly community?: CommunityReputationSignal;
  readonly model?: RandomForestModel;
  readonly isOffline?: boolean;
  readonly scoringConfig?: Partial<ScoringConfig>;
}

const DEFAULT_MODEL: RandomForestModel = defaultModelData as unknown as RandomForestModel;

/**
 * Main verification entrypoint for UPI QR Verifier.
 * Zero external runtime dependencies; executes 100% offline on any JS/TS platform.
 */
export function verifyQrPayload(
  rawPayload: string,
  options?: VerifyQrOptions
): VerificationResult {
  // 1. Parse QR payload
  const parsed: ParsedPayload = parsePayload(rawPayload);

  // 2. Build Rule Context
  const ctx = {
    parsed,
    community: options?.community
  };

  // 3. Evaluate deterministic security rules
  const { triggeredRules, ruleRiskScore } = evaluateRules(ctx);

  // 4. Extract fixed-length normalized feature vector
  const features = extractFeatureVector(ctx, ruleRiskScore);

  // 5. Select ML model
  const model = options?.model ?? DEFAULT_MODEL;

  // 6. Blend scores and generate output
  return calculateVerificationScore({
    ctx,
    triggeredRules,
    ruleRiskScore,
    features,
    model,
    config: options?.scoringConfig,
    isOffline: options?.isOffline ?? !options?.community
  });
}
