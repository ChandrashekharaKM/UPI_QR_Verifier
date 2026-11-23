import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  PspLookupService,
  maskVpaForLogs
} from '../src/services/psp-lookup.js';

describe('PspLookupService & Licensed Gateway VPA Adapter', () => {
  describe('Privacy & Redaction: maskVpaForLogs', () => {
    it('masks raw VPA when user consent (optInTelemetry) is false', () => {
      const vpa = 'rohit.sharma@okhdfcbank';
      const masked = maskVpaForLogs(vpa, false);

      expect(masked).not.toContain('rohit.sharma');
      expect(masked).toMatch(/^\[anon_[a-f0-9]{8}@okhdfcbank\]$/);
    });

    it('returns raw VPA only when explicit user consent is granted', () => {
      const vpa = 'rohit.sharma@okhdfcbank';
      const unmasked = maskVpaForLogs(vpa, true);

      expect(unmasked).toBe('rohit.sharma@okhdfcbank');
    });
  });

  describe('Service Configuration & Default Mock Behavior', () => {
    it('is disabled by default and returns null', async () => {
      const service = new PspLookupService(); // disabled by default
      expect(service.enabled).toBe(false);

      const result = await service.validateVpa('starbucks@okhdfcbank');
      expect(result).toBeNull();
    });

    it('validates VPA and returns registered beneficiary name when enabled with mock provider', async () => {
      const service = new PspLookupService({
        enabled: true,
        provider: 'mock'
      });
      expect(service.enabled).toBe(true);

      const res = await service.validateVpa('starbucks@okhdfcbank');
      expect(res).not.toBeNull();
      expect(res?.isValid).toBe(true);
      expect(res?.registeredName).toBe('Starbucks Coffee India Pvt Ltd');
      expect(res?.provider).toBe('mock-gateway');
    });

    it('reports invalid or inactive VPAs according to mock definitions', async () => {
      const service = new PspLookupService({
        enabled: true,
        provider: 'mock'
      });

      const res = await service.validateVpa('invalid.handle@okhdfcbank');
      expect(res).not.toBeNull();
      expect(res?.isValid).toBe(false);
    });

    it('supports custom injected mock entries', async () => {
      const service = new PspLookupService({
        enabled: true,
        provider: 'mock',
        mockEntries: {
          'custom.shop@okaxis': {
            isValid: true,
            registeredName: 'Custom Bookstore Enterprises'
          }
        }
      });

      const res = await service.validateVpa('custom.shop@okaxis');
      expect(res?.isValid).toBe(true);
      expect(res?.registeredName).toBe('Custom Bookstore Enterprises');
    });
  });

  describe('API Route Integration with PspLookupService', () => {
    it('POST /v1/verify skips psp-lookup when disabled (default behavior)', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        pspLookup: { enabled: false }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          payload: 'upi://pay?pa=starbucks@okhdfcbank&pn=Starbucks%20Coffee&am=250'
        }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.pspLookup).toBeUndefined();

      const providers = json.verification.vpaVerification.providerResults.map((p: { providerId: string }) => p.providerId);
      expect(providers).not.toContain('psp-lookup');

      await app.close();
    });

    it('POST /v1/verify enriches verification and triggers RULE_REGISTERED_NAME_MISMATCH when enabled with mismatched name', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        pspLookup: {
          enabled: true,
          provider: 'mock',
          mockEntries: {
            'scammer@ybl': {
              isValid: true,
              registeredName: 'Unrelated Personal Account Holder'
            }
          }
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          payload: 'upi://pay?pa=scammer@ybl&pn=Official%20Bank%20Support&am=5000'
        }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();

      expect(json.pspLookup).toBeDefined();
      expect(json.pspLookup.registeredName).toBe('Unrelated Personal Account Holder');

      // Verify RULE_REGISTERED_NAME_MISMATCH triggered
      const reasons = json.verification.reasons;
      const mismatch = reasons.find((r: { ruleId: string; severity?: string }) => r.ruleId === 'RULE_REGISTERED_NAME_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch.severity).toBe('high');

      // Verify provider results include psp-lookup flagged as risk
      const pspProvider = json.verification.vpaVerification.providerResults.find(
        (p: { providerId: string; status?: string }) => p.providerId === 'psp-lookup'
      );
      expect(pspProvider).toBeDefined();
      expect(pspProvider.status).toBe('flagged_risk');
      expect(json.verification.vpaVerification.overallStatus).toBe('flagged_risk');

      await app.close();
    });

    it('GET /v1/vpa/:vpa/verify includes psp-lookup provider when service is enabled', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        pspLookup: {
          enabled: true,
          provider: 'mock'
        }
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/vpa/starbucks@okhdfcbank/verify'
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();

      const providers = json.providerResults.map((p: { providerId: string }) => p.providerId);
      expect(providers).toContain('psp-lookup');

      const pspProvider = json.providerResults.find((p: { providerId: string; details: { registeredNameMatchCheck?: unknown } }) => p.providerId === 'psp-lookup');
      expect(pspProvider.details.registeredNameMatchCheck).toBeDefined();

      await app.close();
    });
  });
});
