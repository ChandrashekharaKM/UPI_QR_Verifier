import type { ParsedPayload } from '../types/payload.js';
import { parsePayload } from '../parser/payload-parser.js';
import type {
  VpaVerifierProvider,
  VpaVerificationResult,
  VpaCompositeResult,
  VpaVerificationStatus
} from './types.js';
import { OfflineStructuralVerifier } from './offline-structural-verifier.js';

export class VpaVerifierRegistry {
  private readonly providers: Map<string, VpaVerifierProvider> = new Map();

  constructor() {
    // Automatically register default OfflineStructuralVerifier
    this.register(new OfflineStructuralVerifier());
  }

  public register(provider: VpaVerifierProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  public unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  public getProvider(providerId: string): VpaVerifierProvider | undefined {
    return this.providers.get(providerId);
  }

  public getAllProviders(): readonly VpaVerifierProvider[] {
    return Array.from(this.providers.values());
  }

  public async verifyAll(
    payloadOrParsed: string | ParsedPayload,
    enabledProviderIds?: readonly string[]
  ): Promise<VpaCompositeResult> {
    const parsed: ParsedPayload =
      typeof payloadOrParsed === 'string' ? parsePayload(payloadOrParsed) : payloadOrParsed;

    const evaluatedAt = new Date().toISOString();

    let vpa: string | undefined;
    let payeeName: string | undefined;
    const originalScheme = parsed.originalScheme;

    if (parsed.fields.kind === 'upi') {
      vpa = parsed.fields.upi.pa;
      payeeName = parsed.fields.upi.pn;
    } else if (parsed.fields.kind === 'emv') {
      vpa = parsed.fields.upi.pa;
      payeeName = parsed.fields.upi.pn;
    }

    // Determine target providers
    const targetProviders = Array.from(this.providers.values()).filter((p) => {
      if (!enabledProviderIds || enabledProviderIds.length === 0) {
        return p.isDefault;
      }
      return enabledProviderIds.includes(p.id);
    });

    const providerResults: VpaVerificationResult[] = [];
    for (const provider of targetProviders) {
      const res = await Promise.resolve(provider.verify(parsed));
      providerResults.push(res);
    }

    // Calculate overall composite status
    let overallStatus: VpaVerificationStatus = 'verified_valid';
    let overallStatusLabel = 'Structurally Valid';

    if (providerResults.some((r) => r.status === 'unsupported')) {
      overallStatus = 'unsupported';
      overallStatusLabel = 'Unsupported Protocol';
    } else if (providerResults.some((r) => r.status === 'flagged_risk')) {
      overallStatus = 'flagged_risk';
      overallStatusLabel = 'Verification Risk Flagged';
    } else if (providerResults.some((r) => r.status === 'inconclusive')) {
      overallStatus = 'inconclusive';
      overallStatusLabel = 'Partially Inconclusive';
    }

    return {
      vpa,
      payeeName,
      originalScheme,
      overallStatus,
      overallStatusLabel,
      providerResults,
      honestLimitationNotice:
        'NPCI provides no public API to confirm live VPA existence. Verification evaluates structural banking rules, cryptographic CRC checksums, and community threat reputation.',
      evaluatedAt
    };
  }
}

export const defaultVpaRegistry = new VpaVerifierRegistry();

export async function verifyVpa(
  payloadOrParsed: string | ParsedPayload,
  enabledProviderIds?: readonly string[]
): Promise<VpaCompositeResult> {
  return defaultVpaRegistry.verifyAll(payloadOrParsed, enabledProviderIds);
}
