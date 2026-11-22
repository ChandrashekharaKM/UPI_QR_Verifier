# Manual Real-Device Testing Checklist & Protocol
> **Document**: `docs/REAL_WORLD_TESTING.md`  
> **Application**: Payment QR Code Alert System — UPI QR Verifier  
> **Applies to**: `apps/mobile` (Expo React Native, Android APK, iOS TestFlight, Web)

---

## 1. Safety Rules & Ethical Guidelines

> [!CAUTION]
> **CRITICAL SAFETY DIRECTIVE**:
> 1. **Zero Real Money Transfers to Unknown Accounts**: Never send real money or authorize real payment transactions to untrusted merchants, external individuals, or documented scam VPAs during testing.
> 2. **Self-Owned Test Accounts Only**: For testing live payment intent handoff to banking apps (Google Pay, PhonePe, Paytm, BHIM), use **₹0 parameters** or nominal self-transfers (**₹1.00**) between **two bank accounts owned exclusively by the tester**.
> 3. **Never Enter UPI PIN**: The UPI QR Verifier is designed to protect users **BEFORE** they open banking rails. You never need to enter your 4-digit or 6-digit banking UPI PIN to verify or inspect a QR code.
> 4. **Zero Personal Data Exposure**: Do not commit real individuals' phone numbers, Aadhaar-linked VPAs, or private merchant credentials to git or public issue trackers. Use synthetic or anonymized pattern handles.

---

## 2. Test Environment Matrix

| Device Type | Platform | OS Version | Display / Hardware Specifications |
|---|---|---|---|
| **Primary Android Device** | Android Smartphone | Android 12, 13, 14, or 15 | 1080p+ camera, autofocus, hardware flashlight |
| **Primary iOS Device** | iPhone | iOS 16, 17, or 18 | Dual/Triple camera system, Safari WebKit |
| **Secondary Target Screen** | Laptop or Smartphone | macOS / Windows / Android | 60Hz or 120Hz LCD / OLED display for screen tests |
| **Physical Test Stand** | Printed Paper / Acrylic | N/A | Printed matte and gloss laminated counter standees |

---

## 3. Manual Real-Device Test Checklist

### Test Scenario A: Physical Shop Counter QR Stand (Laminated / Acrylic Standee)
- **Objective**: Verify standard retail checkout scanning against real-world shop standees.
- **Test Setup**:
  1. Print or position an authentic merchant standee (e.g. `docs/real-world-fixtures/real_grocery_counter.png` or `real_bharatqr_emv_standee.png`) at counter height (approx. 90–110 cm).
  2. Launch the UPI QR Verifier app on your mobile device.
  3. Navigate to **Scan (Camera)**.
- **Execution Steps**:
  1. Hold device 15–30 cm from the standee.
  2. Verify camera auto-focus locks onto the QR pattern within 500ms.
  3. Confirm that the Result Screen renders immediately upon detection.
  4. Verify that the **Physical Sticker Tampering Warning** card is visible.
  5. Verify that the mandatory **"Check the name shown in your UPI app before you enter your PIN"** step is prominently shown.
  6. Verify the Category reads **`SAFE (Low Risk)`** with the honest advisory: *"No major risk indicators found; recipient identity NOT independently verified"*.

---

### Test Scenario B: QR Displayed on Another Phone Screen (Digital-to-Digital)
- **Objective**: Verify digital checkout scanning when a user scans another person's phone (e.g. PhonePe split bill, GPay peer request, web checkout invoice).
- **Test Setup**:
  1. Display a test QR code (`degraded_photographed_on_screen.png` or live app screen) on a secondary phone at 50% screen brightness.
  2. Open the verifier on the primary testing smartphone.
- **Execution Steps**:
  1. Align primary phone camera 10–20 cm in front of the secondary phone screen.
  2. Verify that high-frequency LCD/OLED raster scanlines and moiré interference patterns do not prevent decoding.
  3. Verify that the verifier successfully extracts all payment fields (Payee VPA, Payee Name, Amount).
  4. Tilt the secondary screen by ~15° to simulate casual hand-held angles; confirm decoding continues without failure.

---

### Test Scenario C: Screenshot Forwarded via WhatsApp / Messaging App
- **Objective**: Verify image file upload decoding for compressed, downsampled, or forwarded screenshots.
- **Test Setup**:
  1. Save `degraded_jpeg_compressed.png` to your device's photo gallery (or send a QR screenshot to yourself via WhatsApp/Telegram to apply real messaging compression).
  2. In the UPI QR Verifier app, navigate to **Inspect Stored QR Codes (Gallery Upload)**.
- **Execution Steps**:
  1. Tap **"Tap to Browse Gallery / Files"** and select the WhatsApp-compressed screenshot.
  2. Verify the progress indicator displays: *"Analyzing QR code patterns & security features..."*.
  3. Verify that 8x8 block DCT compression noise and color subsampling artifacts are successfully handled by the decoder.
  4. Confirm that the Result Screen accurately displays the payee VPA, declared name, and security score.

---

### Test Scenario D: Printed Paper QR in Low Light / Dim Environment
- **Objective**: Verify decoding resilience under poor illumination (dim street kiosks, nighttime dining, power outages).
- **Test Setup**:
  1. Place a printed QR standee (`degraded_low_contrast_faded.png`) in an ambient dim room (< 50 lux).
  2. Disable room lighting or shield direct lights to simulate nighttime conditions.
- **Execution Steps**:
  1. Point camera at the low-light printed standee.
  2. Verify that the multi-pass contrast stretching and adaptive thresholding algorithms binarize the faded modules.
  3. If required, toggle the camera torch / flashlight icon in the scanner header.
  4. Verify that decoding succeeds in < 2 seconds without false pattern rejections.

