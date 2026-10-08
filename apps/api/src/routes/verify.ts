import type { FastifyPluginAsync } from 'fastify';
import {
  parsePayload,
  verifyQrPayload,
  type CommunityReputationSignal
} from '@upi-verifier/core';
import { VerifyRequestSchema, type VerifyRequestBody } from '../schemas/index.js';
import type { DatabaseClient } from '../db/client.js';
import { hashString } from '../db/schema.js';

export interface VerifyRouteOptions {
  readonly dbClient: DatabaseClient;
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
            payload: { type: 'string', description: 'Raw QR code string content' },
            optInTelemetry: {
              type: 'boolean',
              description: 'Optional user consent to save raw payload for threat intelligence'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              verification: { type: 'object', additionalProperties: true },
              communityReputation: { type: 'object', additionalProperties: true }
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
      let repSummary = {
        reportCount: 0,
        topCategories: [] as readonly string[]
      };

      if (preParsed.kind === 'upi' && preParsed.fields.kind === 'upi') {
        const vpa = preParsed.fields.upi.pa;
        const rep = dbClient.getVpaReputation(vpa);
        repSummary = rep;

        if (rep.reportCount > 0) {
          communitySignal = {
            reportCount: rep.reportCount,
            ...(rep.lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo: rep.lastReportedDaysAgo } : {}),
            topCategories: rep.topCategories
          };
        }
      }

      // 2. Run core verification algorithm with enriched community signal
      const verification = verifyQrPayload(payload, {
        community: communitySignal,
        isOffline: false
      });

      // 3. Store anonymized scan record (Never stores raw payload unless optInTelemetry is true)
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
        communityReputation: repSummary
      });
    }
  );
};
