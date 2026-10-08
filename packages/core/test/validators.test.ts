import { describe, it, expect } from 'vitest';
import { validateVpa, isKnownPspHandle, getKnownPspHandles } from '../src/validators/psp-validator.js';
import { validateAmountAndCurrency } from '../src/validators/amount-validator.js';
import { validateMerchantAndUrgency } from '../src/validators/merchant-validator.js';
import { calculateShannonEntropy, analyzeStringComposition } from '../src/validators/entropy.js';
import { levenshteinDistance, jaroWinklerSimilarity } from '../src/validators/string-distance.js';

describe('Validators and Heuristic Analyzers', () => {
  it('14. validates legitimate NPCI bank handles against allowlist', () => {
    expect(isKnownPspHandle('oksbi')).toBe(true);
    expect(isKnownPspHandle('okhdfcbank')).toBe(true);
    expect(isKnownPspHandle('paytm')).toBe(true);
    expect(isKnownPspHandle('ybl')).toBe(true);
    expect(isKnownPspHandle('apl')).toBe(true);
    expect(getKnownPspHandles().length).toBeGreaterThan(30);
  });

  it('15. rejects invalid or unrecognized PSP handles', () => {
    expect(isKnownPspHandle('fakebankpsp')).toBe(false);
    expect(isKnownPspHandle('xyzbank')).toBe(false);
  });

  it('16. validates correct VPA syntax and detects format errors', () => {
    expect(validateVpa('user@oksbi').isValidSyntax).toBe(true);
    expect(validateVpa('user.name-123@okhdfcbank').isValidSyntax).toBe(true);

    expect(validateVpa('no-at-sign').isValidSyntax).toBe(false);
    expect(validateVpa('multiple@@signs@ybl').isValidSyntax).toBe(false);
    expect(validateVpa('@missinglocal').isValidSyntax).toBe(false);
    expect(validateVpa('missinghandle@').isValidSyntax).toBe(false);
  });

  it('17. detects standard 10-digit Indian mobile number VPAs', () => {
    const vpa = validateVpa('9876543210@paytm');
    expect(vpa.isPhoneVpa).toBe(true);
    expect(vpa.excessiveDigits).toBe(false);
  });

  it('18. flags excessive digits on non-phone identifiers', () => {
    const vpa = validateVpa('user9837194827491823@oksbi');
    expect(vpa.excessiveDigits).toBe(true);
  });

  it('19. identifies high-entropy randomized account identifiers', () => {
    const compNormal = analyzeStringComposition('sharmagrocery');
    const compRandom = analyzeStringComposition('x9k2q8z7m3p1');

    expect(compRandom.entropy).toBeGreaterThan(compNormal.entropy);
    const vpaRandom = validateVpa('x9k2q8z7m3p1@oksbi');
    expect(vpaRandom.highEntropy).toBe(true);
  });

  it('20. detects brand/bank/support impersonation keywords in VPA', () => {
    const sbiRefund = validateVpa('sbi.refund.portal@ybl');
    expect(sbiRefund.impersonationKeywords).toContain('refund');

    const paytmSupport = validateVpa('paytm.support.care@oksbi');
    expect(paytmSupport.impersonationKeywords.length).toBeGreaterThan(0);

    const kycVpa = validateVpa('bank-kycupdate@icici');
    expect(kycVpa.impersonationKeywords.length).toBeGreaterThan(0);
  });

  it('21. validates positive INR amounts with standard decimals', () => {
    const valid = validateAmountAndCurrency('150.50', 'INR');
    expect(valid.hasAmount).toBe(true);
    expect(valid.isValidNumber).toBe(true);
    expect(valid.amountValue).toBe(150.5);
    expect(valid.isCurrencyValid).toBe(true);
  });

  it('22. detects invalid amount formats and zero/negative numbers', () => {
    expect(validateAmountAndCurrency('abc', 'INR').isValidNumber).toBe(false);
    expect(validateAmountAndCurrency('-50', 'INR').isValidNumber).toBe(false);
    expect(validateAmountAndCurrency('0', 'INR').isValidNumber).toBe(false);
    expect(validateAmountAndCurrency('10.999', 'INR').isValidNumber).toBe(false); // >2 decimals
  });

  it('23. flags non-INR currencies', () => {
    const usd = validateAmountAndCurrency('100.00', 'USD');
    expect(usd.isCurrencyValid).toBe(false);
    expect(usd.currencyCode).toBe('USD');
  });

  it('24. flags high amounts (>= 25,000) and limits exceeding NPCI standard (1,00,000)', () => {
    const high = validateAmountAndCurrency('35000', 'INR');
    expect(high.isHighAmount).toBe(true);
    expect(high.isAboveNpciLimit).toBe(false);

    const overNpci = validateAmountAndCurrency('150000', 'INR');
    expect(overNpci.isHighAmount).toBe(true);
    expect(overNpci.isAboveNpciLimit).toBe(true);
  });

  it('25. identifies psychological round bait amounts (e.g. 19999, 49999)', () => {
    expect(validateAmountAndCurrency('19999', 'INR').isRoundBaitAmount).toBe(true);
    expect(validateAmountAndCurrency('49999', 'INR').isRoundBaitAmount).toBe(true);
    expect(validateAmountAndCurrency('250', 'INR').isRoundBaitAmount).toBe(false);
  });

  it('26. identifies micro-authorization amounts (1 to 5 INR)', () => {
    expect(validateAmountAndCurrency('1.00', 'INR').isMicroAuthAmount).toBe(true);
    expect(validateAmountAndCurrency('5.00', 'INR').isMicroAuthAmount).toBe(true);
    expect(validateAmountAndCurrency('10.00', 'INR').isMicroAuthAmount).toBe(false);
  });

  it('27. validates 4-digit Merchant Category Codes (MCC)', () => {
    expect(validateMerchantAndUrgency('Store', '5411').isMerchantCodeValidFormat).toBe(true);
    expect(validateMerchantAndUrgency('Store', '12').isMerchantCodeValidFormat).toBe(false);
    expect(validateMerchantAndUrgency('Store', 'ABCD').isMerchantCodeValidFormat).toBe(false);
  });

  it('28. flags businesses claiming commercial status without an MCC', () => {
    const bizWithoutMcc = validateMerchantAndUrgency('Sharma Electronics Store Pvt Ltd', undefined);
    expect(bizWithoutMcc.payeeClaimsBusiness).toBe(true);
    expect(bizWithoutMcc.missingMerchantCodeForBusiness).toBe(true);

    const bizWithMcc = validateMerchantAndUrgency('Sharma Electronics Store Pvt Ltd', '5732');
    expect(bizWithMcc.missingMerchantCodeForBusiness).toBe(false);
  });

  it('29. detects urgency keywords in name or transaction note', () => {
    const check = validateMerchantAndUrgency('Lucky Winner Lottery Claim', undefined, 'Instant Cashback');
    expect(check.urgencyKeywordsInName).toContain('lottery');
    expect(check.urgencyKeywordsInName).toContain('winner');
    expect(check.urgencyKeywordsInNote).toContain('cashback');
  });

  it('30. computes string similarity metrics correctly', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('same', 'same')).toBe(0);

    const highSim = jaroWinklerSimilarity('rameshkumar', 'ramesh');
    const lowSim = jaroWinklerSimilarity('rameshkumar', 'xyz987');
    expect(highSim).toBeGreaterThan(0.8);
    expect(lowSim).toBeLessThan(0.3);
  });
});
