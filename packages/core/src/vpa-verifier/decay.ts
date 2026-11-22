import type { CommunityPeriodBreakdown } from '../types/rules.js';

export interface RawReportInput {
  readonly deviceHash?: string;
  readonly createdAt: string | Date;
  readonly reason?: string;
  readonly note?: string;
}

export type { CommunityPeriodBreakdown };

export interface DecayEvaluationResult {
  readonly rawReportCount: number;
  readonly uniqueReporters: number;
  readonly decayedScore: number;
  readonly recentReportCount: number;
  readonly lastReportedDaysAgo?: number;
  readonly lastReportedDate?: string;
  readonly topCategories: readonly string[];
  readonly breakdownByPeriod: CommunityPeriodBreakdown;
}

/**
 * Calculates time-decayed threat weighting and deduplication for crowd-sourced scam reports.
 *
 * Deduplication:
 * - When `deviceHash` is provided, reports from the same device are deduplicated to their latest submission.
 * - This prevents report stuffing / Sybil spam from a single user inflating report metrics.
 *
 * Decay Weighting:
 * - Exponential decay based on half-life (default 30 days):
 *   weight = 2 ^ (-daysAgo / halfLife)
 * - Reports <= 7 days ago carry full active campaign weight.
 * - Reports > 90 days ago carry diminished historical weight.
 */
export function calculateReputationDecay(
  reports: readonly RawReportInput[],
  options?: {
    halfLifeDays?: number;
    referenceDate?: Date;
  }
): DecayEvaluationResult {
  const halfLife = options?.halfLifeDays ?? 30;
  const now = options?.referenceDate ?? new Date();
  const rawReportCount = reports.length;

  if (rawReportCount === 0) {
    return {
      rawReportCount: 0,
      uniqueReporters: 0,
      decayedScore: 0,
      recentReportCount: 0,
      topCategories: [],
      breakdownByPeriod: {
        within7Days: 0,
        within30Days: 0,
        within90Days: 0,
        olderThan90Days: 0
      }
    };
  }

  // 1. Deduplicate by deviceHash, retaining the latest submission per device
  const deduplicatedMap = new Map<string, RawReportInput>();
  const anonymousReports: RawReportInput[] = [];

  for (const report of reports) {
    if (report.deviceHash && report.deviceHash.trim()) {
      const hash = report.deviceHash.trim().toLowerCase();
      const existing = deduplicatedMap.get(hash);
      if (!existing) {
        deduplicatedMap.set(hash, report);
      } else {
        const existingTime = new Date(existing.createdAt).getTime();
        const currentTime = new Date(report.createdAt).getTime();
        if (currentTime > existingTime) {
          deduplicatedMap.set(hash, report);
        }
      }
    } else {
      anonymousReports.push(report);
    }
  }

  const dedupedReports: RawReportInput[] = [
    ...Array.from(deduplicatedMap.values()),
    ...anonymousReports
  ];

  const uniqueReporters = deduplicatedMap.size + anonymousReports.length;

  let totalDecayedScore = 0;
  let minDaysAgo: number | undefined;
  let maxReportedDate: string | undefined;
  let maxReportedTime = -1;

  let within7Days = 0;
  let within30Days = 0;
  let within90Days = 0;
  let olderThan90Days = 0;

  const categoryWeightMap = new Map<string, number>();

  for (const report of dedupedReports) {
    const reportDate = new Date(report.createdAt);
    const reportTime = reportDate.getTime();
    const diffMs = now.getTime() - reportTime;
    const daysAgo = Math.max(0, diffMs / (1000 * 60 * 60 * 24));

    if (minDaysAgo === undefined || daysAgo < minDaysAgo) {
      minDaysAgo = Math.floor(daysAgo);
    }
    if (reportTime > maxReportedTime) {
      maxReportedTime = reportTime;
      maxReportedDate = reportDate.toISOString();
    }

    // Exponential half-life decay formula: w = 2 ^ (-daysAgo / halfLife)
    const weight = Math.pow(2, -daysAgo / halfLife);
    totalDecayedScore += weight;

    // Period breakdown
    if (daysAgo <= 7) {
      within7Days++;
    } else if (daysAgo <= 30) {
      within30Days++;
    } else if (daysAgo <= 90) {
      within90Days++;
    } else {
      olderThan90Days++;
    }

    // Category weighting
    if (report.reason && report.reason.trim()) {
      const reason = report.reason.trim();
      const prev = categoryWeightMap.get(reason) ?? 0;
      categoryWeightMap.set(reason, prev + weight);
    }
  }

  // Top categories sorted by accumulated decayed weight
  const topCategories = Array.from(categoryWeightMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  return {
    rawReportCount,
    uniqueReporters,
    decayedScore: Math.round(totalDecayedScore * 100) / 100,
    recentReportCount: within7Days,
    lastReportedDaysAgo: minDaysAgo,
    lastReportedDate: maxReportedDate,
    topCategories,
    breakdownByPeriod: {
      within7Days,
      within30Days,
      within90Days,
      olderThan90Days
    }
  };
}
