import type { RandomForestModel, DecisionTreeNode } from '@upi-verifier/core';

export interface FeatureImportanceItem {
  readonly featureIndex: number;
  readonly featureName: string;
  readonly importanceScore: number; // Normalized to 0.0 - 1.0
  readonly splitCount: number;
}

export function computeFeatureImportance(
  model: RandomForestModel,
  featureNames: readonly string[]
): FeatureImportanceItem[] {
  const counts = new Map<number, number>();

  function countSplits(node: DecisionTreeNode) {
    if (node.isLeaf) return;
    if (node.featureIndex !== undefined) {
      counts.set(node.featureIndex, (counts.get(node.featureIndex) ?? 0) + 1);
    }
    if (node.leftChild) countSplits(node.leftChild);
    if (node.rightChild) countSplits(node.rightChild);
  }

  for (const tree of model.trees) {
    countSplits(tree.root);
  }

  let totalSplits = 0;
  for (const cnt of counts.values()) {
    totalSplits += cnt;
  }

  const items: FeatureImportanceItem[] = [];
  for (let i = 0; i < featureNames.length; i++) {
    const splitCount = counts.get(i) ?? 0;
    const importanceScore = totalSplits > 0 ? splitCount / totalSplits : 0;
    items.push({
      featureIndex: i,
      featureName: featureNames[i] ?? `feature_${i}`,
      importanceScore: Math.round(importanceScore * 10000) / 10000,
      splitCount
    });
  }

  return items.sort((a, b) => b.importanceScore - a.importanceScore);
}
