import { describe, it, expect } from 'vitest';
import { predictTree, predictRandomForest } from '../src/ml/inference.js';
import { extractFeatureVector } from '../src/features/feature-extractor.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import type { DecisionTreeNode, RandomForestModel } from '../src/types/model.js';
import { FEATURE_NAMES } from '../src/features/feature-schema.js';

describe('ML Tree Traversal and Feature Extraction', () => {
  it('60. traverses decision tree nodes accurately based on feature thresholds', () => {
    // Tree: if feature 0 <= 0.5 then 0.1 else (if feature 1 <= 0.5 then 0.4 else 0.9)
    const treeRoot: DecisionTreeNode = {
      isLeaf: false,
      featureIndex: 0,
      threshold: 0.5,
      leftChild: { isLeaf: true, probability: 0.1 },
      rightChild: {
        isLeaf: false,
        featureIndex: 1,
        threshold: 0.5,
        leftChild: { isLeaf: true, probability: 0.4 },
        rightChild: { isLeaf: true, probability: 0.9 }
      }
    };

    expect(predictTree(treeRoot, [0.2, 0.8])).toBe(0.1);
    expect(predictTree(treeRoot, [0.7, 0.2])).toBe(0.4);
    expect(predictTree(treeRoot, [0.7, 0.9])).toBe(0.9);
  });

  it('61. averages probabilities across multiple trees in random forest', () => {
    const forest: RandomForestModel = {
      version: '1.0.0',
      nEstimators: 3,
      featureNames: FEATURE_NAMES,
      trees: [
        { root: { isLeaf: true, probability: 0.2 } },
        { root: { isLeaf: true, probability: 0.5 } },
        { root: { isLeaf: true, probability: 0.8 } }
      ]
    };

    const vector = {
      version: '1.0.0',
      names: FEATURE_NAMES,
      values: new Array(FEATURE_NAMES.length).fill(0)
    };

    const prob = predictRandomForest(forest, vector);
    // (0.2 + 0.5 + 0.8) / 3 = 1.5 / 3 = 0.5
    expect(prob).toBeCloseTo(0.5, 5);
  });

  it('62. extracts full feature vector with strictly documented 30 numerical features', () => {
    const parsed = parsePayload('upi://pay?pa=merchant@okhdfcbank&pn=SuperStore&am=500&mc=5411');
    const vector = extractFeatureVector({ parsed }, 15);

    expect(vector.names.length).toBe(30);
    expect(vector.values.length).toBe(30);
    expect(vector.version).toBe('1.0.0');

    for (let i = 0; i < vector.values.length; i++) {
      const val = vector.values[i];
      expect(typeof val).toBe('number');
      expect(isNaN(val as number)).toBe(false);
      expect((val as number) >= 0.0 && (val as number) <= 1.0).toBe(true);
    }
  });

  it('63. handles empty or degenerate trees gracefully without crashing', () => {
    const emptyForest: RandomForestModel = {
      version: '1.0.0',
      nEstimators: 0,
      featureNames: FEATURE_NAMES,
      trees: []
    };

    const vector = {
      version: '1.0.0',
      names: FEATURE_NAMES,
      values: new Array(FEATURE_NAMES.length).fill(0)
    };

    expect(predictRandomForest(emptyForest, vector)).toBe(0.0);
  });
});
