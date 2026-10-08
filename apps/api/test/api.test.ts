import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Fastify Backend API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /v1/health returns system status and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/health'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe('number');
  });

  it('2. GET /v1/vpa/:vpa/reputation returns zero count for unflagged VPA', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/vpa/cleanmerchant@oksbi/reputation'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.vpa).toBe('cleanmerchant@oksbi');
    expect(body.reportCount).toBe(0);
    expect(body.topCategories).toEqual([]);
  });

  it('3. POST /v1/reports successfully submits an anonymized scam report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        vpa: 'scam.operator@ybl',
        reason: 'phishing',
        note: 'Posed as bank customer care asking for QR scan',
        deviceId: 'device-test-uuid-001'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toContain('Report submitted successfully');
  });

  it('4. GET /v1/vpa/:vpa/reputation reflects submitted reports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/vpa/scam.operator@ybl/reputation'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reportCount).toBe(1);
    expect(body.topCategories).toContain('phishing');
    expect(body.lastReported).toBeDefined();
  });

  it('5. POST /v1/reports deduplicates multiple reports from the same device', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        vpa: 'scam.operator@ybl',
        reason: 'fake_support',
        deviceId: 'device-test-uuid-001' // Same device
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('already been recorded');
  });

  it('6. POST /v1/reports validates VPA format and rejects invalid inputs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        vpa: 'invalid-no-at-sign',
        reason: 'phishing'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation Error');
  });

  it('7. POST /v1/verify evaluates legitimate merchant QR as SAFE with caution disclaimer', async () => {
    const payload = 'upi://pay?pa=grocery@okhdfcbank&pn=GroceryStore&am=150.00&cu=INR&mc=5411';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.verification).toBeDefined();
    expect(body.verification.category).toBe('SAFE');
    expect(body.verification.score).toBeLessThanOrEqual(30);
    expect(body.verification.confidenceNote).toContain('No major risk indicators found; verify the receiver before paying.');
    expect(body.verification.disclaimer).toBeTruthy();
  });

  it('8. POST /v1/verify incorporates community intelligence when VPA has reported history', async () => {
    // Add report from another device
    await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        vpa: 'reportedscam@oksbi',
        reason: 'unauthorized_charge',
        deviceId: 'device-uuid-999'
      }
    });

    const payload = 'upi://pay?pa=reportedscam@oksbi&pn=Lottery%20Prize&am=5000&tn=Claim%20Prize';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.communityReputation.reportCount).toBeGreaterThanOrEqual(1);
    expect(body.verification.category).toBe('HIGH_RISK');
    expect(body.verification.scoreBreakdown.communityPenalty).toBeGreaterThan(0);
  });

  it('9. POST /v1/verify rejects empty or invalid request body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload: '' }
    });

    expect(res.statusCode).toBe(400);
  });

  it('10. GET /documentation/json provides valid OpenAPI 3.0 specification', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json'
    });

    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths['/v1/verify']).toBeDefined();
    expect(spec.paths['/v1/reports']).toBeDefined();
    expect(spec.paths['/v1/health']).toBeDefined();
  });
});
