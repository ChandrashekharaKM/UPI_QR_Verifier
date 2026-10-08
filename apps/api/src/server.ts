import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const DB_PATH = process.env['DATABASE_PATH'] ?? path.resolve(__dirname, '../data.sqlite');

async function main() {
  const app = await buildApp({
    dbPath: DB_PATH,
    logger: true
  });

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(`[API Server] Running at: ${address}`);
    console.log(`[API Server] Swagger docs: ${address}/documentation`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
