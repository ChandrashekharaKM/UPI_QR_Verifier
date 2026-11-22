import type { UpiFields, EmvFields } from '../types/payload.js';

export interface EmvParseResult {
  readonly success: boolean;
  readonly fields?: EmvFields;
  readonly upiFields?: UpiFields;
  readonly warnings: readonly string[];
  readonly hasBadCrc: boolean;
}

/**
 * Parses TLV string into a key-value Map (2-digit tag, 2-digit length, value).
 * Handles both top-level and nested template strings.
 */
export function parseTLVString(str: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i + 4 <= str.length) {
    const tag = str.slice(i, i + 2);
    const lenStr = str.slice(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (isNaN(len) || len < 0) break;
    i += 4;
    if (i + len > str.length) break;
    const val = str.slice(i, i + len);
    map.set(tag, val);
    i += len;
  }
  return map;
}

/**
 * Calculates standard EMVCo CRC-16/CCITT-FALSE checksum.
 * Polynomial: 0x1021, Initial value: 0xFFFF, No reflection, Final XOR: 0x0000.
 */
export function calculateCrc16CcittFalse(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Checks whether the raw string matches EMVCo Merchant QR format (starts with 000201).
 */
export function isEmvPayload(raw: string): boolean {
  return raw.trim().startsWith('000201');
}

const NPCI_GUID_IDENTIFIERS = [
  'a000000524',
  'upi',
  'in.org.npci',
  'org.npci.upi',
  'com.npci.upi',
  'bharatpe'
];

/**
 * Parses EMVCo / BharatQR payload into typed EmvFields and normalised UpiFields (source: 'emv').
 */
export function parseEmvPayload(rawPayload: string): EmvParseResult {
  const trimmed = rawPayload.trim();
  const warnings: string[] = [];

  if (!isEmvPayload(trimmed)) {
    return {
      success: false,
      warnings: ['Payload does not start with EMVCo indicator (000201)'],
      hasBadCrc: false
    };
  }

  const tlvMap = parseTLVString(trimmed);

  // 1. Validate CRC-16/CCITT-FALSE checksum in tag 63 over payload up to and including "6304"
  const tag63Index = trimmed.lastIndexOf('6304');
  let isValidCrc = false;
  let declaredCrc: string | undefined;
  let calculatedCrc: string | undefined;

  if (tag63Index !== -1 && tag63Index + 8 <= trimmed.length) {
    const dataForCrc = trimmed.slice(0, tag63Index + 4);
    declaredCrc = trimmed.slice(tag63Index + 4, tag63Index + 8).toUpperCase();
    calculatedCrc = calculateCrc16CcittFalse(dataForCrc);
    isValidCrc = declaredCrc === calculatedCrc;
    if (!isValidCrc) {
      warnings.push(`EMVCo CRC checksum mismatch: declared "${declaredCrc}", calculated "${calculatedCrc}"`);
    }
  } else {
    warnings.push('EMVCo payload is missing mandatory 4-character CRC-16 checksum in tag 63');
  }

  // 2. Point of initiation method: 11 = static (printed standee), 12 = dynamic (POS terminal/screen)
  const poi = tlvMap.get('01');
  const pointOfInitiation: 'static' | 'dynamic' | undefined =
    poi === '11' ? 'static' : poi === '12' ? 'dynamic' : undefined;
  const mode = poi === '11' ? '01' : poi === '12' ? '02' : undefined;

  // 3. Extract VPA from merchant account templates (Tags 26 to 51)
  let pa: string | undefined;
  let trFromAccount: string | undefined;
  let urlFromAccount: string | undefined;

  for (let tagNum = 26; tagNum <= 51; tagNum++) {
    const tagKey = tagNum.toString().padStart(2, '0');
    const tagVal = tlvMap.get(tagKey);
    if (!tagVal) continue;

    const subMap = parseTLVString(tagVal);
    const sub00 = (subMap.get('00') ?? '').toLowerCase().trim();
    const sub01 = subMap.get('01')?.trim();

    const matchesGuid = NPCI_GUID_IDENTIFIERS.some((id) => sub00.includes(id));
    const hasVpaFormat = sub01 ? sub01.includes('@') : false;

    if (matchesGuid || hasVpaFormat) {
      if (sub01 && sub01.length > 0) {
        pa = sub01.toLowerCase();
        trFromAccount = subMap.get('02'); // min amount or ref
        urlFromAccount = subMap.get('03') ?? subMap.get('04'); // ref url
        break;
      } else {
        for (const [subKey, subVal] of subMap.entries()) {
          if (subKey !== '00' && subVal.includes('@')) {
            pa = subVal.trim().toLowerCase();
            break;
          }
        }
        if (pa) {
          trFromAccount = subMap.get('02');
          urlFromAccount = subMap.get('03') ?? subMap.get('04');
          break;
        }
      }
    }
  }

  // Fallback scan: check all tags 26-51 for any VPA format if not yet found
  if (!pa) {
    for (let tagNum = 26; tagNum <= 51; tagNum++) {
      const tagKey = tagNum.toString().padStart(2, '0');
      const tagVal = tlvMap.get(tagKey);
      if (!tagVal) continue;

      const subMap = parseTLVString(tagVal);
      for (const [subKey, subVal] of subMap.entries()) {
        if (subKey !== '00' && subVal.includes('@') && !subVal.includes(' ')) {
          pa = subVal.trim().toLowerCase();
          trFromAccount = subMap.get('02');
          urlFromAccount = subMap.get('03') ?? subMap.get('04');
          break;
        }
      }
      if (pa) break;
    }
  }

  if (!pa) {
    warnings.push('EMVCo/BharatQR payload missing valid NPCI merchant UPI account template (Tags 26-51)');
    return {
      success: false,
      hasBadCrc: !isValidCrc,
      warnings
    };
  }

  // 4. Standard EMV Tags
  const mc = tlvMap.get('52')?.trim(); // Tag 52: MCC
  const rawCurrency = tlvMap.get('53')?.trim(); // Tag 53: Currency (356 for INR)
  const cu = rawCurrency === '356' ? 'INR' : (rawCurrency ?? 'INR');
  const am = tlvMap.get('54')?.trim(); // Tag 54: Amount
  const tipIndicator = tlvMap.get('55')?.trim(); // Tag 55: Tip indicator
  const tipValueFixed = tlvMap.get('56')?.trim(); // Tag 56: Tip fixed value
  const tipValuePercentage = tlvMap.get('57')?.trim(); // Tag 57: Tip percentage
  const pn = tlvMap.get('59')?.trim(); // Tag 59: Merchant Name
  const merchantCity = tlvMap.get('60')?.trim(); // Tag 60: Merchant City
  const postalCode = tlvMap.get('61')?.trim(); // Tag 61: Postal Code

  // Tag 62: Additional Data Template
  const tag62 = tlvMap.get('62');
  let tr = trFromAccount;
  let tid: string | undefined;
  let tn: string | undefined;

  if (tag62) {
    const addMap = parseTLVString(tag62);
    tr = tr ?? addMap.get('05') ?? addMap.get('01'); // 05 = Reference ID, 01 = Bill Number
    tid = addMap.get('07'); // 07 = Terminal ID
    tn = addMap.get('08'); // 08 = Purpose
  }

  const extraParams: Record<string, string> = {
    format: 'bharat_qr',
    source: 'emv',
    ...(pointOfInitiation ? { pointOfInitiation } : {}),
    ...(merchantCity ? { city: merchantCity } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(tipIndicator ? { tipIndicator } : {}),
    ...(tipValueFixed ? { tipValueFixed } : {}),
    ...(tipValuePercentage ? { tipValuePercentage } : {})
  };

  // Normalise into existing UpiFields shape with source: 'emv'
  const upiFields: UpiFields = {
    source: 'emv',
    pa,
    ...(pn ? { pn } : {}),
    ...(am ? { am } : {}),
    cu,
    ...(mc ? { mc } : {}),
    ...(tr ? { tr } : {}),
    ...(tn ? { tn } : {}),
    ...(urlFromAccount ? { url: urlFromAccount } : {}),
    ...(mode ? { mode } : {}),
    ...(tid ? { tid } : {}),
    extraParams,
    duplicateKeys: []
  };

  const rawMapObj: Record<string, string> = {};
  for (const [k, v] of tlvMap.entries()) {
    rawMapObj[k] = v;
  }

  const emvFields: EmvFields = {
    rawPayload: trimmed,
    tlvMap: rawMapObj,
    isValidCrc,
    ...(declaredCrc ? { declaredCrc } : {}),
    ...(calculatedCrc ? { calculatedCrc } : {}),
    upi: upiFields,
    ...(pn ? { merchantName: pn } : {}),
    ...(merchantCity ? { merchantCity } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(mc ? { mcc: mc } : {}),
    currency: cu,
    ...(am ? { amount: am } : {}),
    ...(tipIndicator ? { tipIndicator } : {}),
    ...(tipValueFixed ? { tipValueFixed } : {}),
    ...(tipValuePercentage ? { tipValuePercentage } : {}),
    ...(pointOfInitiation ? { pointOfInitiation } : {})
  };

  return {
    success: true,
    fields: emvFields,
    upiFields,
    warnings,
    hasBadCrc: !isValidCrc
  };
}
