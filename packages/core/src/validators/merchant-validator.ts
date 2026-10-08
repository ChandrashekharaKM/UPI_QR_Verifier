export interface MerchantSanityResult {
  readonly hasMerchantCode: boolean;
  readonly isMerchantCodeValidFormat: boolean;
  readonly payeeClaimsBusiness: boolean;
  readonly missingMerchantCodeForBusiness: boolean;
  readonly urgencyKeywordsInName: readonly string[];
  readonly urgencyKeywordsInNote: readonly string[];
}

const BUSINESS_INDICATORS = [
  'pvt ltd',
  'ltd',
  'limited',
  'enterprises',
  'store',
  'shop',
  'mart',
  'restaurant',
  'cafe',
  'hotel',
  'pharmacy',
  'medical',
  'electronics',
  'supermarket',
  'agency',
  'services',
  'traders'
] as const;

const URGENCY_KEYWORDS = [
  'refund',
  'cashback',
  'kyc',
  'prize',
  'lottery',
  'winner',
  'reward',
  'bonus',
  'congratulations',
  'urgent',
  'verify',
  'verification',
  'claim',
  'gift card',
  'free',
  'settlement'
] as const;

export function validateMerchantAndUrgency(
  payeeName?: string,
  merchantCode?: string,
  transactionNote?: string
): MerchantSanityResult {
  const normName = (payeeName ?? '').toLowerCase().trim();
  const normNote = (transactionNote ?? '').toLowerCase().trim();

  // MCC format check: standard ISO 18245 MCC is exactly 4 digits
  const hasMerchantCode = Boolean(merchantCode && merchantCode.trim().length > 0);
  const isMerchantCodeValidFormat = hasMerchantCode
    ? /^\d{4}$/.test(merchantCode?.trim() ?? '')
    : false;

  // Check if name claims business
  const payeeClaimsBusiness = BUSINESS_INDICATORS.some((ind) => normName.includes(ind));

  // Missing MC for business: if name indicates a formal company/store but no MCC is present
  const missingMerchantCodeForBusiness = payeeClaimsBusiness && !hasMerchantCode;

  // Urgency words in name
  const urgencyKeywordsInName = URGENCY_KEYWORDS.filter((word) => normName.includes(word));

  // Urgency words in transaction note
  const urgencyKeywordsInNote = URGENCY_KEYWORDS.filter((word) => normNote.includes(word));

  return {
    hasMerchantCode,
    isMerchantCodeValidFormat,
    payeeClaimsBusiness,
    missingMerchantCodeForBusiness,
    urgencyKeywordsInName,
    urgencyKeywordsInNote
  };
}
