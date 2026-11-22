import { describe, it, expect } from 'vitest';
import {
  verifyQrPayload,
  parsePayload,
  calculateCrc16CcittFalse,
  validateVpa
} from '../src/index.js';

describe('Real-World Acceptance Test Suite: 15 Core Scenarios Specification', () => {
  // Scenario 1: Valid upi://pay merchant with MCC
  it('1. Valid upi://pay merchant with MCC: returns SAFE with "recipient identity NOT independently verified" caveat', () => {
    const payload =
      'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart%20Supermarket&am=250.00&cu=INR&mc=5411&tn=Groceries';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('SAFE');
    expect(result.score).toBeLessThanOrEqual(30);
    expect(result.isSafeWithCaveat).toBe(true);
    expect(result.confidenceNote).toContain(
      'No major risk indicators found; recipient identity NOT independently verified'
    );
  });

  // Scenario 2: P2P phone-number VPA
  it('2. P2P phone-number VPA: returns SAFE for legitimate peer-to-peer mobile transfer', () => {
    const payload = 'upi://pay?pa=9876543210@paytm&pn=Aarav%20Sharma&am=100.00&cu=INR';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('SAFE');
    expect(result.score).toBeLessThanOrEqual(30);
    expect(result.parsed.fields.kind).toBe('upi');
    if (result.parsed.fields.kind === 'upi') {
      const vpaResult = validateVpa(result.parsed.fields.upi.pa);
      expect(vpaResult.isPhoneVpa).toBe(true);
    }
  });

  // Scenario 3: Valid EMVCo BharatQR with correct CRC
  it('3. Valid EMVCo BharatQR with correct CRC (built per spec): returns SAFE and validates CRC', () => {
    const payload =
      '00020101021126370009com.upiqr0120supermart@okhdfcbank5204541153033565802IN5920Supermart Provisions6006Mumbai62110707POS884463044CA5';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('SAFE');
    expect(result.parsed.kind).toBe('emv');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
  });

  // Scenario 4: Same EMV QR with one character altered (bad CRC)
  it('4. Same EMV QR with one character altered (bad CRC): returns SUSPICIOUS or higher with RULE_EMV_BAD_CRC', () => {
    // Last check character changed from '5' to '6'
    const tamperedPayload =
      '00020101021126370009com.upiqr0120supermart@okhdfcbank5204541153033565802IN5920Supermart Provisions6006Mumbai62110707POS884463044CA6';
    const result = verifyQrPayload(tamperedPayload);

    expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
    expect(result.score).toBeGreaterThanOrEqual(31);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
    const badCrcReason = result.reasons.find((r) => r.ruleId === 'RULE_EMV_BAD_CRC');
    expect(badCrcReason?.severity).toBe('high');
  });

  // Scenario 5: EMV QR with the VPA swapped but the CRC recomputed
  it('5. EMV QR with the VPA swapped but the CRC recomputed: evaluated normally by rules', () => {
    // Swapping VPA to kirana@oksbi and recomputing valid CRC-16
    const baseWithoutCrc =
      '00020101021126290009com.upiqr0112kirana@oksbi5204541153033565802IN5913Kirana Store6006Mumbai62110707POS88446304';
    const computedCrc = calculateCrc16CcittFalse(baseWithoutCrc);
    expect(computedCrc).toBe('8E2D');

    const validSwappedEmv = baseWithoutCrc + computedCrc;
    const result = verifyQrPayload(validSwappedEmv);

    // CRC is valid, so RULE_EMV_BAD_CRC must NOT trigger
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
    // Evaluated normally based on the new VPA's properties (legitimate merchant -> SAFE)
    expect(result.category).toBe('SAFE');

    // If swapped with an impersonating scam VPA and recomputed CRC:
    const scamBaseWithoutCrc =
      '00020101021126390009com.upiqr0122sbi.refund.helpline@ybl5204541153033565802IN5913Kirana Store6006Mumbai62110707POS88446304';
    const scamCrc = calculateCrc16CcittFalse(scamBaseWithoutCrc);
    const scamEmvWithValidCrc = scamBaseWithoutCrc + scamCrc;

    const scamResult = verifyQrPayload(scamEmvWithValidCrc);
    expect(scamResult.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
    // Evaluated normally: impersonation rule triggers
    expect(scamResult.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION')).toBe(true);
    expect(scamResult.category).toBe('HIGH_RISK');
  });

  // Scenario 6: phonepe://pay?... and paytmmp://pay?... deep links
  it('6. phonepe://pay?... and paytmmp://pay?... deep links: parsed same as upi://', () => {
    const phonepePayload =
      'phonepe://pay?pa=chaipoint@ybl&pn=Chai%20Point&am=50.00&cu=INR&mc=5814';
    const parsedPhonepe = parsePayload(phonepePayload);
    expect(parsedPhonepe.kind).toBe('upi');
    expect(parsedPhonepe.fields.kind).toBe('upi');
    if (parsedPhonepe.fields.kind === 'upi') {
      expect(parsedPhonepe.fields.upi.pa).toBe('chaipoint@ybl');
      expect(parsedPhonepe.fields.upi.pn).toBe('Chai Point');
      expect(parsedPhonepe.fields.upi.mc).toBe('5814');
      expect(parsedPhonepe.fields.upi.originalScheme).toContain('phonepe://');
    }

    const paytmmpPayload =
      'paytmmp://pay?pa=sharmatea@ptyes&pn=Sharma%20Tea&am=30.00&cu=INR&mc=5814';
    const parsedPaytmmp = parsePayload(paytmmpPayload);
    expect(parsedPaytmmp.kind).toBe('upi');
    expect(parsedPaytmmp.fields.kind).toBe('upi');
    if (parsedPaytmmp.fields.kind === 'upi') {
      expect(parsedPaytmmp.fields.upi.pa).toBe('sharmatea@ptyes');
      expect(parsedPaytmmp.fields.upi.originalScheme).toContain('paytmmp://');
    }
  });

  // Scenario 7: upi://collect?...
  it('7. upi://collect?...: returns HIGH_RISK (pull-payment debit fraud defense)', () => {
    const payload =
      'upi://collect?pa=scammer@oksbi&pn=Lottery%20Reward&am=5000.00&cu=INR';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('HIGH_RISK');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
  });

  // Scenario 8: "Refund / KYC / prize" scam text in tn
  it('8. "Refund / KYC / prize" scam text in tn: returns HIGH_RISK', () => {
    const payload =
      'upi://pay?pa=helpdesk@ybl&pn=Support&am=100.00&cu=INR&tn=Refund%20Verification%20KYC';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('HIGH_RISK');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_REFUND_VERIFY_NOTE')).toBe(true);
  });

  // Scenario 9: Bank-helpline impersonation VPA
  it('9. Bank-helpline impersonation VPA: returns HIGH_RISK', () => {
    const payload =
      'upi://pay?pa=sbi.refund.helpline@ybl&pn=SBI%20Customer%20Helpline&am=4999.00&cu=INR';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('HIGH_RISK');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION')).toBe(true);
  });

  // Scenario 10: Shortened URL, IP-host URL, punycode URL, http URL
  it('10. Shortened URL, IP-host URL, punycode URL, http URL: returns HIGH_RISK across all four vectors', () => {
    const shortened = 'https://bit.ly/pay-sbi-portal';
    const resShort = verifyQrPayload(shortened);
    expect(resShort.category).toBe('HIGH_RISK');
    expect(resShort.reasons.some((r) => r.ruleId === 'RULE_SHORTENED_URL' || r.ruleId === 'RULE_NON_UPI_SCHEME')).toBe(true);

    const ipHost = 'http://185.220.101.5/sbi/auth/index.php';
    const resIp = verifyQrPayload(ipHost);
    expect(resIp.category).toBe('HIGH_RISK');
    expect(resIp.reasons.some((r) => r.ruleId === 'RULE_IP_ADDRESS_URL')).toBe(true);

    const punycode = 'https://xn--sbi-9fa.com/pay';
    const resPuny = verifyQrPayload(punycode);
    expect(resPuny.category).toBe('HIGH_RISK');
    expect(resPuny.reasons.some((r) => r.ruleId === 'RULE_PUNYCODE_DOMAIN')).toBe(true);

    const insecureHttp = 'http://bank-verification.com/login';
    const resHttp = verifyQrPayload(insecureHttp);
    expect(resHttp.category).toBe('HIGH_RISK');
    expect(resHttp.reasons.some((r) => r.ruleId === 'RULE_HTTP_NOT_HTTPS')).toBe(true);
  });

  // Scenario 11: Parameter pollution (pa twice)
  it('11. Parameter pollution (pa twice): returns HIGH_RISK with RULE_DUPLICATE_PARAMETERS', () => {
    const payload =
      'upi://pay?pa=innocent@oksbi&pa=attacker@ybl&am=50000.00&cu=INR';
    const result = verifyQrPayload(payload);

    expect(result.category).toBe('HIGH_RISK');
    expect(result.parsed.hasDuplicateParams).toBe(true);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_DUPLICATE_PARAMETERS')).toBe(true);
  });

  // Scenario 12: Hidden unicode / homoglyph in pn
  it('12. Hidden unicode / homoglyph in pn: returns SUSPICIOUS or higher with RULE_HIDDEN_UNICODE', () => {
    // Payee name contains Cyrillic small letter "а" (\u0430) spoofing Latin "a"
    const payload =
      'upi://pay?pa=store@oksbi&pn=Fresh%20M\u0430rt&am=250.00&cu=INR';
    const result = verifyQrPayload(payload);

    expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_HIDDEN_UNICODE')).toBe(true);
    const unicodeReason = result.reasons.find((r) => r.ruleId === 'RULE_HIDDEN_UNICODE');
    expect(['high', 'critical']).toContain(unicodeReason?.severity);
  });

  // Scenario 13: wifi:, mailto:, tel: QRs
  it('13. wifi:, mailto:, tel: QRs: returns "not a payment QR" and is NOT flagged as a scam', () => {
    const wifiPayload = 'WIFI:S:CafeWifi;T:WPA;P:secret123;;';
    const wifiResult = verifyQrPayload(wifiPayload);
    expect(wifiResult.category).toBe('SAFE');
    expect(wifiResult.score).toBe(0);
    expect(wifiResult.isNonPaymentQr).toBe(true);
    expect(wifiResult.confidenceNote).toContain('Not a payment QR code (wifi:)');
    expect(wifiResult.reasons.some((r) => r.severity === 'critical')).toBe(false);

    const mailtoPayload = 'mailto:support@company.com';
    const mailtoResult = verifyQrPayload(mailtoPayload);
    expect(mailtoResult.category).toBe('SAFE');
    expect(mailtoResult.score).toBe(0);
    expect(mailtoResult.isNonPaymentQr).toBe(true);
    expect(mailtoResult.confidenceNote).toContain('Not a payment QR code (mailto:)');

    const telPayload = 'tel:+919876543210';
    const telResult = verifyQrPayload(telPayload);
    expect(telResult.category).toBe('SAFE');
    expect(telResult.score).toBe(0);
    expect(telResult.isNonPaymentQr).toBe(true);
    expect(telResult.confidenceNote).toContain('Not a payment QR code (tel:)');
  });
});
