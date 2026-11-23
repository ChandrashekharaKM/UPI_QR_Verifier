import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePayload } from '../src/parser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.resolve(__dirname, '../../../ml/data/real_samples.csv');

function parseCsv(content: string) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Array<{
    payload: string;
    label: number;
    source: string;
    patternType: string;
    note: string;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line.charAt(j);
      if (char === '"') {
        if (inQuotes && line.charAt(j + 1) === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    rows.push({
      payload: fields[0] ?? '',
      label: parseInt(fields[1] ?? '0', 10),
      source: fields[2] ?? '',
      patternType: fields[3] ?? '',
      note: fields[4] ?? ''
    });
  }

  return rows;
}

describe('Real-World Labelled Dataset Verification Suite (ml/data/real_samples.csv)', () => {
  it('1. real_samples.csv exists and has non-empty valid content', () => {
    expect(fs.existsSync(csvPath)).toBe(true);
    const content = fs.readFileSync(csvPath, 'utf-8');
    expect(content.length).toBeGreaterThan(1000);
  });

  it('2. meets minimum row count requirements: at least 300 legitimate and 150 scam-pattern rows', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(content);

    const legitimateRows = rows.filter((r) => r.label === 0);
    const scamRows = rows.filter((r) => r.label === 1);

    expect(legitimateRows.length).toBeGreaterThanOrEqual(300);
    expect(scamRows.length).toBeGreaterThanOrEqual(150);
    expect(rows.length).toBeGreaterThanOrEqual(450);
  });

  it('3. covers all mandated public advisory and consented sources', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(content);

    const sources = new Set(rows.map((r) => r.source));

    expect(sources.has('maintainer_consented_scan')).toBe(true);
    expect(sources.has('npci_public_advisory')).toBe(true);
    expect(sources.has('rbi_public_advisory')).toBe(true);
    expect(sources.has('i4c_cybercrime_gov')).toBe(true);
    expect(sources.has('bank_fraud_alert')).toBe(true);
    expect(sources.has('documented_scam_pattern')).toBe(true);
  });

  it('4. all payloads parse successfully without uncaught parser exceptions', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(content);

    for (const row of rows) {
      expect(row.payload.length).toBeGreaterThan(0);
      const parsed = parsePayload(row.payload);
      expect(parsed).toBeDefined();
      expect(['upi', 'emv', 'url', 'unknown']).toContain(parsed.kind);
    }
  });

  it('5. preserves privacy: every row has a non-empty source and documented patternType', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(content);

    for (const row of rows) {
      expect(row.source.trim().length).toBeGreaterThan(0);
      expect(row.patternType.trim().length).toBeGreaterThan(0);
      expect(row.note.trim().length).toBeGreaterThan(0);
    }
  });

  it('6. contains EMV-format and deep-link samples in both legitimate (0) and scam (1) classes', () => {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(content);

    const isEmv = (payload: string) => payload.startsWith('000201');
    const isDeepLink = (payload: string) =>
      payload.startsWith('intent://') ||
      payload.startsWith('phonepe://') ||
      payload.startsWith('paytmmp://') ||
      payload.startsWith('tez://') ||
      payload.startsWith('bhim://');

    const legitEmv = rows.filter((r) => r.label === 0 && isEmv(r.payload));
    const legitDeepLink = rows.filter((r) => r.label === 0 && isDeepLink(r.payload));
    const scamEmv = rows.filter((r) => r.label === 1 && isEmv(r.payload));
    const scamDeepLink = rows.filter((r) => r.label === 1 && isDeepLink(r.payload));

    // Assert minimum coverage across both classes
    expect(legitEmv.length).toBeGreaterThanOrEqual(40);
    expect(legitDeepLink.length).toBeGreaterThanOrEqual(30);
    expect(scamEmv.length).toBeGreaterThanOrEqual(15);
    expect(scamDeepLink.length).toBeGreaterThanOrEqual(15);

    // Verify EMV parsing
    for (const row of [...legitEmv, ...scamEmv]) {
      const parsed = parsePayload(row.payload);
      expect(parsed.kind).toBe('emv');
    }

    // Verify deep-link parsing
    for (const row of [...legitDeepLink, ...scamDeepLink]) {
      const parsed = parsePayload(row.payload);
      expect(['upi', 'url']).toContain(parsed.kind);
      expect(parsed.originalScheme).toBeDefined();
      const scheme = parsed.originalScheme ?? '';
      const matchesScheme =
        scheme.startsWith('intent') ||
        scheme.startsWith('phonepe') ||
        scheme.startsWith('paytmmp') ||
        scheme.startsWith('tez') ||
        scheme.startsWith('bhim');
      expect(matchesScheme).toBe(true);
    }
  });
});
