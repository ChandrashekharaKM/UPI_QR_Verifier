export interface AmountValidationResult {
  readonly hasAmount: boolean;
  readonly isValidNumber: boolean;
  readonly amountValue?: number;
  readonly isCurrencyValid: boolean;
  readonly currencyCode: string;
  readonly isHighAmount: boolean;
  readonly isAboveNpciLimit: boolean;
  readonly isRoundBaitAmount: boolean;
  readonly isMicroAuthAmount: boolean;
}

const NPCI_DEFAULT_PER_TXN_LIMIT = 100000; // Rs 1 Lakh
const HIGH_AMOUNT_THRESHOLD = 25000;      // Rs 25,000
const BAIT_AMOUNTS = new Set([9999, 19999, 24999, 49999, 99999]);

export function validateAmountAndCurrency(
  amountStr?: string,
  currencyStr?: string
): AmountValidationResult {
  const currencyCode = (currencyStr ?? 'INR').trim().toUpperCase();
  const isCurrencyValid = currencyCode === 'INR';

  if (!amountStr || amountStr.trim().length === 0) {
    return {
      hasAmount: false,
      isValidNumber: true,
      isCurrencyValid,
      currencyCode,
      isHighAmount: false,
      isAboveNpciLimit: false,
      isRoundBaitAmount: false,
      isMicroAuthAmount: false
    };
  }

  const cleanAmount = amountStr.trim();
  // Check decimal format: positive number up to 2 decimal places
  const numberRegex = /^\d+(\.\d{1,2})?$/;
  if (!numberRegex.test(cleanAmount)) {
    return {
      hasAmount: true,
      isValidNumber: false,
      isCurrencyValid,
      currencyCode,
      isHighAmount: false,
      isAboveNpciLimit: false,
      isRoundBaitAmount: false,
      isMicroAuthAmount: false
    };
  }

  const value = parseFloat(cleanAmount);
  if (isNaN(value) || value <= 0) {
    return {
      hasAmount: true,
      isValidNumber: false,
      isCurrencyValid,
      currencyCode,
      isHighAmount: false,
      isAboveNpciLimit: false,
      isRoundBaitAmount: false,
      isMicroAuthAmount: false
    };
  }

  const isHighAmount = value >= HIGH_AMOUNT_THRESHOLD;
  const isAboveNpciLimit = value > NPCI_DEFAULT_PER_TXN_LIMIT;
  const isRoundBaitAmount = BAIT_AMOUNTS.has(Math.round(value));
  const isMicroAuthAmount = value > 0 && value <= 5; // Rs 1 - 5 often used in "pay 1 rupee to verify/refund" scams

  return {
    hasAmount: true,
    isValidNumber: true,
    amountValue: value,
    isCurrencyValid,
    currencyCode,
    isHighAmount,
    isAboveNpciLimit,
    isRoundBaitAmount,
    isMicroAuthAmount
  };
}
