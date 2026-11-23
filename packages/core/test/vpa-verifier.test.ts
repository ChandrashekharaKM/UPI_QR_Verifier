import { describe, it, expect } from 'vitest';
import {
  OfflineStructuralVerifier,
  CommunityReputationVpaVerifier,
  CommunityReputationVerifier,
  calculateReputationDecay,
  VpaVerifierRegistry,
  verifyVpa
} from '../src/index.js';

describe('VPA Real-World Verification Layer', () => {
  describe('calculateReputationDecay & Report Deduplication Engine', () => {
    const now = new Date('2026-11-22T12:00:00Z');

    it('deduplicates multiple reports from the same deviceHash to the latest submission', () => {
      const reports = [
        { deviceHash: 'device-1', createdAt: '2026-11-20T10:00:00Z', reason: 'phishing' },
        { deviceHash: 'device-1', createdAt: '2026-11-22T10:00:00Z', reason: 'fake_support' }, // Newer submission from same device
        { deviceHash: 'device-2', createdAt: '2026-11-21T10:00:00Z', reason: 'phishing' }
      ];

      const result = calculateReputationDecay(reports, { referenceDate: now });
      expect(result.rawReportCount).toBe(3);
      expect(result.uniqueReporters).toBe(2);
      expect(result.topCategories).toContain('fake_support');
    });

    it('applies exponential 30-day half-life time decay weighting to reports', () => {
      const reports = [
        { deviceHash: 'dev-now', createdAt: '2026-11-22T12:00:00Z', reason: 'phishing' }, // 0 days ago -> weight 1.0
        { deviceHash: 'dev-30d', createdAt: '2026-10-23T12:00:00Z', reason: 'phishing' }, // 30 days ago -> weight 0.5
        { deviceHash: 'dev-60d', createdAt: '2026-09-23T12:00:00Z', reason: 'phishing' }  // 60 days ago -> weight 0.25
      ];

      const result = calculateReputationDecay(reports, { referenceDate: now, halfLifeDays: 30 });
      expect(result.rawReportCount).toBe(3);
      expect(result.uniqueReporters).toBe(3);
      // Decayed score should be approximately 1.0 + 0.5 + 0.25 = 1.75
      expect(result.decayedScore).toBeCloseTo(1.75, 1);
      expect(result.recentReportCount).toBe(1);
      expect(result.breakdownByPeriod.within7Days).toBe(1);
      expect(result.breakdownByPeriod.within30Days).toBe(1);
      expect(result.breakdownByPeriod.within90Days).toBe(1);
      expect(result.breakdownByPeriod.olderThan90Days).toBe(0);
    });

    it('handles reports older than 90 days with diminished historical weighting', () => {
      const reports = [
        { deviceHash: 'dev-ancient', createdAt: '2025-11-22T12:00:00Z', reason: 'phishing' } // 365 days ago (~12 half lives)
      ];

      const result = calculateReputationDecay(reports, { referenceDate: now, halfLifeDays: 30 });
      expect(result.decayedScore).toBeLessThan(0.01);
      expect(result.breakdownByPeriod.olderThan90Days).toBe(1);
      expect(result.recentReportCount).toBe(0);
    });
  });

  describe('OfflineStructuralVerifier (Default Provider)', () => {
    const verifier = new OfflineStructuralVerifier();

    it('has honest limitation notice stating NPCI public API limitation', () => {
      expect(verifier.honestLimitationNotice).toContain(
        'NPCI provides no public API to query whether a UPI ID is actively registered on banking servers'
      );
      expect(verifier.isOnline).toBe(false);
      expect(verifier.isDefault).toBe(true);
    });

    it('verifies legitimate merchant VPA with valid MCC and known PSP', () => {
      const payload =
        'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart%20Supermarket&am=250.00&cu=INR&mc=5411&tn=Groceries';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('verified_valid');
      expect(result.details.formatCheck.passed).toBe(true);
      expect(result.details.pspHandleCheck.passed).toBe(true);
      expect(result.details.sponsorBank).toBe('HDFC Bank');
      expect(result.details.merchantConsistencyCheck.passed).toBe(true);
      expect(result.details.mccCode).toBe('5411');
      expect(result.details.mccCategory).toContain('Grocery');
      expect(result.details.emvCrcCheck.status).toBe('not_applicable');
      expect(result.details.unicodeSafetyCheck.passed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('verifies authentic peer-to-peer 10-digit mobile VPA', () => {
      const payload = 'upi://pay?pa=9876543210@paytm&pn=Aarav%20Sharma&am=100.00&cu=INR';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('verified_valid');
      expect(result.details.formatCheck.passed).toBe(true);
      expect(result.details.pspHandleCheck.passed).toBe(true);
      expect(result.details.sponsorBank).toBe('Paytm Payments Bank');
      expect(result.details.merchantConsistencyCheck.status).toBe('info');
      expect(result.details.emvCrcCheck.status).toBe('not_applicable');
    });

    it('flags unlisted/fake PSP handle', () => {
      const payload = 'upi://pay?pa=store99@fakepspbank123&pn=Store';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe('flagged_risk');
      expect(result.details.pspHandleCheck.passed).toBe(false);
      expect(result.details.pspHandleCheck.details).toContain('fakepspbank123');
      expect(result.warnings.some((w) => w.includes('fakepspbank123'))).toBe(true);
    });

    it('flags commercial business entity claiming Pvt Ltd but omitting 4-digit MCC', () => {
      const payload = 'upi://pay?pa=store201@oksbi&pn=Sharma%20Electronics%20Store%20Pvt%20Ltd&am=18500.00&cu=INR';
      const result = verifier.verify(payload);

      expect(result.details.formatCheck.passed).toBe(true);
      expect(result.details.pspHandleCheck.passed).toBe(true);
      expect(result.details.merchantConsistencyCheck.passed).toBe(false);
      expect(result.details.merchantConsistencyCheck.status).toBe('warn');
      expect(result.statusLabel).toContain('Unregistered Business Warning');
      expect(result.warnings.some((w) => w.includes('Merchant Category Code'))).toBe(true);
    });

    it('verifies authentic BharatQR / EMVCo standee with valid CRC-16 checksum', () => {
      const payload =
        '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS99126304D70A';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('verified_valid');
      expect(result.details.emvCrcCheck.passed).toBe(true);
      expect(result.details.emvCrcCheck.status).toBe('pass');
      expect(result.details.emvCrcCheck.details).toContain('D70A');
    });

    it('flags BharatQR / EMVCo standee with corrupted or tampered CRC-16 checksum', () => {
      const payload =
        '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS991263040000';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe('flagged_risk');
      expect(result.details.emvCrcCheck.passed).toBe(false);
      expect(result.details.emvCrcCheck.status).toBe('fail');
      expect(result.warnings.some((w) => w.includes('CRC-16 checksum mismatch'))).toBe(true);
    });

    it('flags hidden Unicode homoglyphs in VPA username', () => {
      // Cyrillic 'а' (U+0430)
      const payload = 'upi://pay?pa=freshm\u0430rt@okhdfcbank&pn=Fresh%20Mart&am=250.00&cu=INR';
      const result = verifier.verify(payload);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe('flagged_risk');
      expect(result.details.unicodeSafetyCheck.passed).toBe(false);
      expect(result.warnings.some((w) => w.includes('Unicode'))).toBe(true);
    });

    it('returns unsupported for non-UPI web URLs', () => {
      const payload = 'https://phishing-site.example/login';
      const result = verifier.verify(payload);

      expect(result.status).toBe('unsupported');
      expect(result.statusLabel).toBe('Non-UPI Protocol');
    });
  });

  describe('CommunityReputationVpaVerifier (Network Provider)', () => {
    it('returns verified_valid when no fraud reports are on record', async () => {
      const verifier = new CommunityReputationVpaVerifier({
        signal: { reportCount: 0 }
      });
      const result = await verifier.verify('upi://pay?pa=innocent@oksbi&pn=Innocent%20User');

      expect(result.isOnline).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('verified_valid');
      expect(result.statusLabel).toBe('No Prior Reports');
      expect(result.honestLimitationNotice).toContain('newly created or disposable burner accounts often have 0 prior reports');
    });

    it('flags risk when community reports exist on record', async () => {
      const verifier = new CommunityReputationVpaVerifier({
        signal: {
          reportCount: 4,
          lastReportedDaysAgo: 2,
          topCategories: ['fake_support', 'lottery_fraud']
        }
      });
      const result = await verifier.verify('upi://pay?pa=scammer@ybl&pn=Fake%20Support');

      expect(result.isOnline).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('flagged_risk');
      expect(result.statusLabel).toContain('4 reports');
      expect(result.warnings.some((w) => w.includes('fake_support'))).toBe(true);
    });

    it('evaluates raw report records with decay weighting directly in provider', async () => {
      const reports = [
        { deviceHash: 'dev-1', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), reason: 'fake_support' },
        { deviceHash: 'dev-2', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), reason: 'fake_support' },
        { deviceHash: 'dev-2', createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), reason: 'fake_support' } // duplicate dev-2
      ];

      const verifier = new CommunityReputationVerifier({ rawReports: reports });
      const result = await verifier.verify('upi://pay?pa=scammer@oksbi&pn=Scam');

      expect(result.isValid).toBe(false);
      expect(result.status).toBe('flagged_risk');
      expect(result.details.formatCheck.details).toContain('2 deduplicated report(s) from 2 unique verified reporting device(s)');
      expect(result.details.pspHandleCheck.details).toContain('Decayed threat score');
      expect(result.details.merchantConsistencyCheck.details).toContain('active within last 7 days');
    });

    it('CommunityReputationVerifier is exported as alias for CommunityReputationVpaVerifier', () => {
      expect(CommunityReputationVerifier).toBe(CommunityReputationVpaVerifier);
    });
  });

  describe('VpaVerifierRegistry & Composite Verification', () => {
    it('default registry contains OfflineStructuralVerifier and runs verifyAll', async () => {
      const registry = new VpaVerifierRegistry();
      const providers = registry.getAllProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0]?.id).toBe('offline-structural');

      const composite = await registry.verifyAll(
        'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart&am=100.00&cu=INR&mc=5411'
      );

      expect(composite.vpa).toBe('freshmart@okhdfcbank');
      expect(composite.payeeName).toBe('Fresh Mart');
      expect(composite.overallStatus).toBe('verified_valid');
      expect(composite.providerResults).toHaveLength(1);
      expect(composite.providerResults[0]?.details.sponsorBank).toBe('HDFC Bank');
    });

    it('can plug in multiple custom providers and evaluate them in composite result', async () => {
      const registry = new VpaVerifierRegistry();
      registry.register(
        new CommunityReputationVpaVerifier({
          signal: { reportCount: 3, topCategories: ['impersonation'] }
        })
      );

      expect(registry.getAllProviders()).toHaveLength(2);

      const composite = await registry.verifyAll(
        'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart&mc=5411',
        ['offline-structural', 'community-reputation']
      );

      expect(composite.providerResults).toHaveLength(2);
      // Offline structural was valid, but community reports flagged risk -> overall is flagged_risk
      expect(composite.overallStatus).toBe('flagged_risk');
      expect(composite.overallStatusLabel).toBe('Verification Risk Flagged');
    });

    it('verifyVpa helper executes composite verification', async () => {
      const result = await verifyVpa('upi://pay?pa=9876543210@paytm&pn=Test');
      expect(result.overallStatus).toBe('verified_valid');
      expect(result.providerResults).toHaveLength(1);
    });
  });
});
