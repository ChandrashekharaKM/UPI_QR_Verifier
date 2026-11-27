import type { VerificationResult, RiskCategory } from '../types/result.js';

export interface QrDeceptionAlert {
  readonly isDeceptive: boolean;
  readonly title: string;
  readonly warningMessage: string;
}

export interface QrIntentDescription {
  /** High-level action category */
  readonly actionType:
    | 'PAYMENT'
    | 'REFUND_SCAM_TRAP'
    | 'COLLECT_REQUEST'
    | 'AUTOPAY_MANDATE'
    | 'EXTERNAL_LINK'
    | 'NON_PAYMENT';

  /** Bold, unmistakable plain-English headline (e.g. "You are SENDING ₹25,000 to an unverified individual") */
  readonly headline: string;

  /** Clear conversational explanation of what happens if user proceeds and enters PIN */
  readonly plainEnglishAction: string;

  /** Plain statement of financial effect on user's bank account */
  readonly financialImpact: string;

  /** Highlighted fraud alert if deceitful keywords or tricks were identified */
  readonly deceptionAlert?: QrDeceptionAlert;

  /** Amount description, e.g. "₹500.00 (Fixed deduction)" or "Open Amount (You choose amount)" */
  readonly amountText: string;
  readonly rawAmount?: string;

  /** Payee declared name or fallback */
  readonly payeeName: string;

  /** Payee UPI ID (VPA) or N/A */
  readonly payeeVpa: string;

  /** Classification of recipient */
  readonly payeeType: 'MERCHANT_VERIFIED' | 'COMMERCIAL_STANDEE' | 'INDIVIDUAL_UNVERIFIED' | 'UNKNOWN';
  readonly payeeTypeLabel: string;

  /** Optional note / remark extracted from QR */
  readonly transactionNote?: string;

  /** Exact count of identified risks / warning factors */
  readonly totalRisks: number;

  /** Risk level */
  readonly riskLevel: RiskCategory;

  /** Human-readable risk label, e.g. "HIGH RISK (Critical Danger)" */
  readonly riskLevelLabel: string;

  /** Count of critical / high severity risks */
  readonly criticalRisksCount: number;

  /** Count of medium / low severity warnings */
  readonly warningRisksCount: number;

  /** Bullet-point summaries of each identified risk in plain English */
  readonly riskBulletPoints: readonly string[];
}

/**
 * Translates a technical VerificationResult into a plain-English, human-understandable
 * intent explanation: "How many risks do we have?" and "What is this QR code actually saying?"
 */
