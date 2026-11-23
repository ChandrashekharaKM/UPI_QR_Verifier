import type { RuleContext, RuleResult } from '../types/rules.js';
import { jaroWinklerSimilarity } from '../validators/string-distance.js';
import { validateMerchantAndUrgency } from '../validators/merchant-validator.js';
import { validateBrandImpersonation } from '../validators/brand-validator.js';

/**
 * Rule: Missing payee name.
 * Why: Legitimate merchant QR codes and authentic payment requests almost universally specify the registered payee name (`pn`).
 * Omitting it leaves the payer blind to who will receive their funds.
 */
export function ruleMissingPayeeName(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
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
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
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
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
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

/**
 * Rule: Bank-registered beneficiary name mismatch.
 * Why: When a licensed PSP/payment gateway (e.g. Razorpay, Cashfree) validates a VPA,
 * it queries NPCI in real time and returns the account-holder name registered with the receiving bank.
 * If this name differs significantly from the payee name declared on the QR (pn),
 * it indicates identity spoofing or that payment is being diverted to an unintended beneficiary.
 */
export function ruleRegisteredNameMismatch(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_REGISTERED_NAME_MISMATCH',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Beneficiary Name Mismatch with Bank Record',
      message: 'Not applicable.'
    };
  }

  if (!ctx.pspLookup) {
    return {
      id: 'RULE_REGISTERED_NAME_MISMATCH',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Beneficiary Name Mismatch with Bank Record',
      message: 'Licensed PSP lookup not enabled or available.'
    };
  }

  // If the licensed gateway reported that the VPA does not exist or is inactive
  if (!ctx.pspLookup.isValid) {
    return {
      id: 'RULE_REGISTERED_NAME_MISMATCH',
      triggered: true,
      severity: 'high',
      weight: 80,
      title: 'Invalid or Inactive VPA on Banking Network',
      message: 'Licensed payment gateway lookup confirmed that this UPI ID is invalid or inactive on the banking network.',
      evidence: [
        { key: 'isValid', value: false },
        { key: 'provider', value: ctx.pspLookup.provider ?? 'gateway' }
      ]
    };
  }

  const registeredName = ctx.pspLookup.registeredName?.trim();
  if (!registeredName) {
    return {
      id: 'RULE_REGISTERED_NAME_MISMATCH',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Beneficiary Name Mismatch with Bank Record',
      message: 'No registered beneficiary name returned by gateway.'
    };
  }

  const { pn } = ctx.parsed.fields.upi;
  if (!pn || pn.trim().length === 0) {
    return {
      id: 'RULE_REGISTERED_NAME_MISMATCH',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Beneficiary Name Mismatch with Bank Record',
      message: `QR code does not declare payee name, but bank-registered name is "${registeredName}".`
    };
  }

  const cleanQr = pn.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanReg = registeredName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Substring containment check (e.g. "Starbucks Coffee" in "Starbucks Coffee India Private Limited")
  const isContained = cleanQr.includes(cleanReg) || cleanReg.includes(cleanQr);

  // Common word intersection check
  const qrWords = cleanQr.split(' ').filter((w) => w.length > 2);
  const regWords = cleanReg.split(' ').filter((w) => w.length > 2);
  const commonWords = regWords.filter((w) => qrWords.includes(w));
  const hasWordOverlap =
    commonWords.length > 0 &&
    qrWords.length > 0 &&
    regWords.length > 0 &&
    commonWords.length >= Math.min(qrWords.length, regWords.length) * 0.5;

  const similarity = jaroWinklerSimilarity(cleanQr, cleanReg);
  // Mismatch when neither substring nor strong word overlap, and Jaro-Winkler similarity < 0.72
  const isMismatch = !isContained && !hasWordOverlap && similarity < 0.72;

  return {
    id: 'RULE_REGISTERED_NAME_MISMATCH',
    triggered: isMismatch,
    severity: 'high',
    weight: 75,
    title: 'Beneficiary Name Mismatch with Bank Record',
    message: isMismatch
      ? `Beneficiary name mismatch: The bank-registered name on this UPI ID ("${registeredName}") does not match the merchant name shown on the QR ("${pn}"). Advice: This QR may divert funds to an unauthorized recipient.`
      : `Bank-registered name ("${registeredName}") matches or correlates with QR payee name ("${pn}").`,
    evidence: isMismatch
      ? [
          { key: 'declaredPayeeName', value: pn },
          { key: 'registeredBeneficiaryName', value: registeredName },
          { key: 'similarity', value: Math.round(similarity * 100) / 100 },
          { key: 'provider', value: ctx.pspLookup.provider ?? 'gateway' }
        ]
      : undefined
  };
}

/**
 * Rule: Brand, bank, authority, or customer care impersonation.
 * Why: Scammers pose as official customer care ("SBI Helpline", "Paytm Customer Care", "एसबीआई सहायता केंद्र")
 * or claim official brand names on unverified accounts.
 *
 * Low False-Positive Safeguards:
 * Legitimate intermediaries and merchants (e.g. "SBI Mutual Fund Agent", "HDFC Life Insurance Advisor",
 * "ICICI Securities Sub-broker", "SBI Canteen IIT Delhi") are exempted unless accompanied by high-risk scam intent keywords.
 */
export function ruleBrandImpersonation(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_BRAND_IMPERSONATION',
      triggered: false,
      severity: 'critical',
      weight: 85,
      title: 'Brand / Authority / Support Impersonation',
      message: 'Not applicable.'
    };
  }

  const { pn, pa, mc } = ctx.parsed.fields.upi;
  const brandCheck = validateBrandImpersonation({
    payeeName: pn,
    vpa: pa,
    merchantCode: mc
  });

  const isTriggered = brandCheck.isImpersonation;

  return {
    id: 'RULE_BRAND_IMPERSONATION',
    triggered: isTriggered,
    severity: brandCheck.riskLevel === 'critical' ? 'critical' : 'high',
    weight: brandCheck.riskLevel === 'critical' ? 85 : 70,
    title: 'Brand / Bank / Support Impersonation',
    message: isTriggered
      ? brandCheck.message
      : 'No brand or authority impersonation detected.',
    evidence: isTriggered
      ? [
          {
            key: 'brands',
            value: brandCheck.matchedBrands.map((b) => b.brandDisplayName).join(', ') || 'none'
          },
          {
            key: 'intentKeywords',
            value: brandCheck.matchedIntentKeywords.join(', ') || 'none'
          },
          {
            key: 'reason',
            value: brandCheck.reason || 'Brand impersonation detected'
          }
        ]
      : undefined
  };
}
