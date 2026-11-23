import { describe, it, expect } from 'vitest';
import { predictTree, predictRandomForest } from '../src/ml/inference.js';
import { extractFeatureVector } from '../src/features/feature-extractor.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import type { DecisionTreeNode, RandomForestModel } from '../src/types/model.js';
import {
  FEATURE_NAMES,
  FEATURE_SCHEMA_VERSION,
  validateModelFeatureSchema
} from '../src/features/feature-schema.js';
import defaultModelData from '../src/model/model.json' with { type: 'json' };

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
      version: FEATURE_SCHEMA_VERSION,
      nEstimators: 3,
      featureNames: FEATURE_NAMES,
      trees: [
        { root: { isLeaf: true, probability: 0.2 } },
        { root: { isLeaf: true, probability: 0.5 } },
        { root: { isLeaf: true, probability: 0.8 } }
      ]
    };

    const vector = {
      version: FEATURE_SCHEMA_VERSION,
      names: FEATURE_NAMES,
      values: new Array(FEATURE_NAMES.length).fill(0)
    };

    const prob = predictRandomForest(forest, vector);
    // (0.2 + 0.5 + 0.8) / 3 = 1.5 / 3 = 0.5
    expect(prob).toBeCloseTo(0.5, 5);
  });

  it('62. extracts full feature vector with strictly documented numerical features', () => {
    const parsed = parsePayload('upi://pay?pa=merchant@okhdfcbank&pn=SuperStore&am=500&mc=5411');
    const vector = extractFeatureVector({ parsed }, 15);

    expect(vector.names.length).toBe(FEATURE_NAMES.length);
    expect(vector.values.length).toBe(FEATURE_NAMES.length);
    expect(vector.version).toBe(FEATURE_SCHEMA_VERSION);

    for (let i = 0; i < vector.values.length; i++) {
      const val = vector.values[i];
      expect(typeof val).toBe('number');
      expect(isNaN(val as number)).toBe(false);
      expect((val as number) >= 0.0 && (val as number) <= 1.0).toBe(true);
    }
  });

  it('63. handles empty or degenerate trees gracefully without crashing', () => {
    const emptyForest: RandomForestModel = {
      version: FEATURE_SCHEMA_VERSION,
      nEstimators: 0,
      featureNames: FEATURE_NAMES,
      trees: []
    };

    const vector = {
      version: FEATURE_SCHEMA_VERSION,
      names: FEATURE_NAMES,
      values: new Array(FEATURE_NAMES.length).fill(0)
    };

    expect(predictRandomForest(emptyForest, vector)).toBe(0.0);
  });

  it('64. model.json is strictly synchronized with FEATURE_NAMES and FEATURE_SCHEMA_VERSION', () => {
    const model = defaultModelData as unknown as RandomForestModel;

    // 1. Must match current FEATURE_SCHEMA_VERSION
    expect(model.version).toBe(FEATURE_SCHEMA_VERSION);

    // 2. Feature count must strictly match
    expect(model.featureNames.length).toBe(FEATURE_NAMES.length);

    // 3. Exact element-by-element ordering and naming must match
    expect(model.featureNames).toEqual(FEATURE_NAMES);

    // 4. validateModelFeatureSchema must pass with 0 errors
    const validation = validateModelFeatureSchema(model);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);

    // 5. All decision tree nodes must only reference valid feature indices [0, FEATURE_NAMES.length - 1]
    expect(model.trees.length).toBeGreaterThan(0);
    for (let t = 0; t < model.trees.length; t++) {
      const tree = model.trees[t]!;
      const stack = [tree.root];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (!node.isLeaf && node.featureIndex !== undefined) {
          expect(node.featureIndex).toBeGreaterThanOrEqual(0);
          expect(node.featureIndex).toBeLessThan(FEATURE_NAMES.length);
        }
        if (node.leftChild) stack.push(node.leftChild);
        if (node.rightChild) stack.push(node.rightChild);
      }
    }
  });

  it('65. fails and detects divergence if model.json or schema features diverge', () => {
    const model = defaultModelData as unknown as RandomForestModel;

    // Divergence 1: Missing feature
    const missingFeaturesModel: RandomForestModel = {
      ...model,
      featureNames: model.featureNames.slice(0, -1)
    };
    const missingRes = validateModelFeatureSchema(missingFeaturesModel);
    expect(missingRes.isValid).toBe(false);
    expect(missingRes.errors.some((e) => e.includes('Feature count mismatch'))).toBe(true);

    // Divergence 2: Re-ordered features
    const reorderedModel: RandomForestModel = {
      ...model,
      featureNames: [model.featureNames[1]!, model.featureNames[0]!, ...model.featureNames.slice(2)]
    };
    const reorderedRes = validateModelFeatureSchema(reorderedModel);
    expect(reorderedRes.isValid).toBe(false);
    expect(reorderedRes.errors.some((e) => e.includes('Feature divergence at index'))).toBe(true);

    // Divergence 3: Outdated version
    const outdatedVersionModel: RandomForestModel = {
      ...model,
      version: '0.9.0'
    };
    const versionRes = validateModelFeatureSchema(outdatedVersionModel);
    expect(versionRes.isValid).toBe(false);
    expect(versionRes.errors.some((e) => e.includes('Model schema version mismatch'))).toBe(true);

    // Divergence 4: Out-of-bounds featureIndex in a decision tree
    const badIndexModel: RandomForestModel = {
      ...model,
      trees: [
        {
          root: {
            isLeaf: false,
            featureIndex: 999, // Out of bounds
            threshold: 0.5,
            leftChild: { isLeaf: true, probability: 0.1 },
            rightChild: { isLeaf: true, probability: 0.9 }
          }
        }
      ]
    };
    const badIndexRes = validateModelFeatureSchema(badIndexModel);
    expect(badIndexRes.isValid).toBe(false);
    expect(badIndexRes.errors.some((e) => e.includes('invalid featureIndex 999'))).toBe(true);
  });
});
