import type { SampleRow } from '../data/dataset-types.js';

export interface BinaryMetrics {
  readonly total: number;
  readonly truePositives: number;
  readonly trueNegatives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly accuracy: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly falsePositiveRate: number;
  readonly confusionMatrix: readonly [readonly [number, number], readonly [number, number]]; // [[TN, FP], [FN, TP]]
}

export interface EvaluationReport {
  readonly overall: BinaryMetrics;
  readonly perSource: Readonly<Record<string, BinaryMetrics>>;
  readonly threshold: number;
}

export function computeBinaryMetrics(
  trueLabels: readonly (0 | 1)[],
  predLabels: readonly (0 | 1)[]
): BinaryMetrics {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  const total = trueLabels.length;

  for (let i = 0; i < total; i++) {
    const y = trueLabels[i];
    const yPred = predLabels[i];

    if (y === 1 && yPred === 1) tp++;
    else if (y === 0 && yPred === 0) tn++;
    else if (y === 0 && yPred === 1) fp++;
    else if (y === 1 && yPred === 0) fn++;
  }

  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;

  return {
    total,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    accuracy: Math.round(accuracy * 10000) / 10000,
    precision: Math.round(precision * 10000) / 10000,
    recall: Math.round(recall * 10000) / 10000,
    f1Score: Math.round(f1Score * 10000) / 10000,
    falsePositiveRate: Math.round(falsePositiveRate * 10000) / 10000,
    confusionMatrix: [
      [tn, fp],
      [fn, tp]
    ]
  };
}

export function evaluateModelPredictions(
  samples: readonly SampleRow[],
  predictedProbabilities: readonly number[],
  threshold = 0.5
): EvaluationReport {
  const trueLabels = samples.map((s) => s.label);
  const predLabels = predictedProbabilities.map((p) => (p >= threshold ? 1 : 0) as 0 | 1);

  const overall = computeBinaryMetrics(trueLabels, predLabels);

  // Group by source
  const sourceGroups = new Map<string, { trueLabels: (0 | 1)[]; predLabels: (0 | 1)[] }>();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const group = sourceGroups.get(s.source) ?? { trueLabels: [], predLabels: [] };
    group.trueLabels.push(trueLabels[i]!);
    group.predLabels.push(predLabels[i]!);
    sourceGroups.set(s.source, group);
  }

  const perSource: Record<string, BinaryMetrics> = {};
  for (const [source, group] of sourceGroups.entries()) {
    perSource[source] = computeBinaryMetrics(group.trueLabels, group.predLabels);
  }

  return {
    overall,
    perSource,
    threshold
  };
}