export function describeQrIntent(result: VerificationResult): QrIntentDescription {
  const { category, reasons, parsed, isMerchantQr, isNonPaymentQr } = result;

  const totalRisks = reasons.length;
  const criticalRisksCount = reasons.filter((r) => r.severity === 'critical' || r.severity === 'high').length;
  const warningRisksCount = reasons.filter((r) => r.severity === 'medium' || r.severity === 'low').length;

  const riskLevelLabel =
    category === 'HIGH_RISK'
      ? 'HIGH RISK (Critical Danger)'
      : category === 'SUSPICIOUS'
        ? 'SUSPICIOUS (Proceed with Caution)'
        : 'LOW RISK (Format Verified)';

  // Extract upi or url fields
  const upi =
    (parsed.kind === 'upi' || parsed.kind === 'emv') &&
    (parsed.fields.kind === 'upi' || parsed.fields.kind === 'emv')
      ? parsed.fields.upi
      : undefined;

  const emv =
    parsed.kind === 'emv' && parsed.fields.kind === 'emv'
      ? parsed.fields.emv
      : undefined;

  const url =
    parsed.kind === 'url' && parsed.fields.kind === 'url'
      ? parsed.fields.url
      : undefined;

  // Compile concise bullet points for each risk
  const riskBulletPoints: string[] = reasons.map((r) => {
    return `${r.title}: ${r.message}`;
  });

  if (riskBulletPoints.length === 0) {
    riskBulletPoints.push('Format and syntax conform to UPI standards. Receiver identity unverified offline.');
  }

  // Handle Non-Payment Utility codes (wifi, mailto, tel, plain text)
  if (isNonPaymentQr || parsed.kind === 'other') {
    return {
      actionType: 'NON_PAYMENT',
      headline: `ℹ️ Non-Payment Code (${parsed.originalScheme ?? 'Utility'})`,
      plainEnglishAction:
        'This QR code does NOT initiate a financial payment or transfer funds. It contains device configuration data (such as Wi-Fi credentials, contact card, or plain text).',
      financialImpact: 'No money will leave your bank account.',
      amountText: 'None (Non-financial code)',
      payeeName: 'N/A',
      payeeVpa: 'N/A',
      payeeType: 'UNKNOWN',
      payeeTypeLabel: 'Non-Payment Code',
      totalRisks,
      riskLevel: category,
      riskLevelLabel,
      criticalRisksCount,
      warningRisksCount,
      riskBulletPoints
    };
  }

  // Handle External Web Links (URLs)
  if (url || parsed.kind === 'url') {
    const rawUrl = url?.rawUrl ?? parsed.rawPayload;
    const hostname = url?.hostname ?? 'external website';

    return {
      actionType: 'EXTERNAL_LINK',
      headline: `🔗 External Web Link (${hostname})`,
      plainEnglishAction: `This QR code is NOT a direct UPI payment. It opens an external web browser page at "${rawUrl}". Beware of phishing websites that imitate bank portals or ask for card numbers, OTPs, or passwords.`,
      financialImpact: 'No direct payment is initiated, but visiting external links may expose you to credential phishing or malicious downloads.',
      amountText: 'None (Web Link)',
      payeeName: hostname,
      payeeVpa: 'N/A',
      payeeType: 'UNKNOWN',
      payeeTypeLabel: 'External Website',
      totalRisks,
      riskLevel: category,
      riskLevelLabel,
      criticalRisksCount,
      warningRisksCount,
      riskBulletPoints
    };
  }

  // From here on, payload is UPI or EMVCo / BharatQR
  const vpa = upi?.pa ?? 'unknown@vpa';
  const declaredName = emv?.merchantName ?? upi?.pn ?? '';
  const note = upi?.tn ?? '';
  const amount = emv?.amount ?? upi?.am;
  const action = upi?.action ?? 'pay';

  // Determine Payee Type
  let payeeType: 'MERCHANT_VERIFIED' | 'COMMERCIAL_STANDEE' | 'INDIVIDUAL_UNVERIFIED' | 'UNKNOWN' = 'INDIVIDUAL_UNVERIFIED';
  let payeeTypeLabel = 'Personal / Unverified Account';

  if (emv || upi?.extraParams?.['format'] === 'bharat_qr') {
    payeeType = 'COMMERCIAL_STANDEE';
    payeeTypeLabel = 'BharatQR / EMVCo Merchant Standee';
  } else if (isMerchantQr || Boolean(upi?.mc)) {
    payeeType = 'MERCHANT_VERIFIED';
    payeeTypeLabel = upi?.mc ? `Commercial Merchant (MCC: ${upi.mc})` : 'Commercial Merchant';
  } else if (!upi?.pa) {
    payeeType = 'UNKNOWN';
    payeeTypeLabel = 'Unknown Payee';
  }

  // Format amount description
  const amountText = amount
    ? `₹${amount} (Fixed deduction)`
    : 'Open Amount (You will be prompted to enter the amount in your UPI app)';

  // Check for Refund / Cashback / Reward Deception
  const lowerNote = note.toLowerCase();
  const lowerName = declaredName.toLowerCase();
  const hasRefundRule = reasons.some((r) => r.ruleId === 'RULE_REFUND_VERIFY_NOTE');
  const isDeceptiveRefund =
    hasRefundRule ||
    lowerNote.includes('refund') ||
    lowerNote.includes('cashback') ||
    lowerNote.includes('reward') ||
    lowerNote.includes('lottery') ||
    lowerNote.includes('prize') ||
    lowerNote.includes('claim') ||
    lowerNote.includes('received') ||
    lowerNote.includes('receive money') ||
    lowerName.includes('refund') ||
    lowerName.includes('cashback');

  if (isDeceptiveRefund) {
    const formattedAmt = amount ? `₹${amount}` : 'money';
    return {
      actionType: 'REFUND_SCAM_TRAP',
      headline: `🚨 DECEPTION TRAP: You are SENDING ${formattedAmt}, NOT receiving money!`,
      plainEnglishAction:
        `This QR code is pretending to be a "refund" or "reward". In UPI, YOU NEVER SCAN A QR CODE OR ENTER YOUR PIN TO RECEIVE MONEY. If you scan this in Google Pay, PhonePe, or Paytm and enter your UPI PIN, ${formattedAmt.toUpperCase()} WILL BE DEDUCTED FROM YOUR BANK ACCOUNT immediately!`,
      financialImpact: amount
        ? `₹${amount} will be DEBITED from your bank account.`
        : 'Money will be DEBITED from your bank account (you will be asked for an amount).',
      deceptionAlert: {
        isDeceptive: true,
        title: 'CRITICAL REFUND / REWARD SCAM PATTERN',
        warningMessage:
          'Fraudsters trick victims by saying "Scan this QR to receive your refund/prize". Entering your UPI PIN ALWAYS authorizes money to LEAVE your bank account. Never enter your PIN to receive money!'
      },
      amountText,
      rawAmount: amount,
      payeeName: declaredName || 'Unverified Individual',
      payeeVpa: vpa,
      payeeType,
      payeeTypeLabel,
      transactionNote: note || undefined,
      totalRisks,
      riskLevel: category,
      riskLevelLabel,
      criticalRisksCount,
      warningRisksCount,
      riskBulletPoints
    };
  }

  // Check for Collect / Debit Pull Request
  if (action === 'collect' || reasons.some((r) => r.ruleId === 'RULE_PULL_PAYMENT')) {
    const formattedAmt = amount ? `₹${amount}` : 'requested amount';
    return {
      actionType: 'COLLECT_REQUEST',
      headline: `⚠️ COLLECT REQUEST: Requester is asking to withdraw ${formattedAmt}`,
      plainEnglishAction:
        `This is a PULL / DEBIT REQUEST. The recipient is requesting ${formattedAmt} from your bank account. Entering your UPI PIN approves the withdrawal and transfers the money to "${declaredName || vpa}".`,
      financialImpact: amount
        ? `₹${amount} will be DEDUCTED from your bank account.`
        : 'Money will be DEDUCTED from your bank account upon PIN confirmation.',
      deceptionAlert: {
        isDeceptive: true,
        title: 'DEBIT COLLECT INITIATIVE',
        warningMessage:
          'This is not a standard payment QR; it initiates a collect request to withdraw funds from your bank. Confirm you owe this debt before entering your PIN.'
      },
      amountText,
      rawAmount: amount,
      payeeName: declaredName || 'Unverified Requester',
      payeeVpa: vpa,
      payeeType,
      payeeTypeLabel,
      transactionNote: note || undefined,
      totalRisks,
      riskLevel: category,
      riskLevelLabel,
      criticalRisksCount,
      warningRisksCount,
      riskBulletPoints
    };
  }

  // Check for AutoPay Mandate
  if (action === 'mandate') {
    const formattedAmt = amount ? `₹${amount}` : 'specified amount';
    return {
      actionType: 'AUTOPAY_MANDATE',
      headline: `📅 AUTOPAY MANDATE: Authorizing recurring automatic deductions`,
      plainEnglishAction:
        `This QR code sets up a RECURRING AUTOPAY SUBSCRIPTION. Entering your UPI PIN authorizes recurring scheduled deductions of ${formattedAmt} from your bank account on an ongoing basis.`,
      financialImpact: `Automatic recurring bank debits will be scheduled for "${declaredName || vpa}".`,
      deceptionAlert: {
        isDeceptive: true,
        title: 'RECURRING PAYMENT MANDATE',
        warningMessage:
          'This is NOT a one-time purchase. It will set up automatic recurring deductions from your bank account. Do not approve unless you intended to buy a subscription.'
      },
      amountText,
      rawAmount: amount,
      payeeName: declaredName || 'Subscription Provider',
      payeeVpa: vpa,
      payeeType,
      payeeTypeLabel,
      transactionNote: note || undefined,
      totalRisks,
      riskLevel: category,
      riskLevelLabel,
      criticalRisksCount,
      warningRisksCount,
      riskBulletPoints
    };
  }

  // Standard UPI / BharatQR Payment
  const payeeDisplayName = declaredName ? `${declaredName} (${vpa})` : vpa;
  const headline = amount
    ? `💸 You are paying ₹${amount} to ${declaredName || vpa}`
    : `💸 You are sending money to ${declaredName || vpa}`;

  const plainEnglishAction = amount
    ? `You are authorizing a one-time payment of ₹${amount} to "${payeeDisplayName}". If you enter your UPI PIN, ₹${amount} will be deducted from your bank account and credited to this recipient.`
    : `You are sending money to "${payeeDisplayName}". The amount is not fixed in the QR code—your UPI app will prompt you to enter how much you want to pay.`;

  const financialImpact = amount
    ? `₹${amount} will be debited from your bank account.`
    : 'The amount you type into your UPI app will be debited from your bank account.';

  return {
    actionType: 'PAYMENT',
    headline,
    plainEnglishAction,
    financialImpact,
    amountText,
    rawAmount: amount,
    payeeName: declaredName || (payeeType === 'COMMERCIAL_STANDEE' ? 'Merchant Standee' : 'Individual Recipient'),
    payeeVpa: vpa,
    payeeType,
    payeeTypeLabel,
    transactionNote: note || undefined,
    totalRisks,
    riskLevel: category,
    riskLevelLabel,
    criticalRisksCount,
    warningRisksCount,
    riskBulletPoints
  };
}
