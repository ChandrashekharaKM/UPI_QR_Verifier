import DatabaseConstructor, { type Database } from 'better-sqlite3';
import { calculateReputationDecay } from '@upi-verifier/core';
import {
  INIT_DB_SQL,
  type ReportRecord,
  type ScanRecord,
  type VpaReputationSummary
} from './schema.js';

export class DatabaseClient {
  private readonly db: Database;

  constructor(dbPath = ':memory:') {
    this.db = new DatabaseConstructor(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    this.db.exec(INIT_DB_SQL);
  }

  public getRawDatabase(): Database {
    return this.db;
  }

  public insertReport(record: ReportRecord): { inserted: boolean; message: string } {
    const cleanVpa = record.vpa.trim().toLowerCase();
    try {
      // Check existing report from this device
      const existing = this.db.prepare(`
        SELECT id, created_at FROM reports WHERE vpa = ? AND device_hash = ?
      `).get(cleanVpa, record.device_hash) as { id: number; created_at: string } | undefined;

      if (existing) {
        // Cooldown: check if submitted within last 24 hours
        const diffMs = Date.now() - new Date(existing.created_at).getTime();
        const hoursAgo = diffMs / (1000 * 60 * 60);

        if (hoursAgo < 24) {
          return {
            inserted: false,
            message: 'A report for this UPI ID from your device has already been recorded'
          };
        }

        // If > 24 hours have elapsed, update the existing report (retaining single unique deduplicated reporter record)
        this.db.prepare(`
          UPDATE reports
          SET reason = @reason, note = @note, created_at = DATETIME('now')
          WHERE id = @id
        `).run({
          id: existing.id,
          reason: record.reason,
          note: record.note ?? null
        });

        return { inserted: true, message: 'Report updated with latest threat details' };
      }

      const stmt = this.db.prepare(`
        INSERT INTO reports (vpa, reason, note, device_hash)
        VALUES (@vpa, @reason, @note, @device_hash)
      `);

      stmt.run({
        vpa: cleanVpa,
        reason: record.reason,
        note: record.note ?? null,
        device_hash: record.device_hash
      });

      return { inserted: true, message: 'Report submitted successfully' };
    } catch (err: unknown) {
      // Catch unique constraint violation for deduplication
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return {
          inserted: false,
          message: 'A report for this UPI ID from your device has already been recorded'
        };
      }
      throw err;
    }
  }

  public getVpaReputation(vpa: string): VpaReputationSummary {
    const cleanVpa = vpa.trim().toLowerCase();

    // Query all reports for this VPA to compute time decay weighting and device deduplication
    const rows = this.db.prepare(`
      SELECT reason, note, device_hash as deviceHash, created_at as createdAt
      FROM reports
      WHERE vpa = ?
      ORDER BY created_at DESC
    `).all(cleanVpa) as Array<{
      reason: string;
      note?: string;
      deviceHash: string;
      createdAt: string;
    }>;

    if (rows.length === 0) {
      return {
        vpa: cleanVpa,
        reportCount: 0,
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

    const decay = calculateReputationDecay(rows);

    return {
      vpa: cleanVpa,
      reportCount: decay.uniqueReporters,
      uniqueReporters: decay.uniqueReporters,
      decayedScore: decay.decayedScore,
      recentReportCount: decay.recentReportCount,
      ...(decay.lastReportedDate ? { lastReported: decay.lastReportedDate } : {}),
      ...(decay.lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo: decay.lastReportedDaysAgo } : {}),
      topCategories: decay.topCategories,
      breakdownByPeriod: decay.breakdownByPeriod
    };
  }

  public insertScan(record: ScanRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO scans (payload_hash, score, category, is_opted_in, raw_payload)
      VALUES (@payload_hash, @score, @category, @is_opted_in, @raw_payload)
    `);

    stmt.run({
      payload_hash: record.payload_hash,
      score: record.score,
      category: record.category,
      is_opted_in: record.is_opted_in,
      raw_payload: record.raw_payload ?? null
    });
  }

  public close(): void {
    this.db.close();
  }
}
