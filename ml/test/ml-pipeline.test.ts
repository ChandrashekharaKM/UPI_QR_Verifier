import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCsvDataset, loadJsonDataset } from '../src/data/dataset-loader.js';
import {
  computeBinaryMetrics,
  computeRocAuc,
  computeCalibrationCurve
} from '../src/evaluation/metrics.js';
import { stratifiedSplit } from '../src/training/split.js';
import { trainRandomForest } from '../src/training/random-forest.js';
import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION, predictRandomForest } from '@upi-verifier/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('ML Pipeline & Evaluation Suite', () => {
  it('1. loads real_samples.csv successfully with valid ground-truth labels and sources', () => {
    const csvPath = path.resolve(projectRoot, 'data/real_samples.csv');
    expect(fs.existsSync(csvPath)).toBe(true);

    const samples = loadCsvDataset(csvPath);
    expect(samples.length).toBeGreaterThanOrEqual(450);

    const labels = new Set(samples.map((s) => s.label));
    expect(labels.has(0)).toBe(true);
    expect(labels.has(1)).toBe(true);

    const legitimate = samples.filter((s) => s.label === 0);
    const scam = samples.filter((s) => s.label === 1);
    expect(legitimate.length).toBeGreaterThanOrEqual(300);
    expect(scam.length).toBeGreaterThanOrEqual(150);
  });

  it('2. loads synthetic_dataset.json and validates dataset structure', () => {
    const jsonPath = path.resolve(projectRoot, 'data/synthetic_dataset.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const samples = loadJsonDataset(jsonPath);
    expect(samples.length).toBeGreaterThan(500);

    const labels = new Set(samples.map((s) => s.label));
    expect(labels.has(0)).toBe(true);
    expect(labels.has(1)).toBe(true);
  });

  it('3. calculates classification metrics correctly (Accuracy, Precision, Recall, F1)', () => {
    const yTrue: (0 | 1)[] = [1, 1, 0, 0, 1, 0, 1, 0];
    const yPred: (0 | 1)[] = [1, 1, 0, 0, 0, 0, 1, 1]; // TP=3, FN=1, TN=3, FP=1

    const m = computeBinaryMetrics(yTrue, yPred);
    expect(m.accuracy).toBe(0.75);
    expect(m.truePositives).toBe(3);
    expect(m.falseNegatives).toBe(1);
    expect(m.trueNegatives).toBe(3);
    expect(m.falsePositives).toBe(1);
    expect(m.precision).toBe(0.75);
    expect(m.recall).toBe(0.75);
  });

  it('4. calculates ROC-AUC and Expected Calibration Error (ECE)', () => {
    const yTrue: (0 | 1)[] = [0, 0, 1, 1];
    const yProb = [0.1, 0.2, 0.8, 0.9];

    const auc = computeRocAuc(yTrue, yProb);
    expect(auc).toBe(1.0);

    const cal = computeCalibrationCurve(yTrue, yProb, 5);
    expect(cal.ece).toBeLessThan(0.2);
    expect(cal.bins.length).toBeGreaterThan(0);
  });

  it('5. stratifies and splits dataset ensuring balanced partitions', () => {
    const samples = Array.from({ length: 20 }, (_, i) => ({
      payload: `upi://pay?pa=user${i}@oksbi`,
      label: (i % 2 === 0 ? 0 : 1) as 0 | 1,
      source: 'synthetic'
    }));

    const split = stratifiedSplit(samples, 42, 0.6, 0.2);
    expect(split.train.length).toBeGreaterThan(0);
    expect(split.validation.length).toBeGreaterThan(0);
    expect(split.test.length).toBeGreaterThan(0);
  });

  it('6. trains a Random Forest and generates valid probability predictions', () => {
    const data = [
      { features: [0.0, 0.1, 0.0], label: 0 as const },
      { features: [0.0, 0.2, 0.0], label: 0 as const },
      { features: [1.0, 0.9, 1.0], label: 1 as const },
      { features: [1.0, 0.8, 1.0], label: 1 as const }
    ];

    const model = trainRandomForest(
      data,
      ['f1', 'f2', 'f3'],
      {
        nEstimators: 5,
        maxDepth: 3,
        minSamplesSplit: 2,
        minSamplesLeaf: 1,
        seed: 42
      }
    );

    expect(model.trees.length).toBe(5);
    expect(model.featureNames).toEqual(['f1', 'f2', 'f3']);

    const p0 = predictRandomForest(model, { values: data[0]!.features });
    const p1 = predictRandomForest(model, { values: data[1]!.features });
    const p2 = predictRandomForest(model, { values: data[2]!.features });
    const p3 = predictRandomForest(model, { values: data[3]!.features });

    expect(p0).toBeLessThan(0.5);
    expect(p1).toBeLessThan(0.5);
    expect(p2).toBeGreaterThan(0.5);
    expect(p3).toBeGreaterThan(0.5);
  });

  it('7. verifies trained model.json conforms to current FEATURE_SCHEMA_VERSION', () => {
    const modelPath = path.resolve(projectRoot, '../packages/core/src/model/model.json');
    expect(fs.existsSync(modelPath)).toBe(true);

    const model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    expect(model.version).toBe(FEATURE_SCHEMA_VERSION);
    expect(model.featureNames).toEqual(FEATURE_NAMES);
  });
});
