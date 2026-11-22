import type { ParsedPayload } from '../types/payload.js';
import { parsePayload } from '../parser/payload-parser.js';
import { validateVpa, isKnownPspHandle } from '../validators/psp-validator.js';
import { inspectUnicodeSafety } from '../validators/unicode-validator.js';
import { validateMerchantAndUrgency } from '../validators/merchant-validator.js';
import { isEmvPayload, parseEmvPayload } from '../parser/emv-parser.js';
import type {
  VpaVerifierProvider,
  VpaVerificationResult,
  VpaVerificationStatus,
  VpaCheckItem,
  VpaVerificationDetails
} from './types.js';

/**
 * Mapping of recognized NPCI PSP handles to their primary sponsor financial institutions.
 */
const PSP_HANDLE_BANK_MAP: Record<string, string> = {
  okhdfcbank: 'HDFC Bank',
  hdfcbank: 'HDFC Bank',
  payzapp: 'HDFC Bank',
  pthdfc: 'HDFC Bank (Paytm TPAP)',
  oksbi: 'State Bank of India (SBI)',
  sbi: 'State Bank of India (SBI)',
  ptsbi: 'State Bank of India (Paytm TPAP)',
  okicici: 'ICICI Bank',
  icici: 'ICICI Bank',
  ibl: 'ICICI Bank (PhonePe TPAP)',
  imobile: 'ICICI Bank',
  pockets: 'ICICI Bank',
  tapicici: 'ICICI Bank',
  okaxis: 'Axis Bank',
  axisbank: 'Axis Bank',
  axl: 'Axis Bank (PhonePe TPAP)',
  ptaxis: 'Axis Bank (Paytm TPAP)',
  plaxis: 'Axis Bank (Pine Labs TPAP)',
  ybl: 'Yes Bank (PhonePe TPAP)',
  ptyes: 'Yes Bank (Paytm TPAP)',
  yesbank: 'Yes Bank',
  bharatpe: 'Yes Bank / Unity Small Finance Bank (BharatPe)',
  paytm: 'Paytm Payments Bank',
  barodampay: 'Bank of Baroda',
  kotak: 'Kotak Mahindra Bank',
  kaypay: 'Kotak Mahindra Bank',
  pnb: 'Punjab National Bank',
  cnrb: 'Canara Bank',
  canarabank: 'Canara Bank',
  unionbank: 'Union Bank of India',
  idfcbank: 'IDFC FIRST Bank',
  federal: 'Federal Bank',
  fbl: 'Federal Bank',
  airtel: 'Airtel Payments Bank',
  airtelpaymentsbank: 'Airtel Payments Bank',
  ippb: 'India Post Payments Bank',
  postbank: 'India Post Payments Bank',
  bhim: 'NPCI BHIM Central Application',
  upi: 'NPCI Universal UPI Handle',
  indus: 'IndusInd Bank',
  rbl: 'RBL Bank',
  aubank: 'AU Small Finance Bank',
  cred: 'Axis Bank / Yes Bank (CRED TPAP)',
  amazonpay: 'Axis Bank (Amazon Pay TPAP)',
  apl: 'Axis Bank (Amazon Pay TPAP)',
  rapl: 'RBL Bank (Amazon Pay TPAP)',
  citi: 'Citibank N.A. (Axis Bank)',
  hsbc: 'HSBC Bank India',
  standardchartered: 'Standard Chartered Bank',
  scb: 'Standard Chartered Bank',
  dbs: 'DBS Bank India',
  digibank: 'DBS Bank India',
  bandhan: 'Bandhan Bank'
};

/**
 * Standard ISO 18245 Merchant Category Code (MCC) descriptions commonly found in Indian UPI payments.
 */
