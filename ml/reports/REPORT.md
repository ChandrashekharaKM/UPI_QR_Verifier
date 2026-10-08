# Machine Learning Evaluation Report: UPI QR Verifier

> [!WARNING]
> **TRANSPARENCY NOTICE ON SYNTHETIC EVALUATION DATA**:
> There is currently no publicly available, comprehensively labelled real-world dataset of legitimate vs fraudulent UPI payment QR codes. The majority of the training and testing corpus used in this evaluation consists of **synthetic payloads generated from heuristic attack patterns and legitimate banking rules**.
> 
> High accuracy numbers on synthetic test data reflect **consistency and alignment with generator rules**, NOT an empirical guarantee of real-world scam detection accuracy. Attackers continuously mutate techniques, and real-world performance will naturally diverge from synthetic benchmarks.
>
> All metrics reported below are calculated directly from held-out test splits without fabricated data.

---

## 1. Dataset Partitioning

The evaluation pipeline applies a strictly stratified split with a fixed deterministic pseudorandom seed (`seed: 42`), ensuring the held-out test set was never accessed during training or hyperparameter selection:

| Partition | Total Samples | Legitimate (0) | Scam / Fraud (1) | Ratio |
|---|---|---|---|---|
| **Training (70%)** | 706 | 352 | 354 | 70% |
| **Validation (15%)** | 150 | 75 | 75 | 15% |
| **Held-Out Test (15%)** | 154 | 77 | 77 | 15% |
| **Total Corpus** | **1010** | **504** | **506** | 100% |

---

## 2. Held-Out Test Set Performance

Evaluated strictly on the held-out partition (154 unseen samples) at decision threshold $T = 0.50$:

| Metric | Score | Formula / Notes |
|---|---|---|
| **Accuracy** | **100.00%** | $(TP + TN) / Total$ |
| **Precision** | **100.00%** | $TP / (TP + FP)$ |
| **Recall (Sensitivity)** | **100.00%** | $TP / (TP + FN)$ |
| **F1 Score** | **100.00%** | $2 \cdot (P \cdot R) / (P + R)$ |
| **False Positive Rate (FPR)** | **0.00%** | $FP / (FP + TN)$ |

### Confusion Matrix
```
Predicted Negative (0)   Predicted Positive (1)
[ TN: 77 ]               [ FP: 0 ]     <- Actual Negative (Legitimate)
[ FN: 0 ]               [ TP: 77 ]     <- Actual Positive (Scam)
```

---

## 3. Per-Source Performance Breakdown

Performance stratified by sample origin (synthetic generator vs verified real-world samples):

| Source Group | Total | Accuracy | Precision | Recall | F1 Score |
|---|---|---|---|---|---|
| `synthetic` | 153 | 100.00% | 100.00% | 100.00% | 100.00% |
| `real_phish` | 1 | 100.00% | 100.00% | 100.00% | 100.00% |

---

## 4. Ablation Study: Rules vs ML vs Combined

Comparison of decision effectiveness across different architectural configurations on the held-out test set:

| Configuration | Accuracy | Precision | Recall | F1 Score | False Positive Rate |
|---|---|---|---|---|---|
| **1. Rules-Only (Threshold $\ge 31$)** | 85.71% | 78.95% | 97.40% | 87.21% | 25.97% |
| **2. ML-Only (Probability $\ge 0.50$)** | 100.00% | 100.00% | 100.00% | 100.00% | 0.00% |
| **3. Combined Weighted Blend (0.65 Rules + 0.35 ML)** | **98.70%** | **100.00%** | **97.40%** | **98.68%** | **0.00%** |

### Observations:
- **Rules-Only** provides absolute determinism and zero latency, but suffers from rigidity when slight parameter variations occur.
- **ML-Only** generalizes across non-linear correlations, but lacks human-readable explanations on its own.
- **Combined Weighted Blend** achieves the optimal balance: deterministic rules trigger plain-language explanations with high confidence, while the Random Forest probability smooths boundary decisions and flags subtle statistical anomalies.

---

## 5. Feature Importance (Split Frequency across Trees)

Top 10 most influential features utilized by the Random Forest during recursive CART splits:

| Rank | Feature Name | Split Count | Importance Weight | Description |
|---|---|---|---|---|
| 1 | `name_vpa_similarity` | 8 | 12.90% | Feature index 17 |
| 2 | `vpa_is_known_psp` | 6 | 9.68% | Feature index 10 |
| 3 | `vpa_entropy_norm` | 6 | 9.68% | Feature index 12 |
| 4 | `amount_normalized` | 6 | 9.68% | Feature index 20 |
| 5 | `rule_risk_score_norm` | 6 | 9.68% | Feature index 27 |
| 6 | `has_merchant_code` | 5 | 8.06% | Feature index 24 |
| 7 | `vpa_is_phone_number` | 4 | 6.45% | Feature index 11 |
| 8 | `vpa_digit_ratio` | 4 | 6.45% | Feature index 13 |
| 9 | `payload_length_norm` | 3 | 4.84% | Feature index 7 |
| 10 | `vpa_has_impersonation` | 3 | 4.84% | Feature index 14 |

---

## 6. Model Export

The trained Random Forest model was serialized and exported to:
`packages/core/src/model/model.json`

- Estimator Count: **12** CART decision trees
- Max Depth: **5** levels
- Runtime Traversal: Zero-dependency, pure TypeScript recursion executing offline on mobile and web devices.
