import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  ThreatIntelService,
  maskUrlForLogs
} from '../src/services/threat-intel.js';

describe('ThreatIntelService & URL Threat Intelligence Adapter', () => {
  const urlPhishing = 'https://testsafebrowsing.appspot.com/s/phishing.html';
  const urlMalware = 'https://malware-download.xyz/update.apk';
  const urlClean = 'https://www.tatamotors.com/investors';

  describe('Privacy & Redaction: maskUrlForLogs', () => {
    it('masks URL domain and path when optInTelemetry is false', () => {
      const masked = maskUrlForLogs('https://secret-bank-portal.com/login?token=xyz123', false);
      expect(masked).not.toContain('secret-bank-portal');
      expect(masked).not.toContain('token=xyz123');
      expect(masked).toContain('[anon_');
      expect(masked).toContain(':masked');
    });

    it('returns raw URL when user explicitly granted optInTelemetry consent', () => {
      const raw = 'https://secret-bank-portal.com/login?token=xyz123';
      const unmasked = maskUrlForLogs(raw, true);
      expect(unmasked).toBe(raw);
    });
  });

  describe('Service Configuration & Default Mock Behavior', () => {
    it('is disabled by default and returns null', async () => {
      const service = new ThreatIntelService();
      expect(service.enabled).toBe(false);

      const result = await service.checkUrl(urlPhishing);
      expect(result).toBeNull();
    });

    it('flags phishing URL when enabled with mock provider', async () => {
      const service = new ThreatIntelService({
        enabled: true,
        provider: 'mock'
      });
      expect(service.enabled).toBe(true);

      const result = await service.checkUrl(urlPhishing);
      expect(result).not.toBeNull();
      expect(result?.isMalicious).toBe(true);
      expect(result?.threatType).toBe('SOCIAL_ENGINEERING');
      expect(result?.source).toBe('google_safe_browsing');
    });

    it('flags malware URL when enabled', async () => {
      const service = new ThreatIntelService({
        enabled: true,
        provider: 'mock'
      });

      const result = await service.checkUrl(urlMalware);
      expect(result?.isMalicious).toBe(true);
      expect(result?.threatType).toBe('MALWARE');
    });

    it('reports clean status for safe URLs', async () => {
      const service = new ThreatIntelService({
        enabled: true,
        provider: 'mock'
      });

      const result = await service.checkUrl(urlClean);
      expect(result).not.toBeNull();
      expect(result?.isMalicious).toBe(false);
    });

    it('supports custom injected mock entries', async () => {
      const customUrl = 'https://fake-electricity-bill-pay.com';
      const service = new ThreatIntelService({
        enabled: true,
        provider: 'mock',
        mockEntries: {
          [customUrl]: {
            isMalicious: true,
            threatType: 'PHISHING'
          }
        }
      });

      const res = await service.checkUrl(customUrl);
      expect(res?.isMalicious).toBe(true);
      expect(res?.threatType).toBe('PHISHING');
    });
  });

  describe('Timeout & Graceful Degradation', () => {
    it('gracefully degrades and returns null when upstream query fails or times out without throwing', async () => {
      // Configure an unreachable provider with a short timeout
      const service = new ThreatIntelService({
        enabled: true,
        provider: 'google',
        googleApiKey: 'dummy_invalid_key_for_test',
        timeoutMs: 100 // 100ms short timeout
      });

      // Querying an external service with invalid key degrades gracefully to null
      const res = await service.checkUrl('https://example.com/test');
      expect(res).toBeNull(); // Graceful degradation
    });
  });

  describe('API Route Integration: POST /v1/verify with URL-type QRs', () => {
    it('skips threat intel when service is disabled (default)', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        threatIntel: { enabled: false }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          payload: urlPhishing
        }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.threatIntel).toBeUndefined();

      const providers = json.verification.vpaVerification.providerResults.map((p: { providerId: string }) => p.providerId);
      expect(providers).not.toContain('threat-intel');

      await app.close();
    });

    it('enriches URL verification, triggers RULE_THREAT_INTEL_MALICIOUS and flags high risk when enabled with phishing URL', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        threatIntel: {
          enabled: true,
          provider: 'mock'
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          payload: urlPhishing
        }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();

      expect(json.threatIntel).toBeDefined();
      expect(json.threatIntel.isMalicious).toBe(true);
      expect(json.threatIntel.threatType).toBe('SOCIAL_ENGINEERING');

      // Verify RULE_THREAT_INTEL_MALICIOUS triggered
      const reasons = json.verification.reasons;
      const threatRule = reasons.find((r: { ruleId: string; severity?: string }) => r.ruleId === 'RULE_THREAT_INTEL_MALICIOUS');
      expect(threatRule).toBeDefined();
      expect(threatRule.severity).toBe('critical');

      // Overall risk category must be HIGH_RISK
      expect(json.verification.category).toBe('HIGH_RISK');

      // Verify provider results include threat-intel flagged as risk
      const threatProvider = json.verification.vpaVerification.providerResults.find(
        (p: { providerId: string; status?: string }) => p.providerId === 'threat-intel'
      );
      expect(threatProvider).toBeDefined();
      expect(threatProvider.status).toBe('flagged_risk');

      await app.close();
    });

    it('handles embedded URL in UPI payment link payload', async () => {
      const app = await buildApp({
        dbPath: ':memory:',
        threatIntel: {
          enabled: true,
          provider: 'mock'
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          payload: `upi://pay?pa=store@okhdfcbank&pn=Store&am=100&url=${encodeURIComponent(urlMalware)}`
        }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.threatIntel).toBeDefined();
      expect(json.threatIntel.isMalicious).toBe(true);
      expect(json.threatIntel.threatType).toBe('MALWARE');

      await app.close();
    });
  });
});
