import { describe, it, expect } from 'vitest';
import {
  verifyQrPayload,
  parsePayload,
  ruleRegisteredNameMismatch,
  PspLookupVerifier,
  PspLookupVpaVerifier,
  VpaVerifierRegistry,
  type PspLookupSignal,
  type RuleContext
} from '../src/index.js';

describe('PspLookupVerifier & RULE_REGISTERED_NAME_MISMATCH', () => {
  const qrValidMerchant = 'upi://pay?pa=starbucks@okhdfcbank&pn=Starbucks%20Coffee&am=250&cu=INR';
  const qrPersonalMismatched = 'upi://pay?pa=fraud99@ybl&pn=Electricity%20Board&am=1500&cu=INR';
  const qrMissingName = 'upi://pay?pa=anonymous@okaxis&am=100&cu=INR';

  describe('Rule: RULE_REGISTERED_NAME_MISMATCH', () => {
    it('does not trigger when pspLookup signal is absent', () => {
      const parsed = parsePayload(qrValidMerchant);
      const ctx: RuleContext = { parsed };
      const res = ruleRegisteredNameMismatch(ctx);

      expect(res.triggered).toBe(false);
      expect(res.id).toBe('RULE_REGISTERED_NAME_MISMATCH');
    });

    it('does not trigger when registered beneficiary name matches QR payee name closely', () => {
      const parsed = parsePayload(qrValidMerchant);
      const pspLookup: PspLookupSignal = {
        isValid: true,
        registeredName: 'Starbucks Coffee India Private Limited',
        provider: 'razorpay'
      };
      const ctx: RuleContext = { parsed, pspLookup };
      const res = ruleRegisteredNameMismatch(ctx);

      expect(res.triggered).toBe(false);
      expect(res.message).toContain('matches or correlates');
    });

    it('triggers with severity high when bank registered name differs completely from QR payee name', () => {
      const parsed = parsePayload(qrPersonalMismatched);
      const pspLookup: PspLookupSignal = {
        isValid: true,
        registeredName: 'Mukesh Rameshwar Sharma',
        provider: 'cashfree'
      };
      const ctx: RuleContext = { parsed, pspLookup };
      const res = ruleRegisteredNameMismatch(ctx);

      expect(res.triggered).toBe(true);
      expect(res.severity).toBe('high');
      expect(res.weight).toBe(75);
      expect(res.message).toContain('Beneficiary name mismatch');
      expect(res.evidence).toBeDefined();

      const evidenceKeys = res.evidence?.map((e) => e.key);
      expect(evidenceKeys).toContain('declaredPayeeName');
      expect(evidenceKeys).toContain('registeredBeneficiaryName');
      expect(evidenceKeys).toContain('similarity');
    });

    it('triggers high-severity alert when gateway confirms VPA is invalid on network', () => {
      const parsed = parsePayload('upi://pay?pa=fake.inactive@icici&pn=Shop');
      const pspLookup: PspLookupSignal = {
        isValid: false,
        provider: 'razorpay'
      };
      const ctx: RuleContext = { parsed, pspLookup };
      const res = ruleRegisteredNameMismatch(ctx);

      expect(res.triggered).toBe(true);
      expect(res.severity).toBe('high');
      expect(res.title).toContain('Invalid or Inactive VPA');
    });

    it('handles missing payee name gracefully without crashing', () => {
      const parsed = parsePayload(qrMissingName);
      const pspLookup: PspLookupSignal = {
        isValid: true,
        registeredName: 'Rohan Gupta',
        provider: 'mock'
      };
      const ctx: RuleContext = { parsed, pspLookup };
      const res = ruleRegisteredNameMismatch(ctx);

      expect(res.triggered).toBe(false);
      expect(res.message).toContain('does not declare payee name');
    });
  });

  describe('Provider: PspLookupVerifier / PspLookupVpaVerifier', () => {
    it('is registered with id "psp-lookup" and flagged as online provider', () => {
      const verifier = new PspLookupVerifier();
      expect(verifier.id).toBe('psp-lookup');
      expect(verifier.name).toBe('Licensed Gateway VPA Lookup');
      expect(verifier.isOnline).toBe(true);
      expect(verifier.isDefault).toBe(false);
    });

    it('verifies synchronously when signal is provided in constructor', () => {
      const signal: PspLookupSignal = {
        isValid: true,
        registeredName: 'Tata Starbucks Private Limited',
        provider: 'razorpay'
      };
      const verifier = new PspLookupVpaVerifier({ signal });
      const result = verifier.verify(qrValidMerchant);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.providerId).toBe('psp-lookup');
        expect(result.isValid).toBe(true);
        expect(result.status).toBe('verified_valid');
        expect(result.details.registeredNameMatchCheck?.passed).toBe(true);
        expect(result.details.registeredBeneficiaryName).toBe('Tata Starbucks Private Limited');
      }
    });

    it('flags risk when bank-registered name does not match QR name', () => {
      const signal: PspLookupSignal = {
        isValid: true,
        registeredName: 'Ramesh Kumar',
        provider: 'cashfree'
      };
      const verifier = new PspLookupVerifier({ signal });
      const result = verifier.verify(qrPersonalMismatched);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.status).toBe('flagged_risk');
        expect(result.statusLabel).toBe('Beneficiary Name Mismatch');
        expect(result.isValid).toBe(false);
        expect(result.details.registeredNameMatchCheck?.passed).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.details.jaroWinklerSimilarity).toBeDefined();
      }
    });

    it('flags risk when gateway reports VPA does not exist on network', () => {
      const signal: PspLookupSignal = {
        isValid: false,
        provider: 'razorpay'
      };
      const verifier = new PspLookupVerifier({ signal });
      const result = verifier.verify('upi://pay?pa=nonexistent@okhdfcbank&pn=Merchant');

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.status).toBe('flagged_risk');
        expect(result.statusLabel).toBe('Invalid VPA on Network');
        expect(result.details.gatewayValidationCheck?.passed).toBe(false);
      }
    });

    it('verifies asynchronously when fetcher function is passed', async () => {
      const mockFetcher = async (vpa: string): Promise<PspLookupSignal> => {
        return {
          isValid: true,
          registeredName: vpa.includes('starbucks') ? 'Starbucks Coffee' : 'Unknown',
          provider: 'mock-gateway'
        };
      };

      const verifier = new PspLookupVerifier({ fetcher: mockFetcher });
      const resPromise = verifier.verify(qrValidMerchant);

      expect(resPromise).toBeInstanceOf(Promise);
      const res = await resPromise;
      expect(res.status).toBe('verified_valid');
      expect(res.details.registeredBeneficiaryName).toBe('Starbucks Coffee');
    });

    it('handles unsupported non-UPI payloads', () => {
      const verifier = new PspLookupVerifier();
      const res = verifier.verify('https://example.com/checkout');

      expect(res).not.toBeInstanceOf(Promise);
      if (!(res instanceof Promise)) {
        expect(res.status).toBe('unsupported');
      }
    });

    it('integrates seamlessly with VpaVerifierRegistry', async () => {
      const registry = new VpaVerifierRegistry();
      registry.register(
        new PspLookupVerifier({
          signal: {
            isValid: true,
            registeredName: 'Starbucks Coffee',
            provider: 'razorpay'
          }
        })
      );

      const composite = await registry.verifyAll(qrValidMerchant, [
        'offline-structural',
        'psp-lookup'
      ]);

      expect(composite.providerResults.length).toBe(2);
      expect(composite.providerResults.some((p) => p.providerId === 'psp-lookup')).toBe(true);
      expect(composite.overallStatus).toBe('verified_valid');
    });
  });

  describe('Full End-to-End verifyQrPayload with pspLookup', () => {
    it('elevates risk score and adds mismatch reason when registered name differs from QR pn', () => {
      const normalResult = verifyQrPayload(qrPersonalMismatched);

      const pspResult = verifyQrPayload(qrPersonalMismatched, {
        pspLookup: {
          isValid: true,
          registeredName: 'Dinesh Prasad Gupta',
          provider: 'razorpay'
        }
      });

      expect(pspResult.score).toBeGreaterThan(normalResult.score);
      const mismatchRule = pspResult.reasons.find((r) => r.ruleId === 'RULE_REGISTERED_NAME_MISMATCH');
      expect(mismatchRule).toBeDefined();
      expect(mismatchRule?.severity).toBe('high');

      // Verify VPA verification section includes psp-lookup
      const pspProviderResult = pspResult.vpaVerification.providerResults.find(
        (p) => p.providerId === 'psp-lookup'
      );
      expect(pspProviderResult).toBeDefined();
      expect(pspProviderResult?.status).toBe('flagged_risk');
      expect(pspResult.vpaVerification.overallStatus).toBe('flagged_risk');
    });

    it('maintains safe score and passes verification when registered name matches QR pn', () => {
      const pspResult = verifyQrPayload(qrValidMerchant, {
        pspLookup: {
          isValid: true,
          registeredName: 'Starbucks Coffee India',
          provider: 'razorpay'
        }
      });

      const mismatchRule = pspResult.reasons.find((r) => r.ruleId === 'RULE_REGISTERED_NAME_MISMATCH');
      expect(mismatchRule).toBeUndefined();

      const pspProviderResult = pspResult.vpaVerification.providerResults.find(
        (p) => p.providerId === 'psp-lookup'
      );
      expect(pspProviderResult?.status).toBe('verified_valid');
    });
  });
});
