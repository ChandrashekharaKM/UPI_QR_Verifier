import { describe, it, expect } from 'vitest';
import { calculateVerificationScore } from '../src/scoring/scorer.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION } from '../src/features/feature-schema.js';
describe('Scoring Logic, Threshold Boundaries, and Confidence Notes', () => {
    const dummyFeatures = {
        version: FEATURE_SCHEMA_VERSION,
        names: FEATURE_NAMES,
        values: new Array(FEATURE_NAMES.length).fill(0)
    };
    const dummyModel = {
        version: '1.0.0',
        nEstimators: 1,
        featureNames: FEATURE_NAMES,
        trees: [
            {
                root: {
                    isLeaf: true,
                    probability: 0.0 // ML predicts 0 by default for boundary tests
                }
            }
        ]
    };
    function createMockRule(id, weight, severity = 'medium') {
        return {
            id,
            triggered: true,
            severity,
            weight,
            title: `Rule ${id}`,
            message: `Triggered message for ${id}`
        };
    }
    it('54. categorizes score <= 30 strictly as SAFE', () => {
        const parsed = parsePayload('upi://pay?pa=valid@oksbi&pn=ValidStore&mc=5411');
        const result = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [createMockRule('LOW_WARN', 20, 'low')],
            ruleRiskScore: 30,
            features: dummyFeatures,
            model: dummyModel
        });
        // ruleScore (30) * 0.65 + mlScore (0) * 0.35 = 19.5 -> rounds to 20 <= 30 => SAFE
        expect(result.score).toBeLessThanOrEqual(30);
        expect(result.category).toBe('SAFE');
        expect(result.isSafeWithCaveat).toBe(true);
    });
    it('55. categorizes exact boundary at 30 as SAFE and 31 as SUSPICIOUS', () => {
        const parsed = parsePayload('upi://pay?pa=merchant@okhdfcbank&mc=5411');
        // Force ruleRiskScore so finalScore hits exactly 30:
        // finalScore = round(ruleRiskScore * 0.65 + ml * 0.35)
        // 30 / 0.65 ~= 46.15 -> ruleRiskScore 46 gives 46 * 0.65 = 29.9 -> 30
        const result30 = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [createMockRule('WARN_A', 46)],
            ruleRiskScore: 46,
            features: dummyFeatures,
            model: dummyModel
        });
        expect(result30.score).toBe(30);
        expect(result30.category).toBe('SAFE');
        // 48 * 0.65 = 31.2 -> 31
        const result31 = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [createMockRule('WARN_B', 48)],
            ruleRiskScore: 48,
            features: dummyFeatures,
            model: dummyModel
        });
        expect(result31.score).toBe(31);
        expect(result31.category).toBe('SUSPICIOUS');
    });
    it('56. categorizes exact boundary at 70 as SUSPICIOUS and 71 as HIGH_RISK', () => {
        const parsed = parsePayload('upi://pay?pa=merchant@okhdfcbank');
        // Model with probability 0.5 -> mlScore = 50 -> 50 * 0.35 = 17.5
        // Need combined = 70. 70 - 17.5 = 52.5. 52.5 / 0.65 ~= 80.76 -> 81 * 0.65 = 52.65 + 17.5 = 70.15 -> 70
        const modelHalf = {
            version: '1.0.0',
            nEstimators: 1,
            featureNames: FEATURE_NAMES,
            trees: [{ root: { isLeaf: true, probability: 0.5 } }]
        };
        const result70 = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [createMockRule('RISK_A', 81, 'high')],
            ruleRiskScore: 81,
            features: dummyFeatures,
            model: modelHalf
        });
        expect(result70.score).toBe(70);
        expect(result70.category).toBe('SUSPICIOUS');
        // 82 * 0.65 = 53.3 + 17.5 = 70.8 -> 71
        const result71 = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [createMockRule('RISK_B', 82, 'high')],
            ruleRiskScore: 82,
            features: dummyFeatures,
            model: modelHalf
        });
        expect(result71.score).toBe(71);
        expect(result71.category).toBe('HIGH_RISK');
    });
    it('57. never shows a bare "Safe": requires explicit caution advice', () => {
        const parsed = parsePayload('upi://pay?pa=valid@oksbi&mc=5411');
        const result = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [],
            ruleRiskScore: 0,
            features: dummyFeatures,
            model: dummyModel
        });
        expect(result.category).toBe('SAFE');
        expect(result.confidenceNote).toContain('No major risk indicators found; verify the receiver before paying.');
        // Persistent disclaimer must always be present
        expect(result.disclaimer).toBeTruthy();
        expect(result.disclaimer.length).toBeGreaterThan(20);
    });
    it('58. adds an explicit "Unverified" note when evidence is insufficient (no merchant code, no reports)', () => {
        const parsed = parsePayload('upi://pay?pa=randomperson@oksbi');
        const result = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [],
            ruleRiskScore: 0,
            features: dummyFeatures,
            model: dummyModel
        });
        expect(result.category).toBe('SAFE');
        expect(result.confidenceNote).toContain('Unverified recipient: No previous history or merchant records found.');
        expect(result.confidenceNote).toContain('verify the receiver before paying.');
    });
    it('59. ranks reasons strictly in descending order of impact', () => {
        const parsed = parsePayload('upi://pay?pa=scam@oksbi');
        const r1 = createMockRule('LOW_IMPACT', 20, 'low');
        const r2 = createMockRule('HIGH_IMPACT', 85, 'critical');
        const r3 = createMockRule('MED_IMPACT', 50, 'medium');
        const result = calculateVerificationScore({
            ctx: { parsed },
            triggeredRules: [r1, r2, r3],
            ruleRiskScore: 85,
            features: dummyFeatures,
            model: dummyModel
        });
        expect(result.reasons[0]?.ruleId).toBe('HIGH_IMPACT');
        expect(result.reasons[0]?.impact).toBe(85);
        expect(result.reasons[1]?.ruleId).toBe('MED_IMPACT');
        expect(result.reasons[1]?.impact).toBe(50);
        expect(result.reasons[2]?.ruleId).toBe('LOW_IMPACT');
        expect(result.reasons[2]?.impact).toBe(20);
    });
});
//# sourceMappingURL=scoring.test.js.map