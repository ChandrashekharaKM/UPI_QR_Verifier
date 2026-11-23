import type { FastifyPluginAsync } from 'fastify';
import { VpaParamsSchema } from '../schemas/index.js';
import type { DatabaseClient } from '../db/client.js';

export interface ReputationRouteOptions {
  readonly dbClient: DatabaseClient;
}

export const reputationRoutes: FastifyPluginAsync<ReputationRouteOptions> = async (
  fastify,
  opts
) => {
  const { dbClient } = opts;

  fastify.get<{ Params: { vpa: string } }>(
    '/vpa/:vpa/reputation',
    {
      schema: {
        description: 'Retrieves crowd-sourced community reputation metrics for a given UPI ID',
        tags: ['Reputation'],
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
            additionalProperties: true,
            properties: {
              vpa: { type: 'string' },
              reportCount: { type: 'number' },
              uniqueReporters: { type: 'number' },
              decayedScore: { type: 'number' },
              recentReportCount: { type: 'number' },
              lastReported: { type: 'string' },
              lastReportedDaysAgo: { type: 'number' },
              topCategories: { type: 'array', items: { type: 'string' } },
              breakdownByPeriod: {
                type: 'object',
                properties: {
                  within7Days: { type: 'number' },
                  within30Days: { type: 'number' },
                  within90Days: { type: 'number' },
                  olderThan90Days: { type: 'number' }
                }
              }
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
      const parsedParams = VpaParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: parsedParams.error.errors[0]?.message ?? 'Invalid VPA parameter'
        });
      }

      const summary = dbClient.getVpaReputation(parsedParams.data.vpa);
      return reply.code(200).send(summary);
    }
  );
};
