import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FreshnessCheckResult {
  readonly isFresh: boolean;
  readonly ageDays: number;
  readonly maxFreshnessDays: number;
  readonly updatedAt: string;
  readonly version: string;
  readonly warning?: string;
  readonly error?: string;
}

export function checkPspFreshness(
  allowlistPath?: string,
  currentDate: Date = new Date()
): FreshnessCheckResult {
  const resolvedPath =
    allowlistPath ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../src/validators/psp-allowlist.json'
    );

  if (!fs.existsSync(resolvedPath)) {
    return {
      isFresh: false,
      ageDays: -1,
      maxFreshnessDays: 180,
      updatedAt: 'missing',
      version: 'unknown',
      error: `File not found at ${resolvedPath}`
    };
  }

  const rawData = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  const version = rawData.version ?? 'unknown';
  const updatedAtStr = rawData.updatedAt;
  const maxDays = typeof rawData.maxFreshnessDays === 'number' ? rawData.maxFreshnessDays : 180;

  if (!updatedAtStr) {
    return {
      isFresh: false,
      ageDays: -1,
      maxFreshnessDays: maxDays,
      updatedAt: 'missing',
      version,
      error: 'psp-allowlist.json is missing required "updatedAt" field.'
    };
  }

  const updatedTimestamp = Date.parse(updatedAtStr);
  if (Number.isNaN(updatedTimestamp)) {
    return {
      isFresh: false,
      ageDays: -1,
      maxFreshnessDays: maxDays,
      updatedAt: updatedAtStr,
      version,
      error: `Invalid ISO-8601 date in "updatedAt": "${updatedAtStr}".`
    };
  }

  const nowTimestamp = currentDate.getTime();
  const ageMs = Math.max(0, nowTimestamp - updatedTimestamp);
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  const isFresh = ageDays <= maxDays;

  let warning: string | undefined;
  if (!isFresh) {
    warning =
      `PSP allowlist (v${version}) is older than ${maxDays} days (updated: ${updatedAtStr}, age: ${ageDays} days). ` +
      `NPCI updates UPI handles dynamically. Please refresh against NPCI's published list of live UPI PSPs: ` +
      `https://www.npci.org.in/what-we-do/upi/live-members`;
  }

  return {
    isFresh,
    ageDays,
    maxFreshnessDays: maxDays,
    updatedAt: updatedAtStr,
    version,
    warning
  };
}

// Direct CLI invocation
const isDirectCli =
  process.argv[1] &&
  (process.argv[1].endsWith('check-psp-freshness.ts') ||
    process.argv[1].endsWith('check-psp-freshness.js'));

if (isDirectCli) {
  const isStrict = process.argv.includes('--strict');
  const result = checkPspFreshness();

  if (result.error) {
    console.error(`\x1b[31m✖ ERROR:\x1b[0m ${result.error}`);
    process.exit(1);
  }

  if (!result.isFresh) {
    console.warn(`\x1b[33m⚠ WARNING:\x1b[0m ${result.warning}`);
    if (isStrict) {
      console.error(`\x1b[31m✖ Exiting with error code due to --strict flag.\x1b[0m`);
      process.exit(1);
    }
  } else {
    const daysRemaining = result.maxFreshnessDays - result.ageDays;
    console.log(
      `\x1b[32m✔ PSP allowlist is fresh\x1b[0m (v${result.version}, updated ${result.ageDays} days ago on ${result.updatedAt}). ` +
        `Fresh for another ${daysRemaining} days (threshold: ${result.maxFreshnessDays} days).`
    );
  }
}
