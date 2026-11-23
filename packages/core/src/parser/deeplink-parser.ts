import type { UpiFields } from '../types/payload.js';
import { inspectUnicodeSafety } from '../validators/unicode-validator.js';

export interface DeepLinkParseResult {
  readonly success: boolean;
  readonly isDeepLink: boolean;
  readonly originalScheme: string;
  readonly action: string;
  readonly fields?: UpiFields;
  readonly warnings: readonly string[];
  readonly hasDuplicates: boolean;
  readonly duplicateKeys: readonly string[];
}

export const KNOWN_UPI_STANDARD_PARAMS = new Set([
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
  'mtid',
  'tid',
  'purpose',
  'ver'
]);

/**
 * Safely decodes a single percent-encoded string.
 * Gracefully preserves malformed percent escapes (e.g. %ZZ, lone % at end) without throwing URIError.
 */
function safeSinglePassDecode(input: string): string {
  const withSpaces = input.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    // If malformed (e.g. %ZZ or lone % at end), escape invalid '%' as '%25' and retry
    const sanitized = withSpaces.replace(/%(?![0-9a-fA-F]{2})/g, '%25');
    try {
      return decodeURIComponent(sanitized);
    } catch {
      // Chunk-by-chunk fallback
      let out = '';
      let i = 0;
      while (i < withSpaces.length) {
        if (withSpaces[i] === '%') {
          const hex = withSpaces.slice(i + 1, i + 3);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            try {
              out += decodeURIComponent(`%${hex}`);
              i += 3;
              continue;
            } catch {
              // Ignore chunk failure and append character
            }
          }
        }
        out += withSpaces[i];
        i++;
      }
      return out;
    }
  }
}

/**
 * Multi-pass robust URL decoder.
 * Resolves double-encoding (e.g. %2540 -> %40 -> @) and edge cases while tracking obfuscation attempts.
 */
export function robustDecodeURIComponent(input: string): {
  decoded: string;
  wasDoubleEncoded: boolean;
} {
  let current = input;
  let wasDoubleEncoded = false;

  // Pass 1
  const pass1 = safeSinglePassDecode(current);
  current = pass1;

  // Pass 2: check if percent escapes remain or were newly formed
  if (/%[0-9a-fA-F]{2}/.test(current)) {
    const pass2 = safeSinglePassDecode(current);
    if (pass2 !== current) {
      wasDoubleEncoded = true;
      current = pass2;

      // Pass 3 (catch triple-encoded vectors)
      if (/%[0-9a-fA-F]{2}/.test(current)) {
        const pass3 = safeSinglePassDecode(current);
        if (pass3 !== current) {
          current = pass3;
        }
      }
    }
  }

  return { decoded: current, wasDoubleEncoded };
}

/**
 * Backward-compatible helper for safe decoding.
 */
export function decodeURIComponentSafe(val: string): string {
  return robustDecodeURIComponent(val).decoded;
}

/**
 * Checks whether the input string is a recognized UPI payment deep link scheme or Android intent.
 * Matches case-insensitively (e.g. UPI://, Tez://, InTeNt://).
 */
export function isUpiDeepLink(raw: string): boolean {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // 1. Android Intent with UPI scheme or payload
  if (lower.startsWith('intent://')) {
    return (
      lower.includes('scheme=upi') ||
      lower.includes('scheme=tez') ||
      lower.includes('package=in.org.npci') ||
      lower.includes('?pa=') ||
      lower.includes('&pa=')
    );
  }

  // 2. Official UPI schemes (upi://pay, upi://collect, upi://mandate, etc.)
  if (lower.startsWith('upi://')) {
    return true;
  }

  // 3. App-specific custom UPI schemes
  const customPrefixes = [
    'phonepe://',
    'paytmmp://',
    'paytm://',
    'tez://',
    'gpay://',
    'bhim://',
    'cred://',
    'mobikwik://',
    'amazonpay://'
  ];

  return customPrefixes.some((prefix) => lower.startsWith(prefix));
}

/**
 * Parses query string into canonical UpiFields, extracting parameters and recording warnings.
 * Handles double-encoding, percent-decoding edge cases, and invisible / homoglyph characters.
 */
