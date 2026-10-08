import type { UpiFields } from '../types/payload.js';

export interface UpiParseResult {
  readonly success: boolean;
  readonly fields?: UpiFields;
  readonly warnings: readonly string[];
  readonly hasDuplicates: boolean;
  readonly duplicateKeys: readonly string[];
}

const KNOWN_UPI_STANDARD_PARAMS = new Set([
  'pa',
  'pn',
  'am',
  'cu',
  'mc',
  'tr',
  'tn',
  'url',
  'mode',
  'sign',
  'orgid',
  'mid',
  'msid',
  'mtid'
]);

/**
 * Parses UPI URI payload strings according to NPCI specifications.
 * Handles url-encoding, case variations, duplicate parameters, and extra params.
 */
export function parseUpiPayload(rawPayload: string): UpiParseResult {
  const warnings: string[] = [];
  const trimmed = rawPayload.trim();

  // Case-insensitive scheme check
  if (!trimmed.toLowerCase().startsWith('upi://pay')) {
    return {
      success: false,
      warnings: ['Payload does not start with upi://pay scheme'],
      hasDuplicates: false,
      duplicateKeys: []
    };
  }

  // Extract query string
  const queryIndex = trimmed.indexOf('?');
  if (queryIndex === -1 || queryIndex === trimmed.length - 1) {
    return {
      success: false,
      warnings: ['UPI URI is missing query parameters (no "?" delimiter or empty query)'],
      hasDuplicates: false,
      duplicateKeys: []
    };
  }

  const queryString = trimmed.slice(queryIndex + 1);
  const pairs = queryString.split('&');

  const paramMap = new Map<string, string>();
  const duplicateKeysSet = new Set<string>();
  const extraParams: Record<string, string> = {};

  for (const pair of pairs) {
    if (!pair) continue;
    const eqIndex = pair.indexOf('=');
    const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const rawVal = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);

    const key = decodeURIComponentSafe(rawKey).trim().toLowerCase();
    const val = decodeURIComponentSafe(rawVal).trim();

    if (paramMap.has(key)) {
      duplicateKeysSet.add(key);
      warnings.push(`Duplicate parameter detected: "${key}"`);
    } else {
      paramMap.set(key, val);
    }
  }

  const pa = paramMap.get('pa');
  if (!pa || pa.trim().length === 0) {
    warnings.push('Mandatory payee address parameter "pa" is missing or empty');
    return {
      success: false,
      warnings,
      hasDuplicates: duplicateKeysSet.size > 0,
      duplicateKeys: Array.from(duplicateKeysSet)
    };
  }

  // Extract known standard fields
  const pn = paramMap.get('pn');
  const am = paramMap.get('am');
  const cu = paramMap.get('cu') ?? 'INR';
  const mc = paramMap.get('mc');
  const tr = paramMap.get('tr');
  const tn = paramMap.get('tn');
  const url = paramMap.get('url');
  const mode = paramMap.get('mode');
  const sign = paramMap.get('sign');
  const orgid = paramMap.get('orgid');
  const mid = paramMap.get('mid');
  const msid = paramMap.get('msid');
  const mtid = paramMap.get('mtid');

  // Identify extra/unknown parameters
  for (const [key, value] of paramMap.entries()) {
    if (!KNOWN_UPI_STANDARD_PARAMS.has(key)) {
      extraParams[key] = value;
      warnings.push(`Unknown/non-standard UPI parameter detected: "${key}"`);
    }
  }

  const duplicateKeys = Array.from(duplicateKeysSet);

  const fields: UpiFields = {
    pa,
    ...(pn ? { pn } : {}),
    ...(am ? { am } : {}),
    ...(cu ? { cu } : {}),
    ...(mc ? { mc } : {}),
    ...(tr ? { tr } : {}),
    ...(tn ? { tn } : {}),
    ...(url ? { url } : {}),
    ...(mode ? { mode } : {}),
    ...(sign ? { sign } : {}),
    ...(orgid ? { orgid } : {}),
    ...(mid ? { mid } : {}),
    ...(msid ? { msid } : {}),
    ...(mtid ? { mtid } : {}),
    extraParams,
    duplicateKeys
  };

  return {
    success: true,
    fields,
    warnings,
    hasDuplicates: duplicateKeys.length > 0,
    duplicateKeys
  };
}

function decodeURIComponentSafe(val: string): string {
  try {
    return decodeURIComponent(val.replace(/\+/g, ' '));
  } catch {
    return val;
  }
}
