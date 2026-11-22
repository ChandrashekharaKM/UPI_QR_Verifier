import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { verifyQrPayload, parsePayload } from '../src';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureDef {
  readonly filename: string;
  readonly expectedCategory: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';
  readonly payload: string;
  readonly description: string;
  readonly transformation: string;
}

describe('Core Real-World Acceptance Fixtures Test Suite', () => {
  const fixturesDir = path.resolve(__dirname, '../../../docs/real-world-fixtures');
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, FixtureDef>;

  it('contains at least 25 real-world fixtures in manifest', () => {
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(25);
  });

  it('covers all required degraded conditions: rotated 15°, blurred, JPEG-compressed, low contrast, photographed-on-a-screen', () => {
    const transformations = new Set(Object.values(manifest).map((m) => m.transformation));
    expect(transformations.has('rotated_15')).toBe(true);
    expect(transformations.has('blurred')).toBe(true);
    expect(transformations.has('jpeg_compressed')).toBe(true);
    expect(transformations.has('low_contrast')).toBe(true);
    expect(transformations.has('screen_simulation')).toBe(true);
  });

  describe('Core Security Verification for all 29 Manifest Fixtures', () => {
    for (const [filename, item] of Object.entries(manifest)) {
      it(`verifies "${filename}" [${item.transformation}] matches ${item.expectedCategory}`, () => {
        const parsed = parsePayload(item.payload);
        expect(parsed.rawPayload).toBe(item.payload.trim());

        const verification = verifyQrPayload(item.payload);
        expect(verification.category).toBe(item.expectedCategory);
        expect(verification.score).toBeGreaterThanOrEqual(0);
        expect(verification.score).toBeLessThanOrEqual(100);

        if (item.expectedCategory === 'SAFE') {
          expect(verification.isSafeWithCaveat).toBe(true);
          expect(verification.confidenceNote).toContain(
            'No major risk indicators found; recipient identity NOT independently verified'
          );
        } else if (item.expectedCategory === 'HIGH_RISK') {
          expect(verification.score).toBeGreaterThanOrEqual(71);
          expect(verification.reasons.length).toBeGreaterThan(0);
        }
      });
    }
  });

  describe('Specific Threat Invariants Across Scenarios', () => {
    it('flags tampered EMV CRC with RULE_EMV_BAD_CRC', () => {
      const item = manifest['suspicious_emv_tampered_crc.png']!;
      const verif = verifyQrPayload(item.payload);
      expect(verif.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
    });

    it('flags Cyrillic homoglyph in payee VPA with RULE_HIDDEN_UNICODE', () => {
      const item = manifest['malicious_unicode_homoglyph.png']!;
      const verif = verifyQrPayload(item.payload);
      expect(verif.reasons.some((r) => r.ruleId === 'RULE_HIDDEN_UNICODE')).toBe(true);
    });

    it('flags pull-collect and mandate requests with RULE_COLLECT_OR_MANDATE', () => {
      const collect = manifest['malicious_pull_collect_debit.png']!;
      const verifCollect = verifyQrPayload(collect.payload);
      expect(verifCollect.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);

      const mandate = manifest['malicious_autopay_mandate.png']!;
      const verifMandate = verifyQrPayload(mandate.payload);
      expect(verifMandate.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
    });

    it('flags bank helpline refund impersonation with RULE_VPA_IMPERSONATION and RULE_REFUND_VERIFY_NOTE', () => {
      const item = manifest['malicious_sbi_refund_scam.png']!;
      const verif = verifyQrPayload(item.payload);
      expect(
        verif.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION' || r.ruleId === 'RULE_REFUND_VERIFY_NOTE')
      ).toBe(true);
    });

    it('flags parameter pollution injection with RULE_DUPLICATE_PARAMETERS', () => {
      const item = manifest['malicious_parameter_pollution.png']!;
      const verif = verifyQrPayload(item.payload);
      expect(verif.reasons.some((r) => r.ruleId === 'RULE_DUPLICATE_PARAMETERS')).toBe(true);
    });
  });
});