export function parseQueryStringToUpiFields(
  queryString: string,
  meta: { originalScheme: string; action: string }
): {
  success: boolean;
  fields?: UpiFields;
  warnings: string[];
  hasDuplicates: boolean;
  duplicateKeys: string[];
} {
  const warnings: string[] = [];
  const pairs = queryString.split('&');

  const paramMap = new Map<string, string>();
  const duplicateKeysSet = new Set<string>();
  const extraParams: Record<string, string> = {};

  for (const pair of pairs) {
    if (!pair) continue;
    const eqIndex = pair.indexOf('=');
    const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const rawVal = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);

    const { decoded: key } = robustDecodeURIComponent(rawKey);
    const { decoded: val, wasDoubleEncoded } = robustDecodeURIComponent(rawVal);
    const cleanKey = key.trim().toLowerCase();
    const cleanVal = val.trim();

    if (wasDoubleEncoded) {
      warnings.push(`Double URL-encoding detected in parameter "${cleanKey}" (obfuscation attempt)`);
    }

    const unicodeCheck = inspectUnicodeSafety(cleanVal);
    if (unicodeCheck.hasHiddenUnicode) {
      if (unicodeCheck.hasZeroWidth) {
        warnings.push(
          `Suspicious invisible or bidirectional control characters detected in parameter "${cleanKey}" (${unicodeCheck.zeroWidthFound.join(', ')})`
        );
      }
      if (unicodeCheck.hasHomoglyphs) {
        const homos = unicodeCheck.homoglyphsFound
          .map((h) => `'${h.char}' (${h.codePoint} -> '${h.replacement}')`)
          .join(', ');
        warnings.push(`Deceptive Unicode homoglyphs detected in parameter "${cleanKey}": ${homos}`);
      }
    }

    if (paramMap.has(cleanKey)) {
      duplicateKeysSet.add(cleanKey);
      warnings.push(`Duplicate parameter detected: "${cleanKey}"`);
    } else {
      paramMap.set(cleanKey, cleanVal);
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
  const tid = paramMap.get('tid');
  const purpose = paramMap.get('purpose');
  const ver = paramMap.get('ver');

  // Identify non-standard extra parameters
  for (const [key, value] of paramMap.entries()) {
    if (!KNOWN_UPI_STANDARD_PARAMS.has(key)) {
      extraParams[key] = value;
      warnings.push(`Unknown/non-standard UPI parameter detected: "${key}"`);
    }
  }

  const duplicateKeys = Array.from(duplicateKeysSet);

  const fields: UpiFields = {
    source: 'upi',
    originalScheme: meta.originalScheme,
    action: meta.action,
    pa,
    ...(pn ? { pn } : {}),
    ...(am ? { am } : {}),
    cu,
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
    ...(tid ? { tid } : {}),
    ...(purpose ? { purpose } : {}),
    ...(ver ? { ver } : {}),
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

/**
 * Normalises any deep-link (upi://pay, upi://collect, upi://mandate, phonepe://, paytmmp://,
 * tez://, gpay://, bhim://, intent://...) to canonical UpiFields while remembering originalScheme.
 */
export function parseUpiDeepLink(rawPayload: string): DeepLinkParseResult {
  const trimmed = rawPayload.trim();
  const lower = trimmed.toLowerCase();

  // 1. Android Intent URLs (intent://...#Intent;scheme=upi;...)
  if (lower.startsWith('intent://')) {
    const hashIdx = trimmed.indexOf('#');
    const uriBeforeHash = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
    const questionIdx = uriBeforeHash.indexOf('?');

    const schemeAndPath = questionIdx !== -1 ? uriBeforeHash.slice(0, questionIdx) : uriBeforeHash;
    const queryString = questionIdx !== -1 ? uriBeforeHash.slice(questionIdx + 1) : '';

    let action = 'pay';
    const lowerPath = schemeAndPath.toLowerCase();
    if (lowerPath.includes('collect')) {
      action = 'collect';
    } else if (lowerPath.includes('mandate')) {
      action = 'mandate';
    }

    const originalScheme = schemeAndPath;

    if (!queryString || queryString.trim().length === 0) {
      return {
        success: false,
        isDeepLink: true,
        originalScheme,
        action,
        warnings: ['Android Intent URI is missing query parameters (empty query string)'],
        hasDuplicates: false,
        duplicateKeys: []
      };
    }

    const queryRes = parseQueryStringToUpiFields(queryString, { originalScheme, action });
    return {
      success: queryRes.success,
      isDeepLink: true,
      originalScheme,
      action,
      fields: queryRes.fields,
      warnings: queryRes.warnings,
      hasDuplicates: queryRes.hasDuplicates,
      duplicateKeys: queryRes.duplicateKeys
    };
  }

  // 2. Custom app and standard UPI deep-links (upi://, phonepe://, tez://, gpay://, etc.)
  const questionIdx = trimmed.indexOf('?');
  if (questionIdx === -1 || questionIdx === trimmed.length - 1) {
    const originalScheme = questionIdx !== -1 ? trimmed.slice(0, questionIdx) : trimmed;
    return {
      success: false,
      isDeepLink: true,
      originalScheme,
      action: 'unknown',
      warnings: ['Deep link URI is missing query parameters (no "?" delimiter or empty query)'],
      hasDuplicates: false,
      duplicateKeys: []
    };
  }

  const schemeAndPath = trimmed.slice(0, questionIdx);
  const queryString = trimmed.slice(questionIdx + 1);
  const lowerScheme = schemeAndPath.toLowerCase();

  let action = 'pay';
  if (lowerScheme.includes('collect')) {
    action = 'collect';
  } else if (lowerScheme.includes('mandate')) {
    action = 'mandate';
  }

  const queryRes = parseQueryStringToUpiFields(queryString, {
    originalScheme: schemeAndPath,
    action
  });

  return {
    success: queryRes.success,
    isDeepLink: true,
    originalScheme: schemeAndPath,
    action,
    fields: queryRes.fields,
    warnings: queryRes.warnings,
    hasDuplicates: queryRes.hasDuplicates,
    duplicateKeys: queryRes.duplicateKeys
  };
}
