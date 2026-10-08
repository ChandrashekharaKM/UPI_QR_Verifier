import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { DatabaseClient } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { reputationRoutes } from './routes/reputation.js';
import { reportsRoutes } from './routes/reports.js';
import { verifyRoutes } from './routes/verify.js';

export interface AppOptions {
  readonly dbPath?: string;
  readonly logger?: boolean;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 1048576 // 1 MB payload size limit
  });

  const dbClient = new DatabaseClient(opts.dbPath ?? ':memory:');

  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });

  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute'
  });

  // OpenAPI / Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'UPI QR Verifier - Payment QR code Alert System API',
        description: 'Backend services for crowd-sourced reputation, threat intelligence and scan verification',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Development Server'
        }
      ],
      tags: [
        { name: 'Verification', description: 'Real-time QR payload risk analysis' },
        { name: 'Reports', description: 'Scam reporting and crowd-sourced intelligence' },
        { name: 'Reputation', description: 'UPI VPA reputation queries' },
        { name: 'System', description: 'Health and diagnostics' }
      ]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  });

  // Register API v1 routes
  await fastify.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(reputationRoutes, { dbClient });
      await v1.register(reportsRoutes, { dbClient });
      await v1.register(verifyRoutes, { dbClient });
    },
    { prefix: '/v1' }
  );

  // Hook to close DB when fastify closes
  fastify.addHook('onClose', async () => {
    dbClient.close();
  });

  return fastify;
}
