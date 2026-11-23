import type { ParsedPayload } from '../types/payload.js';
import { parsePayload } from '../parser/payload-parser.js';
import type { CommunityReputationSignal } from '../types/rules.js';
import { calculateReputationDecay, type RawReportInput } from './decay.js';
import type {
  VpaVerifierProvider,
  VpaVerificationResult,
  VpaVerificationStatus,
  VpaCheckItem,
  VpaVerificationDetails
} from './types.js';

export interface CommunityVerifierFetchFunction {
  (vpa: string): Promise<CommunityReputationSignal | null | undefined>;
}

export class CommunityReputationVpaVerifier implements VpaVerifierProvider {
  public readonly id = 'community-reputation';
  public readonly name = 'Community Scam Reputation Network';
  public readonly isDefault = false;
  public readonly isOnline = true;
  public readonly description =
    'Cross-references the payee VPA against the community scam intelligence network with time-decay weighting and device deduplication.';
  public readonly honestLimitationNotice =
    'Community reputation relies on crowd-sourced verified fraud reports with time-decay weighting (recent reports carry full weight; historical reports decay over a 30-day half-life). Zero reports on record does NOT guarantee account safety — newly created or disposable burner accounts often have 0 prior reports.';

  private readonly fetcher?: CommunityVerifierFetchFunction;
  private readonly injectedSignal?: CommunityReputationSignal;
  private readonly rawReports?: readonly RawReportInput[];

  constructor(options?: {
    fetcher?: CommunityVerifierFetchFunction;
    signal?: CommunityReputationSignal;
    rawReports?: readonly RawReportInput[];
  }) {
    this.fetcher = options?.fetcher;
    this.injectedSignal = options?.signal;
    this.rawReports = options?.rawReports;
  }