const MCC_CATEGORY_MAP: Record<string, string> = {
  '5411': 'Grocery Stores, Supermarkets & Bakeries',
  '5814': 'Fast Food Restaurants & Tea Stalls',
  '5812': 'Eating Places, Restaurants & Cafes',
  '5912': 'Drug Stores & Pharmacies',
  '5462': 'Bakeries & Confectionery Stores',
  '5251': 'Hardware Stores & Electricals',
  '5942': 'Bookstores & Stationery',
  '5311': 'Department Stores & General Merchandise',
  '5541': 'Service Stations & Fuel Dispensers',
  '4121': 'Taxicabs, Rideshares & Commuter Transport',
  '5999': 'Miscellaneous Retail Stores',
  '6012': 'Financial Institutions - Merchandise & Services',
  '5732': 'Electronics & Consumer Appliance Stores',
  '5651': 'Family Clothing & Apparel Stores',
  '8062': 'Hospitals & Healthcare Clinics'
};

export class OfflineStructuralVerifier implements VpaVerifierProvider {
  public readonly id = 'offline-structural';
  public readonly name = 'Offline Structural Verifier (NPCI & Banking Heuristics)';
  public readonly isDefault = true;
  public readonly isOnline = false;
  public readonly description =
    'Deterministic offline structural analysis validating UPI ID format, PSP handle authorization against the NPCI allowlist, MCC merchant metadata consistency, and EMVCo CRC-16 checksums.';
  public readonly honestLimitationNotice =
    'NPCI provides no public API to query whether a UPI ID is actively registered on banking servers. Offline Structural Verification verifies syntax compliance, NPCI banking handle authorization, merchant consistency, and EMVCo cryptographic CRC offline. Never rely on format checks alone — always confirm payee identity before authorizing payments.';

  public verify(payloadOrParsed: string | ParsedPayload): VpaVerificationResult {
    const timestamp = new Date().toISOString();
    const parsed: ParsedPayload =
      typeof payloadOrParsed === 'string' ? parsePayload(payloadOrParsed) : payloadOrParsed;

    // Check if payload is UPI or EMV format
    let vpa = '';
    let payeeName = '';
    let mcc = '';
    let transactionNote = '';
    let isEmv = false;

    if (parsed.fields.kind === 'upi') {
      vpa = parsed.fields.upi.pa;
      payeeName = parsed.fields.upi.pn ?? '';
      mcc = parsed.fields.upi.mc ?? '';
      transactionNote = parsed.fields.upi.tn ?? '';
      isEmv = parsed.fields.upi.source === 'emv';
    } else if (parsed.fields.kind === 'emv') {
      vpa = parsed.fields.upi.pa;
      payeeName = parsed.fields.upi.pn ?? '';
      mcc = parsed.fields.upi.mc ?? '';
      transactionNote = parsed.fields.upi.tn ?? '';
      isEmv = true;
    } else {
      // Non-UPI link (e.g. web URL or unknown protocol)
      return {
        providerId: this.id,
        providerName: this.name,
        isOnline: false,
        isValid: false,
        status: 'unsupported',
        statusLabel: 'Non-UPI Protocol',
        summary: 'Payload does not contain a UPI Virtual Payment Address (VPA) or EMVCo payment standee format.',
        honestLimitationNotice: this.honestLimitationNotice,
        details: {
          formatCheck: { id: 'fmt', name: 'VPA Syntax Format', passed: false, status: 'fail', details: 'No VPA present' },
          pspHandleCheck: { id: 'psp', name: 'NPCI PSP Authorization', passed: false, status: 'fail', details: 'Non-UPI link' },
          merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: false, status: 'not_applicable', details: 'N/A' },
          emvCrcCheck: { id: 'crc', name: 'EMVCo CRC-16 Checksum', passed: false, status: 'not_applicable', details: 'N/A' },
          unicodeSafetyCheck: { id: 'uni', name: 'Unicode & Homoglyph Safety', passed: true, status: 'pass', details: 'Clean' }
        },
        warnings: ['Scanned code is not a UPI or EMV payment link.'],
        timestamp
      };
    }

    const warnings: string[] = [];

    // 1. Format Check (VPA syntax, characters, length)
    const vpaValidation = validateVpa(vpa);
    const formatPassed = vpaValidation.isValidSyntax;
    let formatDetails = '';

    if (!vpa.includes('@')) {
      formatDetails = 'Malformed UPI address: missing mandatory "@" delimiter.';
      warnings.push(formatDetails);
    } else if (!formatPassed) {
      formatDetails = 'Malformed UPI address: username or handle contains illegal characters.';
      warnings.push(formatDetails);
    } else {
      formatDetails = `Valid UPI address syntax (${vpaValidation.localPart}@${vpaValidation.pspHandle}).`;
    }

