import pspAllowlistData from './psp-allowlist.json' with { type: 'json' };
import { analyzeStringComposition } from './entropy.js';
import { inspectUnicodeSafety } from './unicode-validator.js';

export interface VpaValidationResult {
  readonly isValidSyntax: boolean;
  readonly localPart: string;
  readonly pspHandle: string;
  readonly isKnownPsp: boolean;
  readonly isPhoneVpa: boolean;
  readonly excessiveDigits: boolean;
  readonly highEntropy: boolean;
  readonly impersonationKeywords: readonly string[];
}

const KNOWN_PSP_SET = new Set(pspAllowlistData.handles.map((h: string) => h.toLowerCase()));

// Common high-risk impersonation keywords targeting Indian banking/digital payments
const IMPERSONATION_TARGETS = [
  'support',
  'customercare',
  'customer-care',
  'customer.care',
  'helpline',
  'helpdesk',
  'tollfree',
  'refund',
  'cashback',
  'kyc',
  'kycupdate',
  'kyc-update',
  'kyc.update',
  'verification',
  'verify',
  'lottery',
  'reward',
  'bonus',
  'prize',
  'winner',
  'gift',
  'claim',
  'settlement',
  'rbi',
  'npci',
  'income.tax',
  'incometax',
  'challan',
  'echallan',
  'e-challan',
  'parivahan',
  'trafficpolice',
  'traffic',
  'bescom',
  'mahavitaran',
  'uppcl',
  'tneb',
  'electricity',
  'discom',
  'fastag',
  'indiapost',
  'speedpost',
  'postoffice',
  'fedex',
  'dtdc',
  'bluedart',
  'gov.in'
] as const;

function matchesImpersonationKeyword(text: string, keyword: string): boolean {
  // For short acronyms (<= 3 chars, e.g. 'rbi'), require delimiter or word boundaries
  // so substrings inside common words (e.g. 'inorbit') do not trigger false positives
  if (keyword.length <= 3) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[._\\-])${escaped}([._\\-]|$)`, 'i');
    return regex.test(text);
  }
  return text.includes(keyword);
}

// Bank/brand names frequently impersonated in scams
const IMPERSONATED_BRANDS = [
  'sbi',
  'hdfc',
  'icici',
  'axis',
  'paytm',
  'phonepe',
  'gpay',
  'googlepay',
  'bhim',
  'amazonpay',
  'airtel',
  'jio'
] as const;

/**
 * Validates a UPI Virtual Payment Address (VPA) / UPI ID.
 * Hardened against zero-width characters, bidirectional overrides, and Unicode homoglyphs.
 */
export function validateVpa(vpa: string): VpaValidationResult {
  const unicodeCheck = inspectUnicodeSafety(vpa);
  const cleanVpa = unicodeCheck.sanitized.trim().toLowerCase();
  const normalizedVpa = unicodeCheck.normalizedAscii.trim().toLowerCase();

  const atIndex = cleanVpa.indexOf('@');
  if (atIndex <= 0 || atIndex === cleanVpa.length - 1 || cleanVpa.indexOf('@', atIndex + 1) !== -1) {
    return {
      isValidSyntax: false,
      localPart: '',
      pspHandle: '',
      isKnownPsp: false,
      isPhoneVpa: false,
      excessiveDigits: false,
      highEntropy: false,
      impersonationKeywords: []
    };
  }

  const localPart = cleanVpa.slice(0, atIndex);
  const pspHandle = cleanVpa.slice(atIndex + 1);

  const normalizedAtIndex = normalizedVpa.indexOf('@');
  const normalizedLocalPart = normalizedAtIndex !== -1 ? normalizedVpa.slice(0, normalizedAtIndex) : localPart;

  // VPA local part should follow valid UPI characters (alphanumeric, dot, hyphen, underscore) and have no hidden Unicode
  const isValidLocal = /^[a-z0-9._-]+$/.test(localPart);
  const isValidHandle = /^[a-z0-9]+$/.test(pspHandle);
  const isValidSyntax = isValidLocal && isValidHandle && !unicodeCheck.hasHiddenUnicode;

  const isKnownPsp = KNOWN_PSP_SET.has(pspHandle);

  // Check if local part is a 10-digit Indian phone number (standard legitimate VPA)
  const isPhoneVpa = /^[6-9]\d{9}$/.test(localPart);

  // Analyze entropy and digits
  const comp = analyzeStringComposition(localPart);
  // Excessive digits: >12 digits or >70% digits when not a 10-digit phone number
  const excessiveDigits = !isPhoneVpa && (comp.digitCount > 10 || (comp.length > 8 && comp.digitRatio > 0.65));

  // High entropy check: > 3.4 for strings of length >= 8 indicates random machine-generated usernames
  const highEntropy = comp.length >= 8 && comp.entropy >= 3.4;

  // Impersonation detection (checks both raw and homoglyph-normalized representation)
  const matchedImpersonations: string[] = [];

  for (const keyword of IMPERSONATION_TARGETS) {
    if (
      matchesImpersonationKeyword(localPart, keyword) ||
      matchesImpersonationKeyword(normalizedLocalPart, keyword)
    ) {
      matchedImpersonations.push(keyword);
    }
  }

  // Check compound brand + service impersonation (e.g. sbi-refund, paytm_support, hdfc.kyc)
  for (const brand of IMPERSONATED_BRANDS) {
    for (const service of ['care', 'help', 'support', 'refund', 'kyc', 'desk', 'service', 'alert']) {
      const compound = `${brand}${service}`;
      const dotted = `${brand}.${service}`;
      const hyphen = `${brand}-${service}`;
      const under = `${brand}_${service}`;
      if (
        (localPart.includes(compound) ||
          localPart.includes(dotted) ||
          localPart.includes(hyphen) ||
          localPart.includes(under) ||
          normalizedLocalPart.includes(compound) ||
          normalizedLocalPart.includes(dotted) ||
          normalizedLocalPart.includes(hyphen) ||
          normalizedLocalPart.includes(under)) &&
        !matchedImpersonations.includes(`${brand}.${service}`)
      ) {
        matchedImpersonations.push(`${brand}.${service}`);
      }
    }
  }

  return {
    isValidSyntax,
    localPart,
    pspHandle,
    isKnownPsp,
    isPhoneVpa,
    excessiveDigits,
    highEntropy,
    impersonationKeywords: matchedImpersonations
  };
}

/**
 * Returns whether a given handle string is recognized in NPCI's official list.
 */
export function isKnownPspHandle(handle: string): boolean {
  return KNOWN_PSP_SET.has(handle.trim().toLowerCase());
}

/**
 * Exposes the full read-only allowlist of handles.
 */
export function getKnownPspHandles(): readonly string[] {
  return pspAllowlistData.handles;
}
