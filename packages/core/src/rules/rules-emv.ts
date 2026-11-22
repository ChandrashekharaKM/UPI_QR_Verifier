import type { RuleContext, RuleResult } from '../types/rules.js';

/**
 * Rule: EMVCo / BharatQR Invalid Checksum.
 * Why: EMVCo merchant QR specifications mandate a CRC-16/CCITT-FALSE checksum in tag 63.
 * A checksum mismatch strongly indicates that the QR code has been altered or tampered with
 * (e.g., an attacker replacing the merchant VPA or amount on a counter standee sticker).
 */
export function ruleEmvBadCrc(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'emv' || ctx.parsed.fields.kind !== 'emv') {
    return {
      id: 'RULE_EMV_BAD_CRC',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Invalid EMVCo / BharatQR Checksum',
      message: 'Not applicable.'
    };
  }

  const emv = ctx.parsed.fields.emv;
  const isBadCrc = !emv.isValidCrc;

  return {
    id: 'RULE_EMV_BAD_CRC',
    triggered: isBadCrc,
    severity: 'high',
    weight: 75,
    title: 'Invalid EMVCo / BharatQR Checksum (Tampering Indicator)',
    message: isBadCrc
      ? `The EMVCo / BharatQR CRC-16 checksum verification failed (declared: "${emv.declaredCrc ?? 'none'}", calculated: "${emv.calculatedCrc ?? 'none'}"). The QR code payload may have been tampered with or corrupted.`
      : 'EMVCo CRC-16 checksum verified successfully.',
    evidence: isBadCrc
      ? [
          { key: 'declaredCrc', value: emv.declaredCrc ?? 'missing' },
          { key: 'calculatedCrc', value: emv.calculatedCrc ?? 'unknown' }
        ]
      : undefined
  };
}
