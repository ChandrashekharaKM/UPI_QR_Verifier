import type { RuleContext, RuleResult } from '../types/rules.js';
import { jaroWinklerSimilarity } from '../validators/string-distance.js';
import { validateMerchantAndUrgency } from '../validators/merchant-validator.js';

/**
 * Rule: Missing payee name.
 * Why: Legitimate merchant QR codes and authentic payment requests almost universally specify the registered payee name (`pn`).
 * Omitting it leaves the payer blind to who will receive their funds.
 */
export function ruleMissingPayeeName(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_MISSING_PAYEE_NAME',
      triggered: false,
      severity: 'low',
      weight: 25,
      title: 'Missing Payee Name',
      message: 'Not applicable.'
    };
  }

  const { pn } = ctx.parsed.fields.upi;
  const isMissing = !pn || pn.trim().length === 0;

  return {
    id: 'RULE_MISSING_PAYEE_NAME',
    triggered: isMissing,
    severity: 'low',
    weight: 25,
    title: 'Missing Payee Name',
    message: isMissing
      ? 'The QR code does not declare a registered payee name ("pn"). You will not see the recipient identity until payment is initiated.'
      : 'Payee name is declared.',
    evidence: isMissing ? [{ key: 'pn', value: 'missing' }] : undefined
  };
}

/**
 * Rule: Severe name and VPA mismatch.
 * Why: Fraudsters often pose as a well-known entity (e.g. Payee Name "State Electricity Board")
 * while routing the transaction to an unrelated personal UPI ID (e.g. "rohit9823@ybl").
 */
export function ruleNameVpaMismatch(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_NAME_VPA_MISMATCH',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Payee Name and UPI Address Mismatch',
      message: 'Not applicable.'
    };
  }

  const { pa, pn } = ctx.parsed.fields.upi;
  if (!pn || pn.trim().length === 0) {
    return {
      id: 'RULE_NAME_VPA_MISMATCH',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Payee Name and UPI Address Mismatch',
      message: 'Payee name not provided, mismatch rule skipped.'
    };
  }

  const localPart = pa.split('@')[0] ?? '';
  // If local part is a phone number, skip direct lexical mismatch check since phone numbers are common P2P
  const isPhone = /^[6-9]\d{9}$/.test(localPart);
  if (isPhone) {
    return {
      id: 'RULE_NAME_VPA_MISMATCH',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Payee Name and UPI Address Mismatch',
      message: 'Phone number VPA detected; lexical name check skipped.'
    };
  }

  const cleanName = pn.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanVpaLocal = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (cleanName.length < 3 || cleanVpaLocal.length < 3) {
    return {
      id: 'RULE_NAME_VPA_MISMATCH',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Payee Name and UPI Address Mismatch',
      message: 'Names too short for reliable comparison.'
    };
  }

  // Check substring containment or fuzzy similarity
  const isContained = cleanName.includes(cleanVpaLocal) || cleanVpaLocal.includes(cleanName);
  const similarity = jaroWinklerSimilarity(cleanName, cleanVpaLocal);

  // Severe mismatch: not contained and similarity is very low (< 0.40)
  const isMismatch = !isContained && similarity < 0.40;

  return {
    id: 'RULE_NAME_VPA_MISMATCH',
    triggered: isMismatch,
    severity: 'medium',
    weight: 35,
    title: 'Payee Name and UPI Address Mismatch',
    message: isMismatch
      ? `The declared payee name "${pn}" has virtually no correlation with the UPI handle "${pa}". Scammers frequently display misleading names while redirecting money elsewhere.`
      : 'Payee name correlates reasonably with the UPI address.',
    evidence: isMismatch
      ? [
          { key: 'pn', value: pn },
          { key: 'pa', value: pa },
          { key: 'similarity', value: Math.round(similarity * 100) / 100 }
        ]
      : undefined
  };
}

/**
 * Rule: Urgency or bait keywords in payee name or note.
 * Why: "Lottery", "Prize Winner", "KYC Verification", "Refund Approval" are psychological engineering triggers designed to rush victims.
 */
export function ruleUrgencyKeywords(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_URGENCY_KEYWORDS',
      triggered: false,
      severity: 'high',
      weight: 60,
      title: 'Urgency / Psychological Bait Keywords',
      message: 'Not applicable.'
    };
  }

  const { pn, tn } = ctx.parsed.fields.upi;
  const merchantCheck = validateMerchantAndUrgency(pn, undefined, tn);

  const matchedKeywords = [
    ...merchantCheck.urgencyKeywordsInName,
    ...merchantCheck.urgencyKeywordsInNote
  ];

  const isTriggered = matchedKeywords.length > 0;

  return {
    id: 'RULE_URGENCY_KEYWORDS',
    triggered: isTriggered,
    severity: 'high',
    weight: 60,
    title: 'Urgency / Psychological Bait Keywords',
    message: isTriggered
      ? `High-risk psychological bait phrases detected (${Array.from(new Set(matchedKeywords)).join(', ')}). Fraudsters frequently promise refunds, prizes, or threaten KYC suspension.`
      : 'No high-risk urgency phrases found in payee name or notes.',
    evidence: isTriggered
      ? [{ key: 'keywords', value: Array.from(new Set(matchedKeywords)).join(', ') }]
      : undefined
  };
}