---

### Test Scenario E: QR Behind Harsh Glare & Specular Reflection
- **Objective**: Verify specular glare recovery on glossy laminated stickers and acrylic table-top stands.
- **Test Setup**:
  1. Enclose a printed QR code inside a glossy plastic sheet protector or glass display frame.
  2. Position an overhead lamp or smartphone flashlight at a 45° angle to create a bright specular reflection covering ~25% of the QR code.
- **Execution Steps**:
  1. Point camera at the standee directly through the specular reflection.
  2. Observe whether Bradley-Roth local adaptive thresholding isolates the darker modules beneath the glare.
  3. Slowly tilt the camera angle by 10–15° to break reflection highlights.
  4. Verify that once decoded, the verifier accurately extracts parameters and checks for BharatQR CRC integrity.

---

## 4. Test Results Recording Log Template

Testers must log every manual real-device evaluation in the table below:

| Run # | Date & Time | Device Model & OS | Test Scenario (A–E) | Lighting / Angle Condition | Scanned Payload / File | Expected Category | Actual Category | Verdict (Pass / Fail) | FP / FN Flag | Notes / Observations |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 01 | 2026-11-23 10:30 | Pixel 8 (Android 14) | A (Shop Counter) | Normal daylight (350 lux) | `real_grocery_counter.png` | SAFE | SAFE | PASS | Clean | Verified tampering alert & pre-PIN step visible |
| 02 | 2026-11-23 10:45 | iPhone 15 (iOS 17.4) | B (Phone Screen) | OLED display at 60% brightness | `degraded_photographed_on_screen.png` | SAFE | SAFE | PASS | Clean | Moiré lines handled seamlessly |
| 03 | 2026-11-23 11:00 | Samsung S23 (OneUI 6) | C (WhatsApp) | JPEG quality ~35 WhatsApp forward | `degraded_jpeg_compressed.png` | SAFE | SAFE | PASS | Clean | Decoded via multi-pass DCT tolerance |
| 04 | 2026-11-23 11:15 | Pixel 8 (Android 14) | D (Low Light) | Dim evening kiosk (~30 lux) | `degraded_low_contrast_faded.png` | SAFE | SAFE | PASS | Clean | Contrast stretching recovered faded print |
| 05 | 2026-11-23 11:30 | iPhone 15 (iOS 17.4) | E (Glare) | Glossy laminate under direct lamp | `real_bharatqr_emv_standee.png` | SAFE | SAFE | PASS | Clean | Adaptive thresholding eliminated glare |
| 06 | 2026-11-23 11:45 | Pixel 8 (Android 14) | A (Shop Counter) | Tampered sticker overlay | `suspicious_emv_tampered_crc.png` | SUSPICIOUS | SUSPICIOUS | PASS | Clean | Flagged RULE_EMV_BAD_CRC immediately |
| 07 | 2026-11-23 12:00 | Samsung S23 (OneUI 6) | B (Phone Screen) | Deceptive pull collect request | `malicious_pull_collect_debit.png` | HIGH_RISK | HIGH_RISK | PASS | Clean | Triggered two-step confirmation modal |

---

## 5. False Positive & False Negative Triage Guide

### What is a False Positive (FP)?
- **Definition**: A genuine, legitimate merchant or personal payment QR code is incorrectly scored $\ge 31$ (`SUSPICIOUS`) or $\ge 71$ (`HIGH_RISK`).
- **Impact**: Causes unnecessary friction or panic for legitimate shopkeepers and customers.
- **Triage Checklist**:
  1. Inspect `reasons` array on Result Screen: which rule ID triggered?
  2. Was the PSP handle recognized in `psp-allowlist.json`? If not, verify if the bank launched a new handle.
  3. Did `RULE_NAME_VPA_MISMATCH` trigger due to an abbreviated shop name (e.g. `KGM Store` vs `krishnamurthy@oksbi`)?
  4. Did `RULE_MISSING_MC_BUSINESS` trigger because a formal Pvt Ltd entity used a personal P2P handle?

### What is a False Negative (FN)?
- **Definition**: A fraudulent QR code (e.g. collect request, refund trap, bad CRC, homoglyph attack) is incorrectly scored $\le 30$ (`SAFE`).
- **Impact**: **CRITICAL SECURITY RISK** — user may authorize a fraudulent payment.
- **Triage Checklist**:
  1. Immediately record the exact unparsed QR text and file an urgent P0 security bug.
  2. Check if a critical deterministic rule failed to match (e.g. new URL scheme or novel Unicode lookalike character).
  3. Check if ML score diluted the rule risk score (critical rules must strictly override ML).
  4. Add the anonymized pattern to `ml/data/real_samples.csv` and retrain the model.

---

## 6. Real-Device Acceptance Sign-Off Criteria

Before approving any release or production build:
- [ ] **100% of Scenarios A–E** must decode successfully in $< 2.0$ seconds on both Android and iOS reference devices.
- [ ] **Zero False Negatives**: Under no circumstance may a pull-debit (`upi://collect`), auto-debit mandate (`upi://mandate`), bad CRC EMV standee, or bank helpline impersonation evaluate to `SAFE`.
- [ ] **Zero Bare "Safe"**: Unverified offline QRs must display the mandatory unverified identity disclaimer.
- [ ] **Two-Step Modal Verified**: Tapping "Continue Anyway" on any `HIGH_RISK` QR must trigger the `CRITICAL SCAM WARNING` modal.
