import { describe, it, expect } from 'vitest';
import {
  validateBrandImpersonation,
  detectBrandMatches
} from '../src/validators/brand-validator.js';
import { ruleBrandImpersonation } from '../src/rules/rules-payee.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import { evaluateRules } from '../src/rules/engine.js';

describe('Brand Impersonation Validator & Rule Suite (brand-keywords.json)', () => {
  describe('1. Low False Positives: Legitimate Intermediaries and Authorized Entities', () => {
    it('allows "SBI Mutual Fund Agent" without flagging impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'SBI Mutual Fund Agent',
        vpa: 'rajesh.mf@oksbi'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.riskLevel).toBe('none');
      expect(result.isExempt).toBe(true);
      expect(result.matchedBrands.length).toBeGreaterThan(0);
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedExemptions).toContain('agent');
      expect(result.matchedExemptions).toContain('mutual fund');
    });

    it('allows "HDFC Life Insurance Advisor" without flagging impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'HDFC Life Insurance Advisor',
        vpa: 'anita.advisor@okhdfcbank'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('hdfc');
      expect(result.matchedExemptions).toContain('advisor');
      expect(result.matchedExemptions).toContain('life insurance');
    });

    it('allows "ICICI Securities Sub-broker" without flagging impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'ICICI Securities Sub-broker',
        vpa: 'verma.stocks@icici'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('icici');
      expect(result.matchedExemptions).toContain('sub-broker');
    });

    it('allows "SBI Canteen IIT Delhi" without flagging impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'SBI Canteen IIT Delhi',
        vpa: 'sbicanteen@oksbi'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedExemptions).toContain('canteen');
    });

    it('allows "Paytm Authorized Merchant Store" without flagging impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Paytm Authorized Merchant Store',
        vpa: 'paytmstore@paytm'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedExemptions).toContain('store');
      expect(result.matchedExemptions).toContain('merchant');
    });

    it('allows legitimate utility billing with MCC 4900 ("BESCOM Bill Collection Desk")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'BESCOM Bill Collection Desk',
        vpa: 'bescom.bills@canarabank',
        merchantCode: '4900'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedBrands.some((b) => b.brandId === 'bescom')).toBe(true);
    });

    it('allows Devanagari legitimate intermediary ("एसबीआई म्यूचुअल फंड एजेंट")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'एसबीआई म्यूचुअल फंड एजेंट',
        vpa: 'sbi.agent@oksbi'
      });

      expect(result.isImpersonation).toBe(false);
      expect(result.isExempt).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedExemptions).toContain('एजेंट');
    });
  });

  describe('2. Impersonation Detection: Fake Helplines, Support & Social Engineering Lures', () => {
    it('flags "SBI Helpline" as critical brand impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'SBI Helpline',
        vpa: 'sbihelpline982@ybl'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedIntentKeywords).toContain('helpline');
    });

    it('flags "Paytm Customer Care Desk" as brand impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Paytm Customer Care Desk',
        vpa: 'care.paytm.help@okaxis'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands[0]?.brandId).toBe('paytm');
      expect(result.matchedIntentKeywords.some((k) => k.includes('care') || k.includes('support'))).toBe(true);
    });

    it('flags "Paytm KYC Support Desk" as brand impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Paytm KYC Support Desk',
        vpa: 'paytmkyc@ibl'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedIntentKeywords).toContain('kyc');
    });

    it('flags "Income Tax Department Refund Portal" as impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Income Tax Department Refund Portal',
        vpa: 'incometax.refund@paytm'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands[0]?.brandId).toBe('incometax');
      expect(result.matchedIntentKeywords).toContain('refund');
    });

    it('flags "Traffic Police e-Challan Penalty Clearance"', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Traffic Police e-Challan Penalty Clearance',
        vpa: 'echallan.pay@ybl'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands[0]?.brandId).toBe('police_challan');
      expect(result.matchedIntentKeywords).toContain('penalty');
    });

    it('flags "BESCOM Electricity Power Cut Notice" without MCC 4900 as extortion impersonation', () => {
      const result = validateBrandImpersonation({
        payeeName: 'BESCOM Electricity Power Cut Notice',
        vpa: 'powercut.bescom@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedIntentKeywords).toContain('power cut');
    });
  });

  describe('3. Indian Language Transliterations (Devanagari, Hinglish, South Indian)', () => {
    it('detects Devanagari brand impersonation ("एसबीआई सहायता केंद्र")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'एसबीआई सहायता केंद्र',
        vpa: 'sbihelpdesk@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedBrands[0]?.language).toBe('devanagari');
      expect(result.matchedIntentKeywords).toContain('सहायता');
    });

    it('detects Hinglish electricity threat ("Bijli Vibhag Sahayata Desk")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'Bijli Vibhag Sahayata Desk',
        vpa: 'bijli.officer@ybl'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.riskLevel).toBe('critical');
      expect(result.matchedBrands.some((b) => b.brandId === 'generic_electricity')).toBe(true);
      expect(result.matchedIntentKeywords).toContain('sahayata');
    });

    it('detects Tamil transliteration impersonation ("எஸ்பிஐ உதவி மையம்")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'எஸ்பிஐ உதவி மையம்',
        vpa: 'sbi.support@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedBrands[0]?.language).toBe('tamil');
      expect(result.matchedIntentKeywords).toContain('உதவி');
    });

    it('detects Telugu transliteration impersonation ("ఎస్బీఐ సహాయ కేంద్రం")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'ఎస్బీఐ సహాయ కేంద్రం',
        vpa: 'sbi.help@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedBrands[0]?.language).toBe('telugu');
      expect(
        result.matchedIntentKeywords.some((k) => k.includes('సహాయ'))
      ).toBe(true);
    });

    it('detects Bengali transliteration impersonation ("এসবিআই সাহায্য কেন্দ্র")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'এসবিআই সাহায্য কেন্দ্র',
        vpa: 'sbi.kolkata@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('sbi');
      expect(result.matchedBrands[0]?.language).toBe('bengali');
      expect(result.matchedIntentKeywords).toContain('সাহায্য');
    });

    it('detects Kannada transliteration impersonation ("ಬೆಸ್ಕಾಂ ಸಹಾಯವಾಣಿ")', () => {
      const result = validateBrandImpersonation({
        payeeName: 'ಬೆಸ್ಕಾಂ ಸಹಾಯವಾಣಿ',
        vpa: 'bescom.helpline@oksbi'
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.matchedBrands[0]?.brandId).toBe('bescom');
      expect(result.matchedBrands[0]?.language).toBe('kannada');
      expect(result.matchedIntentKeywords).toContain('ಸಹಾಯವಾಣಿ');
    });
  });

  describe('4. Token Boundary Safety & Word Collision Avoidance', () => {
    it('does NOT trigger RBI on "Inorbit Mall Store"', () => {
      const brands = detectBrandMatches('Inorbit Mall Store', false);
      expect(brands.some((b) => b.brandId === 'rbi')).toBe(false);

      const result = validateBrandImpersonation({ payeeName: 'Inorbit Mall Store' });
      expect(result.isImpersonation).toBe(false);
    });

    it('does NOT trigger Bank of Baroda (bob) on "Bobcat Heavy Equipments"', () => {
      const brands = detectBrandMatches('Bobcat Heavy Equipments', false);
      expect(brands.some((b) => b.brandId === 'bob')).toBe(false);

      const result = validateBrandImpersonation({ payeeName: 'Bobcat Heavy Equipments' });
      expect(result.isImpersonation).toBe(false);
    });

    it('does NOT trigger SBI on "Asbika General Store"', () => {
      const brands = detectBrandMatches('Asbika General Store', false);
      expect(brands.some((b) => b.brandId === 'sbi')).toBe(false);

      const result = validateBrandImpersonation({ payeeName: 'Asbika General Store' });
      expect(result.isImpersonation).toBe(false);
    });
  });

  describe('5. Rule Integration with Security Rules Engine', () => {
    it('triggers ruleBrandImpersonation on malicious "SBI Customer Care" QR', () => {
      const ctx = {
        parsed: parsePayload('upi://pay?pa=sbi.customercare@ybl&pn=SBI%20Customer%20Care')
      };
      const ruleRes = ruleBrandImpersonation(ctx);

      expect(ruleRes.id).toBe('RULE_BRAND_IMPERSONATION');
      expect(ruleRes.triggered).toBe(true);
      expect(ruleRes.severity).toBe('critical');
      expect(ruleRes.evidence).toBeDefined();
    });

    it('does NOT trigger ruleBrandImpersonation on "SBI Mutual Fund Agent"', () => {
      const ctx = {
        parsed: parsePayload('upi://pay?pa=rajesh.mf@oksbi&pn=SBI%20Mutual%20Fund%20Agent')
      };
      const ruleRes = ruleBrandImpersonation(ctx);

      expect(ruleRes.triggered).toBe(false);
    });

    it('evaluates cleanly in full evaluateRules pipeline', () => {
      const cleanCtx = {
        parsed: parsePayload('upi://pay?pa=merchant@okhdfcbank&pn=Merchant&am=100&cu=INR&mc=5411')
      };
      const res = evaluateRules(cleanCtx);
      expect(res.triggeredRules.find((r) => r.id === 'RULE_BRAND_IMPERSONATION')).toBeUndefined();
      expect(res.triggeredRules.length).toBe(0);
      expect(res.ruleRiskScore).toBe(0);
    });
  });
});
