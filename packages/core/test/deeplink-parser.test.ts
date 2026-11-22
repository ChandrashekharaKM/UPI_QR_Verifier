import { describe, it, expect } from 'vitest';
import { parsePayload } from '../src/parser/payload-parser.js';
import { isUpiDeepLink } from '../src/parser/deeplink-parser.js';
import { ruleCollectOrMandate } from '../src/rules/rules-protocol.js';
import { verifyQrPayload } from '../src/verifier.js';

describe('Deep-link Normaliser and RULE_COLLECT_OR_MANDATE', () => {
  it('1. normalises upi://pay and retains originalScheme', () => {
    const raw = 'upi://pay?pa=merchant@okhdfcbank&pn=SuperStore&am=250.00&cu=INR&mc=5411';
    const parsed = parsePayload(raw);

    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('upi://pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.source).toBe('upi');
      expect(parsed.fields.upi.originalScheme).toBe('upi://pay');
      expect(parsed.fields.upi.action).toBe('pay');
      expect(parsed.fields.upi.pa).toBe('merchant@okhdfcbank');
      expect(parsed.fields.upi.pn).toBe('SuperStore');
      expect(parsed.fields.upi.am).toBe('250.00');
      expect(parsed.fields.upi.cu).toBe('INR');
      expect(parsed.fields.upi.mc).toBe('5411');
    }

    const ruleRes = ruleCollectOrMandate({ parsed });
    expect(ruleRes.triggered).toBe(false);
  });

  it('2. normalises upi://collect and triggers RULE_COLLECT_OR_MANDATE (pull payment indicator)', () => {
    const raw = 'upi://collect?pa=fraudster@ybl&pn=FakeElectricitySupport&am=3500.00&cu=INR';
    const parsed = parsePayload(raw);

    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('upi://collect');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('fraudster@ybl');
      expect(parsed.fields.upi.pn).toBe('FakeElectricitySupport');
      expect(parsed.fields.upi.am).toBe('3500.00');
      expect(parsed.fields.upi.action).toBe('collect');
      expect(parsed.fields.upi.originalScheme).toBe('upi://collect');
    }

    const ruleRes = ruleCollectOrMandate({ parsed });
    expect(ruleRes.triggered).toBe(true);
    expect(ruleRes.id).toBe('RULE_COLLECT_OR_MANDATE');
    expect(ruleRes.severity).toBe('high');
    expect(ruleRes.weight).toBe(75);
    // Explicit advice requirement
    expect(ruleRes.message).toContain('This QR requests money from you instead of paying you.');

    const verification = verifyQrPayload(raw);
    expect(verification.category).toBe('HIGH_RISK');
    expect(verification.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
    const reason = verification.reasons.find((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE');
    expect(reason?.message).toContain('This QR requests money from you instead of paying you.');
  });

  it('3. normalises upi://mandate and triggers RULE_COLLECT_OR_MANDATE (recurring mandate)', () => {
    const raw = 'upi://mandate?pa=service@okaxis&pn=AutoPayService&am=999.00&cu=INR';
    const parsed = parsePayload(raw);

    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('upi://mandate');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('service@okaxis');
      expect(parsed.fields.upi.action).toBe('mandate');
      expect(parsed.fields.upi.originalScheme).toBe('upi://mandate');
    }

    const ruleRes = ruleCollectOrMandate({ parsed });
    expect(ruleRes.triggered).toBe(true);
    expect(ruleRes.severity).toBe('high');
    expect(ruleRes.message).toContain('This QR requests money from you instead of paying you.');

    const verification = verifyQrPayload(raw);
    expect(verification.reasons.some((r) => r.ruleId === 'RULE_COLLECT_OR_MANDATE')).toBe(true);
  });

  it('4. normalises PhonePe deep link (phonepe://pay?...)', () => {
    const raw = 'phonepe://pay?pa=restaurant@ybl&pn=Spice%20Garden&am=620.00&mc=5812';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('phonepe://pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.source).toBe('upi');
      expect(parsed.fields.upi.originalScheme).toBe('phonepe://pay');
      expect(parsed.fields.upi.action).toBe('pay');
      expect(parsed.fields.upi.pa).toBe('restaurant@ybl');
      expect(parsed.fields.upi.pn).toBe('Spice Garden');
      expect(parsed.fields.upi.am).toBe('620.00');
      expect(parsed.fields.upi.mc).toBe('5812');
    }

    const verification = verifyQrPayload(raw);
    expect(verification.category).toBe('SAFE');
    expect(verification.reasons.some((r) => r.ruleId === 'RULE_NON_UPI_SCHEME')).toBe(false);
  });

  it('5. normalises Paytm deep link (paytmmp://pay?...)', () => {
    const raw = 'paytmmp://pay?pa=localstore@paytm&pn=Local%20Kirana&am=150.00';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('paytmmp://pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.originalScheme).toBe('paytmmp://pay');
      expect(parsed.fields.upi.pa).toBe('localstore@paytm');
      expect(parsed.fields.upi.pn).toBe('Local Kirana');
      expect(parsed.fields.upi.am).toBe('150.00');
    }

    const verification = verifyQrPayload(raw);
    expect(verification.category).toBe('SAFE');
  });

  it('6. normalises Google Pay Tez deep link (tez://upi/pay?...)', () => {
    const raw = 'tez://upi/pay?pa=bakery@okhdfcbank&pn=Cake%20Walk&am=450.00&mc=5462';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('tez://upi/pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.originalScheme).toBe('tez://upi/pay');
      expect(parsed.fields.upi.action).toBe('pay');
      expect(parsed.fields.upi.pa).toBe('bakery@okhdfcbank');
      expect(parsed.fields.upi.pn).toBe('Cake Walk');
      expect(parsed.fields.upi.am).toBe('450.00');
    }

    const verification = verifyQrPayload(raw);
    expect(verification.category).toBe('SAFE');
  });

  it('7. normalises GPay custom scheme (gpay://upi/pay?...)', () => {
    const raw = 'gpay://upi/pay?pa=coffee@okaxis&pn=Coffee%20Bean&am=180.00';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('gpay://upi/pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('coffee@okaxis');
      expect(parsed.fields.upi.pn).toBe('Coffee Bean');
      expect(parsed.fields.upi.am).toBe('180.00');
    }
  });

  it('8. normalises BHIM custom scheme (bhim://pay?...)', () => {
    const raw = 'bhim://pay?pa=dairy@upi&pn=City%20Dairy&am=90.00';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('bhim://pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.pa).toBe('dairy@upi');
      expect(parsed.fields.upi.pn).toBe('City Dairy');
      expect(parsed.fields.upi.am).toBe('90.00');
    }
  });

  it('9. normalises Android Intent URL with scheme=upi in fragment', () => {
    const raw =
      'intent://pay?pa=crosswordbooks@okaxis&pn=Crossword%20Bookstores&am=499.00&cu=INR&mc=5942#Intent;scheme=upi;package=in.org.npci.upiapp;end';
    expect(isUpiDeepLink(raw)).toBe(true);

    const parsed = parsePayload(raw);
    expect(parsed.kind).toBe('upi');
    expect(parsed.originalScheme).toBe('intent://pay');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.originalScheme).toBe('intent://pay');
      expect(parsed.fields.upi.pa).toBe('crosswordbooks@okaxis');
      expect(parsed.fields.upi.pn).toBe('Crossword Bookstores');
      expect(parsed.fields.upi.am).toBe('499.00');
      expect(parsed.fields.upi.mc).toBe('5942');
    }
  });

  it('10. detects collect request inside an Android Intent URI and triggers RULE_COLLECT_OR_MANDATE', () => {
    const raw =
      'intent://collect?pa=attacker@ybl&pn=FakeClaim&am=5000.00#Intent;scheme=upi;package=net.one97.paytm;end';
    const parsed = parsePayload(raw);

    expect(parsed.kind).toBe('upi');
    if (parsed.fields.kind === 'upi') {
      expect(parsed.fields.upi.action).toBe('collect');
      expect(parsed.fields.upi.originalScheme).toBe('intent://collect');
    }

    const ruleRes = ruleCollectOrMandate({ parsed });
    expect(ruleRes.triggered).toBe(true);
    expect(ruleRes.message).toContain('This QR requests money from you instead of paying you.');
  });
});
