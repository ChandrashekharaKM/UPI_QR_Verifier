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

export interface CalibrationBin {
  readonly binIndex: number;
  readonly binMin: number;
  readonly binMax: number;
  readonly count: number;
  readonly meanConfidence: number;
  readonly empiricalAccuracy: number;
  readonly calibrationGap: number;
}

export interface CalibrationCurveResult {
  readonly bins: readonly CalibrationBin[];
  readonly ece: number; // Expected Calibration Error
}

export interface LegitimateMerchantMetrics {
  readonly total: number;
  readonly trueNegatives: number;
  readonly falsePositives: number;
  readonly falsePositiveRate: number;
}

export interface EvaluationReport {
  readonly overall: BinaryMetrics;
  readonly perSource: Readonly<Record<string, BinaryMetrics>>;
  readonly threshold: number;
  readonly auc: number;
  readonly calibration: CalibrationCurveResult;
  readonly legitimateMerchantMetrics: LegitimateMerchantMetrics;
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

/**
 * Computes Area Under the ROC Curve (ROC-AUC) via trapezoidal integration.
 */
export function computeRocAuc(
  trueLabels: readonly (0 | 1)[],
  predictedProbabilities: readonly number[]
): number {
  const totalPos = trueLabels.filter((y) => y === 1).length;
  const totalNeg = trueLabels.filter((y) => y === 0).length;

  if (totalPos === 0 || totalNeg === 0) return 0.5;

  const paired = trueLabels.map((y, idx) => ({ y, p: predictedProbabilities[idx]! }));
  const uniqueThresholds = Array.from(new Set([0, ...predictedProbabilities, 1])).sort((a, b) => a - b);

  const points: { fpr: number; tpr: number }[] = [];
  for (const t of uniqueThresholds) {
    let tp = 0;
    let fp = 0;
    for (const item of paired) {
      if (item.p >= t) {
        if (item.y === 1) tp++;
        else fp++;
      }
    }
    points.push({
      fpr: fp / totalNeg,
      tpr: tp / totalPos
    });
  }

  // Sort by FPR ascending for trapezoidal integration
  points.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  let auc = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1]!;
    const p2 = points[i]!;
    auc += ((p2.fpr - p1.fpr) * (p1.tpr + p2.tpr)) / 2;
  }

  return Math.round(auc * 10000) / 10000;
}

/**
 * Computes Calibration Curve and Expected Calibration Error (ECE) across equal-width probability bins.
 */
export function computeCalibrationCurve(
  trueLabels: readonly (0 | 1)[],
  predictedProbabilities: readonly number[],
  numBins = 10
): CalibrationCurveResult {
  const total = trueLabels.length;
  if (total === 0) return { bins: [], ece: 0 };

  const bins: CalibrationBin[] = [];
  let weightedEce = 0;

  for (let b = 0; b < numBins; b++) {
    const binMin = b / numBins;
    const binMax = (b + 1) / numBins;

    const inBinIndices: number[] = [];
    for (let i = 0; i < total; i++) {
      const p = predictedProbabilities[i]!;
      const matches = b === numBins - 1 ? p >= binMin && p <= binMax : p >= binMin && p < binMax;
      if (matches) inBinIndices.push(i);
    }

    const count = inBinIndices.length;
    if (count > 0) {
      const meanConfidence =
        inBinIndices.reduce((acc, idx) => acc + predictedProbabilities[idx]!, 0) / count;
      const empiricalAccuracy =
        inBinIndices.reduce((acc, idx) => acc + trueLabels[idx]!, 0) / count;
      const calibrationGap = Math.abs(meanConfidence - empiricalAccuracy);

      weightedEce += (count / total) * calibrationGap;
      bins.push({
        binIndex: b + 1,
        binMin: Math.round(binMin * 100) / 100,
        binMax: Math.round(binMax * 100) / 100,
        count,
        meanConfidence: Math.round(meanConfidence * 10000) / 10000,
        empiricalAccuracy: Math.round(empiricalAccuracy * 10000) / 10000,
        calibrationGap: Math.round(calibrationGap * 10000) / 10000
      });
    } else {
      bins.push({
        binIndex: b + 1,
        binMin: Math.round(binMin * 100) / 100,
        binMax: Math.round(binMax * 100) / 100,
        count: 0,
        meanConfidence: Math.round(((binMin + binMax) / 2) * 10000) / 10000,
        empiricalAccuracy: 0,
        calibrationGap: 0
      });
    }
  }

  return {
    bins,
    ece: Math.round(weightedEce * 10000) / 10000
  };
}

/**
 * Computes False-Positive Rate exclusively on legitimate merchant and business QRs.
 */
export function computeLegitimateMerchantMetrics(
  samples: readonly SampleRow[],
  predictedProbabilities: readonly number[],
  threshold = 0.5
): LegitimateMerchantMetrics {
  let merchantTn = 0;
  let merchantFp = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const pt = s.patternType ?? '';
    if (s.label === 0 && (pt.includes('merchant') || pt.includes('standee'))) {
      const p = predictedProbabilities[i]!;
      if (p >= threshold) {
        merchantFp++;
      } else {
        merchantTn++;
      }
    }
  }

  const total = merchantTn + merchantFp;
  const falsePositiveRate = total > 0 ? merchantFp / total : 0;

  return {
    total,
    trueNegatives: merchantTn,
    falsePositives: merchantFp,
    falsePositiveRate: Math.round(falsePositiveRate * 10000) / 10000
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

  const auc = computeRocAuc(trueLabels, predictedProbabilities);
  const calibration = computeCalibrationCurve(trueLabels, predictedProbabilities, 10);
  const legitimateMerchantMetrics = computeLegitimateMerchantMetrics(
    samples,
    predictedProbabilities,
    threshold
  );

  return {
    overall,
    perSource,
    threshold,
    auc,
    calibration,
    legitimateMerchantMetrics
  };
}
