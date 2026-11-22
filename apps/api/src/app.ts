import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { DatabaseClient } from './db/client.js';
import { PspLookupService, type PspLookupServiceConfig } from './services/psp-lookup.js';
import { ThreatIntelService, type ThreatIntelServiceConfig } from './services/threat-intel.js';
import { healthRoutes } from './routes/health.js';
import { reputationRoutes } from './routes/reputation.js';
import { reportsRoutes } from './routes/reports.js';
import { verifyRoutes } from './routes/verify.js';
import { vpaRoutes } from './routes/vpa.js';

export interface AppOptions {
  readonly dbPath?: string;
  readonly logger?: boolean;
  readonly bodyLimit?: number;
  readonly corsOrigins?: readonly string[];
  readonly rateLimitMax?: number;
  readonly rateLimitTimeWindow?: string;
  readonly pspLookup?: PspLookupService | PspLookupServiceConfig;
  readonly threatIntel?: ThreatIntelService | ThreatIntelServiceConfig;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: opts.logger
      ? {
          level: 'info',
          serializers: {
            req(req) {
              return {
                id: req.id,
                method: req.method,
                url: req.url,
                remoteAddress: req.ip
                // NOTE: req.body, req.query, payload, and VPAs are strictly omitted for user privacy
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode
              };
            }
          }
        }
      : false,
    bodyLimit: opts.bodyLimit ?? 16384 // 16 KB default limit to prevent oversized request DOS
  });

  const dbClient = new DatabaseClient(opts.dbPath ?? ':memory:');
  const pspLookupService =
    opts.pspLookup instanceof PspLookupService
      ? opts.pspLookup
      : new PspLookupService(opts.pspLookup);
  const threatIntelService =
    opts.threatIntel instanceof ThreatIntelService
      ? opts.threatIntel
      : new ThreatIntelService(opts.threatIntel);

  // Security headers plugin
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });

  // Strict CORS allowlist
  const defaultAllowedOrigins = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    'http://localhost:3001',
    'https://upiverifier.app'
  ];
  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : undefined;
  const allowedOrigins = opts.corsOrigins ?? envOrigins ?? defaultAllowedOrigins;

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin header (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin ${origin} not allowed by CORS allowlist`), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  // Rate limiting plugin
  await fastify.register(rateLimit, {
    max: opts.rateLimitMax ?? 120,
    timeWindow: opts.rateLimitTimeWindow ?? '1 minute',
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}.`
    })
  });

  // OpenAPI / Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'UPI QR Verifier - Payment QR code Alert System API',
        description: 'Backend services for crowd-sourced reputation, threat intelligence, and scan verification',
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

  // Expose raw OpenAPI 3.0 specification as JSON
  fastify.get('/openapi.json', { schema: { hide: true } }, async (_req, reply) => {
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return fastify.swagger();
  });

  // Register API v1 routes
  await fastify.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(reputationRoutes, { dbClient });
      await v1.register(reportsRoutes, { dbClient });
      await v1.register(verifyRoutes, { dbClient, pspLookupService, threatIntelService });
      await v1.register(vpaRoutes, { dbClient, pspLookupService, threatIntelService });
    },
    { prefix: '/v1' }
  );

  // Hook to close DB when fastify closes
  fastify.addHook('onClose', async () => {
    dbClient.close();
  });

  return fastify;
}
