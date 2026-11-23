import type { FastifyPluginAsync } from 'fastify';
import {
  parsePayload,
  verifyQrPayload,
  type CommunityReputationSignal,
  type PspLookupSignal,
  type ThreatIntelSignal
} from '@upi-verifier/core';
import { VerifyRequestSchema, type VerifyRequestBody } from '../schemas/index.js';
import type { DatabaseClient } from '../db/client.js';
import type { PspLookupService } from '../services/psp-lookup.js';
import type { ThreatIntelService } from '../services/threat-intel.js';
import { hashString, type VpaReputationSummary } from '../db/schema.js';

export interface VerifyRouteOptions {
  readonly dbClient: DatabaseClient;
  readonly pspLookupService?: PspLookupService;
  readonly threatIntelService?: ThreatIntelService;
}

export const verifyRoutes: FastifyPluginAsync<VerifyRouteOptions> = async (
  fastify,
  opts
) => {
  const { dbClient } = opts;

  fastify.post<{ Body: VerifyRequestBody }>(
    '/verify',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute'
        }
      },
      schema: {
        description: 'Verify and analyze risk for any scanned UPI QR or payment link payload',
        tags: ['Verification'],
        body: {
          type: 'object',
          required: ['payload'],
          properties: {
            payload: {
              type: 'string',
              minLength: 1,
              maxLength: 2048,
              description: 'Raw QR code string content'
            },
            optInTelemetry: {
              type: 'boolean',
              default: false,
              description: 'Optional user consent to save raw payload for threat intelligence'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
            properties: {
              verification: { type: 'object', additionalProperties: true },
              communityReputation: { type: 'object', additionalProperties: true },
              pspLookup: { type: 'object', additionalProperties: true },
              threatIntel: { type: 'object', additionalProperties: true }
            }
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
      const parsedBody = VerifyRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: parsedBody.error.errors[0]?.message ?? 'Invalid request payload'
        });
      }

      const { payload, optInTelemetry } = parsedBody.data;

      // 1. Initial parse to check VPA for community signals
      const preParsed = parsePayload(payload);
      let communitySignal: CommunityReputationSignal | undefined;
      let repSummary: VpaReputationSummary | { reportCount: number; topCategories: readonly string[] } = {
        reportCount: 0,
        topCategories: [] as readonly string[]
      };

      let vpaToCheck: string | undefined;
      if (preParsed.kind === 'upi' && preParsed.fields.kind === 'upi') {
        vpaToCheck = preParsed.fields.upi.pa;
      } else if (preParsed.kind === 'emv' && preParsed.fields.kind === 'emv') {
        vpaToCheck = preParsed.fields.upi.pa;
      }

      if (vpaToCheck) {
        const rep = dbClient.getVpaReputation(vpaToCheck);
        repSummary = rep;

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
        }
      }

      // 2. Query licensed payment gateway VPA validator if enabled
      let pspSignal: PspLookupSignal | null | undefined;
      if (opts.pspLookupService?.enabled && vpaToCheck) {
        try {
          pspSignal = await opts.pspLookupService.validateVpa(vpaToCheck, { optInTelemetry });
        } catch {
          // Fault tolerant: continue verification even if third-party gateway experiences outage
        }
      }

      // 3. Query Threat Intelligence for URL-type QRs (Google Safe Browsing / PhishTank via API server only)
      let urlToCheck: string | undefined;
      if (preParsed.kind === 'url' && preParsed.fields.kind === 'url') {
        urlToCheck = preParsed.fields.url.rawUrl;
      } else if (
        (preParsed.kind === 'upi' || preParsed.kind === 'emv') &&
        (preParsed.fields.kind === 'upi' || preParsed.fields.kind === 'emv') &&
        preParsed.fields.upi.url
      ) {
        urlToCheck = preParsed.fields.upi.url;
      } else if (payload.startsWith('http://') || payload.startsWith('https://')) {
        urlToCheck = payload.trim();
      }

      let threatIntelSignal: ThreatIntelSignal | null | undefined;
      if (opts.threatIntelService?.enabled && urlToCheck) {
        try {
          threatIntelSignal = await opts.threatIntelService.checkUrl(urlToCheck, { optInTelemetry });
        } catch {
          // Graceful degradation: never crash verification flow on external threat intel error
        }
      }

      // 4. Run core verification algorithm with enriched community signal, PSP lookup & Threat Intelligence
      const verification = verifyQrPayload(payload, {
        community: communitySignal,
        pspLookup: pspSignal ?? undefined,
        threatIntel: threatIntelSignal ?? undefined,
        isOffline: false
      });

      // 5. Store anonymized scan record (Never stores raw payload unless optInTelemetry is true)
      const payloadHash = hashString(payload);
      dbClient.insertScan({
        payload_hash: payloadHash,
        score: verification.score,
        category: verification.category,
        is_opted_in: optInTelemetry ? 1 : 0,
        raw_payload: optInTelemetry ? payload : null
      });

      return reply.code(200).send({
        verification,
        communityReputation: repSummary,
        ...(pspSignal ? { pspLookup: pspSignal } : {}),
        ...(threatIntelSignal ? { threatIntel: threatIntelSignal } : {})
      });
    }
  );
};
