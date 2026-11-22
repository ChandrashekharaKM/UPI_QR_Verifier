import type { ParsedPayload } from '../types/payload.js';

export type VpaVerificationStatus =
  | 'verified_valid'       // All structural & allowlist checks passed
  | 'flagged_risk'          // Structural flaw, bad CRC, fake handle, or metadata mismatch
  | 'inconclusive'          // Provider could not conclusively confirm (e.g. unconfigured gateway)
  | 'unsupported';          // Payload is not a UPI or EMV payment link

export interface VpaCheckItem {
  readonly id: string;
  readonly name: string;
  readonly passed: boolean;
  readonly status: 'pass' | 'fail' | 'warn' | 'info' | 'not_applicable';
  readonly details: string;
}

export interface VpaVerificationDetails {
  readonly formatCheck: VpaCheckItem;
  readonly pspHandleCheck: VpaCheckItem;
  readonly merchantConsistencyCheck: VpaCheckItem;
  readonly emvCrcCheck: VpaCheckItem;
  readonly unicodeSafetyCheck: VpaCheckItem;
  readonly sponsorBank?: string;
  readonly mccCode?: string;
  readonly mccCategory?: string;
  readonly gatewayValidationCheck?: VpaCheckItem;
  readonly registeredNameMatchCheck?: VpaCheckItem;
  readonly registeredBeneficiaryName?: string;
  readonly jaroWinklerSimilarity?: number;
  readonly threatIntelCheck?: VpaCheckItem;
  readonly threatIntelSource?: string;
  readonly threatType?: string;
}

export interface VpaVerificationResult {
  readonly providerId: string;
  readonly providerName: string;
  readonly isOnline: boolean;
  readonly isValid: boolean;
  readonly status: VpaVerificationStatus;
  readonly statusLabel: string;
  readonly summary: string;
  readonly honestLimitationNotice: string;
  readonly details: VpaVerificationDetails;
  readonly warnings: readonly string[];
  readonly timestamp: string;
}

export interface VpaVerifierProvider {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly isOnline: boolean;
  readonly description: string;
  readonly honestLimitationNotice: string;
  verify(payload: string | ParsedPayload): Promise<VpaVerificationResult> | VpaVerificationResult;
}

export interface CheckAuditItem {
  readonly id: string;
  readonly name: string;
  readonly ran: boolean;
  readonly status: 'pass' | 'fail' | 'warn' | 'info' | 'not_available' | 'not_applicable';
  readonly statusLabel: string;
  readonly details: string;
}

export interface VpaCompositeResult {
  readonly vpa?: string;
  readonly payeeName?: string;
  readonly originalScheme?: string;
  readonly overallStatus: VpaVerificationStatus;
  readonly overallStatusLabel: string;
  readonly providerResults: readonly VpaVerificationResult[];
  readonly checksAudit?: readonly CheckAuditItem[];
  readonly honestLimitationNotice: string;
  readonly evaluatedAt: string;
}
