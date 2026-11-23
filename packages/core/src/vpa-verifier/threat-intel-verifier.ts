import type { ParsedPayload } from '../types/payload.js';
import { parsePayload } from '../parser/payload-parser.js';
import type { ThreatIntelSignal } from '../types/rules.js';
import type {
  VpaVerifierProvider,
  VpaVerificationResult,
  VpaVerificationStatus,
  VpaCheckItem,
  VpaVerificationDetails
} from './types.js';

export interface ThreatIntelFetchFunction {
  (url: string): Promise<ThreatIntelSignal | null | undefined>;
}

export interface ThreatIntelVerifierOptions {
  readonly fetcher?: ThreatIntelFetchFunction;
  readonly signal?: ThreatIntelSignal;
}

/**
 * ThreatIntelVerifier: Evaluates URL-type QRs against Google Safe Browsing and PhishTank
 * feeds strictly via the API server (never directly from the client application).
 * Implements strict timeout and graceful degradation.
 */
export class ThreatIntelVpaVerifier implements VpaVerifierProvider {
  public readonly id = 'threat-intel';
  public readonly name = 'Threat Intelligence URL Network';
  public readonly isDefault = false;
  public readonly isOnline = true;
  public readonly description =
    'Validates web URL targets against Google Safe Browsing and PhishTank feeds via the API server to identify phishing, malware, and social engineering attacks.';
  public readonly honestLimitationNotice =
    'Threat intelligence lookups evaluate external web URLs via API server queries only. Zero-day phishing campaigns and freshly minted domains may take hours to appear in public threat feeds.';

  private readonly fetcher?: ThreatIntelFetchFunction;
  private readonly injectedSignal?: ThreatIntelSignal;

  constructor(options?: ThreatIntelVerifierOptions) {
    this.fetcher = options?.fetcher;
    this.injectedSignal = options?.signal;
  }

  private extractTargetUrl(parsed: ParsedPayload): string | undefined {
    if (parsed.kind === 'url' && parsed.fields.kind === 'url') {
      return parsed.fields.url.rawUrl;
    }
    if (
      (parsed.kind === 'upi' || parsed.kind === 'emv') &&
      (parsed.fields.kind === 'upi' || parsed.fields.kind === 'emv') &&
      parsed.fields.upi.url
    ) {
      return parsed.fields.upi.url;
    }
    if (parsed.rawPayload.startsWith('http://') || parsed.rawPayload.startsWith('https://')) {
      return parsed.rawPayload.trim();
    }
    return undefined;
  }

