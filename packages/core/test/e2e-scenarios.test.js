import { describe, it, expect } from 'vitest';
import { verifyQrPayload } from '../src/verifier.js';
describe('End-to-End Scenarios and Real-World Threat Detection', () => {
    it('64. verifies legitimate registered merchant QR code as SAFE with caution caveat', () => {
        const payload = 'upi://pay?pa=kirana.store@okhdfcbank&pn=Kirana%20Provisions&am=120.00&cu=INR&mc=5411&tn=Milk%20and%20Bread';
        const result = verifyQrPayload(payload);
        expect(result.category).toBe('SAFE');
        expect(result.score).toBeLessThanOrEqual(30);
        expect(result.confidenceNote).toContain('No major risk indicators found; verify the receiver before paying.');
        expect(result.reasons.length).toBe(0);
        expect(result.disclaimer).toBeTruthy();
    });
    it('65. flags fake SBI customer care refund QR code as HIGH_RISK with explicit reasons', () => {
        const payload = 'upi://pay?pa=sbi.refund.helpline@ybl&pn=SBI%20Customer%20Support&am=5000&tn=Scan%20to%20Receive%20Refund';
        const result = verifyQrPayload(payload);
        expect(result.category).toBe('HIGH_RISK');
        expect(result.score).toBeGreaterThanOrEqual(71);
        // Reasons should be ranked with highest impact first
        expect(result.reasons.length).toBeGreaterThanOrEqual(2);
        const topReason = result.reasons[0];
        expect(topReason?.impact).toBeGreaterThanOrEqual(80);
        const hasRefundReason = result.reasons.some((r) => r.ruleId === 'RULE_REFUND_VERIFY_NOTE');
        const hasImpersonation = result.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION');
        expect(hasRefundReason).toBe(true);
        expect(hasImpersonation).toBe(true);
    });
    it('66. flags phishing URL disguised as QR payment as HIGH_RISK', () => {
        const payload = 'http://185.220.101.5/sbi-online-banking/verify.php';
        const result = verifyQrPayload(payload);
        expect(result.category).toBe('HIGH_RISK');
        expect(result.score).toBeGreaterThanOrEqual(71);
        expect(result.reasons.some((r) => r.ruleId === 'RULE_NON_UPI_SCHEME')).toBe(true);
        expect(result.reasons.some((r) => r.ruleId === 'RULE_IP_ADDRESS_URL')).toBe(true);
    });
    it('67. flags shortened link masking payment target as SUSPICIOUS or HIGH_RISK', () => {
        const payload = 'https://bit.ly/claim-electricity-cashback';
        const result = verifyQrPayload(payload);
        expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
        expect(result.reasons.some((r) => r.ruleId === 'RULE_SHORTENED_URL')).toBe(true);
    });
    it('68. flags duplicate parameter tampering attack', () => {
        const payload = 'upi://pay?pa=innocent@oksbi&pa=fraudster@ybl&am=2000';
        const result = verifyQrPayload(payload);
        expect(result.parsed.hasDuplicateParams).toBe(true);
        expect(result.reasons.some((r) => r.ruleId === 'RULE_DUPLICATE_PARAMETERS')).toBe(true);
    });
    it('69. integrates community reputation report signal and increases penalty score', () => {
        const payload = 'upi://pay?pa=suspiciousguy@oksbi&pn=Suspicious%20Seller';
        const offlineResult = verifyQrPayload(payload, { isOffline: true });
        const communityResult = verifyQrPayload(payload, {
            community: {
                reportCount: 6,
                lastReportedDaysAgo: 1,
                topCategories: ['phishing', 'fake_kyc']
            }
        });
        expect(communityResult.score).toBeGreaterThan(offlineResult.score);
        expect(communityResult.scoreBreakdown.communityPenalty).toBeGreaterThan(0);
        expect(communityResult.reasons.some((r) => r.ruleId === 'RULE_COMMUNITY_HIGH_REPORTS')).toBe(true);
    });
    it('70. runs 100% offline without crashing or requiring any network dependency', () => {
        const payload = 'upi://pay?pa=9876543210@paytm&pn=Rohit';
        const result = verifyQrPayload(payload, { isOffline: true });
        expect(result.isOfflineEvaluation).toBe(true);
        expect(result.score).toBeDefined();
        expect(result.features.values.length).toBe(30);
    });
});
//# sourceMappingURL=e2e-scenarios.test.js.map