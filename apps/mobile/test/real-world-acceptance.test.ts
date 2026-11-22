import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { decodeQrFromImageBuffer } from '../lib/web-qr';
import { verifyQrPayload, parsePayload } from '@upi-verifier/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureDef {
  readonly filename: string;
  readonly expectedCategory: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';
  readonly payload: string;
  readonly description: string;
  readonly transformation: string;
}

describe('Real-World Acceptance Test Suite (docs/real-world-fixtures)', () => {
  const fixturesDir = path.resolve(__dirname, '../../../docs/real-world-fixtures');
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, FixtureDef>;

  describe('Comprehensive PNG Image File Decoding & Categorization', () => {
    for (const [filename, item] of Object.entries(manifest)) {
      it(`decodes "${filename}" [${item.transformation}] and asserts category ${item.expectedCategory}`, () => {
        const filePath = path.join(fixturesDir, filename);
        expect(fs.existsSync(filePath)).toBe(true);

        const fileBuffer = fs.readFileSync(filePath);
        const png = PNG.sync.read(fileBuffer);

        expect(png.width).toBeGreaterThan(0);
        expect(png.height).toBeGreaterThan(0);

        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);

        expect(decoded).not.toBeNull();
        expect(decoded).toBe(item.payload);

        // Security engine verification
        const verification = verifyQrPayload(decoded!);
        expect(verification.category).toBe(item.expectedCategory);
      });
    }
  });

  describe('Degraded Variant Real-World Acceptance Verification', () => {
    it('decodes merchant standee and scam sticker rotated at 15° hand-held tilt', () => {
      for (const rotFilename of [
        'degraded_rotated_15_merchant.png',
        'degraded_rotated_15_scam.png'
      ]) {
        const item = manifest[rotFilename]!;
        const filePath = path.join(fixturesDir, rotFilename);
        const png = PNG.sync.read(fs.readFileSync(filePath));
        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
        expect(decoded).toBe(item.payload);

        const verification = verifyQrPayload(decoded!);
        expect(verification.category).toBe(item.expectedCategory);
      }
    });

    it('decodes defocused / motion-blurred counter QR photo (degraded_blurred_counter.png)', () => {
      const item = manifest['degraded_blurred_counter.png']!;
      const filePath = path.join(fixturesDir, 'degraded_blurred_counter.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));
      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

      const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
      expect(decoded).toBe(item.payload);

      const parsed = parsePayload(decoded!);
      expect(parsed.fields.kind).toBe('upi');
      if (parsed.fields.kind === 'upi') {
        expect(parsed.fields.upi.pa).toBe('citypharmacy@ptyes');
        expect(parsed.fields.upi.mc).toBe('5912');
      }
    });

    it('decodes messaging-app JPEG-compressed QR with 8x8 block DCT quantization (degraded_jpeg_compressed.png)', () => {
      const item = manifest['degraded_jpeg_compressed.png']!;
      const filePath = path.join(fixturesDir, 'degraded_jpeg_compressed.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));
      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

      const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
      expect(decoded).toBe(item.payload);

      const verification = verifyQrPayload(decoded!);
      expect(verification.category).toBe('SAFE');
    });

    it('decodes washed-out low-contrast standee via linear contrast stretching (degraded_low_contrast_faded.png)', () => {
      const item = manifest['degraded_low_contrast_faded.png']!;
      const filePath = path.join(fixturesDir, 'degraded_low_contrast_faded.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));
      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

      const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
      expect(decoded).toBe(item.payload);

      const verification = verifyQrPayload(decoded!);
      expect(verification.category).toBe('SAFE');
    });

    it('decodes display screen photos with LCD raster lines and vignette (degraded_photographed_on_screen.png & degraded_screen_refund_scam.png)', () => {
      for (const screenFilename of [
        'degraded_photographed_on_screen.png',
        'degraded_screen_refund_scam.png'
      ]) {
        const item = manifest[screenFilename]!;
        const filePath = path.join(fixturesDir, screenFilename);
        const png = PNG.sync.read(fs.readFileSync(filePath));
        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
        expect(decoded).toBe(item.payload);

        const verification = verifyQrPayload(decoded!);
        expect(verification.category).toBe(item.expectedCategory);
      }
    });

    it('validates BharatQR EMVCo CRC-16 checksum on authentic standee vs tampered standee', () => {
      // Authentic BharatQR standee
      const authItem = manifest['real_bharatqr_emv_standee.png']!;
      const authPng = PNG.sync.read(fs.readFileSync(path.join(fixturesDir, 'real_bharatqr_emv_standee.png')));
      const authDecoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(authPng.data.buffer, authPng.data.byteOffset, authPng.data.length),
        authPng.width,
        authPng.height
      );
      expect(authDecoded).toBe(authItem.payload);
      const authVerif = verifyQrPayload(authDecoded!);
      expect(authVerif.category).toBe('SAFE');
      expect(authVerif.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);

      // Tampered CRC standee
      const badItem = manifest['suspicious_emv_tampered_crc.png']!;
      const badPng = PNG.sync.read(fs.readFileSync(path.join(fixturesDir, 'suspicious_emv_tampered_crc.png')));
      const badDecoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(badPng.data.buffer, badPng.data.byteOffset, badPng.data.length),
        badPng.width,
        badPng.height
      );
      expect(badDecoded).toBe(badItem.payload);
      const badVerif = verifyQrPayload(badDecoded!);
      expect(badVerif.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
    });

    it('proactively flags pull-payment debit collect and autopay mandate requests', () => {
      const collectPng = PNG.sync.read(fs.readFileSync(path.join(fixturesDir, 'malicious_pull_collect_debit.png')));
      const collectDecoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(collectPng.data.buffer, collectPng.data.byteOffset, collectPng.data.length),
        collectPng.width,
        collectPng.height
      );
      const collectVerif = verifyQrPayload(collectDecoded!);
      expect(collectVerif.category).toBe('HIGH_RISK');
      expect(collectVerif.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);

      const mandatePng = PNG.sync.read(fs.readFileSync(path.join(fixturesDir, 'malicious_autopay_mandate.png')));
      const mandateDecoded = decodeQrFromImageBuffer(
        new Uint8ClampedArray(mandatePng.data.buffer, mandatePng.data.byteOffset, mandatePng.data.length),
        mandatePng.width,
        mandatePng.height
      );
      const mandateVerif = verifyQrPayload(mandateDecoded!);
      expect(mandateVerif.category).toBe('HIGH_RISK');
      expect(mandateVerif.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
    });
  });
});
