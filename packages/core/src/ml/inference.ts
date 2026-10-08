import type { DecisionTreeNode, RandomForestModel } from '../types/model.js';
import type { FeatureVector } from '../types/features.js';

/**
 * Traverses a single CART decision tree to predict scam probability.
 */
export function predictTree(node: DecisionTreeNode, features: readonly number[]): number {
  if (node.isLeaf) {
    return node.probability ?? 0.0;
  }

  if (node.featureIndex === undefined || node.threshold === undefined) {
    return node.probability ?? 0.0;
  }

  const featureVal = features[node.featureIndex] ?? 0.0;

  if (featureVal <= node.threshold) {
    return node.leftChild ? predictTree(node.leftChild, features) : (node.probability ?? 0.0);
  } else {
    return node.rightChild ? predictTree(node.rightChild, features) : (node.probability ?? 0.0);
  }
}

/**
 * Executes ensemble prediction over a Random Forest model.
 * Averages probabilities across all decision trees.
 * Returns a probability in [0.0, 1.0].
 */
export function predictRandomForest(
  model: RandomForestModel,
  featureVector: FeatureVector
): number {
  if (!model.trees || model.trees.length === 0) {
    return 0.0;
  }

  let totalProb = 0;
  for (const tree of model.trees) {
    totalProb += predictTree(tree.root, featureVector.values);
  }

  const avgProb = totalProb / model.trees.length;
  return Math.min(1.0, Math.max(0.0, avgProb));
}
