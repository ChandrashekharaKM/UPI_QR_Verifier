import type { RuleContext, RuleResult } from '../types/rules.js';
import { MAX_REASONABLE_PAYLOAD_LENGTH } from '../parser/payload-parser.js';

/**
 * Rule: Duplicate parameters detected in URI.
 * Why: HTTP/URI parameter pollution (HPP) can cause different UPI apps to parse different payee addresses or amounts,
 * a known vector where the preview shows one payee while the app executes payment to an attacker's duplicate parameter.
 */
export function ruleDuplicateParameters(ctx: RuleContext): RuleResult {
  const isTriggered = ctx.parsed.hasDuplicateParams;
  const duplicateKeys =
    ctx.parsed.fields.kind === 'upi' ? ctx.parsed.fields.upi.duplicateKeys : [];

  return {
    id: 'RULE_DUPLICATE_PARAMETERS',
    triggered: isTriggered,
    severity: 'high',
    weight: 65,
    title: 'Duplicate URI Parameters (Tampering Indicator)',
    message: isTriggered
      ? `Repeated parameter keys detected (${duplicateKeys.join(', ')}). Parameter pollution attacks trick payment apps into charging an attacker instead of the shown recipient.`
      : 'No duplicate parameters found.',
    evidence: isTriggered
      ? [{ key: 'duplicateKeys', value: duplicateKeys.join(', ') }]
      : undefined
  };
}

/**
 * Rule: Unknown or non-standard UPI parameters.
 * Why: Injection of custom query parameters may exploit vulnerabilities or app-specific behavior in banking apps.
 */
export function ruleUnknownParameters(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_UNKNOWN_PARAMETERS',
      triggered: false,
      severity: 'low',
      weight: 20,
      title: 'Non-Standard Query Parameters',
      message: 'Not applicable.'
    };
  }

  const extraKeys = Object.keys(ctx.parsed.fields.upi.extraParams);
  const isTriggered = extraKeys.length > 0;

  return {
    id: 'RULE_UNKNOWN_PARAMETERS',
    triggered: isTriggered,
    severity: 'low',
    weight: 20,
    title: 'Non-Standard Query Parameters',
    message: isTriggered
      ? `The QR code carries unexpected extra parameters (${extraKeys.join(', ')}), which deviate from the standard NPCI specification.`
      : 'All query parameters conform to standard UPI specifications.',
    evidence: isTriggered
      ? [{ key: 'extraParams', value: extraKeys.join(', ') }]
      : undefined
  };
}

/**
 * Rule: Oversized payload length.
 * Why: Standard UPI QR codes are compact (under 250 characters). Excessively large payloads may hide embedded payloads or buffer exploits.
 */
export function ruleOversizedPayload(ctx: RuleContext): RuleResult {
  const isOversized = ctx.parsed.payloadLength > MAX_REASONABLE_PAYLOAD_LENGTH;

  return {
    id: 'RULE_OVERSIZED_PAYLOAD',
    triggered: isOversized,
    severity: 'low',
    weight: 20,
    title: 'Oversized QR Code Payload',
    message: isOversized
      ? `The QR payload length (${ctx.parsed.payloadLength} characters) significantly exceeds typical UPI QR codes (${MAX_REASONABLE_PAYLOAD_LENGTH} chars maximum).`
      : 'Payload length is within normal limits.',
    evidence: isOversized
      ? [{ key: 'length', value: ctx.parsed.payloadLength }]
      : undefined
  };
}

/**
 * Rule: Non-INR Currency specification.
 * Why: UPI exclusively operates in Indian Rupees (INR). Specifying other currencies indicates a foreign or spoofed payment request.
 */
export function ruleInvalidCurrency(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_INVALID_CURRENCY',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Invalid Transaction Currency',
      message: 'Not applicable.'
    };
  }

  const currency = (ctx.parsed.fields.upi.cu ?? 'INR').toUpperCase().trim();
  const isInvalid = currency !== 'INR';

  return {
    id: 'RULE_INVALID_CURRENCY',
    triggered: isInvalid,
    severity: 'high',
    weight: 75,
    title: 'Invalid Transaction Currency',
    message: isInvalid
      ? `Transaction requests non-INR currency "${currency}". Official UPI transactions within India strictly require INR.`
      : 'Currency is valid INR.',
    evidence: isInvalid ? [{ key: 'cu', value: currency }] : undefined
  };
}
