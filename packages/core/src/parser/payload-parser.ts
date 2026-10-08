import type { ParsedPayload, ParsedFields } from '../types/payload.js';
import { parseUpiPayload } from './upi-parser.js';
import { parseUrlPayload } from './url-parser.js';

export const MAX_REASONABLE_PAYLOAD_LENGTH = 512;

/**
 * Universal payload parser: parses any QR code content into a strongly typed ParsedPayload.
 */
export function parsePayload(rawInput: string): ParsedPayload {
  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();
  const warnings: string[] = [];

  const payloadLength = trimmed.length;
  if (payloadLength > MAX_REASONABLE_PAYLOAD_LENGTH) {
    warnings.push(`Oversized QR payload (${payloadLength} characters, typical limit is ${MAX_REASONABLE_PAYLOAD_LENGTH})`);
  }

  // 1. UPI Payment URI
  if (lower.startsWith('upi://pay')) {
    const upiResult = parseUpiPayload(trimmed);
    warnings.push(...upiResult.warnings);

    if (upiResult.success && upiResult.fields) {
      const fields: ParsedFields = {
        kind: 'upi',
        upi: upiResult.fields
      };

      return {
        kind: 'upi',
        rawPayload: trimmed,
        fields,
        parseWarnings: warnings,
        hasDuplicateParams: upiResult.hasDuplicates,
        payloadLength
      };
    }
  }

  // 2. HTTP / HTTPS URL
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    const urlResult = parseUrlPayload(trimmed);
    warnings.push(...urlResult.warnings);

    if (urlResult.success && urlResult.fields) {
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
        payloadLength
      };
    }
  }

  // 3. Other schemes or plain text
  let detectedScheme: string | undefined;
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0 && colonIndex < 15) {
    const potentialScheme = trimmed.slice(0, colonIndex + 1).toLowerCase();
    if (['wifi:', 'mailto:', 'tel:', 'intent:', 'sms:', 'geo:', 'market:'].includes(potentialScheme)) {
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
    payloadLength
  };
}
