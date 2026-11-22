import type {
  VerificationResult,
  CommunityReputationSignal,
  PspLookupSignal,
  ThreatIntelSignal,
  RandomForestModel,
  ParsedPayload
} from './types/index.js';
import type { ScoringConfig } from './scoring/config.js';
import { parsePayload } from './parser/index.js';
import { evaluateRules } from './rules/index.js';
import { extractFeatureVector } from './features/index.js';
import { calculateVerificationScore } from './scoring/index.js';
import { OfflineStructuralVerifier } from './vpa-verifier/offline-structural-verifier.js';
import { CommunityReputationVpaVerifier } from './vpa-verifier/community-verifier.js';
import { PspLookupVpaVerifier } from './vpa-verifier/psp-lookup-verifier.js';
import { ThreatIntelVpaVerifier } from './vpa-verifier/threat-intel-verifier.js';
import { validateMerchantAndUrgency } from './validators/merchant-validator.js';
import type {
  VpaCompositeResult,
  VpaVerificationResult,
  CheckAuditItem
} from './vpa-verifier/types.js';
import defaultModelData from './model/model.json' with { type: 'json' };

export interface VerifyQrOptions {
  readonly community?: CommunityReputationSignal;
  readonly pspLookup?: PspLookupSignal;
  readonly threatIntel?: ThreatIntelSignal;
  readonly model?: RandomForestModel;
  readonly isOffline?: boolean;
  readonly scoringConfig?: Partial<ScoringConfig>;
}

export const DEFAULT_MODEL: RandomForestModel = defaultModelData as unknown as RandomForestModel;
const DEFAULT_STRUCTURAL_VERIFIER = new OfflineStructuralVerifier();

/**
 * Main verification entrypoint for UPI QR Verifier.
 * Zero external runtime dependencies; executes 100% offline on any JS/TS platform.
 */
