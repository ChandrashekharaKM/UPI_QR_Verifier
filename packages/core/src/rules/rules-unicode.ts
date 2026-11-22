import type { RuleContext, RuleResult } from '../types/rules.js';
import { inspectUnicodeSafety } from '../validators/unicode-validator.js';

/**
 * Rule: Hidden Unicode, Zero-Width Characters, and Homoglyph Obfuscation.
 * Why: Fraudsters insert invisible zero-width spaces (e.g. U+200B), bidirectional overrides (e.g. U+202E),
 * and lookalike homoglyphs (e.g. Cyrillic 'а', 'с', 'о', 'ѕ', 'і') into UPI IDs (pa), payee names (pn),
 * and transaction notes (tn) to deceive victims into believing they are paying legitimate banks/merchants
 * or to bypass anti-fraud filters.
 */
export function ruleHiddenUnicode(ctx: RuleContext): RuleResult {
  const detectedFindings: Array<{
    field: string;
    hasZeroWidth: boolean;
    hasHomoglyphs: boolean;
    details: string;
  }> = [];

  const fieldsToCheck: Array<{ name: string; value?: string }> = [];

  if (ctx.parsed.fields.kind === 'upi' || ctx.parsed.fields.kind === 'emv') {
    const upi = ctx.parsed.fields.upi;
    fieldsToCheck.push({ name: 'pa (UPI ID)', value: upi.pa });
    fieldsToCheck.push({ name: 'pn (Payee Name)', value: upi.pn });
    fieldsToCheck.push({ name: 'tn (Transaction Note)', value: upi.tn });
    for (const [k, v] of Object.entries(upi.extraParams)) {
      fieldsToCheck.push({ name: `extraParam "${k}"`, value: v });
    }
  } else if (ctx.parsed.fields.kind === 'url') {
    fieldsToCheck.push({ name: 'rawUrl', value: ctx.parsed.fields.url.rawUrl });
  } else {
    fieldsToCheck.push({ name: 'raw', value: ctx.parsed.rawPayload });
  }

  // Also check raw payload directly for zero-width / bidi characters
  const rawInspection = inspectUnicodeSafety(ctx.parsed.rawPayload);
  if (
    rawInspection.hasZeroWidth &&
    fieldsToCheck.every((f) => !f.value || !inspectUnicodeSafety(f.value).hasZeroWidth)
  ) {
    fieldsToCheck.push({ name: 'rawPayload', value: ctx.parsed.rawPayload });
  }

  for (const { name, value } of fieldsToCheck) {
    if (!value) continue;
    const res = inspectUnicodeSafety(value);
    if (res.hasHiddenUnicode) {
      const parts: string[] = [];
      if (res.hasZeroWidth) {
        parts.push(`Zero-width / invisible control characters: ${res.zeroWidthFound.join(', ')}`);
      }
      if (res.hasHomoglyphs) {
        const homos = res.homoglyphsFound
          .map((h) => `'${h.char}' (${h.codePoint} -> '${h.replacement}')`)
          .join(', ');
        parts.push(`Confusable homoglyphs: ${homos}`);
      }
      detectedFindings.push({
        field: name,
        hasZeroWidth: res.hasZeroWidth,
        hasHomoglyphs: res.hasHomoglyphs,
        details: parts.join('; ')
      });
    }
  }

  const isTriggered = detectedFindings.length > 0;
  const affectsPa = detectedFindings.some((d) => d.field.includes('pa'));
  const severity = affectsPa ? 'critical' : 'high';
  const weight = affectsPa ? 85 : 75;

  const affectedFields = detectedFindings.map((d) => d.field).join(', ');

  return {
    id: 'RULE_HIDDEN_UNICODE',
    triggered: isTriggered,
    severity,
    weight,
    title: 'Hidden Unicode / Homoglyph Evasion Detected',
    message: isTriggered
      ? `Suspicious invisible characters or lookalike Unicode homoglyphs detected in ${affectedFields}. Fraudsters use zero-width spaces and foreign alphabets to evade security filters and visually impersonate trusted brands.`
      : 'No hidden Unicode control characters or confusable homoglyphs detected.',
    evidence: isTriggered
      ? detectedFindings.map((d) => ({
          key: d.field,
          value: d.details
        }))
      : undefined
  };
}
