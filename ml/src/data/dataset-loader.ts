import fs from 'node:fs';
import type { SampleRow } from './dataset-types.js';

/**
 * Loads and parses a CSV dataset file with columns: payload,label,source[,patternType,note]
 */
export function loadCsvDataset(csvPath: string): SampleRow[] {
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const rows: SampleRow[] = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    // Parse simple CSV line handling quotes
    const fields = parseCsvLine(line);
    const payload = fields[0] ?? '';
    const labelStr = fields[1] ?? '0';
    const sourceStr = (fields[2] ?? 'real_manual') as 'synthetic' | 'real_phish' | 'real_manual';
    const patternType = fields[3];
    const note = fields[4];

    if (!payload) continue;

    const label = (parseInt(labelStr, 10) === 1 ? 1 : 0) as 0 | 1;

    rows.push({
      payload,
      label,
      source: sourceStr,
      ...(patternType ? { patternType } : {}),
      ...(note ? { note } : {})
    });
  }

  return rows;
}

/**
 * Loads JSON dataset file.
 */
export function loadJsonDataset(jsonPath: string): SampleRow[] {
  if (!fs.existsSync(jsonPath)) {
    return [];
  }
  const content = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(content) as SampleRow[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);

    if (char === '"') {
      if (inQuotes && line.charAt(i + 1) === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
