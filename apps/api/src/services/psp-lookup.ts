import { hashString } from '../db/schema.js';
import type { PspLookupSignal } from '@upi-verifier/core';

export type PspGatewayProvider = 'razorpay' | 'cashfree' | 'mock';

export interface PspLookupServiceConfig {
  readonly enabled?: boolean;
  readonly provider?: PspGatewayProvider;
  readonly razorpayKeyId?: string;
  readonly razorpayKeySecret?: string;
  readonly cashfreeAppId?: string;
  readonly cashfreeSecretKey?: string;
  readonly cashfreeEnv?: 'TEST' | 'PROD';
  readonly timeoutMs?: number;
  readonly mockEntries?: Record<string, { isValid: boolean; registeredName?: string }>;
}

export interface LookupVpaOptions {
  readonly optInTelemetry?: boolean;
}

/**
 * Privacy helper: masks raw VPA addresses unless explicit user telemetry consent was granted.
 * Never leaks raw bank handles or user identities into diagnostic traces or logs.
 */
export function maskVpaForLogs(vpa: string, optInConsent = false): string {
  if (optInConsent) {
    return vpa;
  }
  const parts = vpa.split('@');
  if (parts.length === 2) {
    const handle = parts[1];
    const hashPrefix = hashString(parts[0]!).slice(0, 8);
    return `[anon_${hashPrefix}@${handle}]`;
  }
  return `[anon_${hashString(vpa).slice(0, 8)}]`;
}

export class PspLookupService {
  public readonly enabled: boolean;
  public readonly provider: PspGatewayProvider;
  private readonly config: PspLookupServiceConfig;

  // Default mock dictionary for testing / offline simulations
  private static readonly DEFAULT_MOCK_ENTRIES: Record<
    string,
    { isValid: boolean; registeredName?: string }
  > = {
    'starbucks@okhdfcbank': { isValid: true, registeredName: 'Starbucks Coffee India Pvt Ltd' },
    'fraud99@ybl': { isValid: true, registeredName: 'Dinesh Prasad Gupta' },
    'electricity@okaxis': { isValid: true, registeredName: 'State Electricity Distribution Co' },
    'invalid.handle@okhdfcbank': { isValid: false },
    'inactive.account@ybl': { isValid: false }
  };

  constructor(config?: PspLookupServiceConfig) {
    const envEnabled = process.env.PSP_LOOKUP_ENABLED === 'true';
    const envProvider = (process.env.PSP_LOOKUP_PROVIDER as PspGatewayProvider) || 'mock';

    this.enabled = config?.enabled ?? envEnabled ?? false;
    this.provider = config?.provider ?? envProvider;
    this.config = {
      timeoutMs: 4000,
      ...config
    };
  }

  /**
   * Performs real-time VPA validation through the configured licensed gateway.
   * STRICT PRIVACY GUARANTEE: Never logs raw VPAs without explicit opt-in consent.
   */
  public async validateVpa(
    vpa: string,
    options?: LookupVpaOptions
  ): Promise<PspLookupSignal | null> {
    if (!this.enabled) {
      return null;
    }

    const optIn = options?.optInTelemetry ?? false;
    const maskedLogId = maskVpaForLogs(vpa, optIn);

    switch (this.provider) {
      case 'razorpay':
        return this.queryRazorpay(vpa, maskedLogId);
      case 'cashfree':
        return this.queryCashfree(vpa, maskedLogId);
      case 'mock':
      default:
        return this.queryMock(vpa);
    }
  }

  private async queryRazorpay(vpa: string, _maskedLogId: string): Promise<PspLookupSignal> {
    const keyId = this.config.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = this.config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing.');
    }

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 4000);

    try {
      const response = await fetch('https://api.razorpay.com/v1/payments/validate/vpa', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vpa }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Razorpay API error HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        vpa?: string;
        success?: boolean;
        customer_name?: string;
      };

      const isValid = Boolean(data.success);
      return {
        isValid,
        registeredName: isValid ? data.customer_name?.trim() : undefined,
        provider: 'razorpay',
        rawResponse: {
          success: data.success,
          customer_name: data.customer_name
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async queryCashfree(vpa: string, _maskedLogId: string): Promise<PspLookupSignal> {
    const appId = this.config.cashfreeAppId || process.env.CASHFREE_APP_ID;
    const secretKey = this.config.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY;
    const env = this.config.cashfreeEnv || (process.env.CASHFREE_ENV as 'TEST' | 'PROD') || 'TEST';

    if (!appId || !secretKey) {
      throw new Error('Cashfree credentials (CASHFREE_APP_ID, CASHFREE_SECRET_KEY) are missing.');
    }

    const baseUrl =
      env === 'PROD'
        ? 'https://payout-api.cashfree.com/payout/v1'
        : 'https://payout-gamma.cashfree.com/payout/v1';

    const url = `${baseUrl}/validation/upiDetails?vpa=${encodeURIComponent(vpa)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 4000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Client-Id': appId,
          'X-Client-Secret': secretKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Cashfree API error HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        status?: string;
        subCode?: string;
        message?: string;
        data?: {
          nameAtBank?: string;
          accountExists?: string;
        };
      };

      const isValid = data.status === 'SUCCESS' && data.data?.accountExists === 'YES';
      return {
        isValid,
        registeredName: isValid ? data.data?.nameAtBank?.trim() : undefined,
        provider: 'cashfree',
        rawResponse: {
          status: data.status,
          message: data.message,
          data: data.data
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private queryMock(vpa: string): PspLookupSignal {
    const normalizedVpa = vpa.trim().toLowerCase();
    const custom = this.config.mockEntries?.[normalizedVpa];
    if (custom) {
      return {
        isValid: custom.isValid,
        registeredName: custom.registeredName,
        provider: 'mock-gateway'
      };
    }

    const standard = PspLookupService.DEFAULT_MOCK_ENTRIES[normalizedVpa];
    if (standard) {
      return {
        isValid: standard.isValid,
        registeredName: standard.registeredName,
        provider: 'mock-gateway'
      };
    }

    // Default mock response: active account with simulated bank name
    const localPart = normalizedVpa.split('@')[0] ?? 'beneficiary';
    return {
      isValid: true,
      registeredName: localPart.replace(/[._]/g, ' ').toUpperCase(),
      provider: 'mock-gateway'
    };
  }
}
