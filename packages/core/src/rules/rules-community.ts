import type { RuleContext, RuleResult } from '../types/rules.js';

/**
 * Rule: Community reported scam history.
 * Why: Crowd-sourced report consensus from verified users is a powerful real-world threat signal.
 */
export function ruleCommunityHighReports(ctx: RuleContext): RuleResult {
  const count = ctx.community?.reportCount ?? 0;
  const decayed = ctx.community?.decayedScore;
  const effective = decayed !== undefined ? decayed : count;
  const isTriggered = effective >= 1.5 || count >= 2;

  const severity = effective >= 4 || count >= 5 ? 'critical' : 'high';
  const weight = effective >= 4 || count >= 5 ? 85 : 60;

  return {
    id: 'RULE_COMMUNITY_HIGH_REPORTS',
    triggered: isTriggered,
    severity,
    weight,
    title: 'Multiple Scam Reports on Record',
    message: isTriggered
      ? `This UPI recipient has been flagged by ${count} user reports (decayed threat weight: ${effective.toFixed(2)}) as a suspected fraudulent or scam account.`
      : 'No widespread community reports on file.',
    evidence: isTriggered
      ? [
          { key: 'reportCount', value: count },
          ...(ctx.community?.uniqueReporters !== undefined ? [{ key: 'uniqueReporters', value: ctx.community.uniqueReporters }] : []),
          ...(decayed !== undefined ? [{ key: 'decayedScore', value: decayed }] : []),
          { key: 'categories', value: (ctx.community?.topCategories ?? []).join(', ') }
        ]
      : undefined
  };
}

/**
 * Rule: Recent scam report activity.
 * Why: Scams operate in rapid bursts before accounts are frozen. A report within the last 7 days indicates an active campaign.
 */
export function ruleCommunityRecentReports(ctx: RuleContext): RuleResult {
  const daysAgo = ctx.community?.lastReportedDaysAgo;
  const isRecent = daysAgo !== undefined && daysAgo <= 7;

  return {
    id: 'RULE_COMMUNITY_RECENT_REPORTS',
    triggered: isRecent,
    severity: 'medium',
    weight: 40,
    title: 'Recent Fraud Activity Reported',
    message: isRecent
      ? `A scam report was logged against this recipient very recently (within ${daysAgo} days), indicating active malicious operations.`
      : 'No recent reports logged in the past 7 days.',
    evidence: isRecent && daysAgo !== undefined
      ? [{ key: 'lastReportedDaysAgo', value: daysAgo }]
      : undefined
  };
}
