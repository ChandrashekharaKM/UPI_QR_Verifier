import { describe, it, expect } from 'vitest';
import { parsePayload } from '../src/parser/payload-parser.js';
import { robustDecodeURIComponent } from '../src/parser/deeplink-parser.js';
import { inspectUnicodeSafety, canonicalizeUnicodeText } from '../src/validators/unicode-validator.js';
import { ruleHiddenUnicode } from '../src/rules/rules-unicode.js';
import { verifyQrPayload } from '../src/verifier.js';

describe('Hardening: Percent-Decoding, Double-Encoding, Homoglyphs & Mixed-Case', () => {
  describe('1. Percent-Decoding Edge Cases & Double-Encoding', () => {
    it('handles malformed percent escapes (%ZZ, incomplete hex, trailing %) without throwing', () => {
      const { decoded: d1 } = robustDecodeURIComponent('Store%20%ZZ%20Deal');
      expect(d1).toBe('Store %ZZ Deal');

      const { decoded: d2 } = robustDecodeURIComponent('100%20Cashback%');
      expect(d2).toBe('100 Cashback%');

      const { decoded: d3 } = robustDecodeURIComponent('Incomplete%2');
      expect(d3).toBe('Incomplete%2');
    });

    it('resolves double URL-encoding (%2540 -> @, %2520 -> space) and detects obfuscation attempt', () => {
      const { decoded, wasDoubleEncoded } = robustDecodeURIComponent('merchant%2540oksbi');
      expect(decoded).toBe('merchant@oksbi');
      expect(wasDoubleEncoded).toBe(true);

      const payload = 'upi://pay?pa=merchant%2540oksbi&pn=Double%2520Encoded%2520Shop';
      const parsed = parsePayload(payload);
      expect(parsed.kind).toBe('upi');
      if (parsed.fields.kind === 'upi') {
        expect(parsed.fields.upi.pa).toBe('merchant@oksbi');
        expect(parsed.fields.upi.pn).toBe('Double Encoded Shop');
      }
      expect(parsed.parseWarnings.some((w) => w.includes('Double URL-encoding detected'))).toBe(true);
    });
  });

  describe('2. Unicode Homoglyphs & Confusables', () => {
    it('detects Cyrillic homoglyphs in payee address (pa) and triggers RULE_HIDDEN_UNICODE', () => {
      // 'ѕ' is Cyrillic small dze (U+0455), 'і' is Cyrillic small Byelorussian i (U+0456)
      const fakeSbiVpa = '\u0455b\u0456.refund@ybl';
      const payload = `upi://pay?pa=${encodeURIComponent(fakeSbiVpa)}&pn=SBI%20Refund%20Desk`;
      const parsed = parsePayload(payload);

      const ruleRes = ruleHiddenUnicode({ parsed });
      expect(ruleRes.triggered).toBe(true);
      expect(ruleRes.id).toBe('RULE_HIDDEN_UNICODE');
      expect(ruleRes.severity).toBe('critical'); // In PA, severity is critical
      expect(ruleRes.weight).toBe(85);
      expect(ruleRes.evidence?.some((e) => e.key.includes('pa'))).toBe(true);
      expect(ruleRes.message).toContain('lookalike Unicode homoglyphs');

      // Canonical normalizer maps Cyrillic 'ѕ' -> 's' and 'і' -> 'i'
      const canonical = canonicalizeUnicodeText(fakeSbiVpa);
      expect(canonical).toBe('sbi.refund@ybl');

      const verification = verifyQrPayload(payload);
      expect(verification.category).toBe('HIGH_RISK');
      expect(verification.reasons.some((r) => r.ruleId === 'RULE_HIDDEN_UNICODE')).toBe(true);
    });

    it('detects Greek homoglyphs in payee name (pn)', () => {
      // Greek small alpha 'α' (\u03B1) mimicking 'a'
      const greekName = 'Am\u03B1zon Store';
      const payload = `upi://pay?pa=store@okaxis&pn=${encodeURIComponent(greekName)}`;
      const parsed = parsePayload(payload);

      const ruleRes = ruleHiddenUnicode({ parsed });
      expect(ruleRes.triggered).toBe(true);
      expect(ruleRes.evidence?.some((e) => e.key.includes('pn'))).toBe(true);
    });

    it('detects fullwidth ASCII characters (e.g. fullwidth @)', () => {
      // Fullwidth @ is \uFF20
      const fullwidthVpa = 'user\uFF20oksbi';
      const inspection = inspectUnicodeSafety(fullwidthVpa);
      expect(inspection.hasHomoglyphs).toBe(true);
      expect(inspection.normalizedAscii).toBe('user@oksbi');
    });
  });

  describe('3. Zero-Width and Invisible Control Characters', () => {
    it('detects zero-width space (U+200B) in VPA (pa)', () => {
      const zeroWidthVpa = 'merchant\u200B@okhdfcbank';
      const payload = `upi://pay?pa=${encodeURIComponent(zeroWidthVpa)}&pn=LegitShop`;
      const parsed = parsePayload(payload);

      const ruleRes = ruleHiddenUnicode({ parsed });
      expect(ruleRes.triggered).toBe(true);
      expect(ruleRes.severity).toBe('critical');
      expect(ruleRes.evidence?.some((e) => e.value.includes('U+200B'))).toBe(true);
    });

    it('detects zero-width joiner (ZWJ) and non-joiner (ZWNJ) in pn and tn', () => {
      const sneakyName = 'Safe\u200CBank\u200D';
      const sneakyNote = 'Verify\u200BPIN';
      const payload = `upi://pay?pa=payee@okaxis&pn=${encodeURIComponent(sneakyName)}&tn=${encodeURIComponent(sneakyNote)}`;
      const parsed = parsePayload(payload);

      const ruleRes = ruleHiddenUnicode({ parsed });
      expect(ruleRes.triggered).toBe(true);
      expect(ruleRes.evidence?.some((e) => e.key.includes('pn'))).toBe(true);
      expect(ruleRes.evidence?.some((e) => e.key.includes('tn'))).toBe(true);
    });

    it('detects bidirectional override characters (U+202E RLO)', () => {
      const bidiNote = 'Normal text \u202Edrawkcab text';
      const inspection = inspectUnicodeSafety(bidiNote);
      expect(inspection.hasZeroWidth).toBe(true);
      expect(inspection.zeroWidthFound).toContain('U+202E');
    });
  });

  describe('4. Mixed-Case URI Schemes and Parameter Keys', () => {
    it('parses mixed-case UPI://PAY with mixed-case parameters', () => {
      const payload = 'UPI://PAY?PA=merchant@okhdfcbank&Pn=Store%20Name&AM=50.00&CU=INR&MC=5411';
      const parsed = parsePayload(payload);

      expect(parsed.kind).toBe('upi');
      if (parsed.fields.kind === 'upi') {
        expect(parsed.fields.upi.pa).toBe('merchant@okhdfcbank');
        expect(parsed.fields.upi.pn).toBe('Store Name');
        expect(parsed.fields.upi.am).toBe('50.00');
        expect(parsed.fields.upi.cu).toBe('INR');
        expect(parsed.fields.upi.mc).toBe('5411');
      }

      const res = verifyQrPayload(payload);
      expect(res.category).toBe('SAFE');
    });

    it('parses mixed-case deep links: UpI://CoLLeCt and uPi://mAnDaTe', () => {
      const collect = 'UpI://CoLLeCt?pa=claim@ybl&am=500';
      const parsedCollect = parsePayload(collect);
      expect(parsedCollect.kind).toBe('upi');
      if (parsedCollect.fields.kind === 'upi') {
        expect(parsedCollect.fields.upi.action).toBe('collect');
      }
      expect(verifyQrPayload(collect).reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);

      const mandate = 'uPi://mAnDaTe?pa=sub@okaxis&am=200';
      const parsedMandate = parsePayload(mandate);
      expect(parsedMandate.kind).toBe('upi');
      if (parsedMandate.fields.kind === 'upi') {
        expect(parsedMandate.fields.upi.action).toBe('mandate');
      }
      expect(verifyQrPayload(mandate).reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
    });

    it('parses mixed-case app deep links: PhOnEpE://pAy, TeZ://uPi/PaY, InTeNt://', () => {
      const phonepe = 'PhOnEpE://pAy?pa=retail@ybl&pn=Retail';
      expect(parsePayload(phonepe).kind).toBe('upi');

      const tez = 'TeZ://uPi/PaY?pa=retail@okhdfcbank&pn=Retail';
      expect(parsePayload(tez).kind).toBe('upi');

      const intent = 'InTeNt://PaY?pa=store@okaxis&pn=Store#InTeNt;ScHeMe=UpI;end';
      expect(parsePayload(intent).kind).toBe('upi');
    });
  });
});
