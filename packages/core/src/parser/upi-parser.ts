import type { UpiFields } from '../types/payload.js';
import {
  isUpiDeepLink,
  parseUpiDeepLink,
  KNOWN_UPI_STANDARD_PARAMS,
  decodeURIComponentSafe
} from './deeplink-parser.js';

export interface UpiParseResult {
  readonly success: boolean;
  readonly fields?: UpiFields;
  readonly warnings: readonly string[];
  readonly hasDuplicates: boolean;
  readonly duplicateKeys: readonly string[];
}

export { KNOWN_UPI_STANDARD_PARAMS, decodeURIComponentSafe };

/**
 * Parses UPI URI payload strings according to NPCI specifications.
 * Handles url-encoding, case variations, duplicate parameters, extra params,
 * and deep-link schemes (upi://pay, upi://collect, upi://mandate, phonepe://, tez://, etc.).
 */
export function parseUpiPayload(rawPayload: string): UpiParseResult {
  const trimmed = rawPayload.trim();

  if (isUpiDeepLink(trimmed)) {
    const deepResult = parseUpiDeepLink(trimmed);
    return {
      success: deepResult.success,
      fields: deepResult.fields,
      warnings: deepResult.warnings,
      hasDuplicates: deepResult.hasDuplicates,
      duplicateKeys: deepResult.duplicateKeys
    };
  }

  // Case-insensitive scheme check
  if (!trimmed.toLowerCase().startsWith('upi://')) {
    return {
      success: false,
      warnings: ['Payload does not start with upi:// scheme'],
      hasDuplicates: false,
      duplicateKeys: []
    };
  }

  const deepResult = parseUpiDeepLink(trimmed);
  return {
    success: deepResult.success,
    fields: deepResult.fields,
    warnings: deepResult.warnings,
    hasDuplicates: deepResult.hasDuplicates,
    duplicateKeys: deepResult.duplicateKeys
  };
}
