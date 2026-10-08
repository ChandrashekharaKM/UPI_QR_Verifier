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

export interface CommunityReputationSignal {
  readonly reportCount: number;
  readonly lastReportedDaysAgo?: number;
  readonly topCategories: readonly string[];
}

export interface RuleContext {
  readonly parsed: ParsedPayload;
  readonly community?: CommunityReputationSignal;
}

export type RuleFunction = (ctx: RuleContext) => RuleResult;
