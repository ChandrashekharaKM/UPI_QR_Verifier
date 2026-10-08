export interface DecisionTreeNode {
  readonly isLeaf: boolean;
  readonly featureIndex?: number;
  readonly threshold?: number;
  readonly leftChild?: DecisionTreeNode;
  readonly rightChild?: DecisionTreeNode;
  readonly probability?: number; // Probability of scam (0.0 to 1.0) for leaf nodes
}

export interface DecisionTreeModel {
  readonly root: DecisionTreeNode;
}

export interface RandomForestModel {
  readonly version: string;
  readonly nEstimators: number;
  readonly featureNames: readonly string[];
  readonly trees: readonly DecisionTreeModel[];
  readonly trainedAt?: string;
  readonly description?: string;
}
