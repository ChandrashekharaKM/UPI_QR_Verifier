import DatabaseConstructor, { type Database } from 'better-sqlite3';
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

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as cnt, MAX(created_at) as last_reported
      FROM reports
      WHERE vpa = ?
    `).get(cleanVpa) as { cnt: number; last_reported: string | null } | undefined;

    const reportCount = countRow?.cnt ?? 0;
    const lastReported = countRow?.last_reported ?? undefined;

    let lastReportedDaysAgo: number | undefined;
    if (lastReported) {
      const reportedDate = new Date(lastReported);
      const now = new Date();
      const diffMs = now.getTime() - reportedDate.getTime();
      lastReportedDaysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    const categoryRows = this.db.prepare(`
      SELECT reason, COUNT(*) as freq
      FROM reports
      WHERE vpa = ?
      GROUP BY reason
      ORDER BY freq DESC
      LIMIT 3
    `).all(cleanVpa) as Array<{ reason: string; freq: number }>;

    const topCategories = categoryRows.map((r) => r.reason);

    return {
      vpa: cleanVpa,
      reportCount,
      ...(lastReported ? { lastReported } : {}),
      ...(lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo } : {}),
      topCategories
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
