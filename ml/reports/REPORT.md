# Machine Learning Evaluation Report: UPI QR Verifier

> [!IMPORTANT]
> **SOURCE-BASED HELD-OUT SPLIT (TRAIN ON SYNTHETIC, TEST ON REAL)**:
> To evaluate genuine real-world domain transfer and prevent test set leakage, the Random Forest model was trained on algorithmic synthetic data (1200 records) and evaluated on an independent, fully held-out real-world test corpus (635 records from verified advisories and consented merchant scans).
>
> Zero real-world samples were used during training or tree splitting.

> [!WARNING]
> **NO 100% DETECTION GUARANTEE (CAVEAT ON BENCHMARK METRICS)**:
> Neither statistical machine learning nor rule heuristics can provide a 100% guarantee of scam detection in production. Attackers continuously mutate social engineering lures, purchase unflagged mule accounts, and alter parameter arrangements. High benchmark metrics on curated advisory sets do not guarantee zero misses on newly emerging threats.
>
> Users must always independently verify the payee name in their UPI application before entering their UPI PIN.

---

## 1. Dataset Partitioning by Source

| Partition | Source | Total Samples | Legitimate (0) | Scam / Fraud (1) | Description |
|---|---|---|---|---|---|
| **Training (Synthetic)** | `synthetic` | 1200 | 600 | 600 | Algorithmic generation covering UPI URIs, BharatQR standees, and App deep-links |
| **Held-Out Test (Real-World)** | Verified Public / Consented | 635 | 390 | 245 | NPCI, RBI, I4C, Bank alerts, and maintainer consented merchant scans |
| **Total Evaluated** | All Sources | **1835** | **990** | **845** | Complete corpus |

---

## 2. Held-Out Real-World Test Performance

Evaluated on all 635 unseen real-world samples at decision threshold $T = 0.50$:

| Metric | Score | Formula / Notes |
|---|---|---|
| **Accuracy** | **98.11%** | $(TP + TN) / Total$ |
| **Precision** | **98.74%** | $TP / (TP + FP)$ |
| **Recall (Sensitivity)** | **96.33%** | $TP / (TP + FN)$ |
| **F1 Score** | **97.52%** | $2 \cdot (P \cdot R) / (P + R)$ |
| **Overall False Positive Rate (FPR)** | **0.77%** | $FP / (FP + TN)$ |
| **Area Under ROC Curve (AUC)** | **99.37%** | Trapezoidal integration across discrimination thresholds |
| **Expected Calibration Error (ECE)** | **11.65%** | 10-bin weighted calibration gap $\sum \frac{n_b}{N} |\text{conf}_b - \text{acc}_b|$ |

### Confusion Matrix on Real Test Corpus
```
Predicted Negative (0)   Predicted Positive (1)
[ TN: 387 ]               [ FP: 3 ]     <- Actual Negative (Legitimate)
[ FN: 9 ]               [ TP: 236 ]     <- Actual Positive (Scam)
```

---

## 3. False Positive Rate on Legitimate Merchant QRs

A critical requirement for in-store consumer payment usability is minimizing false alarms on legitimate retail checkouts, supermarket counters, and BharatQR standees:

| Metric | Value | Details |
|---|---|---|
| **Total Legitimate Merchant QRs** | **285** | Verified counter standees, supermarket billing, clinic/fuel retail |
| **Correctly Allowed (True Negatives)** | **284** | Safe checkout permitted without interruption |
| **Falsely Flagged (False Positives)** | **1** | Flagged as suspicious or high risk |
| **Merchant False Positive Rate (FPR)** | **0.35%** | $FP / (FP + TN)$ ($1 / 285$) |

---

## 4. Per-Source Performance Breakdown

Performance stratified across each specific public advisory and consented real-world source:

| Source | Total | Legitimate (0) | Scam (1) | Accuracy | Precision | Recall | F1 Score | FPR |
|---|---|---|---|---|---|---|---|---|
| `maintainer_consented_scan` | 390 | 390 | 0 | 99.23% | N/A (all legit) | N/A (all legit) | N/A (all legit) | 0.77% |
| `npci_public_advisory` | 55 | 0 | 55 | 98.18% | 100.00% | 98.18% | 99.08% | 0.00% (all scam) |
| `rbi_public_advisory` | 20 | 0 | 20 | 95.00% | 100.00% | 95.00% | 97.44% | 0.00% (all scam) |
| `i4c_cybercrime_gov` | 45 | 0 | 45 | 86.67% | 100.00% | 86.67% | 92.86% | 0.00% (all scam) |
| `bank_fraud_alert` | 25 | 0 | 25 | 100.00% | 100.00% | 100.00% | 100.00% | 0.00% (all scam) |
| `documented_scam_pattern` | 100 | 0 | 100 | 99.00% | 100.00% | 99.00% | 99.50% | 0.00% (all scam) |

> [!NOTE]
> **Sample Size Context**: Sources like `bank_fraud_alert` ($N = 25$) reflect specific curated alert collections. While all 25 samples in that specific advisory subset were identified in this test run, 100% metrics on small sample subsets do not imply zero error rates across all unobserved fraud campaigns in the wild. Heterogeneous datasets such as `i4c_cybercrime_gov` ($N = 45$) show an 86.67% recall, reflecting the varied complexity of actual scam operations.