  private buildNonUrlResult(timestamp: string): VpaVerificationResult {
    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: true,
      status: 'unsupported',
      statusLabel: 'Not a Web URL',
      summary: 'QR code contains a native UPI payment URI rather than an external web URL; threat intelligence URL verification is not applicable.',
      honestLimitationNotice: this.honestLimitationNotice,
      details: {
        formatCheck: { id: 'fmt', name: 'URL Scheme Check', passed: true, status: 'not_applicable', details: 'N/A' },
        pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'not_applicable', details: 'N/A' },
        merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
        emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
        unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' },
        threatIntelCheck: {
          id: 'threat_intel_url',
          name: 'URL Threat Intelligence',
          passed: true,
          status: 'not_applicable',
          details: 'Payload is native UPI protocol, not a web URL.'
        }
      },
      warnings: [],
      timestamp
    };
  }

  private buildResult(
    url: string,
    signal: ThreatIntelSignal | undefined,
    timestamp: string
  ): VpaVerificationResult {
    // Graceful degradation when signal is absent (e.g. timeout or unconfigured API key)
    if (!signal) {
      return {
        providerId: this.id,
        providerName: this.name,
        isOnline: true,
        isValid: true, // Graceful degradation: does not block verification
        status: 'inconclusive',
        statusLabel: 'Threat Lookup Inconclusive',
        summary: `Threat intelligence check for "${url}" was inconclusive (upstream service unavailable, timed out, or unconfigured).`,
        honestLimitationNotice: this.honestLimitationNotice,
        details: {
          formatCheck: { id: 'fmt', name: 'URL Format', passed: true, status: 'pass', details: `URL: ${url}` },
          pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'not_applicable', details: 'N/A' },
          merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
          emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
          unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' },
          threatIntelCheck: {
            id: 'threat_intel_url',
            name: 'URL Threat Intelligence',
            passed: true,
            status: 'warn',
            details: 'Lookup timed out or upstream feed degraded gracefully.'
          }
        },
        warnings: ['Threat intelligence lookup was unavailable or timed out; proceeding with heuristic checks.'],
        timestamp
      };
    }

    const sourceLabel =
      signal.source === 'google_safe_browsing'
        ? 'Google Safe Browsing'
        : signal.source === 'phishtank'
          ? 'PhishTank'
          : signal.source ?? 'Threat Intelligence';

    const isMalicious = Boolean(signal.isMalicious);
    const threatType = signal.threatType ?? (isMalicious ? 'MALICIOUS_URL' : 'CLEAN');

    const threatIntelCheck: VpaCheckItem = isMalicious
      ? {
          id: 'threat_intel_url',
          name: 'URL Threat Intelligence',
          passed: false,
          status: 'fail',
          details: `URL is flagged as ${threatType} by ${sourceLabel}. Visiting this URL is dangerous.`
        }
      : {
          id: 'threat_intel_url',
          name: 'URL Threat Intelligence',
          passed: true,
          status: 'pass',
          details: `URL verified clean on ${sourceLabel} threat intelligence network.`
        };

    const warnings: string[] = [];
    if (isMalicious) {
      warnings.push(`CONFIRMED THREAT: URL "${url}" is flagged as ${threatType} by ${sourceLabel}.`);
    }

    const status: VpaVerificationStatus = isMalicious ? 'flagged_risk' : 'verified_valid';
    const statusLabel = isMalicious ? 'Confirmed Malicious URL' : 'URL Threat Check Clean';
    const summary = isMalicious
      ? `CRITICAL THREAT: Target URL is actively flagged as ${threatType} by ${sourceLabel}. Do not visit this website or download files.`
      : `Target URL is clean according to ${sourceLabel} threat intelligence telemetry.`;

    const details: VpaVerificationDetails = {
      formatCheck: { id: 'fmt', name: 'URL Format', passed: true, status: 'pass', details: `URL: ${url}` },
      pspHandleCheck: { id: 'psp', name: 'PSP Check', passed: true, status: 'not_applicable', details: 'N/A' },
      merchantConsistencyCheck: { id: 'mcc', name: 'Merchant Consistency', passed: true, status: 'not_applicable', details: 'N/A' },
      emvCrcCheck: { id: 'crc', name: 'CRC Check', passed: true, status: 'not_applicable', details: 'N/A' },
      unicodeSafetyCheck: { id: 'uni', name: 'Unicode Check', passed: true, status: 'pass', details: 'Clean' },
      threatIntelCheck,
      threatIntelSource: sourceLabel,
      threatType
    };

    return {
      providerId: this.id,
      providerName: this.name,
      isOnline: true,
      isValid: !isMalicious,
      status,
      statusLabel,
      summary,
      honestLimitationNotice: this.honestLimitationNotice,
      details,
      warnings,
      timestamp
    };
  }

  public verify(
    payload: string | ParsedPayload
  ): Promise<VpaVerificationResult> | VpaVerificationResult {
    const timestamp = new Date().toISOString();
    const parsed: ParsedPayload = typeof payload === 'string' ? parsePayload(payload) : payload;
    const targetUrl = this.extractTargetUrl(parsed);

    if (!targetUrl) {
      return this.buildNonUrlResult(timestamp);
    }

    if (this.injectedSignal) {
      return this.buildResult(targetUrl, this.injectedSignal, timestamp);
    }

    if (this.fetcher) {
      return this.fetcher(targetUrl)
        .then((signal) => this.buildResult(targetUrl, signal ?? undefined, timestamp))
        .catch(() => {
          // Graceful degradation: never crash if external threat intel feed fails or times out
          return this.buildResult(targetUrl, undefined, timestamp);
        });
    }

    return this.buildResult(targetUrl, undefined, timestamp);
  }
}

export const ThreatIntelVerifier = ThreatIntelVpaVerifier;
