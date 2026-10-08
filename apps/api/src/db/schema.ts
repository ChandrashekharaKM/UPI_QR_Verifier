import crypto from 'node:crypto';

export interface ReportRecord {
  readonly id?: number;
  readonly vpa: string;
  readonly reason: string;
  readonly note?: string;
  readonly device_hash: string;
  readonly created_at?: string;
}

export interface ScanRecord {
  readonly id?: number;
  readonly payload_hash: string;
  readonly score: number;
  readonly category: string;
  readonly is_opted_in: number;
  readonly raw_payload?: string | null;
  readonly created_at?: string;
}

export interface VpaReputationSummary {
  readonly vpa: string;
  readonly reportCount: number;
  readonly lastReported?: string;
  readonly lastReportedDaysAgo?: number;
  readonly topCategories: readonly string[];
}

export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}

export const INIT_DB_SQL = `
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vpa TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  device_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_vpa ON reports (vpa);
CREATE INDEX IF NOT EXISTS idx_reports_device ON reports (device_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_vpa_device ON reports (vpa, device_hash);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload_hash TEXT NOT NULL,
  score INTEGER NOT NULL,
  category TEXT NOT NULL,
  is_opted_in INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE INDEX IF NOT EXISTS idx_scans_hash ON scans (payload_hash);
`;
