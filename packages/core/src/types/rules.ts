import type { ParsedPayload } from './payload.js';

export type RuleSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface RuleEvidence {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly detail?: string;
}

export interface RuleResult {
  readonly id: string;
  readonly triggered: boolean;
  readonly severity: RuleSeverity;
  readonly weight: number; // 0 - 100
  readonly title: string;
  readonly message: string;
  readonly evidence?: readonly RuleEvidence[];
}

export interface CommunityPeriodBreakdown {
  readonly within7Days: number;
  readonly within30Days: number;
  readonly within90Days: number;
  readonly olderThan90Days: number;
}

export interface CommunityReputationSignal {
  readonly reportCount: number;
  readonly uniqueReporters?: number;
  readonly decayedScore?: number;
  readonly recentReportCount?: number;
  readonly lastReportedDaysAgo?: number;
  readonly topCategories: readonly string[];
  readonly breakdownByPeriod?: CommunityPeriodBreakdown;
}

export interface PspLookupSignal {
  readonly isValid: boolean;
  readonly registeredName?: string;
  readonly provider?: string;
  readonly rawResponse?: Record<string, unknown>;
}

export type ThreatType =
  | 'MALWARE'
  | 'SOCIAL_ENGINEERING'
  | 'UNWANTED_SOFTWARE'
  | 'POTENTIALLY_HARMFUL_APPLICATION'
  | 'PHISHING'
  | 'SUSPICIOUS';

export interface ThreatIntelSignal {
  readonly isMalicious: boolean;
  readonly threatType?: ThreatType | string;
  readonly platform?: string;
  readonly source?: 'google_safe_browsing' | 'phishtank' | 'mock' | string;
  readonly targetUrl?: string;
  readonly details?: string;
  readonly checkedAt?: string;
}

export interface RuleContext {
  readonly parsed: ParsedPayload;
  readonly community?: CommunityReputationSignal;
  readonly pspLookup?: PspLookupSignal;
  readonly threatIntel?: ThreatIntelSignal;
}

export type RuleFunction = (ctx: RuleContext) => RuleResult;
