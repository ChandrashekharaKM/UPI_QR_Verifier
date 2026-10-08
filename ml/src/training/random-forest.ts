import type { RandomForestModel, DecisionTreeModel } from '@upi-verifier/core';
import { trainDecisionTree, type DataPoint, type TreeHyperparameters } from './cart.js';

export interface ForestHyperparameters {
  readonly nEstimators: number;
  readonly maxDepth: number;
  readonly minSamplesSplit: number;
  readonly minSamplesLeaf: number;
  readonly seed: number;
}

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/**
 * Trains a Random Forest classifier using bagging and random feature subspaces.
 */
export function trainRandomForest(
  data: readonly DataPoint[],
  featureNames: readonly string[],
  hyperparams: ForestHyperparameters
): RandomForestModel {
  const rng = new SeededRandom(hyperparams.seed);
  const n = data.length;
  const totalFeatures = featureNames.length;
  // Standard m = sqrt(p) feature subspace
  const numSubsetFeatures = Math.max(2, Math.floor(Math.sqrt(totalFeatures)));

  const treeHyperparams: TreeHyperparameters = {
    maxDepth: hyperparams.maxDepth,
    minSamplesSplit: hyperparams.minSamplesSplit,
    minSamplesLeaf: hyperparams.minSamplesLeaf
  };

  const trees: DecisionTreeModel[] = [];

  for (let t = 0; t < hyperparams.nEstimators; t++) {
    // 1. Bootstrap sample with replacement
    const bootstrapSample: DataPoint[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng.next() * n);
      bootstrapSample.push(data[idx]!);
    }

    // 2. Random feature subset generator per tree split
    const featureSubsetFn = (p: number): number[] => {
      const allIndices = Array.from({ length: p }, (_, i) => i);
      // Partial Fisher-Yates shuffle
      for (let i = 0; i < numSubsetFeatures; i++) {
        const j = i + Math.floor(rng.next() * (p - i));
        const temp = allIndices[i]!;
        allIndices[i] = allIndices[j]!;
        allIndices[j] = temp;
      }
      return allIndices.slice(0, numSubsetFeatures);
    };

    // 3. Train decision tree
    const root = trainDecisionTree(bootstrapSample, treeHyperparams, featureSubsetFn);
    trees.push({ root });
  }

  return {
    version: '1.0.0',
    nEstimators: hyperparams.nEstimators,
    featureNames,
    trees,
    trainedAt: new Date().toISOString(),
    description: `Trained Random Forest (${hyperparams.nEstimators} trees, maxDepth=${hyperparams.maxDepth})`
  };
}
