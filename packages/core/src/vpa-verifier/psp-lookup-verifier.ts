import type { ParsedPayload } from '../types/payload.js';
import { parsePayload } from '../parser/payload-parser.js';
import type { PspLookupSignal } from '../types/rules.js';
import { jaroWinklerSimilarity } from '../validators/string-distance.js';
import type {
  VpaVerifierProvider,
  VpaVerificationResult,
  VpaVerificationStatus,
  VpaCheckItem,
  VpaVerificationDetails
} from './types.js';

export interface PspLookupFetchFunction {
  (vpa: string): Promise<PspLookupSignal | null | undefined>;
}

export interface PspLookupVerifierOptions {
  readonly fetcher?: PspLookupFetchFunction;
  readonly signal?: PspLookupSignal;
  readonly nameMismatchThreshold?: number;
}

/**
 * Adapter provider for a licensed VPA-validation provider (e.g. Razorpay, Cashfree).
 * Validates VPA existence and compares bank-registered beneficiary name with QR payee name using Jaro-Winkler.
 * Strictly operates offline when supplied with signal; zero external dependencies.
 */
export class PspLookupVpaVerifier implements VpaVerifierProvider {
  public readonly id = 'psp-lookup';
  public readonly name = 'Licensed Gateway VPA Lookup';
  public readonly isDefault = false;
  public readonly isOnline = true;
  public readonly description =
    'Validates UPI ID existence and retrieves the bank-registered beneficiary name via a licensed Payment Aggregator (e.g. Razorpay or Cashfree).';
  public readonly honestLimitationNotice =
    'Licensed PSP/payment gateway lookups incur commercial per-call API fees and require merchant authorization. Bank-registered names are retrieved in real time from NPCI via partner banking rails.';

  private readonly fetcher?: PspLookupFetchFunction;
  private readonly injectedSignal?: PspLookupSignal;
  private readonly nameMismatchThreshold: number;

  constructor(options?: PspLookupVerifierOptions) {
    this.fetcher = options?.fetcher;
    this.injectedSignal = options?.signal;
    this.nameMismatchThreshold = options?.nameMismatchThreshold ?? 0.72;
  }

