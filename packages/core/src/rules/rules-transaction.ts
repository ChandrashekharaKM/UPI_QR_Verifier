import type { RuleContext, RuleResult } from '../types/rules.js';
import { validateAmountAndCurrency } from '../validators/amount-validator.js';
import { validateMerchantAndUrgency } from '../validators/merchant-validator.js';

/**
 * Rule: Unusually high pre-filled transaction amount.
 * Why: QR codes pre-filling huge sums (> Rs 25,000) or exceeding NPCI guidelines are high-risk because accidental scanning or muscle-memory PIN entry can cause severe financial loss.
 */
export function ruleHighAmount(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_HIGH_AMOUNT',
      triggered: false,
      severity: 'high',
      weight: 50,
      title: 'Unusually High Pre-filled Amount',
      message: 'Not applicable.'
    };
  }

  const { am, cu } = ctx.parsed.fields.upi;
  const amountCheck = validateAmountAndCurrency(am, cu);

  const isTriggered = amountCheck.isHighAmount || amountCheck.isAboveNpciLimit;

  return {
    id: 'RULE_HIGH_AMOUNT',
    triggered: isTriggered,
    severity: amountCheck.isAboveNpciLimit ? 'critical' : 'high',
    weight: amountCheck.isAboveNpciLimit ? 75 : 50,
    title: amountCheck.isAboveNpciLimit
      ? 'Amount Exceeds NPCI Standard Limit'
      : 'Unusually High Pre-filled Amount',
    message: isTriggered
      ? `This QR code attempts to immediately deduct a pre-filled amount of ₹${amountCheck.amountValue?.toLocaleString('en-IN') ?? am}. Always verify before entering your UPI PIN.`
      : 'Pre-filled amount is within typical limits or not pre-specified.',
    evidence: isTriggered && amountCheck.amountValue !== undefined
      ? [{ key: 'amount', value: amountCheck.amountValue }]
      : undefined
  };
}

/**
 * Rule: Suspicious round bait amount pattern.
 * Why: Amounts like 9,999, 19,999, 49,999 are psychological pricing patterns exploited by scam schemes.
 */
export function ruleRoundBaitAmount(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_ROUND_BAIT_AMOUNT',
      triggered: false,
      severity: 'medium',
      weight: 35,
      title: 'Suspicious Pricing Pattern',
      message: 'Not applicable.'
    };
  }

  const { am, cu } = ctx.parsed.fields.upi;
  const amountCheck = validateAmountAndCurrency(am, cu);

  return {
    id: 'RULE_ROUND_BAIT_AMOUNT',
    triggered: amountCheck.isRoundBaitAmount,
    severity: 'medium',
    weight: 35,
    title: 'Suspicious Pricing Pattern',
    message: amountCheck.isRoundBaitAmount
      ? `The pre-filled amount (₹${am}) matches common psychological lure pricing frequently seen in deceptive promotion scams.`
      : 'No suspicious promotional round pricing pattern.',
    evidence: amountCheck.isRoundBaitAmount && amountCheck.amountValue !== undefined
      ? [{ key: 'amount', value: amountCheck.amountValue }]
      : undefined
  };
}

/**
 * Rule: Transaction note asking for "refund" or "verification".
 * Why: The most common UPI scam in India tricks users into believing they are RECEIVING money by having them scan a QR code and enter their PIN under the guise of "refund" or "kyc verification".
 * UPI NEVER requires a PIN or scanning a QR code to receive money!
 */
export function ruleRefundVerifyNote(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_REFUND_VERIFY_NOTE',
      triggered: false,
      severity: 'critical',
      weight: 85,
      title: 'Deceptive Refund / Receive-Money Scam Note',
      message: 'Not applicable.'
    };
  }

  const { tn, am, cu } = ctx.parsed.fields.upi;
  const note = (tn ?? '').toLowerCase();
  const amountCheck = validateAmountAndCurrency(am, cu);

  const hasRefundOrVerifyNote =
    note.includes('refund') ||
    note.includes('verify') ||
    note.includes('verification') ||
    note.includes('received') ||
    note.includes('receive money') ||
    note.includes('cashback claim') ||
    note.includes('collect');

  // If note promises refund/receive or micro authorization scam
  const isTriggered = hasRefundOrVerifyNote || (amountCheck.isMicroAuthAmount && note.length > 0);

  return {
    id: 'RULE_REFUND_VERIFY_NOTE',
    triggered: isTriggered,
    severity: 'critical',
    weight: 85,
    title: 'Deceptive Refund / Receive-Money Scam Note',
    message: isTriggered
      ? 'CRITICAL WARNING: The note claims to be a "refund" or "verification". In UPI, YOU NEVER SCAN A QR OR ENTER A PIN TO RECEIVE MONEY. Scanning this will DEDUCT money from your account.'
      : 'Transaction note does not claim to deliver funds or refunds.',
    evidence: isTriggered
      ? [
          { key: 'note', value: tn ?? '' },
          { key: 'amount', value: am ?? 'none' }
        ]
      : undefined
  };
}

/**
 * Rule: Merchant code missing for a name that claims to be a business.
 * Why: Registered merchants with NPCI must have a valid 4-digit Merchant Category Code (MCC).
 * Scammers register private individual accounts under names like "Apple Store Electronics" to bypass business verification.
 */
export function ruleMissingMcBusiness(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'upi' || ctx.parsed.fields.kind !== 'upi') {
    return {
      id: 'RULE_MISSING_MC_BUSINESS',
      triggered: false,
      severity: 'medium',
      weight: 40,
      title: 'Unverified Merchant Claims Commercial Business',
      message: 'Not applicable.'
    };
  }

  const { pn, mc, tn } = ctx.parsed.fields.upi;
  const merchantCheck = validateMerchantAndUrgency(pn, mc, tn);

  return {
    id: 'RULE_MISSING_MC_BUSINESS',
    triggered: merchantCheck.missingMerchantCodeForBusiness,
    severity: 'medium',
    weight: 40,
    title: 'Unverified Merchant Claims Commercial Business',
    message: merchantCheck.missingMerchantCodeForBusiness
      ? `The payee name "${pn}" claims to be a registered business/store, but lacks an official 4-digit Merchant Category Code (MCC). This may be an unverified personal account masquerading as a business.`
      : 'Merchant code declarations are consistent.',
    evidence: merchantCheck.missingMerchantCodeForBusiness
      ? [
          { key: 'pn', value: pn ?? '' },
          { key: 'mc', value: 'missing' }
        ]
      : undefined
  };
}
