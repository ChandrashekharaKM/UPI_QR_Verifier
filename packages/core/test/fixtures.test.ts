import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { verifyQrPayload } from '../src/verifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureDef {
  filename: string;
  expectedCategory: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';
  payload: string;
  description: string;
}

describe('Sample QR Image Fixtures End-to-End Validation', () => {
  const manifestPath = path.resolve(__dirname, '../../../docs/sample-fixtures/manifest.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent) as Record<string, FixtureDef>;

  for (const [filename, item] of Object.entries(manifest)) {
    it(`evaluates fixture "${filename}" as ${item.expectedCategory}`, () => {
      // Ensure image file exists on disk
      const imagePath = path.resolve(__dirname, '../../../docs/sample-fixtures', filename);
      expect(fs.existsSync(imagePath)).toBe(true);

      const result = verifyQrPayload(item.payload);
      expect(result.category).toBe(item.expectedCategory);

      if (item.expectedCategory === 'SAFE') {
        expect(result.score).toBeLessThanOrEqual(30);
        expect(result.confidenceNote).toContain('No major risk indicators found; verify the receiver before paying.');
      } else if (item.expectedCategory === 'SUSPICIOUS') {
        expect(result.score).toBeGreaterThanOrEqual(31);
        expect(result.score).toBeLessThanOrEqual(70);
        expect(result.reasons.length).toBeGreaterThanOrEqual(1);
      } else if (item.expectedCategory === 'HIGH_RISK') {
        expect(result.score).toBeGreaterThanOrEqual(71);
        expect(result.reasons.length).toBeGreaterThanOrEqual(1);
      }
    });
  }
});
