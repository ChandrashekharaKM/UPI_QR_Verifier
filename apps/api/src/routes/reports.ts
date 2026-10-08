import type { FastifyPluginAsync } from 'fastify';
import { ReportRequestSchema, type ReportRequestBody } from '../schemas/index.js';
import type { DatabaseClient } from '../db/client.js';
import { hashString } from '../db/schema.js';

export interface ReportsRouteOptions {
  readonly dbClient: DatabaseClient;
}

export const reportsRoutes: FastifyPluginAsync<ReportsRouteOptions> = async (
  fastify,
  opts
) => {
  const { dbClient } = opts;

  fastify.post<{ Body: ReportRequestBody }>(
    '/reports',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      },
      schema: {
        description: 'Submit an anonymized community scam report against a suspicious UPI ID',
        tags: ['Reports'],
        body: {
          type: 'object',
          required: ['vpa', 'reason'],
          properties: {
            vpa: { type: 'string', description: 'UPI VPA (e.g. fraudulent@oksbi)' },
            reason: {
              type: 'string',
              enum: ['phishing', 'fake_support', 'impersonation', 'unauthorized_charge', 'other']
            },
            note: { type: 'string', description: 'Optional context note' },
            deviceId: { type: 'string', description: 'Device client identifier' }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          },
          409: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
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
      const parsedBody = ReportRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: parsedBody.error.errors[0]?.message ?? 'Invalid request body'
        });
      }

      const { vpa, reason, note, deviceId } = parsedBody.data;

      // Anonymously hash device identifier to protect user privacy while preventing bot spam
      const rawDeviceIdentifier = deviceId ?? `${request.ip}-${request.headers['user-agent'] ?? ''}`;
      const deviceHash = hashString(rawDeviceIdentifier);

      const result = dbClient.insertReport({
        vpa,
        reason,
        note,
        device_hash: deviceHash
      });

      if (!result.inserted) {
        return reply.code(409).send({
          success: false,
          message: result.message
        });
      }

      return reply.code(201).send({
        success: true,
        message: result.message
      });
    }
  );
};
