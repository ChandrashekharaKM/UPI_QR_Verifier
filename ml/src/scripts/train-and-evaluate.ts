import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePayload,
  evaluateRules,
  extractFeatureVector,
  predictRandomForest,
  FEATURE_NAMES,
  type RandomForestModel
} from '@upi-verifier/core';
import { generateSyntheticDataset } from '../data/synthetic-generator.js';
import { loadCsvDataset, loadJsonDataset } from '../data/dataset-loader.js';
import type { SampleRow } from '../data/dataset-types.js';
import { stratifiedSplit } from '../training/split.js';
import { trainRandomForest } from '../training/random-forest.js';
import { evaluateModelPredictions } from '../evaluation/metrics.js';
import { computeFeatureImportance } from '../evaluation/feature-importance.js';
import { runAblationStudy } from '../evaluation/ablation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../../data');
const reportsDir = path.resolve(__dirname, '../../reports');
const coreModelPath = path.resolve(__dirname, '../../../packages/core/src/model/model.json');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log('====================================================');
console.log('   UPI QR Verifier ML Training & Evaluation Pipeline');
console.log('====================================================\n');

// 1. Load or Generate Dataset
const syntheticPath = path.join(dataDir, 'synthetic_dataset.json');
let syntheticData: SampleRow[] = [];
if (fs.existsSync(syntheticPath)) {
  console.log(`[1/6] Loading synthetic data from: ${syntheticPath}`);
  syntheticData = loadJsonDataset(syntheticPath);
} else {
  console.log('[1/6] Generating 1,000 synthetic records...');
  syntheticData = generateSyntheticDataset(1000, 42);
  fs.writeFileSync(syntheticPath, JSON.stringify(syntheticData, null, 2), 'utf-8');
}

const csvPath = path.join(dataDir, 'real_samples.csv');
console.log(`[2/6] Loading real-world labeled samples from: ${csvPath}`);
const realData = loadCsvDataset(csvPath);
console.log(`      Found ${realData.length} real-world reference samples.`);

const combinedData = [...syntheticData, ...realData];
console.log(`      Total combined corpus: ${combinedData.length} records.\n`);

// 2. Stratified Train / Validation / Test Split
console.log('[3/6] Performing Stratified Train (70%) / Val (15%) / Test (15%) Split (seed: 42)...');
const split = stratifiedSplit(combinedData, 42, 0.70, 0.15);
console.log(`      Train samples: ${split.train.length}`);
console.log(`      Validation samples: ${split.validation.length}`);
console.log(`      Held-out test samples: ${split.test.length}\n`);

// 3. Feature Extraction on Training Set
console.log('[4/6] Extracting 30 normalized feature vectors on training partition...');
function vectorize(samples: readonly SampleRow[]) {
  return samples.map((s) => {
    const parsed = parsePayload(s.payload);
    const { ruleRiskScore } = evaluateRules({ parsed });
    const vector = extractFeatureVector({ parsed }, ruleRiskScore);
    return {
      features: vector.values,
      label: s.label
    };
  });
}

const trainDataPoints = vectorize(split.train);

// 4. Train Random Forest Classifier
console.log('[5/6] Training Random Forest (12 estimators, maxDepth=5, CART trees)...');
const forestModel = trainRandomForest(trainDataPoints, FEATURE_NAMES, {
  nEstimators: 12,
  maxDepth: 5,
  minSamplesSplit: 5,
  minSamplesLeaf: 2,
  seed: 42
});

// 5. Evaluate on Held-out Test Set
console.log('[6/6] Evaluating on held-out test partition (never seen during training)...');
function evaluatePartition(samples: readonly SampleRow[], model: RandomForestModel) {
  const probs = samples.map((s) => {
    const parsed = parsePayload(s.payload);
    const { ruleRiskScore } = evaluateRules({ parsed });
    const vector = extractFeatureVector({ parsed }, ruleRiskScore);
    return predictRandomForest(model, vector);
  });
  return {
    probs,
    report: evaluateModelPredictions(samples, probs, 0.5)
  };
}

const testEval = evaluatePartition(split.test, forestModel);
const valEval = evaluatePartition(split.validation, forestModel);
const featureImportances = computeFeatureImportance(forestModel, FEATURE_NAMES);
const ablation = runAblationStudy(split.test, forestModel);

