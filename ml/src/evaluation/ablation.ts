import {
  parsePayload,
  evaluateRules,
  extractFeatureVector,
  predictRandomForest,
  type RandomForestModel
} from '@upi-verifier/core';
import type { SampleRow } from '../data/dataset-types.js';
import { computeBinaryMetrics, type BinaryMetrics } from './metrics.js';

export interface AblationComparison {
  readonly rulesOnly: BinaryMetrics;
  readonly mlOnly: BinaryMetrics;
  readonly combined: BinaryMetrics;
}

export function runAblationStudy(
  testSamples: readonly SampleRow[],
  model: RandomForestModel
): AblationComparison {
  const trueLabels = testSamples.map((s) => s.label);

  const rulesPreds: (0 | 1)[] = [];
  const mlPreds: (0 | 1)[] = [];
  const combinedPreds: (0 | 1)[] = [];

  for (const sample of testSamples) {
    const parsed = parsePayload(sample.payload);
    const { ruleRiskScore } = evaluateRules({ parsed });
    const features = extractFeatureVector({ parsed }, ruleRiskScore);
    const mlProb = predictRandomForest(model, features);

    // 1. Rules-only decision: considered risky if ruleRiskScore >= 31
    rulesPreds.push(ruleRiskScore >= 31 ? 1 : 0);

    // 2. ML-only decision: considered risky if predicted probability >= 0.50
    mlPreds.push(mlProb >= 0.50 ? 1 : 0);

    // 3. Combined blend: 0.65 * ruleRiskScore + 0.35 * (mlProb * 100)
    const combinedScore = Math.round(0.65 * ruleRiskScore + 0.35 * (mlProb * 100));
    combinedPreds.push(combinedScore >= 31 ? 1 : 0);
  }

  return {
    rulesOnly: computeBinaryMetrics(trueLabels, rulesPreds),
    mlOnly: computeBinaryMetrics(trueLabels, mlPreds),
    combined: computeBinaryMetrics(trueLabels, combinedPreds)
  };
}
