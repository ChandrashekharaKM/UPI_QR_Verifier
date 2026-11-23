import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { decodeAllQrFromImageData, decodeQrFromImageData } from '../lib/web-qr';
import { parsePayload } from '@upi-verifier/core';

/**
 * Helper to render QR code modules into a region of an RGBA pixel buffer.
 */
function blitQrToBuffer(
  qr: { modules: { size: number; get: (r: number, c: number) => boolean | number } },
  buffer: Uint8ClampedArray,
  totalWidth: number,
  startX: number,
  startY: number,
  scale = 4
) {
  const size = qr.modules.size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = startX + c * scale + dx;
            const y = startY + r * scale + dy;
            const idx = (y * totalWidth + x) * 4;
            buffer[idx] = 0;
            buffer[idx + 1] = 0;
            buffer[idx + 2] = 0;
            buffer[idx + 3] = 255;
          }
        }
      }
    }
  }
}

describe('Multi-QR Code Detection & Resolution Engine', () => {
  it('detects a single QR code and returns array of length 1', () => {
    const payload = 'upi://pay?pa=singlemerchant@okhdfcbank&pn=Single%20Merchant&am=250.00&cu=INR';
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const scale = 4;
    const width = qr.modules.size * scale + 20;
    const height = qr.modules.size * scale + 20;

    const pixels = new Uint8ClampedArray(width * height * 4);
    pixels.fill(255);
    blitQrToBuffer(qr, pixels, width, 10, 10, scale);

    const allDetected = decodeAllQrFromImageData(pixels, width, height);
    expect(allDetected).toHaveLength(1);
    expect(allDetected[0]).toBe(payload);

    const singleResult = decodeQrFromImageData(pixels, width, height);
    expect(singleResult).toBe(payload);

    // Test qr2 alone
    const payload2 = '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS99126304D70A';
    const qr2 = QRCode.create(payload2, { errorCorrectionLevel: 'M' });
    const w2 = qr2.modules.size * scale + 20;
    const h2 = qr2.modules.size * scale + 20;
    const px2 = new Uint8ClampedArray(w2 * h2 * 4);
    px2.fill(255);
    blitQrToBuffer(qr2, px2, w2, 10, 10, scale);
    const d2 = decodeAllQrFromImageData(px2, w2, h2);
    expect(d2).toHaveLength(1);
    expect(d2[0]).toBe(payload2);
  });

  it('detects TWO distinct QR codes in a single image buffer without silently dropping one', () => {
    const payload1 = 'upi://pay?pa=storeone@okhdfcbank&pn=Store%20One&am=100.00&cu=INR';
    const payload2 = '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS99126304D70A';

    const qr1 = QRCode.create(payload1, { errorCorrectionLevel: 'M' });
    const qr2 = QRCode.create(payload2, { errorCorrectionLevel: 'M' });

    const scale = 4;
    const gap = 80;
    const padding = 32;
    const totalW = (qr1.modules.size + qr2.modules.size) * scale + gap + padding * 2;
    const totalH = Math.max(qr1.modules.size, qr2.modules.size) * scale + padding * 2;

    const pixels = new Uint8ClampedArray(totalW * totalH * 4);
    pixels.fill(255);

    // Render QR1 on the left
    blitQrToBuffer(qr1, pixels, totalW, padding, padding, scale);

    // Render QR2 on the right
    const qr2StartX = padding + qr1.modules.size * scale + gap;
    blitQrToBuffer(qr2, pixels, totalW, qr2StartX, padding, scale);

    const detected = decodeAllQrFromImageData(pixels, totalW, totalH);

    // Must find BOTH QR codes
    expect(detected).toHaveLength(2);
    expect(detected).toContain(payload1);
    expect(detected).toContain(payload2);
  });

  it('detects THREE distinct QR codes (UPI, PhonePe, and Collect Request)', () => {
    const payload1 = 'upi://pay?pa=tea.stall@oksbi&pn=Chai%20Stall&am=20.00&cu=INR';
    const payload2 = 'phonepe://pay?pa=hardware@ybl&pn=Gupta%20Hardware&cu=INR&mc=5251';
    const payload3 = 'upi://collect?pa=scammer@axis&pn=Prize%20Claim&am=5000.00&cu=INR';

    const qr1 = QRCode.create(payload1, { errorCorrectionLevel: 'M' });
    const qr2 = QRCode.create(payload2, { errorCorrectionLevel: 'M' });
    const qr3 = QRCode.create(payload3, { errorCorrectionLevel: 'M' });

    const scale = 4;
    const gap = 80;
    const padding = 32;
    const totalW = (qr1.modules.size + qr2.modules.size + qr3.modules.size) * scale + gap * 2 + padding * 2;
    const totalH = Math.max(qr1.modules.size, qr2.modules.size, qr3.modules.size) * scale + padding * 2;

    const pixels = new Uint8ClampedArray(totalW * totalH * 4);
    pixels.fill(255);

    let currentX = padding;
    blitQrToBuffer(qr1, pixels, totalW, currentX, padding, scale);

    currentX += qr1.modules.size * scale + gap;
    blitQrToBuffer(qr2, pixels, totalW, currentX, padding, scale);

    currentX += qr2.modules.size * scale + gap;
    blitQrToBuffer(qr3, pixels, totalW, currentX, padding, scale);

    const detected = decodeAllQrFromImageData(pixels, totalW, totalH);

    expect(detected).toHaveLength(3);
    expect(detected).toContain(payload1);
    expect(detected).toContain(payload2);
    expect(detected).toContain(payload3);
  });

  it('deduplicates identical QR codes so user is not prompted with redundant options', () => {
    const payload = 'upi://pay?pa=store@okhdfcbank&pn=Store&am=50.00&cu=INR';
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });

    const scale = 4;
    const gap = 80;
    const padding = 32;
    const totalW = qr.modules.size * scale * 2 + gap + padding * 2;
    const totalH = qr.modules.size * scale + padding * 2;

    const pixels = new Uint8ClampedArray(totalW * totalH * 4);
    pixels.fill(255);

    // Place identical QR code twice
    blitQrToBuffer(qr, pixels, totalW, padding, padding, scale);
    blitQrToBuffer(qr, pixels, totalW, padding + qr.modules.size * scale + gap, padding, scale);

    const detected = decodeAllQrFromImageData(pixels, totalW, totalH);

    // Deduplication should result in exactly 1 unique payload
    expect(detected).toHaveLength(1);
    expect(detected[0]).toBe(payload);
  });

  it('correctly parses candidate QR payloads into detailed metadata for selection display', () => {
    const upiPayload = 'upi://pay?pa=groceries@okhdfcbank&pn=Daily%20Groceries&am=450.00&cu=INR';
    const emvPayload = '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS99126304D70A';
    const collectPayload = 'upi://collect?pa=lottery@oksbi&pn=Lottery%20Refund&am=10000.00&cu=INR';

    const pUpi = parsePayload(upiPayload);
    expect(pUpi.fields.kind).toBe('upi');
    if (pUpi.fields.kind === 'upi') {
      expect(pUpi.fields.upi.pa).toBe('groceries@okhdfcbank');
      expect(pUpi.fields.upi.pn).toBe('Daily Groceries');
      expect(pUpi.fields.upi.am).toBe('450.00');
    }

    const pEmv = parsePayload(emvPayload);
    expect(pEmv.fields.kind).toBe('emv');
    if (pEmv.fields.kind === 'emv') {
      expect(pEmv.fields.emv.merchantName).toBe('Fresh Mart Provisions');
      expect(pEmv.fields.upi.pa).toBe('freshmart@okhdfcbank');
      expect(pEmv.fields.emv.isValidCrc).toBe(true);
    }

    const pCollect = parsePayload(collectPayload);
    expect(pCollect.fields.kind).toBe('upi');
    if (pCollect.fields.kind === 'upi') {
      expect(pCollect.fields.upi.action).toBe('collect');
      expect(pCollect.fields.upi.pa).toBe('lottery@oksbi');
    }
  });
});