console.log('\n--- HELD-OUT TEST RESULTS ---');
console.log(`Accuracy:            ${(testEval.report.overall.accuracy * 100).toFixed(2)}%`);
console.log(`Precision:           ${(testEval.report.overall.precision * 100).toFixed(2)}%`);
console.log(`Recall:              ${(testEval.report.overall.recall * 100).toFixed(2)}%`);
console.log(`F1 Score:            ${(testEval.report.overall.f1Score * 100).toFixed(2)}%`);
console.log(`False Positive Rate: ${(testEval.report.overall.falsePositiveRate * 100).toFixed(2)}%`);
console.log('Confusion Matrix:    [[TN, FP], [FN, TP]]:', JSON.stringify(testEval.report.overall.confusionMatrix));

// Write metrics.json
const metricsOutput = {
  trainedAt: forestModel.trainedAt,
  corpusSize: combinedData.length,
  splits: {
    train: split.train.length,
    validation: split.validation.length,
    test: split.test.length
  },
  heldOutTestMetrics: testEval.report.overall,
  perSourceMetrics: testEval.report.perSource,
  validationMetrics: valEval.report.overall,
  ablationComparison: ablation,
  topFeatures: featureImportances.slice(0, 10),
  hyperparameters: {
    nEstimators: forestModel.nEstimators,
    maxDepth: 5,
    minSamplesSplit: 5,
    minSamplesLeaf: 2,
    seed: 42
  }
};

const metricsJsonPath = path.join(reportsDir, 'metrics.json');
fs.writeFileSync(metricsJsonPath, JSON.stringify(metricsOutput, null, 2), 'utf-8');
console.log(`\nMetrics written to: ${metricsJsonPath}`);

// Write REPORT.md with transparent caveats
const reportMdContent = `# Machine Learning Evaluation Report: UPI QR Verifier

> [!WARNING]
> **TRANSPARENCY NOTICE ON SYNTHETIC EVALUATION DATA**:
> There is currently no publicly available, comprehensively labelled real-world dataset of legitimate vs fraudulent UPI payment QR codes. The majority of the training and testing corpus used in this evaluation consists of **synthetic payloads generated from heuristic attack patterns and legitimate banking rules**.
> 
> High accuracy numbers on synthetic test data reflect **consistency and alignment with generator rules**, NOT an empirical guarantee of real-world scam detection accuracy. Attackers continuously mutate techniques, and real-world performance will naturally diverge from synthetic benchmarks.
>
> All metrics reported below are calculated directly from held-out test splits without fabricated data.

---

## 1. Dataset Partitioning

The evaluation pipeline applies a strictly stratified split with a fixed deterministic pseudorandom seed (\`seed: 42\`), ensuring the held-out test set was never accessed during training or hyperparameter selection:

| Partition | Total Samples | Legitimate (0) | Scam / Fraud (1) | Ratio |
|---|---|---|---|---|
| **Training (70%)** | ${split.train.length} | ${split.train.filter((s) => s.label === 0).length} | ${split.train.filter((s) => s.label === 1).length} | 70% |
| **Validation (15%)** | ${split.validation.length} | ${split.validation.filter((s) => s.label === 0).length} | ${split.validation.filter((s) => s.label === 1).length} | 15% |
| **Held-Out Test (15%)** | ${split.test.length} | ${split.test.filter((s) => s.label === 0).length} | ${split.test.filter((s) => s.label === 1).length} | 15% |
| **Total Corpus** | **${combinedData.length}** | **${combinedData.filter((s) => s.label === 0).length}** | **${combinedData.filter((s) => s.label === 1).length}** | 100% |

---

## 2. Held-Out Test Set Performance

Evaluated strictly on the held-out partition (${split.test.length} unseen samples) at decision threshold $T = 0.50$:

| Metric | Score | Formula / Notes |
|---|---|---|
| **Accuracy** | **${(testEval.report.overall.accuracy * 100).toFixed(2)}%** | $(TP + TN) / Total$ |
| **Precision** | **${(testEval.report.overall.precision * 100).toFixed(2)}%** | $TP / (TP + FP)$ |
| **Recall (Sensitivity)** | **${(testEval.report.overall.recall * 100).toFixed(2)}%** | $TP / (TP + FN)$ |
| **F1 Score** | **${(testEval.report.overall.f1Score * 100).toFixed(2)}%** | $2 \\cdot (P \\cdot R) / (P + R)$ |
| **False Positive Rate (FPR)** | **${(testEval.report.overall.falsePositiveRate * 100).toFixed(2)}%** | $FP / (FP + TN)$ |

### Confusion Matrix
\`\`\`
Predicted Negative (0)   Predicted Positive (1)
[ TN: ${testEval.report.overall.confusionMatrix[0]?.[0]} ]               [ FP: ${testEval.report.overall.confusionMatrix[0]?.[1]} ]     <- Actual Negative (Legitimate)
[ FN: ${testEval.report.overall.confusionMatrix[1]?.[0]} ]               [ TP: ${testEval.report.overall.confusionMatrix[1]?.[1]} ]     <- Actual Positive (Scam)
\`\`\`

---

## 3. Per-Source Performance Breakdown

Performance stratified by sample origin (synthetic generator vs verified real-world samples):

| Source Group | Total | Accuracy | Precision | Recall | F1 Score |
|---|---|---|---|---|---|
${Object.entries(testEval.report.perSource)
  .map(
    ([source, m]) =>
      `| \`${source}\` | ${m.total} | ${(m.accuracy * 100).toFixed(2)}% | ${(m.precision * 100).toFixed(2)}% | ${(m.recall * 100).toFixed(2)}% | ${(m.f1Score * 100).toFixed(2)}% |`
  )
  .join('\n')}

