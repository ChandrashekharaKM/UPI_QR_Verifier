import { hashString } from '../db/schema.js';
import type { ThreatIntelSignal } from '@upi-verifier/core';

export type ThreatIntelProviderType = 'google' | 'phishtank' | 'all' | 'mock';

export interface ThreatIntelServiceConfig {
  readonly enabled?: boolean;
  readonly provider?: ThreatIntelProviderType;
  readonly googleApiKey?: string;
  readonly phishtankApiKey?: string;
  readonly timeoutMs?: number;
  readonly mockEntries?: Record<string, { isMalicious: boolean; threatType?: string }>;
}

export interface CheckUrlOptions {
  readonly optInTelemetry?: boolean;
}

/**
 * Privacy helper: masks URL path and query parameters for server diagnostics
 * unless explicit opt-in telemetry consent has been provided.
 */
export function maskUrlForLogs(rawUrl: string, optInConsent = false): string {
  if (optInConsent) {
    return rawUrl;
  }
  try {
    const parsed = new URL(rawUrl);
    const domainHash = hashString(parsed.hostname).slice(0, 8);
    return `${parsed.protocol}//[anon_${domainHash}]:masked`;
  } catch {
    return `[anon_url_${hashString(rawUrl).slice(0, 8)}]`;
  }
}

export class ThreatIntelService {
  public readonly enabled: boolean;
  public readonly provider: ThreatIntelProviderType;
  private readonly config: ThreatIntelServiceConfig;

  // Pre-configured test dictionary for local simulations & CI
  private static readonly DEFAULT_MOCK_ENTRIES: Record<
    string,
    { isMalicious: boolean; threatType?: string; source?: string }
  > = {
    'https://testsafebrowsing.appspot.com/s/phishing.html': {
      isMalicious: true,
      threatType: 'SOCIAL_ENGINEERING',
      source: 'google_safe_browsing'
    },
    'https://testsafebrowsing.appspot.com/s/malware.html': {
      isMalicious: true,
      threatType: 'MALWARE',
      source: 'google_safe_browsing'
    },
    'https://phishing-bank-login.xyz/login': {
      isMalicious: true,
      threatType: 'PHISHING',
      source: 'phishtank'
    },
    'https://malware-download.xyz/update.apk': {
      isMalicious: true,
      threatType: 'MALWARE',
      source: 'google_safe_browsing'
    }
  };

  constructor(config?: ThreatIntelServiceConfig) {
    const envEnabled = process.env.THREAT_INTEL_ENABLED === 'true';
    const envProvider = (process.env.THREAT_INTEL_PROVIDER as ThreatIntelProviderType) || 'mock';

    this.enabled = config?.enabled ?? envEnabled ?? false;
    this.provider = config?.provider ?? envProvider;
    this.config = {
      timeoutMs: 3000,
      ...config
    };
  }

  /**
   * Evaluates a target URL against configured threat intelligence networks via the API server.
   * STRICT TIMEOUT & GRACEFUL DEGRADATION: Times out in 3000ms and never throws or interrupts verification.
   */
  public async checkUrl(
    targetUrl: string,
    options?: CheckUrlOptions
  ): Promise<ThreatIntelSignal | null> {
    if (!this.enabled || !targetUrl) {
      return null;
    }

    const optIn = options?.optInTelemetry ?? false;
    void maskUrlForLogs(targetUrl, optIn);

    switch (this.provider) {
      case 'google':
        return this.queryGoogleSafeBrowsingWithGracefulDegradation(targetUrl);
      case 'phishtank':
        return this.queryPhishTankWithGracefulDegradation(targetUrl);
      case 'all':
        return this.queryAllWithGracefulDegradation(targetUrl);
      case 'mock':
      default:
        return this.queryMock(targetUrl);
    }
  }

  private async queryGoogleSafeBrowsingWithGracefulDegradation(
    url: string
  ): Promise<ThreatIntelSignal | null> {
    const apiKey = this.config.googleApiKey || process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) {
      // Degrade gracefully if key is unconfigured
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 3000);

    try {
      const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
      const payload = {
        client: {
          clientId: 'upi-qr-verifier',
          clientVersion: '1.0.0'
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        // Upstream error: degrade gracefully
        return null;
      }

      const data = (await res.json()) as {
        matches?: Array<{ threatType: string; platformType: string }>;
      };

      if (data.matches && data.matches.length > 0) {
        const match = data.matches[0]!;
        return {
          isMalicious: true,
          threatType: match.threatType,
          platform: match.platformType,
          source: 'google_safe_browsing',
          targetUrl: url,
          checkedAt: new Date().toISOString()
        };
      }

      return {
        isMalicious: false,
        source: 'google_safe_browsing',
        targetUrl: url,
        checkedAt: new Date().toISOString()
      };
    } catch {
      // Network failure or timeout: degrade gracefully
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async queryPhishTankWithGracefulDegradation(
    url: string
  ): Promise<ThreatIntelSignal | null> {
    const appKey = this.config.phishtankApiKey || process.env.PHISHTANK_API_KEY;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 3000);

    try {
      const body = new URLSearchParams({
        url,
        format: 'json',
        ...(appKey ? { app_key: appKey } : {})
      });

      const res = await fetch('https://checkurl.phishtank.com/checkurl/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'upi-qr-verifier/1.0.0'
        },
        body: body.toString(),
        signal: controller.signal
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as {
        results?: {
          in_database?: boolean;
          verified?: boolean;
          valid?: boolean;
        };
      };

      const inDb = Boolean(data.results?.in_database);
      const isVerified = Boolean(data.results?.verified);
      const isMalicious = inDb && isVerified;

      return {
        isMalicious,
        threatType: isMalicious ? 'PHISHING' : undefined,
        source: 'phishtank',
        targetUrl: url,
        checkedAt: new Date().toISOString()
      };
    } catch {
      // Degrade gracefully on timeout or network error
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async queryAllWithGracefulDegradation(url: string): Promise<ThreatIntelSignal | null> {
    // Check Google Safe Browsing first
    const googleResult = await this.queryGoogleSafeBrowsingWithGracefulDegradation(url);
    if (googleResult && googleResult.isMalicious) {
      return googleResult;
    }

    // Secondary check with PhishTank
    const phishTankResult = await this.queryPhishTankWithGracefulDegradation(url);
    if (phishTankResult && phishTankResult.isMalicious) {
      return phishTankResult;
    }

    return googleResult || phishTankResult || {
      isMalicious: false,
      source: 'threat_intel_network',
      targetUrl: url,
      checkedAt: new Date().toISOString()
    };
  }

  private queryMock(url: string): ThreatIntelSignal {
    const custom = this.config.mockEntries?.[url];
    if (custom) {
      return {
        isMalicious: custom.isMalicious,
        threatType: custom.threatType,
        source: 'mock-threat-intel',
        targetUrl: url,
        checkedAt: new Date().toISOString()
      };
    }

    const standard = ThreatIntelService.DEFAULT_MOCK_ENTRIES[url];
    if (standard) {
      return {
        isMalicious: standard.isMalicious,
        threatType: standard.threatType,
        source: standard.source ?? 'mock-threat-intel',
        targetUrl: url,
        checkedAt: new Date().toISOString()
      };
    }

    // Default mock behavior for other URLs
    const isMockMalicious = url.includes('phishing') || url.includes('malware');
    return {
      isMalicious: isMockMalicious,
      threatType: isMockMalicious ? 'SOCIAL_ENGINEERING' : undefined,
      source: 'mock-threat-intel',
      targetUrl: url,
      checkedAt: new Date().toISOString()
    };
  }
}