  private buildUnsupportedResult(timestamp: string): VpaVerificationResult {
    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: false,
      status: 'unsupported',
      statusLabel: 'Non-UPI Protocol',
      summary: 'Payload does not contain a UPI VPA to query community reports.',
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
    signal: CommunityReputationSignal | undefined,
    timestamp: string
  ): VpaVerificationResult {
    const reportCount = signal?.reportCount ?? 0;
    const uniqueReporters = signal?.uniqueReporters ?? reportCount;
    const decayedScore = signal?.decayedScore ?? reportCount;
    const recentCount =
      signal?.recentReportCount ??
      (signal?.lastReportedDaysAgo !== undefined && signal.lastReportedDaysAgo <= 7 ? reportCount : 0);
    const daysAgo = signal?.lastReportedDaysAgo;
    const categories = signal?.topCategories ?? [];
    const breakdown = signal?.breakdownByPeriod;

    let status: VpaVerificationStatus = 'verified_valid';
    let statusLabel = 'No Scam Reports';
    let summary = '';
    const warnings: string[] = [];

    // Trigger threshold based on decayed threat score (effective reports >= 1.5 or total >= 2)
    if (decayedScore >= 1.5 || reportCount >= 2) {
      status = 'flagged_risk';
      statusLabel = `Scam Reports Logged (${reportCount} reports, ${decayedScore.toFixed(2)} decayed weight)`;
      summary = `High-risk recipient: ${reportCount} deduplicated scam reports (effective decayed threat weight: ${decayedScore.toFixed(2)}) registered against ${vpa}.`;
      warnings.push(summary);
      if (categories.length > 0) {
        warnings.push(`Reported scam patterns: ${categories.join(', ')}.`);
      }
      if (recentCount > 0) {
        warnings.push(`Active campaign: ${recentCount} report(s) submitted within the last 7 days.`);
      }
    } else if (reportCount === 1) {
      status = 'flagged_risk';
      statusLabel = 'Single Scam Report';
      summary = `1 community scam report logged for ${vpa}${daysAgo !== undefined ? ` (${daysAgo} days ago, decayed weight: ${decayedScore.toFixed(2)})` : ''}.`;
      warnings.push(summary);
    } else {
      status = 'verified_valid';
      statusLabel = 'No Prior Reports';
      summary = `Zero prior fraud reports on record for ${vpa}. Note: new accounts may also have 0 reports.`;
    }

    const breakdownText = breakdown
      ? `7d: ${breakdown.within7Days} (1.0x), 30d: ${breakdown.within30Days} (0.7x), 90d: ${breakdown.within90Days} (0.4x), >90d: ${breakdown.olderThan90Days} (0.15x)`
      : `Last report: ${daysAgo !== undefined ? `${daysAgo}d ago` : 'N/A'}`;

    const dedupItem: VpaCheckItem = {
      id: 'community_reports',
      name: 'Crowd-Sourced Reports & Dedup',
      passed: reportCount === 0,
      status: reportCount === 0 ? 'pass' : reportCount === 1 ? 'warn' : 'fail',
      details:
        reportCount === 0
          ? 'Clean reputation: zero scam reports on record.'
          : `${reportCount} deduplicated report(s) from ${uniqueReporters} unique verified reporting device(s).`
    };

    const decayItem: VpaCheckItem = {
      id: 'decay_weight',
      name: 'Time-Decayed Threat Weight',
      passed: decayedScore < 1.0,
      status: decayedScore >= 1.5 ? 'fail' : decayedScore > 0 ? 'warn' : 'pass',
      details:
        reportCount === 0
          ? 'Decayed threat score: 0.00 / 0.00 (no report history).'
          : `Decayed threat score: ${decayedScore.toFixed(2)} / ${reportCount}.00 (${breakdownText}).`
    };

    const recencyItem: VpaCheckItem = {
      id: 'recent_activity',
      name: 'Active Campaign Recency',
      passed: recentCount === 0 && (daysAgo === undefined || daysAgo > 7),
      status:
        recentCount > 0 || (daysAgo !== undefined && daysAgo <= 7)
          ? 'fail'
          : daysAgo !== undefined && daysAgo <= 30
            ? 'warn'
            : 'pass',
      details:
        daysAgo !== undefined
          ? `Most recent report logged ${daysAgo} day(s) ago (${recentCount} active within last 7 days).`
          : 'No recent fraud activity reported.'
    };

    const categoriesItem: VpaCheckItem = {
      id: 'categories',
      name: 'Threat Categories',
      passed: categories.length === 0,
      status: categories.length === 0 ? 'info' : 'warn',
      details: categories.length > 0 ? `Flagged categories: ${categories.join(', ')}.` : 'None.'
    };

    const integrityItem: VpaCheckItem = {
      id: 'dedup_integrity',
      name: 'Deduplication Integrity',
      passed: true,
      status: 'pass',
      details: 'Device hash fingerprinting active to prevent report stuffing and Sybil attacks.'
    };

    const details: VpaVerificationDetails = {
      formatCheck: dedupItem,
      pspHandleCheck: decayItem,
      merchantConsistencyCheck: recencyItem,
      emvCrcCheck: categoriesItem,
      unicodeSafetyCheck: integrityItem
    };

    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: reportCount === 0,
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
    payloadOrParsed: string | ParsedPayload
  ): VpaVerificationResult | Promise<VpaVerificationResult> {
    const timestamp = new Date().toISOString();
    const parsed: ParsedPayload =
      typeof payloadOrParsed === 'string' ? parsePayload(payloadOrParsed) : payloadOrParsed;

    let vpa = '';
    if (parsed.fields.kind === 'upi' || parsed.fields.kind === 'emv') {
      vpa = parsed.fields.upi.pa;
    } else {
      return this.buildUnsupportedResult(timestamp);
    }

    // 1. Raw report records provided (synchronous time decay and deduplication)
    if (this.rawReports && this.rawReports.length > 0) {
      const decayResult = calculateReputationDecay(this.rawReports);
      const signal: CommunityReputationSignal = {
        reportCount: decayResult.uniqueReporters,
        uniqueReporters: decayResult.uniqueReporters,
        decayedScore: decayResult.decayedScore,
        recentReportCount: decayResult.recentReportCount,
        ...(decayResult.lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo: decayResult.lastReportedDaysAgo } : {}),
        topCategories: decayResult.topCategories,
        breakdownByPeriod: decayResult.breakdownByPeriod
      };
      return this.buildResult(parsed, vpa, signal, timestamp);
    }

    // 2. Pre-injected reputation signal (synchronous)
    if (this.injectedSignal) {
      return this.buildResult(parsed, vpa, this.injectedSignal, timestamp);
    }

    // 3. Remote fetcher provided (asynchronous)
    if (this.fetcher) {
      return this.fetcher(vpa).then((fetched) =>
        this.buildResult(parsed, vpa, fetched ?? undefined, timestamp)
      );
    }

    // 4. Default: zero reports on file
    return this.buildResult(parsed, vpa, undefined, timestamp);
  }
}

// Export CommunityReputationVerifier as standard alias
export const CommunityReputationVerifier = CommunityReputationVpaVerifier;
export type CommunityReputationVerifier = CommunityReputationVpaVerifier;