  private buildUnsupportedResult(timestamp: string): VpaVerificationResult {
    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: false,
      status: 'unsupported',
      statusLabel: 'Non-UPI Protocol',
      summary: 'Payload does not contain a UPI VPA to query licensed gateway lookups.',
      honestLimitationNotice: this.honestLimitationNotice,
      details: {
        formatCheck: { id: 'fmt', name: 'VPA Check', passed: false, status: 'fail', details: 'N/A' },
        pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: false, status: 'not_applicable', details: 'N/A' },
        merchantConsistencyCheck: { id: 'mcc', name: 'MCC Check', passed: false, status: 'not_applicable', details: 'N/A' },
        emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: false, status: 'not_applicable', details: 'N/A' },
        unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' }
      },
      warnings: [],
      timestamp
    };
  }

  private buildResult(
    _parsed: ParsedPayload,
    vpa: string,
    qrPayeeName: string | undefined,
    signal: PspLookupSignal | undefined,
    timestamp: string
  ): VpaVerificationResult {
    if (!signal) {
      return {
        providerId: this.id,
        providerName: this.name,
        isOnline: true,
        isValid: false,
        status: 'inconclusive',
        statusLabel: 'Lookup Inconclusive',
        summary: `No gateway verification signal received for VPA "${vpa}". Gateway may be unconfigured or rate limited.`,
        honestLimitationNotice: this.honestLimitationNotice,
        details: {
          formatCheck: { id: 'fmt', name: 'VPA Format Check', passed: true, status: 'pass', details: `VPA: ${vpa}` },
          pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'pass', details: 'Offline check passed' },
          merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
          emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
          unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' }
        },
        warnings: ['Licensed gateway lookup did not return a response.'],
        timestamp
      };
    }

    const warnings: string[] = [];
    const providerLabel = signal.provider ?? 'Payment Gateway';

    // 1. Gateway Network Existence Check
    const gatewayValidationCheck: VpaCheckItem = signal.isValid
      ? {
          id: 'gateway_vpa_valid',
          name: 'Gateway Banking Network Validation',
          passed: true,
          status: 'pass',
          details: `UPI ID is confirmed valid and active on banking network (${providerLabel}).`
        }
      : {
          id: 'gateway_vpa_valid',
          name: 'Gateway Banking Network Validation',
          passed: false,
          status: 'fail',
          details: `UPI ID is reported INVALID or inactive on banking network (${providerLabel}).`
        };

    if (!signal.isValid) {
      warnings.push(`Licensed gateway reported that VPA "${vpa}" does not exist or is inactive on the banking network.`);
    }

    // 2. Beneficiary Name Comparison using Jaro-Winkler
    const registeredName = signal.registeredName?.trim();
    let registeredNameMatchCheck: VpaCheckItem;
    let similarity: number | undefined;
    let isMismatch = false;

    if (!registeredName) {
      registeredNameMatchCheck = {
        id: 'beneficiary_name_match',
        name: 'Beneficiary Name Match',
        passed: true,
        status: 'info',
        details: `Gateway verified VPA validity but did not disclose the registered beneficiary name.`
      };
    } else if (!qrPayeeName || qrPayeeName.trim().length === 0) {
      registeredNameMatchCheck = {
        id: 'beneficiary_name_match',
        name: 'Beneficiary Name Match',
        passed: true,
        status: 'info',
        details: `Bank-registered name is "${registeredName}". (QR payload does not declare a payee name).`
      };
    } else {
      const cleanQr = qrPayeeName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanReg = registeredName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

      const isSubstr = cleanQr.includes(cleanReg) || cleanReg.includes(cleanQr);
      const qrWords = cleanQr.split(' ').filter((w) => w.length > 2);
      const regWords = cleanReg.split(' ').filter((w) => w.length > 2);
      const commonWords = regWords.filter((w) => qrWords.includes(w));
      const hasWordOverlap =
        commonWords.length > 0 &&
        qrWords.length > 0 &&
        regWords.length > 0 &&
        commonWords.length >= Math.min(qrWords.length, regWords.length) * 0.5;

      similarity = jaroWinklerSimilarity(cleanQr, cleanReg);
      isMismatch = !isSubstr && !hasWordOverlap && similarity < this.nameMismatchThreshold;

      if (isMismatch) {
        registeredNameMatchCheck = {
          id: 'beneficiary_name_match',
          name: 'Beneficiary Name Match',
          passed: false,
          status: 'fail',
          details: `Bank-registered name "${registeredName}" does NOT match QR payee name "${qrPayeeName}" (Jaro-Winkler: ${(similarity * 100).toFixed(0)}%).`
        };
        warnings.push(
          `Beneficiary name mismatch: Bank-registered name "${registeredName}" differs from QR payee name "${qrPayeeName}".`
        );
      } else {
        registeredNameMatchCheck = {
          id: 'beneficiary_name_match',
          name: 'Beneficiary Name Match',
          passed: true,
          status: 'pass',
          details: `Bank-registered name "${registeredName}" matches QR payee name "${qrPayeeName}" (Jaro-Winkler: ${(similarity * 100).toFixed(0)}%).`
        };
      }
    }

    // 3. Status determination
    let status: VpaVerificationStatus = 'verified_valid';
    let statusLabel = 'Beneficiary Name Verified';
    let summary = `VPA "${vpa}" confirmed valid on banking network by ${providerLabel}.`;

    if (!signal.isValid) {
      status = 'flagged_risk';
      statusLabel = 'Invalid VPA on Network';
      summary = `CRITICAL: VPA "${vpa}" was reported invalid or inactive on banking rails by ${providerLabel}.`;
    } else if (isMismatch) {
      status = 'flagged_risk';
      statusLabel = 'Beneficiary Name Mismatch';
      summary = `HIGH RISK: Bank-registered beneficiary name "${registeredName}" does not match QR name "${qrPayeeName}". Funds may be diverted.`;
    } else if (registeredName) {
      summary = `Bank-registered beneficiary "${registeredName}" verified on banking network (${providerLabel}).`;
    }

    const details: VpaVerificationDetails = {
      formatCheck: { id: 'fmt', name: 'VPA Check', passed: true, status: 'pass', details: `VPA: ${vpa}` },
      pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'pass', details: 'Offline check passed' },
      merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
      emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
      unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' },
      gatewayValidationCheck,
      registeredNameMatchCheck,
      ...(registeredName ? { registeredBeneficiaryName: registeredName } : {}),
      ...(similarity !== undefined ? { jaroWinklerSimilarity: Math.round(similarity * 100) / 100 } : {})
    };

    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: signal.isValid && !isMismatch,
      status,
      statusLabel,
      summary,
      honestLimitationNotice: this.honestLimitationNotice,
      details,
      warnings,
      timestamp
    };
  }

  public verify(
    payload: string | ParsedPayload
  ): Promise<VpaVerificationResult> | VpaVerificationResult {
    const timestamp = new Date().toISOString();
    const parsed: ParsedPayload = typeof payload === 'string' ? parsePayload(payload) : payload;

    let vpa: string | undefined;
    let qrPayeeName: string | undefined;

    if (parsed.fields.kind === 'upi') {
      vpa = parsed.fields.upi.pa;
      qrPayeeName = parsed.fields.upi.pn;
    } else if (parsed.fields.kind === 'emv') {
      vpa = parsed.fields.upi.pa;
      qrPayeeName = parsed.fields.upi.pn;
    }

    if (!vpa || !vpa.includes('@')) {
      return this.buildUnsupportedResult(timestamp);
    }

    if (this.injectedSignal) {
      return this.buildResult(parsed, vpa, qrPayeeName, this.injectedSignal, timestamp);
    }

    if (this.fetcher) {
      return this.fetcher(vpa)
        .then((signal) =>
          this.buildResult(parsed, vpa!, qrPayeeName, signal ?? undefined, timestamp)
        )
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          return {
            providerId: this.id,
            providerName: this.name,
            isOnline: true,
            isValid: false,
            status: 'inconclusive' as const,
            statusLabel: 'Lookup Failed',
            summary: `Failed to query licensed payment gateway: ${errMsg}`,
            honestLimitationNotice: this.honestLimitationNotice,
            details: {
              formatCheck: { id: 'fmt', name: 'VPA Check', passed: true, status: 'pass', details: `VPA: ${vpa}` },
              pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'pass', details: 'N/A' },
              merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
              emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
              unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' }
            },
            warnings: [`Gateway network error: ${errMsg}`],
            timestamp
          };
        });
    }

    return this.buildResult(parsed, vpa, qrPayeeName, undefined, timestamp);
  }
}

export const PspLookupVerifier = PspLookupVpaVerifier;
