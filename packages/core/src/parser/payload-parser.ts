import type { ParsedPayload, ParsedFields } from '../types/payload.js';
import { isUpiDeepLink, parseUpiDeepLink } from './deeplink-parser.js';
import { parseUrlPayload } from './url-parser.js';
import { isEmvPayload, parseEmvPayload } from './emv-parser.js';

export const MAX_REASONABLE_PAYLOAD_LENGTH = 512;

export const UTILITY_SCHEMES = new Set(['wifi:', 'mailto:', 'tel:', 'sms:', 'geo:', 'market:']);

/**
 * Checks whether the parsed payload represents a known benign non-payment utility scheme (wifi, mailto, tel, etc.)
 */
export function isUtilityNonPaymentScheme(parsed: ParsedPayload): boolean {
  if (parsed.kind === 'other') {
    const rawLower = parsed.rawPayload.trim().toLowerCase();
    for (const scheme of UTILITY_SCHEMES) {
      if (rawLower.startsWith(scheme)) return true;
    }
    if (parsed.fields.kind === 'other' && parsed.fields.other.detectedScheme) {
      return UTILITY_SCHEMES.has(parsed.fields.other.detectedScheme.toLowerCase());
    }
  }
  return false;
}

/**
 * Universal payload parser: parses any QR code content into a strongly typed ParsedPayload.
 * Supports:
 * 1. BharatQR / EMVCo Merchant-Presented QR codes (000201...) from counter standees & stickers
 * 2. Deep links: upi://pay, upi://collect, upi://mandate, phonepe://, paytmmp://, tez://, gpay://, bhim://, intent://
 * 3. Web URLs with embedded UPI intents (phon.pe/pay?pa=..., etc.) or standalone payment landing pages
 * 4. Other schemes (wifi, tel, mailto, etc.)
 */
export function parsePayload(rawInput: string): ParsedPayload {
  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();
  const warnings: string[] = [];

  const payloadLength = trimmed.length;
  if (payloadLength > MAX_REASONABLE_PAYLOAD_LENGTH) {
    warnings.push(`Oversized QR payload (${payloadLength} characters, typical limit is ${MAX_REASONABLE_PAYLOAD_LENGTH})`);
  }

  // 1. BharatQR / EMVCo Merchant-Presented Standee QR Code (starts with 000201)
  if (isEmvPayload(trimmed)) {
    const emvResult = parseEmvPayload(trimmed);
    warnings.push(...emvResult.warnings);

    if (emvResult.success && emvResult.fields && emvResult.upiFields) {
      const fields: ParsedFields = {
        kind: 'emv',
        emv: emvResult.fields,
        upi: emvResult.upiFields
      };

      return {
        kind: 'emv',
        rawPayload: trimmed,
        fields,
        parseWarnings: warnings,
        hasDuplicateParams: false,
        payloadLength,
        originalScheme: 'emv'
      };
    }
  }

  // 2. UPI Deep Links (upi://pay, upi://collect, upi://mandate, phonepe://, paytmmp://, tez://, gpay://, bhim://, intent://...)
  if (isUpiDeepLink(trimmed)) {
    const deepResult = parseUpiDeepLink(trimmed);
    warnings.push(...deepResult.warnings);

    if (deepResult.success && deepResult.fields) {
      const fields: ParsedFields = {
        kind: 'upi',
        upi: deepResult.fields
      };

      return {
        kind: 'upi',
        rawPayload: trimmed,
        fields,
        parseWarnings: warnings,
        hasDuplicateParams: deepResult.hasDuplicates,
        payloadLength,
        originalScheme: deepResult.originalScheme
      };
    }

    // Deep link matched but failed mandatory validation (e.g. missing pa parameter)
    const fields: ParsedFields = {
      kind: 'other',
      other: {
        raw: trimmed,
        detectedScheme: deepResult.originalScheme
      }
    };

    return {
      kind: 'other',
      rawPayload: trimmed,
      fields,
      parseWarnings: warnings,
      hasDuplicateParams: deepResult.hasDuplicates,
      payloadLength,
      originalScheme: deepResult.originalScheme
    };
  }

  // 3. HTTP / HTTPS URL
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    const urlResult = parseUrlPayload(trimmed);
    warnings.push(...urlResult.warnings);

    if (urlResult.success && urlResult.fields) {
      // Check if this web URL encapsulates an official UPI payment intent in query params (e.g. phon.pe/pay?pa=...)
      if (trimmed.includes('?pa=') || trimmed.includes('&pa=')) {
        const questionIdx = trimmed.indexOf('?');
        const queryPart = trimmed.slice(questionIdx + 1);
        const embeddedUpi = parseUpiDeepLink(`upi://pay?${queryPart}`);
        if (embeddedUpi.success && embeddedUpi.fields) {
          const fields: ParsedFields = {
            kind: 'upi',
            upi: {
              ...embeddedUpi.fields,
              url: trimmed,
              originalScheme: lower.startsWith('https://') ? 'https://' : 'http://'
            }
          };
          return {
            kind: 'upi',
            rawPayload: trimmed,
            fields,
            parseWarnings: warnings,
            hasDuplicateParams: embeddedUpi.hasDuplicates,
            payloadLength,
            originalScheme: lower.startsWith('https://') ? 'https://' : 'http://'
          };
        }
      }

      const fields: ParsedFields = {
        kind: 'url',
        url: urlResult.fields
      };

      return {
        kind: 'url',
        rawPayload: trimmed,
        fields,
        parseWarnings: warnings,
        hasDuplicateParams: false,
        payloadLength,
        originalScheme: urlResult.fields.protocol
      };
    }
  }

  // 4. Other schemes or plain text
  let detectedScheme: string | undefined;
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0 && colonIndex < 15) {
    const potentialScheme = trimmed.slice(0, colonIndex + 1).toLowerCase();
    if (['wifi:', 'mailto:', 'tel:', 'sms:', 'geo:', 'market:'].includes(potentialScheme)) {
      detectedScheme = potentialScheme;
      warnings.push(`Non-payment URI scheme detected: "${detectedScheme}"`);
    }
  }

  if (!detectedScheme) {
    warnings.push('QR code does not contain a recognized UPI payment URI');
  }

  const fields: ParsedFields = {
    kind: 'other',
    other: {
      raw: trimmed,
      ...(detectedScheme ? { detectedScheme } : {})
    }
  };

  return {
    kind: 'other',
    rawPayload: trimmed,
    fields,
    parseWarnings: warnings,
    hasDuplicateParams: false,
    payloadLength,
    ...(detectedScheme ? { originalScheme: detectedScheme } : {})
  };
}