    const formatCheck: VpaCheckItem = {
      id: 'format',
      name: 'VPA Syntax & Structure',
      passed: formatPassed,
      status: formatPassed ? 'pass' : 'fail',
      details: formatDetails
    };

    // 2. PSP Handle Check against NPCI Allowlist
    const handle = vpaValidation.pspHandle.toLowerCase();
    const isKnownPsp = isKnownPspHandle(handle);
    const sponsorBank = PSP_HANDLE_BANK_MAP[handle];
    let pspDetails = '';

    if (!handle) {
      pspDetails = 'No PSP handle present.';
      warnings.push(pspDetails);
    } else if (isKnownPsp) {
      pspDetails = sponsorBank
        ? `Recognized NPCI authorized banking handle (@${handle}) issued by ${sponsorBank}.`
        : `Recognized NPCI authorized banking handle (@${handle}).`;
    } else {
      pspDetails = `Unrecognized handle (@${handle}). Not found in official NPCI TPAP/PSP banking directory.`;
      warnings.push(pspDetails);
    }

    const pspHandleCheck: VpaCheckItem = {
      id: 'psp_handle',
      name: 'NPCI PSP Bank Authorization',
      passed: isKnownPsp,
      status: isKnownPsp ? 'pass' : 'fail',
      details: pspDetails
    };

    // 3. Merchant Consistency Check (MCC and payee name)
    const merchantResult = validateMerchantAndUrgency(payeeName, mcc, transactionNote);
    const mccCategory = mcc ? MCC_CATEGORY_MAP[mcc] : undefined;
    let merchantPassed = true;
    let merchantStatus: 'pass' | 'warn' | 'fail' | 'info' = 'info';
    let merchantDetails = '';

    if (merchantResult.urgencyKeywordsInName.length > 0) {
      merchantPassed = false;
      merchantStatus = 'fail';
      merchantDetails = `Payee name "${payeeName}" contains suspicious urgency keywords: [${merchantResult.urgencyKeywordsInName.join(', ')}].`;
      warnings.push(merchantDetails);
    } else if (merchantResult.missingMerchantCodeForBusiness) {
      merchantPassed = false;
      merchantStatus = 'warn';
      merchantDetails = `Payee name "${payeeName}" indicates a commercial business but lacks an official 4-digit Merchant Category Code (MCC).`;
      warnings.push(merchantDetails);
    } else if (merchantResult.hasMerchantCode) {
      if (merchantResult.isMerchantCodeValidFormat) {
        merchantStatus = 'pass';
        merchantDetails = mccCategory
          ? `Verified 4-digit Merchant Category Code (${mcc}: ${mccCategory}).`
          : `Valid 4-digit Merchant Category Code declared (${mcc}).`;
      } else {
        merchantPassed = false;
        merchantStatus = 'fail';
        merchantDetails = `Invalid Merchant Category Code format "${mcc}" (must be exactly 4 digits).`;
        warnings.push(merchantDetails);
      }
    } else {
      merchantStatus = 'info';
      merchantDetails = 'Personal peer-to-peer recipient (no commercial merchant code declared).';
    }

    const merchantConsistencyCheck: VpaCheckItem = {
      id: 'merchant_consistency',
      name: 'MCC & Merchant Consistency',
      passed: merchantPassed,
      status: merchantStatus,
      details: merchantDetails
    };

    // 4. EMVCo CRC-16 Checksum
    let emvPassed = true;
    let emvStatus: 'pass' | 'fail' | 'not_applicable' = 'not_applicable';
    let emvDetails = 'Standard UPI deep link (EMVCo checksum not applicable).';

