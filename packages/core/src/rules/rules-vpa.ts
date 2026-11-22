import type { RuleContext, RuleResult } from '../types/rules.js';
import { validateVpa } from '../validators/psp-validator.js';

/**
 * Rule: Unknown PSP handle.
 * Why: NPCI designates official banking PSP handles (e.g. oksbi, okhdfcbank, paytm).
 * Unrecognized handles might indicate spoofed or unverified payment destinations.
 */
export function ruleUnknownPsp(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_UNKNOWN_PSP',
      triggered: false,
      severity: 'medium',
      weight: 45,
      title: 'Unknown Payment Service Provider',
      message: 'Not applicable.'
    };
  }

  const { pa } = ctx.parsed.fields.upi;
  const vpaCheck = validateVpa(pa);

  const isUnknown = !vpaCheck.isValidSyntax || !vpaCheck.isKnownPsp;

  return {
    id: 'RULE_UNKNOWN_PSP',
    triggered: isUnknown,
    severity: !vpaCheck.isValidSyntax ? 'high' : 'medium',
    weight: !vpaCheck.isValidSyntax ? 60 : 45,
    title: !vpaCheck.isValidSyntax ? 'Invalid or Malformed UPI Address' : 'Unknown Payment Service Provider',
    message: isUnknown
      ? (!vpaCheck.isValidSyntax
          ? `The UPI address "${pa}" violates standard syntax specifications. Malformed addresses risk misdirected payments or client exploitation.`
          : `The UPI handle "@${vpaCheck.pspHandle}" is not on the recognized NPCI banking PSP allowlist. Exercise caution before proceeding.`)
      : 'VPA uses a recognized banking PSP handle.',
    evidence: isUnknown
      ? [
          { key: 'vpa', value: pa },
          { key: 'pspHandle', value: vpaCheck.pspHandle || 'invalid' }
        ]
      : undefined
  };
}

/**
 * Rule: VPA with high entropy (random machine-generated strings).
 * Why: Fraud rings frequently generate thousands of randomized, throwaway VPAs (e.g., x7q8m1z9@...)
 * to evade detection and bank blocklists.
 */
export function ruleVpaHighEntropy(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_VPA_HIGH_ENTROPY',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Randomized Throwaway VPA Pattern',
      message: 'Not applicable.'
    };
  }

  const { pa } = ctx.parsed.fields.upi;
  const vpaCheck = validateVpa(pa);

  return {
    id: 'RULE_VPA_HIGH_ENTROPY',
    triggered: vpaCheck.highEntropy,
    severity: 'medium',
    weight: 35,
    title: 'Randomized Throwaway VPA Pattern',
    message: vpaCheck.highEntropy
      ? `The identifier "${vpaCheck.localPart}" contains random-looking, high-entropy character sequences typical of disposable scam accounts.`
      : 'VPA identifier follows natural naming patterns.',
    evidence: vpaCheck.highEntropy
      ? [{ key: 'localPart', value: vpaCheck.localPart }]
      : undefined
  };
}

/**
 * Rule: VPA with excessive digits.
 * Why: Unless it matches a standard 10-digit Indian phone number, long digit strings often disguise disposable burner routing accounts.
 */
export function ruleVpaExcessiveDigits(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_VPA_EXCESSIVE_DIGITS',
      triggered: false,
      severity: 'low',
      weight: 25,
      title: 'Excessive Digits in UPI Address',
      message: 'Not applicable.'
    };
  }

  const { pa } = ctx.parsed.fields.upi;
  const vpaCheck = validateVpa(pa);

  return {
    id: 'RULE_VPA_EXCESSIVE_DIGITS',
    triggered: vpaCheck.excessiveDigits,
    severity: 'low',
    weight: 25,
    title: 'Excessive Digits in UPI Address',
    message: vpaCheck.excessiveDigits
      ? `The UPI address "${vpaCheck.localPart}" has an unusually high concentration of numeric digits, differing from normal personal or business IDs.`
      : 'Digit composition in UPI address is normal.',
    evidence: vpaCheck.excessiveDigits
      ? [{ key: 'localPart', value: vpaCheck.localPart }]
      : undefined
  };
}

/**
 * Rule: VPA impersonating a bank, authority, or customer care.
 * Why: Scammers name their VPAs "sbi.refund", "paytm.support", "customercare.helpdesk" to deceive victims into believing they are transacting with official customer support.
 */
export function ruleVpaImpersonation(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_VPA_IMPERSONATION',
      triggered: false,
      severity: 'critical',
      weight: 85,
      title: 'Brand / Bank / Support Impersonation',
      message: 'Not applicable.'
    };
  }

  const { pa, mc } = ctx.parsed.fields.upi;
  const vpaCheck = validateVpa(pa);

  // Industry-specific legitimate keywords when matching MCC is present
  const UTILITY_KEYWORDS = new Set(['bescom', 'mahavitaran', 'uppcl', 'tneb', 'electricity', 'discom']);
  const TOLL_KEYWORDS = new Set(['fastag']);
  const COURIER_KEYWORDS = new Set(['indiapost', 'speedpost', 'postoffice', 'fedex', 'dtdc', 'bluedart']);

  const relevantKeywords = vpaCheck.impersonationKeywords.filter((kw) => {
    if (mc === '4900' && UTILITY_KEYWORDS.has(kw)) return false;
    if ((mc === '4784' || mc === '7523') && TOLL_KEYWORDS.has(kw)) return false;
    if (mc === '4215' && COURIER_KEYWORDS.has(kw)) return false;
    return true;
  });

  const isTriggered = relevantKeywords.length > 0;

  return {
    id: 'RULE_VPA_IMPERSONATION',
    triggered: isTriggered,
    severity: 'critical',
    weight: 85,
    title: 'Brand / Bank / Support Impersonation',
    message: isTriggered
      ? `The UPI address "${pa}" contains deceptive keywords (${relevantKeywords.join(', ')}) impersonating official customer care, banking support, or government bodies.`
      : 'No bank or authority impersonation patterns detected in the UPI ID.',
    evidence: isTriggered
      ? [
          { key: 'vpa', value: pa },
          { key: 'keywords', value: relevantKeywords.join(', ') }
        ]
      : undefined
  };
}