---

## 5. Calibration Curve (Expected Calibration Error: 11.65%)

Reliability diagram across 10 equal-width probability bins on the held-out real dataset:

| Bin | Probability Interval | Sample Count | Mean Confidence | Empirical Accuracy | Calibration Gap |
|---|---|---|---|---|---|
| **Bin 1** | [0.00, 0.10) | 213 | 2.94% | 0.00% | 2.94% |
| **Bin 2** | [0.10, 0.20) | 106 | 15.23% | 1.89% | 13.35% |
| **Bin 3** | [0.20, 0.30) | 16 | 24.99% | 18.75% | 6.24% |
| **Bin 4** | [0.30, 0.40) | 53 | 35.42% | 3.77% | 31.65% |
| **Bin 5** | [0.40, 0.50) | 8 | 43.15% | 25.00% | 18.15% |
| **Bin 6** | [0.50, 0.60) | 13 | 51.87% | 84.62% | 32.75% |
| **Bin 7** | [0.60, 0.70) | 15 | 64.14% | 100.00% | 35.86% |
| **Bin 8** | [0.70, 0.80) | 49 | 74.40% | 100.00% | 25.60% |
| **Bin 9** | [0.80, 0.90) | 66 | 85.05% | 98.48% | 13.43% |
| **Bin 10** | [0.90, 1.00) | 96 | 96.56% | 100.00% | 3.44% |

> [!NOTE]
> **High-Confidence Bin Interpretation**: Higher probability bins (e.g., Bin 7, 8, 10) show empirical accuracy approaching or at 100% within this benchmark set because high model confidence scores strongly correlate with clear structural indicators (e.g. non-INR foreign currencies, corrupted EMV checksums). For borderline scores ($0.30 \le p \le 0.60$), empirical accuracy varies considerably.

---

## 6. Deterministic Rule Engine Override for Critical Rules

To prevent statistical dilution or adversarial machine learning evasion, the verification architecture enforces an explicit **Critical Rule Override**:

- **Trigger Condition**: When any deterministic rule with `severity: 'critical'` is triggered (such as `RULE_NON_UPI_SCHEME`, `RULE_THREAT_INTEL_MALICIOUS`, `RULE_REFUND_VERIFY_NOTE`, or `RULE_VPA_IMPERSONATION`).
- **Override Behavior**: The rule engine directly supersedes the weighted ML blend ($0.65 \times \text{Rule} + 0.35 \times \text{ML}$). The composite risk score is floored at $\ge 75$, strictly enforcing a `HIGH_RISK` category.
- **Security Rationale**: Attackers might manipulate features (e.g. length padding, standard merchant character sets) to lower an ML model's confidence. The deterministic override guarantees that confirmed attacks cannot be diluted into a "Safe" or "Suspicious" rating.

---

## 7. Ablation Study: Rules vs ML vs Combined on Real Test Data

Comparison of decision architectures evaluated strictly on the held-out real dataset:

| Configuration | Accuracy | Precision | Recall | F1 Score | False Positive Rate |
|---|---|---|---|---|---|
| **1. Rules-Only (Threshold $\ge 31$)** | 76.69% | 62.40% | 99.59% | 76.73% | 37.69% |
| **2. ML-Only (Probability $\ge 0.50$)** | 98.11% | 98.74% | 96.33% | 97.52% | 0.77% |
| **3. Combined Blend with Critical Override** | **94.80%** | **88.97%** | **98.78%** | **93.62%** | **7.69%** |

---

## 8. Feature Importance (Split Frequency across Trees)

Top 10 most influential features utilized by the Random Forest during recursive CART splits:

| Rank | Feature Name | Split Count | Importance Weight | Description |
|---|---|---|---|---|
| 1 | `rule_risk_score_norm` | 15 | 18.99% | Feature index 27 |
| 2 | `vpa_entropy_norm` | 8 | 10.13% | Feature index 12 |
| 3 | `name_vpa_similarity` | 8 | 10.13% | Feature index 17 |
| 4 | `vpa_digit_ratio` | 6 | 7.59% | Feature index 13 |
| 5 | `vpa_has_impersonation` | 6 | 7.59% | Feature index 14 |
| 6 | `has_merchant_code` | 6 | 7.59% | Feature index 24 |
| 7 | `payload_length_norm` | 5 | 6.33% | Feature index 7 |
| 8 | `amount_normalized` | 5 | 6.33% | Feature index 20 |
| 9 | `has_amount` | 4 | 5.06% | Feature index 19 |
| 10 | `missing_mc_for_business` | 4 | 5.06% | Feature index 25 |

---

## 9. Model Export

The retrained Random Forest model was serialized and exported to:
`packages/core/src/model/model.json`

- Estimator Count: **15** CART decision trees
- Max Depth: **5** levels
- Runtime Traversal: Zero-dependency, pure TypeScript recursion executing offline on mobile and web devices.