export function verifyQrPayload(
  rawPayload: string,
  options?: VerifyQrOptions
): VerificationResult {
  // 1. Parse QR payload
  const parsed: ParsedPayload = parsePayload(rawPayload);

  // 2. Build Rule Context
  const ctx = {
    parsed,
    community: options?.community,
    pspLookup: options?.pspLookup,
    threatIntel: options?.threatIntel
  };

  // 3. Evaluate deterministic security rules
  const { triggeredRules, ruleRiskScore } = evaluateRules(ctx);

  // 4. Extract fixed-length normalized feature vector
  const features = extractFeatureVector(ctx, ruleRiskScore);

  // 5. Select ML model
  const model = options?.model ?? DEFAULT_MODEL;

  // 6. Blend scores and generate output
  const baseResult = calculateVerificationScore({
    ctx,
    triggeredRules,
    ruleRiskScore,
    features,
    model,
    config: options?.scoringConfig,
    isOffline: options?.isOffline ?? !options?.community
  });

  // 7. Attach Real-World Pluggable VPA Verification Layer (OfflineStructuralVerifier + optional CommunityReputation)
  const structuralResult = DEFAULT_STRUCTURAL_VERIFIER.verify(parsed);
  const providerResults: VpaVerificationResult[] = [structuralResult];

  if (options?.community) {
    const communityVerifier = new CommunityReputationVpaVerifier({
      signal: options.community
    });
    const commRes = communityVerifier.verify(parsed);
    if (!(commRes instanceof Promise)) {
      providerResults.push(commRes);
    }
  }

  if (options?.pspLookup) {
    const pspVerifier = new PspLookupVpaVerifier({
      signal: options.pspLookup
    });
    const pspRes = pspVerifier.verify(parsed);
    if (!(pspRes instanceof Promise)) {
      providerResults.push(pspRes);
    }
  }

  if (options?.threatIntel) {
    const threatVerifier = new ThreatIntelVpaVerifier({
      signal: options.threatIntel
    });
    const threatRes = threatVerifier.verify(parsed);
    if (!(threatRes instanceof Promise)) {
      providerResults.push(threatRes);
    }
  }

  const vpa =
    parsed.fields.kind === 'upi' || parsed.fields.kind === 'emv'
      ? parsed.fields.upi.pa
      : undefined;
  const payeeName =
    parsed.fields.kind === 'upi' || parsed.fields.kind === 'emv'
      ? parsed.fields.upi.pn
      : undefined;

  let overallStatus = structuralResult.status;
  let overallStatusLabel = structuralResult.statusLabel;

  if (providerResults.some((r) => r.status === 'flagged_risk')) {
    overallStatus = 'flagged_risk';
    overallStatusLabel = 'Verification Risk Flagged';
  } else if (providerResults.some((r) => r.status === 'unsupported')) {
    overallStatus = 'unsupported';
    overallStatusLabel = 'Unsupported Protocol';
  }

  // 8. Build exhaustive audit of executed checks vs unexecuted/offline checks
  const isPlainUpi = parsed.kind === 'upi' || parsed.kind === 'emv';
  const checksAudit: CheckAuditItem[] = [
    {
      id: 'structural_format',
      name: 'Format & Syntax Validation',
      ran: true,
      status: structuralResult.details.formatCheck.status === 'pass' ? 'pass' : 'fail',
      statusLabel: structuralResult.details.formatCheck.passed ? 'Format Valid' : 'Format Invalid',
      details: structuralResult.details.formatCheck.details
    },
    {
      id: 'psp_allowlist',
      name: 'NPCI Bank PSP Handle Allowlist',
      ran: true,
      status: structuralResult.details.pspHandleCheck.status === 'pass' ? 'pass' : 'fail',
      statusLabel: structuralResult.details.pspHandleCheck.passed
        ? `Recognized Bank Handle${structuralResult.details.sponsorBank ? ` (${structuralResult.details.sponsorBank})` : ''}`
        : 'Unverified Bank Handle',
      details: structuralResult.details.pspHandleCheck.details
    },
    {
      id: 'emv_crc',
      name: 'EMVCo / BharatQR Cryptographic Checksum',
      ran: structuralResult.details.emvCrcCheck.status !== 'not_applicable',
      status: structuralResult.details.emvCrcCheck.status,
      statusLabel:
        structuralResult.details.emvCrcCheck.status === 'pass'
          ? 'CRC-16 Verified'
          : structuralResult.details.emvCrcCheck.status === 'fail'
            ? 'CRC Tampered / Bad'
            : 'Not Applicable (Standard URI)',
      details: structuralResult.details.emvCrcCheck.details
    },
    {
      id: 'unicode_safety',
      name: 'Unicode Homoglyph & Steganography',
      ran: true,
      status: structuralResult.details.unicodeSafetyCheck.status,
      statusLabel: structuralResult.details.unicodeSafetyCheck.passed ? 'Clean (No Homoglyphs)' : 'Hidden Characters Found',
      details: structuralResult.details.unicodeSafetyCheck.details
    },
    {
      id: 'registered_name',
      name: 'Registered Beneficiary Name Check',
      ran: Boolean(options?.pspLookup),
      status: options?.pspLookup
        ? options.pspLookup.isValid
          ? 'pass'
          : 'fail'
        : 'not_available',
      statusLabel: options?.pspLookup
        ? options.pspLookup.registeredName
          ? 'Verified via Bank Record'
          : options.pspLookup.isValid
            ? 'VPA Valid (Name Withheld)'
            : 'Invalid on Banking Rails'
        : 'Not Available (Offline)',
      details: options?.pspLookup
        ? options.pspLookup.registeredName
          ? `Registered name verified: "${options.pspLookup.registeredName}" (${options.pspLookup.provider ?? 'gateway'})`
          : 'Registered name lookup completed'
        : 'Registered name verified: not available (offline)'
    },
    {
      id: 'community_reputation',
      name: 'Community Scam Report Network',
      ran: Boolean(options?.community),
      status: options?.community
        ? (options.community.reportCount ?? 0) === 0
          ? 'pass'
          : 'warn'
        : 'not_available',
      statusLabel: options?.community
        ? `${options.community.reportCount ?? 0} Reports on File`
        : 'Not Available (Offline)',
      details: options?.community
        ? `Community reputation: ${options.community.reportCount ?? 0} reports (decayed score: ${(options.community.decayedScore ?? 0).toFixed(2)})`
        : 'Community reputation check: not available (offline / unqueried)'
    },
    {
      id: 'threat_intel',
      name: 'URL Threat Intelligence Network',
      ran: Boolean(options?.threatIntel),
      status: options?.threatIntel
        ? options.threatIntel.isMalicious
          ? 'fail'
          : 'pass'
        : isPlainUpi
          ? 'not_applicable'
          : 'not_available',
      statusLabel: options?.threatIntel
        ? options.threatIntel.isMalicious
          ? 'Malicious URL Flagged'
          : 'URL Clean'
        : isPlainUpi
          ? 'Not Applicable'
          : 'Not Available (Offline)',
      details: options?.threatIntel
        ? `Threat intelligence verified: ${options.threatIntel.isMalicious ? 'MALICIOUS' : 'Clean'}`
        : isPlainUpi
          ? 'URL threat intelligence: not applicable (native UPI link)'
          : 'URL threat intelligence: not available (offline)'
    }
  ];

  const compositeVpa: VpaCompositeResult = {
    ...(vpa ? { vpa } : {}),
    ...(payeeName ? { payeeName } : {}),
    originalScheme: parsed.originalScheme,
    overallStatus,
    overallStatusLabel,
    providerResults,
    checksAudit,
    honestLimitationNotice: DEFAULT_STRUCTURAL_VERIFIER.honestLimitationNotice,
    evaluatedAt: baseResult.evaluatedAt
  };

  const isMerchantQr = Boolean(
    parsed.kind === 'emv' ||
    parsed.fields.kind === 'emv' ||
    (parsed.fields.kind === 'upi' && (
      Boolean(parsed.fields.upi.mc) ||
      Boolean(parsed.fields.upi.mid) ||
      Boolean(parsed.fields.upi.tid) ||
      parsed.fields.upi.source === 'emv' ||
      parsed.fields.upi.extraParams?.['format'] === 'bharat_qr' ||
      Boolean(payeeName && validateMerchantAndUrgency(payeeName, parsed.fields.upi.mc).payeeClaimsBusiness) ||
      /store|shop|mart|retail|hotel|restaurant|cafe|medical|pharmacy|enterprise|limited|ltd|pvt|bazaar|station|agency|traders|clinic|hospital|jewel|motors|auto|services|foods/i.test(payeeName ?? '') ||
      /merchant|pos|retail|qr|store|pay|bharatpe|swiggy|zomato/i.test(vpa ?? '')
    ))
  );

  return {
    ...baseResult,
    isMerchantQr,
    vpaVerification: compositeVpa
  };
}
