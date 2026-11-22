import { describe, it, expect } from 'vitest';
import {
  parseTLVString,
  calculateCrc16CcittFalse,
  isEmvPayload,
  parseEmvPayload
} from '../src/parser/emv-parser.js';
import { parsePayload } from '../src/parser/payload-parser.js';
import { evaluateRules } from '../src/rules/engine.js';
import { ruleEmvBadCrc } from '../src/rules/rules-emv.js';
import { verifyQrPayload } from '../src/verifier.js';
import { extractFeatureVector } from '../src/features/feature-extractor.js';

describe('EMVCo / BharatQR Parser and Security Rules', () => {
  // Build a standard valid BharatQR standee payload
  function buildEmvPayload(options: {
    poi?: string;
    vpa?: string;
    guid?: string;
    name?: string;
    city?: string;
    postal?: string;
    mcc?: string;
    currency?: string;
    amount?: string;
    tipIndicator?: string;
    tipValueFixed?: string;
    tipValuePercentage?: string;
    terminalId?: string;
    referenceId?: string;
    purpose?: string;
    corruptCrc?: boolean;
  } = {}): string {
    const poi = options.poi ?? '11'; // 11 = static standee
    const vpa = options.vpa ?? 'coffee.shop@okhdfcbank';
    const guid = options.guid ?? 'A000000524';
    const name = options.name ?? 'Blue Tokai Coffee';
    const city = options.city ?? 'Bengaluru';
    const mcc = options.mcc ?? '5499';
    const currency = options.currency ?? '356';

    let tag26Val = `00${guid.length.toString().padStart(2, '0')}${guid}01${vpa.length.toString().padStart(2, '0')}${vpa}`;
    if (options.referenceId) {
      tag26Val += `02${options.referenceId.length.toString().padStart(2, '0')}${options.referenceId}`;
    }

    let payload = `0002010102${poi}`;
    payload += `26${tag26Val.length.toString().padStart(2, '0')}${tag26Val}`;
    payload += `52${mcc.length.toString().padStart(2, '0')}${mcc}`;
    payload += `53${currency.length.toString().padStart(2, '0')}${currency}`;

    if (options.amount) {
      payload += `54${options.amount.length.toString().padStart(2, '0')}${options.amount}`;
    }

    if (options.tipIndicator) {
      payload += `55${options.tipIndicator.length.toString().padStart(2, '0')}${options.tipIndicator}`;
    }
    if (options.tipValueFixed) {
      payload += `56${options.tipValueFixed.length.toString().padStart(2, '0')}${options.tipValueFixed}`;
    }
    if (options.tipValuePercentage) {
      payload += `57${options.tipValuePercentage.length.toString().padStart(2, '0')}${options.tipValuePercentage}`;
    }

    payload += `5802IN`;
    payload += `59${name.length.toString().padStart(2, '0')}${name}`;
    payload += `60${city.length.toString().padStart(2, '0')}${city}`;

    if (options.postal) {
      payload += `61${options.postal.length.toString().padStart(2, '0')}${options.postal}`;
    }

    let tag62Val = '';
    if (options.terminalId) {
      tag62Val += `07${options.terminalId.length.toString().padStart(2, '0')}${options.terminalId}`;
    }
    if (options.purpose) {
      tag62Val += `08${options.purpose.length.toString().padStart(2, '0')}${options.purpose}`;
    }
    if (tag62Val.length > 0) {
      payload += `62${tag62Val.length.toString().padStart(2, '0')}${tag62Val}`;
    }

    // Add CRC-16
    payload += '6304';
    const computedCrc = calculateCrc16CcittFalse(payload);
    const finalCrc = options.corruptCrc ? 'DEAD' : computedCrc;

    return payload + finalCrc;
  }

  it('1. correctly parses TLV string into tags and lengths', () => {
    const tlv = '0002010102115802IN';
    const map = parseTLVString(tlv);
    expect(map.get('00')).toBe('01');
    expect(map.get('01')).toBe('11');
    expect(map.get('58')).toBe('IN');
  });

  it('2. verifies CRC-16/CCITT-FALSE algorithm consistency', () => {
    // Known test vector for CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, final XOR 0x0000)
    // "123456789" -> 0x29B1
    const testCrc = calculateCrc16CcittFalse('123456789');
    expect(testCrc).toBe('29B1');
  });

  it('3. identifies EMVCo payloads starting with 000201', () => {
    expect(isEmvPayload('000201010211')).toBe(true);
    expect(isEmvPayload('  000201010211  ')).toBe(true);
    expect(isEmvPayload('upi://pay?pa=store@oksbi')).toBe(false);
    expect(isEmvPayload('https://example.com')).toBe(false);
  });

  it('4. parses a valid printed merchant standee QR code with all standard EMV tags', () => {
    const validQr = buildEmvPayload({
      poi: '11',
      vpa: 'merchant.store@oksbi',
      name: 'Modern Supermarket',
      city: 'Mumbai',
      postal: '400001',
      mcc: '5411',
      amount: '350.00',
      terminalId: 'POS901',
      tipIndicator: '01'
    });

    const parsed = parsePayload(validQr);

    expect(parsed.kind).toBe('emv');
    expect(parsed.fields.kind).toBe('emv');

    if (parsed.fields.kind === 'emv') {
      // EMV fields verification
      expect(parsed.fields.emv.isValidCrc).toBe(true);
      expect(parsed.fields.emv.merchantName).toBe('Modern Supermarket');
      expect(parsed.fields.emv.merchantCity).toBe('Mumbai');
      expect(parsed.fields.emv.postalCode).toBe('400001');
      expect(parsed.fields.emv.mcc).toBe('5411');
      expect(parsed.fields.emv.amount).toBe('350.00');
      expect(parsed.fields.emv.currency).toBe('INR');
      expect(parsed.fields.emv.pointOfInitiation).toBe('static');
      expect(parsed.fields.emv.tipIndicator).toBe('01');

      // Normalised UPI fields verification
      const upi = parsed.fields.upi;
      expect(upi.source).toBe('emv');
      expect(upi.pa).toBe('merchant.store@oksbi');
      expect(upi.pn).toBe('Modern Supermarket');
      expect(upi.am).toBe('350.00');
      expect(upi.cu).toBe('INR');
      expect(upi.mc).toBe('5411');
      expect(upi.mode).toBe('01'); // static
      expect(upi.tid).toBe('POS901');
      expect(upi.extraParams['format']).toBe('bharat_qr');
      expect(upi.extraParams['city']).toBe('Mumbai');
    }
  });

  it('5. triggers RULE_EMV_BAD_CRC when checksum is corrupted or modified', () => {
    const corruptedQr = buildEmvPayload({
      vpa: 'tampered.payee@ybl',
      corruptCrc: true
    });

    const parsed = parsePayload(corruptedQr);
    expect(parsed.kind).toBe('emv');
    if (parsed.fields.kind === 'emv') {
      expect(parsed.fields.emv.isValidCrc).toBe(false);
      expect(parsed.fields.emv.declaredCrc).toBe('DEAD');
    }

    const ruleRes = ruleEmvBadCrc({ parsed });
    expect(ruleRes.triggered).toBe(true);
    expect(ruleRes.id).toBe('RULE_EMV_BAD_CRC');
    expect(ruleRes.severity).toBe('high');
    expect(ruleRes.weight).toBe(75);
    expect(ruleRes.message).toContain('CRC-16 checksum verification failed');
  });

  it('6. detects sticker overlay tampering attack (amount altered without CRC update)', () => {
    // Legitimate merchant QR
    const legitQr = buildEmvPayload({
      vpa: 'genuine.chai@paytm',
      amount: '20.00',
      name: 'Chai Point'
    });

    // Attacker modifies the amount string from 20.00 to 50000.00 without updating CRC tag 63
    const tamperedQr = legitQr.replace('540520.00', '540850000.00');

    const result = verifyQrPayload(tamperedQr);
    expect(['SUSPICIOUS', 'HIGH_RISK']).toContain(result.category);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(true);
  });

  it('7. evaluates authentic BharatQR standee as SAFE without false positives', () => {
    const standeeQr = buildEmvPayload({
      poi: '11',
      vpa: 'grocery.mart@okaxis',
      name: 'Grocery Mart',
      city: 'Delhi',
      mcc: '5411',
      currency: '356'
    });

    const result = verifyQrPayload(standeeQr);
    expect(result.category).toBe('SAFE');
    expect(result.score).toBeLessThanOrEqual(30);
    // Safe result must never be a bare "Safe"
    expect(result.confidenceNote).toBe('No major risk indicators found; recipient identity NOT independently verified');
    expect(result.reasons.some((r) => r.ruleId === 'RULE_NON_UPI_SCHEME')).toBe(false);
    expect(result.reasons.some((r) => r.ruleId === 'RULE_EMV_BAD_CRC')).toBe(false);
  });

  it('8. extracts VPA from multiple merchant template tags (tags 26 to 51)', () => {
    // Example using tag 27 with NPCI GUID 'in.org.npci'
    const tag27Val = '0011in.org.npci0116retailer@okicici';
    let raw = `00020101021127${tag27Val.length.toString().padStart(2, '0')}${tag27Val}5204541153033565802IN5906Retail6006Mumbai6304`;
    const crc = calculateCrc16CcittFalse(raw);
    raw += crc;

    const parsed = parseEmvPayload(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.upiFields?.pa).toBe('retailer@okicici');
    expect(parsed.upiFields?.source).toBe('emv');
    expect(parsed.fields?.isValidCrc).toBe(true);
  });

  it('9. extracts feature vectors properly for ML inference from EMV payload', () => {
    const standeeQr = buildEmvPayload({
      vpa: 'sweet.shop@okhdfcbank',
      name: 'Sweet Shop',
      mcc: '5441',
      amount: '200.00'
    });

    const parsed = parsePayload(standeeQr);
    const ruleEval = evaluateRules({ parsed });
    const features = extractFeatureVector({ parsed }, ruleEval.ruleRiskScore);

    // Feature 0: is_upi_scheme should be 1.0
    expect(features.values[0]).toBe(1.0);
    // Feature 1: is_url_scheme should be 0.0
    expect(features.values[1]).toBe(0.0);
    // Feature 10: vpa_is_known_psp should be 1.0 (okhdfcbank is known)
    expect(features.values[10]).toBe(1.0);
    // Feature 16: has_payee_name should be 1.0
    expect(features.values[16]).toBe(1.0);
    // Feature 24: has_merchant_code should be 1.0 (5441)
    expect(features.values[24]).toBe(1.0);
  });

  it('10. handles fee indicators and tip values in tags 55-57', () => {
    const tipQr = buildEmvPayload({
      tipIndicator: '02', // Flat convenience fee
      tipValueFixed: '15.00'
    });

    const parsed = parsePayload(tipQr);
    if (parsed.fields.kind === 'emv') {
      expect(parsed.fields.emv.tipIndicator).toBe('02');
      expect(parsed.fields.emv.tipValueFixed).toBe('15.00');
      expect(parsed.fields.upi.extraParams['tipIndicator']).toBe('02');
      expect(parsed.fields.upi.extraParams['tipValueFixed']).toBe('15.00');
    }
  });
});
