import type { FastifyPluginAsync } from 'fastify';
import {
  VpaVerifierRegistry,
  CommunityReputationVpaVerifier,
  PspLookupVpaVerifier,
  ThreatIntelVpaVerifier,
  type CommunityReputationSignal
} from '@upi-verifier/core';
import type { DatabaseClient } from '../db/client.js';
import type { PspLookupService } from '../services/psp-lookup.js';
import type { ThreatIntelService } from '../services/threat-intel.js';

export interface VpaRoutesOptions {
  readonly dbClient: DatabaseClient;
  readonly pspLookupService?: PspLookupService;
  readonly threatIntelService?: ThreatIntelService;
}

export const vpaRoutes: FastifyPluginAsync<VpaRoutesOptions> = async (fastify, opts) => {
  const { dbClient, pspLookupService, threatIntelService } = opts;

  // Build registry with OfflineStructuralVerifier, CommunityReputation, and optional PspLookup
  function buildRegistryForVpa(vpa: string): VpaVerifierRegistry {
    const registry = new VpaVerifierRegistry();
    let communitySignal: CommunityReputationSignal | undefined;

    if (vpa && vpa.includes('@')) {
      const rep = dbClient.getVpaReputation(vpa);
      if (rep.reportCount > 0) {
        communitySignal = {
          reportCount: rep.reportCount,
          uniqueReporters: rep.uniqueReporters,
          decayedScore: rep.decayedScore,
          recentReportCount: rep.recentReportCount,
          ...(rep.lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo: rep.lastReportedDaysAgo } : {}),
          topCategories: rep.topCategories,
          breakdownByPeriod: rep.breakdownByPeriod
        };
      } else {
        communitySignal = {
          reportCount: 0,
          uniqueReporters: 0,
          decayedScore: 0,
          recentReportCount: 0,
          topCategories: []
        };
      }
    }

    registry.register(
      new CommunityReputationVpaVerifier({
        signal: communitySignal
      })
    );

    if (pspLookupService?.enabled) {
      registry.register(
        new PspLookupVpaVerifier({
          fetcher: (targetVpa) => pspLookupService.validateVpa(targetVpa, { optInTelemetry: false })
        })
      );
    }

    if (threatIntelService?.enabled) {
      registry.register(
        new ThreatIntelVpaVerifier({
          fetcher: (targetUrl) => threatIntelService.checkUrl(targetUrl, { optInTelemetry: false })
        })
      );
    }

    return registry;
  }

  // GET /v1/vpa/:vpa/verify - Quick lookup and structural verification
  fastify.get<{ Params: { vpa: string } }>(
    '/vpa/:vpa/verify',
    {
      schema: {
        description:
          'Performs pluggable real-world VPA verification using OfflineStructuralVerifier, CommunityReputation, and licensed PspLookup',
        tags: ['Verification'],
        params: {
          type: 'object',
          properties: {
            vpa: { type: 'string', description: 'UPI Virtual Payment Address' }
          },
          required: ['vpa']
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const rawVpa = decodeURIComponent(request.params.vpa.trim());
      const queryPayload = rawVpa.startsWith('upi://') || rawVpa.startsWith('000201')
        ? rawVpa
        : `upi://pay?pa=${rawVpa}&pn=Payee`;

      const registry = buildRegistryForVpa(rawVpa);
      const enabledProviders = pspLookupService?.enabled
        ? ['offline-structural', 'community-reputation', 'psp-lookup']
        : ['offline-structural', 'community-reputation'];

      const result = await registry.verifyAll(queryPayload, enabledProviders);

      return reply.code(200).send(result);
    }
  );

  // POST /v1/vpa/verify - Full verification for QR payload or standalone VPA
  fastify.post<{
    Body: { payload?: string; vpa?: string; providers?: string[] };
  }>(
    '/vpa/verify',
    {
      schema: {
        description: 'Verifies a VPA or payment QR payload through the pluggable VPA verification registry',
        tags: ['Verification'],
        body: {
          type: 'object',
          properties: {
            payload: { type: 'string', description: 'Raw QR payload string' },
            vpa: { type: 'string', description: 'Standalone VPA address' },
            providers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of provider IDs to evaluate'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { payload, vpa, providers } = request.body ?? {};
      const target = payload ?? (vpa ? `upi://pay?pa=${vpa}&pn=Payee` : undefined);

      if (!target) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Either "payload" or "vpa" parameter must be supplied.'
        });
      }

      const extractedVpa = vpa ?? target;
      const registry = buildRegistryForVpa(extractedVpa);
      const defaultProviders = pspLookupService?.enabled
        ? ['offline-structural', 'community-reputation', 'psp-lookup']
        : ['offline-structural', 'community-reputation'];

      const enabled = providers && providers.length > 0 ? providers : defaultProviders;

      const result = await registry.verifyAll(target, enabled);
      return reply.code(200).send(result);
    }
  );
};
