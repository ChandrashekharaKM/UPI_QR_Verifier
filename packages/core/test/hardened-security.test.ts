import { describe, it, expect } from 'vitest';
import { verifyQrPayload } from '../src/verifier.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import { validateVpa } from '../src/validators/psp-validator.js';
import { ruleDuplicateParameters, ruleUnknownParameters } from '../src/rules/rules-payload.js';
import { ruleIpAddressUrl, ruleHttpNotHttps, ruleShortenedUrl } from '../src/rules/rules-protocol.js';

describe('Hardened Security & Edge-Case Protection Tests', () => {
  it('88. malformed VPA with double-@ is detected and never marked as SAFE', () => {
    const payload = 'upi://pay?pa=fake@@oksbi&pn=Ramesh';
    const result = verifyQrPayload(payload);

    expect(result.category).not.toBe('SAFE');
    expect(result.score).toBeGreaterThan(30);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_UNKNOWN_PSP')).toBe(true);
    const pspReason = result.reasons.find((r) => r.ruleId === 'RULE_UNKNOWN_PSP');
    expect(pspReason?.title).toContain('Invalid or Malformed UPI Address');
    expect(pspReason?.severity).toBe('high');
  });

  it('89. VPA without @ sign triggers format error and is flagged', () => {
    const payload = 'upi://pay?pa=plainusername&pn=Vendor';
    const result = verifyQrPayload(payload);

    expect(result.category).not.toBe('SAFE');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_UNKNOWN_PSP')).toBe(true);
  });

  it('90. detects zero-width Unicode characters used for evasion in VPA', () => {
    // Inject zero-width space (\u200B) into "support"
    const rawWithZeroWidth = 'upi://pay?pa=sbi\u200B.support@ybl&pn=SBI%20Desk';
    const vpaRes = validateVpa('sbi\u200B.support@ybl');

    expect(vpaRes.isValidSyntax).toBe(false);
    // Sanitized checking ensures "support" keyword is still caught
    expect(vpaRes.impersonationKeywords.length).toBeGreaterThan(0);

    const result = verifyQrPayload(rawWithZeroWidth);
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION')).toBe(true);
  });

  it('91. detects UPI AutoPay recurring mandate scheme (upi://mandate)', () => {
    const payload = 'upi://mandate?pa=scam@oksbi&am=1000&recurrence=monthly';
    const parsed = parsePayload(payload);

    expect(parsed.kind).toBe('upi');
    expect(parsed.fields.kind).toBe('upi');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('scam@oksbi');
      expect(parsed.fields.upi.action).toBe('mandate');
      expect(parsed.fields.upi.originalScheme).toBe('upi://mandate');
    }

    const result = verifyQrPayload(payload);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
    const mandateReason = result.reasons.find((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE');
    expect(mandateReason?.message).toContain('This QR requests money from you instead of paying you.');
  });

  it('92. critical parameter pollution (duplicate pa) elevates severity to critical', () => {
    const payload = 'upi://pay?pa=legit@oksbi&pa=attacker@ybl&am=500';
    const ctx = { parsed: parsePayload(payload) };
    const res = ruleDuplicateParameters(ctx);

    expect(res.triggered).toBe(true);
    expect(res.severity).toBe('critical');
    expect(res.weight).toBe(85);
    expect(res.title).toContain('Critical Parameter Pollution');
  });

  it('93. official NPCI parameters (tid, purpose, ver) do not trigger unknown parameter warnings', () => {
    const payload = 'upi://pay?pa=merchant@okhdfcbank&pn=Store&am=100&cu=INR&tid=TID123456&purpose=00&ver=01';
    const ctx = { parsed: parsePayload(payload) };
    const res = ruleUnknownParameters(ctx);

    expect(res.triggered).toBe(false);
    expect(ctx.parsed.parseWarnings.length).toBe(0);
  });

  it('94. embedded malicious IP address URL in UPI QR payload is detected', () => {
    const payload = 'upi://pay?pa=store@oksbi&pn=Store&url=http://185.220.101.5/invoice.apk';
    const ctx = { parsed: parsePayload(payload) };

    const ipResult = ruleIpAddressUrl(ctx);
    expect(ipResult.triggered).toBe(true);
    expect(ipResult.severity).toBe('high');

    const httpResult = ruleHttpNotHttps(ctx);
    expect(httpResult.triggered).toBe(true);
  });

  it('95. embedded shortened link in UPI QR payload is detected', () => {
    const payload = 'upi://pay?pa=store@oksbi&pn=Store&url=https://bit.ly/claim-receipt';
    const ctx = { parsed: parsePayload(payload) };

    const shortResult = ruleShortenedUrl(ctx);
    expect(shortResult.triggered).toBe(true);
  });

  it('96. detects state electricity board and traffic challan impersonation', () => {
    const bescomVpa = validateVpa('bescom.billdesk@oksbi');
    expect(bescomVpa.impersonationKeywords).toContain('bescom');

    const echallanVpa = validateVpa('traffic.echallan@ybl');
    expect(echallanVpa.impersonationKeywords).toContain('echallan');

    const result = verifyQrPayload('upi://pay?pa=bescom.billdesk@oksbi&pn=Electricity%20Department&am=2400');
    expect(result.category).toBe('HIGH_RISK');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_VPA_IMPERSONATION')).toBe(true);
  });

  it('97. real-world BharatQR shop counter standee decodes and evaluates as SAFE', () => {
    // Official EMVCo BharatQR standee: Fresh Mart Provisions, MCC 5411, INR, City: Bangalore
    const standeePayload =
      '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS99126304D70A';
    const parsed = parsePayload(standeePayload);

    expect(parsed.kind).toBe('emv');
    expect(parsed.fields.kind).toBe('emv');
    if (parsed.fields.kind === 'emv') {
      expect(parsed.fields.upi.source).toBe('emv');
      expect(parsed.fields.upi.pa).toBe('freshmart@okhdfcbank');
      expect(parsed.fields.upi.pn).toBe('Fresh Mart Provisions');
      expect(parsed.fields.upi.mc).toBe('5411');
      expect(parsed.fields.upi.cu).toBe('INR');
      expect(parsed.fields.upi.extraParams['format']).toBe('bharat_qr');
    }

    const result = verifyQrPayload(standeePayload);
    expect(result.category).toBe('SAFE');
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('98. detects corrupted CRC16 checksum on damaged or tampered BharatQR standees', () => {
    // Modify one character in payload, keeping declared CRC the same
    const tamperedStandee =
      '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009BangalorX62110707POS99126304D70A';
    const parsed = parsePayload(tamperedStandee);

    expect(parsed.parseWarnings.some((w) => w.includes('EMVCo CRC checksum mismatch'))).toBe(true);
  });

  it('99. recognizes official Paytm TPAP handles (@ptyes, @pthdfc, @ptsbi, @ptaxis) on shop counters', () => {
    const ptyesPayload = 'upi://pay?pa=sharmatea@ptyes&pn=Sharma%20Tea%20Stall&cu=INR&mc=5814&mode=01';
    const vpaRes = validateVpa('sharmatea@ptyes');
    expect(vpaRes.isKnownPsp).toBe(true);

    const result = verifyQrPayload(ptyesPayload);
    expect(result.category).toBe('SAFE');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_UNKNOWN_PSP')).toBe(false);

    expect(validateVpa('merchant@pthdfc').isKnownPsp).toBe(true);
    expect(validateVpa('merchant@ptsbi').isKnownPsp).toBe(true);
    expect(validateVpa('merchant@ptaxis').isKnownPsp).toBe(true);
  });

  it('100. recognizes Pine Labs (@pinelabs) and BharatPe (@bharatpe) merchant handles', () => {
    expect(validateVpa('retailstore@pinelabs').isKnownPsp).toBe(true);
    expect(validateVpa('guptahardware@bharatpe').isKnownPsp).toBe(true);

    const pineResult = verifyQrPayload('upi://pay?pa=retailstore@pinelabs&pn=Retail%20Store&mc=5311&cu=INR');
    expect(pineResult.category).toBe('SAFE');
  });

  it('101. correctly parses and verifies Android Intent UPI URIs (intent://pay)', () => {
    const intentPayload =
      'intent://pay?pa=crosswordbooks@okaxis&pn=Crossword%20Bookstores&am=499.00&cu=INR&mc=5942#Intent;scheme=upi;package=in.org.npci.upiapp;end';
    const parsed = parsePayload(intentPayload);

    expect(parsed.kind).toBe('upi');
    expect(parsed.fields.kind).toBe('upi');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('crosswordbooks@okaxis');
      expect(parsed.fields.upi.pn).toBe('Crossword Bookstores');
      expect(parsed.fields.upi.mc).toBe('5942');
    }

    const result = verifyQrPayload(intentPayload);
    expect(result.category).toBe('SAFE');
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('102. parses and verifies web URLs with encapsulated UPI parameters (phon.pe, etc.)', () => {
    const webUpiPayload =
      'https://phon.pe/pay?pa=apollopharmacy@ybl&pn=Apollo%20Pharmacy&am=250.00&cu=INR&mc=5912';
    const parsed = parsePayload(webUpiPayload);

    expect(parsed.kind).toBe('upi');
    expect(parsed.fields.kind).toBe('upi');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('apollopharmacy@ybl');
      expect(parsed.fields.upi.pn).toBe('Apollo Pharmacy');
      expect(parsed.fields.upi.mc).toBe('5912');
    }

    const result = verifyQrPayload(webUpiPayload);
    expect(result.category).toBe('SAFE');
  });
});
