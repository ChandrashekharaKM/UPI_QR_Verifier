import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkPspFreshness } from '../scripts/check-psp-freshness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowlistPath = path.resolve(__dirname, '../src/validators/psp-allowlist.json');

describe('PSP Allowlist Data Freshness Suite', () => {
  it('1. psp-allowlist.json contains valid metadata schema with version and updatedAt', () => {
    expect(fs.existsSync(allowlistPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));

    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe('string');
    expect(data.version.length).toBeGreaterThan(0);

    expect(data.updatedAt).toBeDefined();
    expect(typeof data.updatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(data.updatedAt))).toBe(false);

    expect(data.maxFreshnessDays).toBeDefined();
    expect(typeof data.maxFreshnessDays).toBe('number');
    expect(data.maxFreshnessDays).toBe(180);

    expect(Array.isArray(data.handles)).toBe(true);
    expect(data.handles.length).toBeGreaterThan(100);
  });

  it('2. current psp-allowlist.json is within the 180-day freshness threshold', () => {
    const result = checkPspFreshness(allowlistPath);

    expect(result.error).toBeUndefined();
    expect(result.isFresh).toBe(true);
    expect(result.ageDays).toBeLessThanOrEqual(180);
    expect(result.warning).toBeUndefined();
  });

  it('3. warns when allowlist updatedAt timestamp exceeds 180 days', () => {
    // Simulate a future evaluation date 200 days after the file's updatedAt date
    const data = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
    const fileDate = new Date(data.updatedAt);
    const staleDate = new Date(fileDate.getTime() + 200 * 24 * 60 * 60 * 1000);

    const result = checkPspFreshness(allowlistPath, staleDate);

    expect(result.isFresh).toBe(false);
    expect(result.ageDays).toBeGreaterThan(180);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('older than 180 days');
    expect(result.warning).toContain('NPCI');
  });

  it('4. handles missing or corrupted allowlist files gracefully with error reporting', () => {
    const nonExistentPath = path.resolve(__dirname, '../src/validators/non-existent-allowlist.json');
    const result = checkPspFreshness(nonExistentPath);

    expect(result.isFresh).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('File not found');
  });
});