---

## 4. Ablation Study: Rules vs ML vs Combined

Comparison of decision effectiveness across different architectural configurations on the held-out test set:

| Configuration | Accuracy | Precision | Recall | F1 Score | False Positive Rate |
|---|---|---|---|---|---|
| **1. Rules-Only (Threshold $\\ge 31$)** | ${(ablation.rulesOnly.accuracy * 100).toFixed(2)}% | ${(ablation.rulesOnly.precision * 100).toFixed(2)}% | ${(ablation.rulesOnly.recall * 100).toFixed(2)}% | ${(ablation.rulesOnly.f1Score * 100).toFixed(2)}% | ${(ablation.rulesOnly.falsePositiveRate * 100).toFixed(2)}% |
| **2. ML-Only (Probability $\\ge 0.50$)** | ${(ablation.mlOnly.accuracy * 100).toFixed(2)}% | ${(ablation.mlOnly.precision * 100).toFixed(2)}% | ${(ablation.mlOnly.recall * 100).toFixed(2)}% | ${(ablation.mlOnly.f1Score * 100).toFixed(2)}% | ${(ablation.mlOnly.falsePositiveRate * 100).toFixed(2)}% |
| **3. Combined Weighted Blend (0.65 Rules + 0.35 ML)** | **${(ablation.combined.accuracy * 100).toFixed(2)}%** | **${(ablation.combined.precision * 100).toFixed(2)}%** | **${(ablation.combined.recall * 100).toFixed(2)}%** | **${(ablation.combined.f1Score * 100).toFixed(2)}%** | **${(ablation.combined.falsePositiveRate * 100).toFixed(2)}%** |

### Observations:
- **Rules-Only** provides absolute determinism and zero latency, but suffers from rigidity when slight parameter variations occur.
- **ML-Only** generalizes across non-linear correlations, but lacks human-readable explanations on its own.
- **Combined Weighted Blend** achieves the optimal balance: deterministic rules trigger plain-language explanations with high confidence, while the Random Forest probability smooths boundary decisions and flags subtle statistical anomalies.

---

## 5. Feature Importance (Split Frequency across Trees)

Top 10 most influential features utilized by the Random Forest during recursive CART splits:

| Rank | Feature Name | Split Count | Importance Weight | Description |
|---|---|---|---|---|
${featureImportances
  .slice(0, 10)
  .map(
    (f, idx) =>
      `| ${idx + 1} | \`${f.featureName}\` | ${f.splitCount} | ${(f.importanceScore * 100).toFixed(2)}% | Feature index ${f.featureIndex} |`
  )
  .join('\n')}

---

## 6. Model Export

The trained Random Forest model was serialized and exported to:
\`packages/core/src/model/model.json\`

- Estimator Count: **${forestModel.nEstimators}** CART decision trees
- Max Depth: **5** levels
- Runtime Traversal: Zero-dependency, pure TypeScript recursion executing offline on mobile and web devices.
`;

const reportMdPath = path.join(reportsDir, 'REPORT.md');
fs.writeFileSync(reportMdPath, reportMdContent, 'utf-8');
console.log(`Evaluation report written to: ${reportMdPath}`);

// Export model to packages/core
fs.writeFileSync(coreModelPath, JSON.stringify(forestModel, null, 2), 'utf-8');
console.log(`Model exported to: ${coreModelPath}\n`);
console.log('ML Pipeline completed successfully.');
