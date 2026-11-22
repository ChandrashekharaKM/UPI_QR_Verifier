import { describe, it, expect } from 'vitest';
import {
  verifyQrPayload,
  parsePayload,
  ruleThreatIntelMalicious,
  ThreatIntelVerifier,
  ThreatIntelVpaVerifier,
  VpaVerifierRegistry,
  type ThreatIntelSignal,
  type RuleContext
} from '../src/index.js';

describe('ThreatIntelVerifier & RULE_THREAT_INTEL_MALICIOUS', () => {
  const urlPhishing = 'https://sbi-netbanking-kyc-update.phishing-bank.xyz/login';
  const urlCleanMerchant = 'https://www.tatacliq.com/payment/checkout';
  const upiWithEmbeddedUrl = 'upi://pay?pa=store@okaxis&pn=Store&am=500&url=https://malware-host.xyz/download.apk';
  const standardUpi = 'upi://pay?pa=john@oksbi&pn=John&am=100';

  describe('Rule: RULE_THREAT_INTEL_MALICIOUS', () => {
    it('does not trigger when threatIntel signal is absent', () => {
      const parsed = parsePayload(urlPhishing);
      const ctx: RuleContext = { parsed };
      const res = ruleThreatIntelMalicious(ctx);

      expect(res.triggered).toBe(false);
      expect(res.id).toBe('RULE_THREAT_INTEL_MALICIOUS');
    });

    it('does not trigger when threatIntel reports URL is clean', () => {
      const parsed = parsePayload(urlCleanMerchant);
      const threatIntel: ThreatIntelSignal = {
        isMalicious: false,
        source: 'google_safe_browsing',
        targetUrl: urlCleanMerchant
      };
      const ctx: RuleContext = { parsed, threatIntel };
      const res = ruleThreatIntelMalicious(ctx);

      expect(res.triggered).toBe(false);
      expect(res.message).toContain('clean');
    });

    it('triggers critical alert when threatIntel flags malware or phishing', () => {
      const parsed = parsePayload(urlPhishing);
      const threatIntel: ThreatIntelSignal = {
        isMalicious: true,
        threatType: 'SOCIAL_ENGINEERING',
        source: 'google_safe_browsing',
        targetUrl: urlPhishing,
        details: 'Confirmed credential harvesting portal impersonating State Bank of India'
      };
      const ctx: RuleContext = { parsed, threatIntel };
      const res = ruleThreatIntelMalicious(ctx);

      expect(res.triggered).toBe(true);
      expect(res.severity).toBe('critical');
      expect(res.weight).toBe(95);
      expect(res.message).toContain('CRITICAL THREAT');
      expect(res.message).toContain('SOCIAL_ENGINEERING');

      const evidenceKeys = res.evidence?.map((e) => e.key);
      expect(evidenceKeys).toContain('threatType');
      expect(evidenceKeys).toContain('source');
      expect(evidenceKeys).toContain('details');
    });
  });

  describe('Provider: ThreatIntelVerifier / ThreatIntelVpaVerifier', () => {
    it('is registered with id "threat-intel" as an online provider', () => {
      const verifier = new ThreatIntelVerifier();
      expect(verifier.id).toBe('threat-intel');
      expect(verifier.name).toBe('Threat Intelligence URL Network');
      expect(verifier.isOnline).toBe(true);
      expect(verifier.isDefault).toBe(false);
    });

    it('synchronously verifies clean URL when signal is provided', () => {
      const signal: ThreatIntelSignal = {
        isMalicious: false,
        source: 'phishtank',
        targetUrl: urlCleanMerchant
      };
      const verifier = new ThreatIntelVpaVerifier({ signal });
      const result = verifier.verify(urlCleanMerchant);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.providerId).toBe('threat-intel');
        expect(result.isValid).toBe(true);
        expect(result.status).toBe('verified_valid');
        expect(result.statusLabel).toBe('URL Threat Check Clean');
        expect(result.details.threatIntelCheck?.passed).toBe(true);
      }
    });

    it('flags risk when URL is confirmed malicious', () => {
      const signal: ThreatIntelSignal = {
        isMalicious: true,
        threatType: 'PHISHING',
        source: 'phishtank',
        targetUrl: urlPhishing
      };
      const verifier = new ThreatIntelVerifier({ signal });
      const result = verifier.verify(urlPhishing);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.status).toBe('flagged_risk');
        expect(result.statusLabel).toBe('Confirmed Malicious URL');
        expect(result.isValid).toBe(false);
        expect(result.details.threatIntelCheck?.passed).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });

    it('extracts embedded URL from UPI payload with "url" parameter', () => {
      const signal: ThreatIntelSignal = {
        isMalicious: true,
        threatType: 'MALWARE',
        source: 'google_safe_browsing'
      };
      const verifier = new ThreatIntelVerifier({ signal });
      const result = verifier.verify(upiWithEmbeddedUrl);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.status).toBe('flagged_risk');
        expect(result.details.threatIntelCheck?.details).toContain('MALWARE');
      }
    });

    it('returns unsupported / not applicable when payload contains no web URL', () => {
      const verifier = new ThreatIntelVerifier();
      const result = verifier.verify(standardUpi);

      expect(result).not.toBeInstanceOf(Promise);
      if (!(result instanceof Promise)) {
        expect(result.status).toBe('unsupported');
        expect(result.statusLabel).toBe('Not a Web URL');
      }
    });

    it('gracefully degrades when fetcher throws or times out without failing the verification', async () => {
      const failingFetcher = async (): Promise<ThreatIntelSignal> => {
        throw new Error('Connection timeout to upstream Safe Browsing service');
      };

      const verifier = new ThreatIntelVerifier({ fetcher: failingFetcher });
      const resPromise = verifier.verify(urlCleanMerchant);

      expect(resPromise).toBeInstanceOf(Promise);
      const res = await resPromise;

      // Graceful degradation: does not crash, marks inconclusive, isValid remains true
      expect(res.status).toBe('inconclusive');
      expect(res.statusLabel).toBe('Threat Lookup Inconclusive');
      expect(res.isValid).toBe(true);
      expect(res.warnings[0]).toContain('unavailable or timed out');
    });

    it('integrates seamlessly with VpaVerifierRegistry', async () => {
      const registry = new VpaVerifierRegistry();
      registry.register(
        new ThreatIntelVerifier({
          signal: {
            isMalicious: false,
            source: 'google_safe_browsing'
          }
        })
      );

      const composite = await registry.verifyAll(urlCleanMerchant, [
        'offline-structural',
        'threat-intel'
      ]);

      expect(composite.providerResults.length).toBe(2);
      expect(composite.providerResults.some((p) => p.providerId === 'threat-intel')).toBe(true);
    });
  });

  describe('Full End-to-End verifyQrPayload with threatIntel', () => {
    it('elevates risk score to HIGH_RISK and adds critical reason when URL is flagged malicious', () => {
      const res = verifyQrPayload(urlPhishing, {
        threatIntel: {
          isMalicious: true,
          threatType: 'SOCIAL_ENGINEERING',
          source: 'google_safe_browsing'
        }
      });

      expect(res.category).toBe('HIGH_RISK');
      expect(res.score).toBeGreaterThanOrEqual(75);

      const threatRule = res.reasons.find((r) => r.ruleId === 'RULE_THREAT_INTEL_MALICIOUS');
      expect(threatRule).toBeDefined();
      expect(threatRule?.severity).toBe('critical');

      const threatProvider = res.vpaVerification.providerResults.find(
        (p) => p.providerId === 'threat-intel'
      );
      expect(threatProvider?.status).toBe('flagged_risk');
      expect(res.vpaVerification.overallStatus).toBe('flagged_risk');
    });
  });
});
