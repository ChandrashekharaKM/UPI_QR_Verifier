# UPI QR Verifier
> **Cover Title: Payment QR Code Alert System**

A full-stack, cross-platform TypeScript security application that scans or uploads UPI payment QR codes **BEFORE** the user pays, decodes and validates parameters against NPCI specifications, performs heuristic security analysis, executes on-device machine learning inference, and displays a calibrated 0–100 risk score with plain-language explanations.

> [!WARNING]
> **Risk-Warning Disclaimer**: This tool is an automated risk-warning advisory instrument based on protocol rules, heuristic patterns, and machine learning indicators. It is **never a guarantee of safety**. Users must always verify recipient identity independently before authorizing payments.

---

## Architecture & Monorepo Overview

Built as a high-performance monorepo using **pnpm workspaces**:

```
UPI QR Verifier/
├── packages/
│   └── core/           # Pure TypeScript (zero external dependencies)
│                       # UPI parser, validators, rule engine, features, ML tree traversal, scoring
├── ml/                 # TypeScript ML training & evaluation pipeline (tsx)
│                       # Synthetic data generator, CART / Random Forest, metrics & ablation
├── apps/
│   ├── api/            # Fastify + Zod + SQLite reputation backend (Phase 3)
│   └── mobile/         # Expo + React Native + react-native-web cross-platform app (Phase 4)
└── docs/               # Architecture diagrams, synopsis mapping & test fixtures (Phase 5)
```

---

## Phase 1: Core Library (`@upi-verifier/core`)
- **UPI Parser**: Robust parsing of `upi://pay` URIs with URL-encoding, case variations, duplicate parameter pollution detection, and non-UPI scheme handling (`http:`, `wifi:`, `mailto:`, etc.).
- **NPCI Validators**: Allowlist of official bank/PSP handles (`oksbi`, `okhdfcbank`, `paytm`, etc.), Shannon entropy calculation for randomized throwaway IDs, 10-digit mobile detection, and Jaro-Winkler lexical distance.
- **Rule Engine**: 23+ deterministic security rules with diminishing-returns accumulation.
- **Feature Vector**: 30 versioned, normalized numerical features (`[0.0, 1.0]`).
- **Embedded ML Inference**: Lightweight, pure TypeScript CART decision tree traversal executing 100% offline on any JS runtime with zero native dependencies.
- **Calibrated Scoring**: 0–30 (Safe with mandatory caution caveat), 31–70 (Suspicious), 71–100 (High Risk).
- **Unit Testing**: 70 unit tests in Vitest covering all rules, boundary conditions (30/31, 70/71), and edge cases.

---

## Phase 2: Dataset & Machine Learning (`@upi-verifier/ml`)
- **Synthetic Data Generator**: Generated 1,000 realistic legitimate and fraudulent UPI patterns, transparently tagged `source: "synthetic"`.
- **Real-World Reference Data**: Recorded phishing indicators (PhishTank/URLhaus) and verified merchant QR codes.
- **Stratified Partitioning**: 70% Train, 15% Validation, and 15% Held-Out Test (`seed: 42`).
- **Ensemble Model**: Random Forest (12 CART trees, max depth 5) exported to `@upi-verifier/core`.
- **Ablation Study**:
  - *Rules-Only*: Accuracy 85.71%, Recall 97.40%, FPR 25.97%
  - *ML-Only*: Accuracy 100.00%, Recall 100.00%, FPR 0.00%
  - *Combined Blend (0.65 Rules + 0.35 ML)*: **Accuracy 98.70%, Recall 97.40%, FPR 0.00%**
- **Evaluation Artifacts**: Documented in [`ml/reports/REPORT.md`](ml/reports/REPORT.md) and [`ml/reports/metrics.json`](ml/reports/metrics.json).

---

## Development Setup

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Typecheck all packages
pnpm typecheck

# Retrain ML model and update metrics
pnpm --filter @upi-verifier/ml train
```

---

## License
MIT
