import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import {
  decodeAllQrFromImageBuffer,
  decodeQrFromImageBuffer
} from '../lib/web-qr';
import { verifyQrPayload } from '@upi-verifier/core';

describe('Mobile App Acceptance Test Suite: 15 Core Scenarios Specification', () => {
  // Scenario 1: Valid upi://pay merchant with MCC
  it('1. Valid upi://pay merchant with MCC: decodes to SAFE with unverified identity caveat', async () => {
    const payload =
      'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart%20Supermarket&am=250.00&cu=INR&mc=5411&tn=Groceries';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('SAFE');
    expect(result.confidenceNote).toContain(
      'No major risk indicators found; recipient identity NOT independently verified'
    );
  });

  // Scenario 2: P2P phone-number VPA
  it('2. P2P phone-number VPA: decodes to SAFE', async () => {
    const payload = 'upi://pay?pa=9876543210@paytm&pn=Aarav%20Sharma&am=100.00&cu=INR';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('SAFE');
  });

  // Scenario 3: Valid EMVCo BharatQR with correct CRC
  it('3. Valid EMVCo BharatQR with correct CRC (built per spec): decodes to SAFE', async () => {
    const payload =
      '00020101021126370009com.upiqr0120supermart@okhdfcbank5204541153033565802IN5920Supermart Provisions6006Mumbai62110707POS884463044CA5';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('SAFE');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
  });

  // Scenario 4: Same EMV QR with one character altered (bad CRC)
  it('4. Same EMV QR with one character altered (bad CRC): decodes to SUSPICIOUS or higher', async () => {
    const tamperedPayload =
      '00020101021126370009com.upiqr0120supermart@okhdfcbank5204541153033565802IN5920Supermart Provisions6006Mumbai62110707POS884463044CA6';
    const qrBuffer = await QRCode.toBuffer(tamperedPayload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(tamperedPayload);
    const result = verifyQrPayload(decoded!);
    expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
  });

  // Scenario 5: EMV QR with the VPA swapped but the CRC recomputed
  it('5. EMV QR with the VPA swapped but the CRC recomputed: evaluated normally by rules', async () => {
    // Valid swapped EMVCo QR code
    const swappedPayload =
      '00020101021126290009com.upiqr0112kirana@oksbi5204541153033565802IN5913Kirana Store6006Mumbai62110707POS884463048E2D';
    const qrBuffer = await QRCode.toBuffer(swappedPayload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(swappedPayload);
    const result = verifyQrPayload(decoded!);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
    expect(result.category).toBe('SAFE');
  });

  // Scenario 6: phonepe://pay?... and paytmmp://pay?... deep links
  it('6. phonepe://pay?... and paytmmp://pay?... deep links: parsed same as upi://', async () => {
    const phonepePayload =
      'phonepe://pay?pa=chaipoint@ybl&pn=Chai%20Point&am=50.00&cu=INR&mc=5814';
    const paytmmpPayload =
      'paytmmp://pay?pa=sharmatea@ptyes&pn=Sharma%20Tea&am=30.00&cu=INR&mc=5814';

    for (const link of [phonepePayload, paytmmpPayload]) {
      const qrBuffer = await QRCode.toBuffer(link, { width: 300, margin: 4 });
      const png = PNG.sync.read(qrBuffer);
      const decoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
        png.width,
        png.height
      );

      expect(decoded).toBe(link);
      const result = verifyQrPayload(decoded!);
      expect(result.parsed.kind).toBe('upi');
    }
  });

  // Scenario 7: upi://collect?...
  it('7. upi://collect?...: decodes to HIGH_RISK', async () => {
    const payload =
      'upi://collect?pa=scammer@oksbi&pn=Reward%20Claim&am=5000.00&cu=INR';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
  });

  // Scenario 8: "Refund / KYC / prize" scam text in tn
  it('8. "Refund / KYC / prize" scam text in tn: decodes to HIGH_RISK', async () => {
    const payload =
      'upi://pay?pa=helpdesk@ybl&pn=Support&am=100.00&cu=INR&tn=Refund%20Verification%20KYC';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_REFUND_VERIFY_NOTE')).toBe(true);
  });

  // Scenario 9: Bank-helpline impersonation VPA
  it('9. Bank-helpline impersonation VPA: decodes to HIGH_RISK', async () => {
    const payload =
      'upi://pay?pa=sbi.refund.helpline@ybl&pn=SBI%20Customer%20Helpline&am=4999.00&cu=INR';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION')).toBe(true);
  });

  // Scenario 10: Shortened URL, IP-host URL, punycode URL, http URL
  it('10. Shortened URL, IP-host URL, punycode URL, http URL: decodes to HIGH_RISK', async () => {
    const urls = [
      'https://bit.ly/pay-sbi-portal',
      'http://185.220.101.5/sbi/auth/index.php',
      'https://xn--sbi-9fa.com/pay',
      'http://bank-verification.com/login'
    ];

    for (const url of urls) {
      const qrBuffer = await QRCode.toBuffer(url, { width: 300, margin: 4 });
      const png = PNG.sync.read(qrBuffer);
      const decoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
        png.width,
        png.height
      );

      expect(decoded).toBe(url);
      const result = verifyQrPayload(decoded!);
      expect(result.category).toBe('HIGH_RISK');
    }
  });

  // Scenario 11: Parameter pollution (pa twice)
  it('11. Parameter pollution (pa twice): decodes to HIGH_RISK', async () => {
    const payload =
      'upi://pay?pa=innocent@oksbi&pa=attacker@ybl&am=50000.00&cu=INR';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_DUPLICATE_PARAMETERS')).toBe(true);
  });

  // Scenario 12: Hidden unicode / homoglyph in pn
  it('12. Hidden unicode / homoglyph in pn: decodes to SUSPICIOUS or higher', async () => {
    const payload =
      'upi://pay?pa=store@oksbi&pn=Fresh%20M\u0430rt&am=250.00&cu=INR';
    const qrBuffer = await QRCode.toBuffer(payload, { width: 300, margin: 4 });
    const png = PNG.sync.read(qrBuffer);
    const decoded = decodeQrFromImageBuffer(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
      png.width,
      png.height
    );

    expect(decoded).toBe(payload);
    const result = verifyQrPayload(decoded!);
    expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_HIDDEN_UNICODE')).toBe(true);
  });

  // Scenario 13: wifi:, mailto:, tel: QRs
  it('13. wifi:, mailto:, tel: QRs: decodes to "not a payment QR" and is NOT flagged as a scam', async () => {
    const wifiPayload = 'WIFI:S:CafeWifi;T:WPA;P:secret123;;';
    const wifiBuffer = await QRCode.toBuffer(wifiPayload, { width: 300, margin: 4 });
    const wifiPng = PNG.sync.read(wifiBuffer);
    const decodedWifi = decodeQrFromImageBuffer(
      new Uint8ClampedArray(wifiPng.data.buffer, wifiPng.data.byteOffset, wifiPng.data.length),
      wifiPng.width,
      wifiPng.height
    );

    expect(decodedWifi).toBe(wifiPayload);
    const wifiResult = verifyQrPayload(decodedWifi!);
    expect(wifiResult.category).toBe('SAFE');
    expect(wifiResult.score).toBe(0);
    expect(wifiResult.isNonPaymentQr).toBe(true);
    expect(wifiResult.confidenceNote).toContain('Not a payment QR code (wifi:)');
    expect(wifiResult.reasons.length).toBe(0);

    const mailtoPayload = 'mailto:support@company.com';
    const mailtoBuffer = await QRCode.toBuffer(mailtoPayload, { width: 300, margin: 4 });
    const mailtoPng = PNG.sync.read(mailtoBuffer);
    const decodedMailto = decodeQrFromImageBuffer(
      new Uint8ClampedArray(mailtoPng.data.buffer, mailtoPng.data.byteOffset, mailtoPng.data.length),
      mailtoPng.width,
      mailtoPng.height
    );
    expect(decodedMailto).toBe(mailtoPayload);
    const mailtoResult = verifyQrPayload(decodedMailto!);
    expect(mailtoResult.category).toBe('SAFE');
    expect(mailtoResult.isNonPaymentQr).toBe(true);
  });

  // Scenario 14: Image with 2 QR codes
  it('14. Image with 2 QR codes: UI extracts both candidates and asks the user which one', async () => {
    const code1 = 'upi://pay?pa=store1@oksbi&pn=Store%20One&am=100.00&cu=INR';
    const code2 = 'upi://pay?pa=store2@okhdfcbank&pn=Store%20Two&am=200.00&cu=INR';

    const b1 = await QRCode.toBuffer(code1, { width: 220, margin: 4 });
    const b2 = await QRCode.toBuffer(code2, { width: 220, margin: 4 });

    const p1 = PNG.sync.read(b1);
    const p2 = PNG.sync.read(b2);

    // Place them side-by-side in a single composite frame with proper 2D row copying
    const combinedW = p1.width + p2.width + 40;
    const combinedH = Math.max(p1.height, p2.height);
    const composite = new PNG({ width: combinedW, height: combinedH });
    composite.data.fill(255);

    // Copy p1 on the left
    for (let y = 0; y < p1.height; y++) {
      for (let x = 0; x < p1.width; x++) {
        const srcIdx = (y * p1.width + x) * 4;
        const destIdx = (y * combinedW + x) * 4;
        composite.data[destIdx] = p1.data[srcIdx]!;
        composite.data[destIdx + 1] = p1.data[srcIdx + 1]!;
        composite.data[destIdx + 2] = p1.data[srcIdx + 2]!;
        composite.data[destIdx + 3] = p1.data[srcIdx + 3]!;
      }
    }

    // Copy p2 on the right
    for (let y = 0; y < p2.height; y++) {
      for (let x = 0; x < p2.width; x++) {
        const srcIdx = (y * p2.width + x) * 4;
        const destIdx = (y * combinedW + (p1.width + 40 + x)) * 4;
        composite.data[destIdx] = p2.data[srcIdx]!;
        composite.data[destIdx + 1] = p2.data[srcIdx + 1]!;
        composite.data[destIdx + 2] = p2.data[srcIdx + 2]!;
        composite.data[destIdx + 3] = p2.data[srcIdx + 3]!;
      }
    }

    const pixels = new Uint8ClampedArray(
      composite.data.buffer,
      composite.data.byteOffset,
      composite.data.length
    );

    // The multi-QR decoder extracts all distinct codes
    const detected = decodeAllQrFromImageBuffer(pixels, combinedW, combinedH);

    expect(detected.length).toBe(2);
    expect(detected).toContain(code1);
    expect(detected).toContain(code2);
    // In mobile UI: `if (detected.length > 1) { setCandidateQrs(detected); setShowMultiQrModal(true); }`
    // triggers the MultipleQrModal asking the user which code to verify.
  });

  // Scenario 15: Image with no QR
  it('15. Image with no QR: returns 0 codes, triggering clear "no QR found" error with tips', () => {
    // Blank / noise image with no QR patterns
    const emptyPng = new PNG({ width: 300, height: 300 });
    emptyPng.data.fill(240); // Solid light gray background

    const pixels = new Uint8ClampedArray(
      emptyPng.data.buffer,
      emptyPng.data.byteOffset,
      emptyPng.data.length
    );

    const detected = decodeAllQrFromImageBuffer(pixels, emptyPng.width, emptyPng.height);
    expect(detected).toHaveLength(0);

    const single = decodeQrFromImageBuffer(pixels, emptyPng.width, emptyPng.height);
    expect(single).toBeNull();
    // In mobile UI: `if (results.length === 0) setErrorMessage('No readable QR code detected... with tips')`
  });
});
