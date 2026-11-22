import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  decodeQrFromImageBuffer,
  decodeAllQrFromImageBuffer,
  rotateImageData,
  scaleImageData2x,
  downscaleImageData,
  applyContrastStretch
} from '../lib/web-qr';
import { verifyQrPayload, parsePayload } from '@upi-verifier/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureDef {
  filename: string;
  expectedCategory: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';
  payload: string;
  description: string;
  transformation?: string;
}

describe('Real-World QR PNG Fixtures Decoder Engine Test Suite', () => {
  const fixturesDir = path.resolve(__dirname, '../../../docs/sample-fixtures');
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, FixtureDef>;

  describe('Direct Image File PNG Decoding for all Manifest Fixtures', () => {
    for (const [filename, item] of Object.entries(manifest)) {
      it(`accurately decodes "${filename}" [${item.transformation ?? 'standard'}] to expected payload`, () => {
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

        // Verify the decoded payload through the security verifier
        const verification = verifyQrPayload(decoded!);
        expect(verification.category).toBe(item.expectedCategory);
      });
    }
  });

  describe('Degraded & Challenging Real-World Condition Transformations', () => {
    it('decodes rotated merchant standees across 90°, 180°, and 270° orientations', () => {
      for (const rotFilename of [
        'real_rotated_standee_90.png',
        'real_rotated_standee_180.png',
        'real_rotated_standee_270.png'
      ]) {
        const item = manifest[rotFilename]!;
        const filePath = path.join(fixturesDir, rotFilename);
        const png = PNG.sync.read(fs.readFileSync(filePath));
        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
        expect(decoded).toBe(item.payload);
      }
    });

    it('decodes photographed counter QR with optical defocus and camera blur (real_blurred_photo.png)', () => {
      const item = manifest['real_blurred_photo.png']!;
      const filePath = path.join(fixturesDir, 'real_blurred_photo.png');
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

    it('decodes washed-out low-contrast laminated counter standee via contrast stretching (real_low_contrast_standee.png)', () => {
      const item = manifest['real_low_contrast_standee.png']!;
      const filePath = path.join(fixturesDir, 'real_low_contrast_standee.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));
      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

      const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
      expect(decoded).toBe(item.payload);

      const parsed = parsePayload(decoded!);
      expect(parsed.fields.kind).toBe('upi');
      if (parsed.fields.kind === 'upi') {
        expect(parsed.fields.upi.pa).toBe('apollomed@axisbank');
        expect(parsed.fields.upi.pn).toBe('Apollo Pharmacy');
      }
    });

    it('decodes small counter sticker via 2x nearest-neighbor upscaling (real_small_counter_sticker.png)', () => {
      const item = manifest['real_small_counter_sticker.png']!;
      const filePath = path.join(fixturesDir, 'real_small_counter_sticker.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));

      expect(png.width).toBeLessThanOrEqual(140);
      expect(png.height).toBeLessThanOrEqual(140);

      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
      const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
      expect(decoded).toBe(item.payload);
    });

    it('decodes and parses authentic BharatQR / EMVCo counter standees with valid CRC16', () => {
      for (const emvFile of ['real_shop_standee_bharatqr.png', 'real_bharatqr_emv_standee.png']) {
        const item = manifest[emvFile]!;
        const filePath = path.join(fixturesDir, emvFile);
        const png = PNG.sync.read(fs.readFileSync(filePath));
        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
        expect(decoded).toBe(item.payload);

        const parsed = parsePayload(decoded!);
        expect(parsed.kind).toBe('emv');
        expect(parsed.fields.kind).toBe('emv');
        if (parsed.fields.kind === 'emv') {
          expect(parsed.fields.emv.isValidCrc).toBe(true);
          expect(parsed.fields.upi.source).toBe('emv');
          expect(parsed.fields.upi.pa).toContain('@');
        }
      }
    });

    it('flags tampered EMVCo standees with bad CRC as SUSPICIOUS (RULE_EMV_BAD_CRC)', () => {
      for (const badCrcFile of ['suspicious_emv_tampered_crc.png', 'suspicious_emv_bad_crc.png']) {
        const item = manifest[badCrcFile]!;
        const filePath = path.join(fixturesDir, badCrcFile);
        const png = PNG.sync.read(fs.readFileSync(filePath));
        const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

        const decoded = decodeQrFromImageBuffer(pixels, png.width, png.height);
        expect(decoded).toBe(item.payload);

        const result = verifyQrPayload(decoded!);
        expect(result.category).toBe('SUSPICIOUS');
        expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
      }
    });
  });

  describe('Image Transformation Utilities Unit Tests', () => {
    it('rotateImageData correctly maps dimensions and coordinates for 90, 180, 270 degrees', () => {
      const w = 4;
      const h = 2;
      const src = new Uint8ClampedArray(w * h * 4);
      // Mark top-left pixel (x=0, y=0) as Red
      src[0] = 255; src[1] = 0; src[2] = 0; src[3] = 255;

      const r90 = rotateImageData(src, w, h, 90);
      expect(r90.width).toBe(2);
      expect(r90.height).toBe(4);
      // At 90 deg, (0, 0) moves to (h-1, 0) = (1, 0)
      const r90Idx = (0 * 2 + 1) * 4;
      expect(r90.data[r90Idx]).toBe(255);

      const r180 = rotateImageData(src, w, h, 180);
      expect(r180.width).toBe(4);
      expect(r180.height).toBe(2);
      // At 180 deg, (0, 0) moves to (w-1, h-1) = (3, 1)
      const r180Idx = (1 * 4 + 3) * 4;
      expect(r180.data[r180Idx]).toBe(255);

      const r270 = rotateImageData(src, w, h, 270);
      expect(r270.width).toBe(2);
      expect(r270.height).toBe(4);
      // At 270 deg, (0, 0) moves to (0, w-1) = (0, 3)
      const r270Idx = (3 * 2 + 0) * 4;
      expect(r270.data[r270Idx]).toBe(255);
    });

    it('scaleImageData2x doubles dimensions and duplicates pixels', () => {
      const w = 2;
      const h = 2;
      const src = new Uint8ClampedArray(w * h * 4);
      src[0] = 128; src[1] = 64; src[2] = 32; src[3] = 255;

      const up = scaleImageData2x(src, w, h);
      expect(up.width).toBe(4);
      expect(up.height).toBe(4);
      // Top-left 2x2 pixels should match original (0, 0)
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          const idx = (y * 4 + x) * 4;
          expect(up.data[idx]).toBe(128);
          expect(up.data[idx + 1]).toBe(64);
          expect(up.data[idx + 2]).toBe(32);
        }
      }
    });

    it('downscaleImageData scales large buffer to max dimension', () => {
      const w = 2000;
      const h = 1000;
      const src = new Uint8ClampedArray(w * h * 4);
      src.fill(200);

      const down = downscaleImageData(src, w, h, 1024);
      expect(down.width).toBe(1024);
      expect(down.height).toBe(512);
      expect(down.data[0]).toBe(200);
    });

    it('applyContrastStretch expands compressed dynamic range to full [0, 255]', () => {
      const w = 10;
      const h = 10;
      const src = new Uint8ClampedArray(w * h * 4);
      // Fill half with 120 and half with 180
      for (let i = 0; i < src.length; i += 4) {
        const val = i < src.length / 2 ? 120 : 180;
        src[i] = val; src[i + 1] = val; src[i + 2] = val; src[i + 3] = 255;
      }

      const stretched = applyContrastStretch(src, w, h);
      // The lower values should map close to 0 and higher close to 255
      expect(stretched[0]).toBeLessThan(50);
      expect(stretched[stretched.length - 4]).toBeGreaterThan(200);
    });

    it('decodeAllQrFromImageBuffer returns all distinct QR codes found in image buffer', () => {
      const filePath = path.join(fixturesDir, 'safe_grocery_store.png');
      const png = PNG.sync.read(fs.readFileSync(filePath));
      const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

      const all = decodeAllQrFromImageBuffer(pixels, png.width, png.height);
      expect(all).toHaveLength(1);
      expect(all[0]).toBe(manifest['safe_grocery_store.png']!.payload);
    });
  });
});