    if (isEmv || isEmvPayload(parsed.rawPayload)) {
      const emvParsed = parseEmvPayload(parsed.rawPayload);
      if (emvParsed.success && emvParsed.fields) {
        if (emvParsed.fields.isValidCrc) {
          emvPassed = true;
          emvStatus = 'pass';
          emvDetails = `EMVCo / BharatQR CRC-16 checksum validated successfully (${emvParsed.fields.declaredCrc}).`;
        } else {
          emvPassed = false;
          emvStatus = 'fail';
          emvDetails = `EMVCo CRC-16 checksum mismatch: declared "${emvParsed.fields.declaredCrc}", calculated "${emvParsed.fields.calculatedCrc}". QR code is corrupted or maliciously altered.`;
          warnings.push(emvDetails);
        }
      } else if (emvParsed.hasBadCrc) {
        emvPassed = false;
        emvStatus = 'fail';
        emvDetails = 'EMVCo CRC-16 checksum mismatch. Checksum validation failed.';
        warnings.push(emvDetails);
      }
    }

    const emvCrcCheck: VpaCheckItem = {
      id: 'emv_crc',
      name: 'EMVCo CRC-16 Cryptographic Checksum',
      passed: emvPassed,
      status: emvStatus,
      details: emvDetails
    };

    // 5. Unicode Safety & Homoglyph Evasion Check
    const unicodeVpa = inspectUnicodeSafety(vpa);
    const unicodeName = inspectUnicodeSafety(payeeName);
    const unicodeNote = inspectUnicodeSafety(transactionNote);
    const hasUnicodeRisk =
      unicodeVpa.hasHiddenUnicode || unicodeName.hasHiddenUnicode || unicodeNote.hasHiddenUnicode;

    const unicodePassed = !hasUnicodeRisk;
    let unicodeDetails = 'Zero-width spaces and Unicode homoglyphs inspection clean.';

    if (hasUnicodeRisk) {
      const issues: string[] = [];
      if (unicodeVpa.hasHiddenUnicode) issues.push('VPA handle contains hidden characters or homoglyphs');
      if (unicodeName.hasHiddenUnicode) issues.push('Payee name contains hidden characters or homoglyphs');
      if (unicodeNote.hasHiddenUnicode) issues.push('Remarks note contains hidden characters');
      unicodeDetails = `Deceptive Unicode characters detected: ${issues.join('; ')}.`;
      warnings.push(unicodeDetails);
    }

    const unicodeSafetyCheck: VpaCheckItem = {
      id: 'unicode_safety',
      name: 'Unicode & Homoglyph Safety',
      passed: unicodePassed,
      status: unicodePassed ? 'pass' : 'fail',
      details: unicodeDetails
    };

    // Determine Overall Status
    const isAllPassed =
      formatPassed && isKnownPsp && merchantPassed && emvPassed && unicodePassed;

    let status: VpaVerificationStatus = 'verified_valid';
    let statusLabel = 'Structurally Valid';
    let summary = '';

    if (!formatPassed || !isKnownPsp || !emvPassed || !unicodePassed) {
      status = 'flagged_risk';
      statusLabel = 'Structural Risk Flagged';
      summary = `Structural verification flagged risk indicators: ${warnings[0] ?? 'Structural anomaly'}.`;
    } else if (merchantStatus === 'warn') {
      status = 'verified_valid';
      statusLabel = 'Structurally Valid (Unregistered Business Warning)';
      summary =
        'Valid VPA syntax and authorized bank handle, but commercial payee claims lack a registered 4-digit MCC.';
    } else {
      status = 'verified_valid';
      statusLabel = 'Structurally Valid';
      summary = sponsorBank
        ? `Valid UPI VPA format verified under authorized NPCI PSP (${sponsorBank}).`
        : 'Valid UPI VPA format verified under authorized NPCI PSP allowlist.';
    }

    const details: VpaVerificationDetails = {
      formatCheck,
      pspHandleCheck,
      merchantConsistencyCheck,
      emvCrcCheck,
      unicodeSafetyCheck,
      ...(sponsorBank ? { sponsorBank } : {}),
      ...(mcc ? { mccCode: mcc } : {}),
      ...(mccCategory ? { mccCategory } : {})
    };

    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: false,
      isValid: isAllPassed,
      status,
      statusLabel,
      summary,
      honestLimitationNotice: this.honestLimitationNotice,
      details,
      warnings,
      timestamp
    };
  }
}
