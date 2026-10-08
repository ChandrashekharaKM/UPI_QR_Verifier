import type { DecisionTreeNode } from '@upi-verifier/core';

export interface DataPoint {
  readonly features: readonly number[];
  readonly label: 0 | 1;
}

export interface TreeHyperparameters {
  readonly maxDepth: number;
  readonly minSamplesSplit: number;
  readonly minSamplesLeaf: number;
  readonly maxFeatures?: number; // Subset of features considered at each split (for Random Forest)
}

/**
 * Calculates Gini Impurity for a set of binary labels.
 * Gini = 1 - (p0^2 + p1^2) = 2 * p * (1 - p)
 */
function calculateGini(data: readonly DataPoint[]): number {
  const n = data.length;
  if (n === 0) return 0;
  let ones = 0;
  for (let i = 0; i < n; i++) {
    if (data[i]?.label === 1) ones++;
  }
  const p1 = ones / n;
  const p0 = 1 - p1;
  return 1 - (p1 * p1 + p0 * p0);
}

/**
 * Trains a single CART decision tree on numeric feature vectors.
 */
export function trainDecisionTree(
  data: readonly DataPoint[],
  hyperparams: TreeHyperparameters,
  randomFeatureSubsetFn?: (totalFeatures: number) => number[],
  depth = 0
): DecisionTreeNode {
  const n = data.length;
  if (n === 0) {
    return { isLeaf: true, probability: 0.0 };
  }

  // Calculate leaf probability
  let ones = 0;
  for (let i = 0; i < n; i++) {
    if (data[i]?.label === 1) ones++;
  }
  const probability = ones / n;

  // Base stopping conditions
  if (
    depth >= hyperparams.maxDepth ||
    n < hyperparams.minSamplesSplit ||
    probability === 0.0 ||
    probability === 1.0
  ) {
    return {
      isLeaf: true,
      probability: Math.round(probability * 1000) / 1000
    };
  }

  const currentGini = calculateGini(data);
  const totalFeatures = data[0]?.features.length ?? 0;

  // Select candidate features
  const featureIndices = randomFeatureSubsetFn
    ? randomFeatureSubsetFn(totalFeatures)
    : Array.from({ length: totalFeatures }, (_, i) => i);

  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: DataPoint[] = [];
  let bestRight: DataPoint[] = [];

  for (const featureIndex of featureIndices) {
    // Collect and sort unique feature values
    const values = data.map((d) => d.features[featureIndex] ?? 0);
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => a - b);

    if (uniqueValues.length <= 1) continue;

    // Check midpoints between adjacent unique values
    for (let i = 0; i < uniqueValues.length - 1; i++) {
      const val1 = uniqueValues[i] ?? 0;
      const val2 = uniqueValues[i + 1] ?? 0;
      const threshold = (val1 + val2) / 2;

      const left: DataPoint[] = [];
      const right: DataPoint[] = [];

      for (let j = 0; j < n; j++) {
        const pt = data[j]!;
        if ((pt.features[featureIndex] ?? 0) <= threshold) {
          left.push(pt);
        } else {
          right.push(pt);
        }
      }

      if (left.length < hyperparams.minSamplesLeaf || right.length < hyperparams.minSamplesLeaf) {
        continue;
      }

      const leftGini = calculateGini(left);
      const rightGini = calculateGini(right);
      const splitGini = (left.length / n) * leftGini + (right.length / n) * rightGini;
      const gain = currentGini - splitGini;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = featureIndex;
        bestThreshold = threshold;
        bestLeft = left;
        bestRight = right;
      }
    }
  }

  // If no split improves Gini impurity significantly
  if (bestGain <= 0.001 || bestLeft.length === 0 || bestRight.length === 0) {
    return {
      isLeaf: true,
      probability: Math.round(probability * 1000) / 1000
    };
  }

  // Recursively build children
  const leftChild = trainDecisionTree(bestLeft, hyperparams, randomFeatureSubsetFn, depth + 1);
  const rightChild = trainDecisionTree(bestRight, hyperparams, randomFeatureSubsetFn, depth + 1);

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: Math.round(bestThreshold * 10000) / 10000,
    leftChild,
    rightChild
  };
}
