import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Service liveness and health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      return reply.code(200).send({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime() * 100) / 100
      });
    }
  );
};
