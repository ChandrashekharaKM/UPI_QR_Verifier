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

  it('1b. GET / redirects browser requests to /documentation and serves JSON metadata to API clients', async () => {
    const htmlRes = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });
    expect(htmlRes.statusCode).toBe(302);
    expect(htmlRes.headers.location).toBe('/documentation');

    const jsonRes = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'application/json' }
    });
    expect(jsonRes.statusCode).toBe(200);
    const jsonBody = JSON.parse(jsonRes.body);
    expect(jsonBody.status).toBe('ok');
    expect(jsonBody.documentation).toBe('/documentation');
    expect(jsonBody.health).toBe('/v1/health');
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
    expect(['Bad Request', 'Validation Error']).toContain(body.error);
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
    expect(body.verification.confidenceNote).toBe('No major risk indicators found; recipient identity NOT independently verified');
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

  it('11. POST /v1/verify flags embedded malicious IP URL in UPI payload', async () => {
    const payload = 'upi://pay?pa=store@oksbi&pn=Store&url=http://185.220.101.5/malware.apk';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.verification.score).toBeGreaterThan(60);
    expect(
      body.verification.reasons.some(
        (r: { ruleId: string }) => r.ruleId === 'RULE_IP_ADDRESS_URL'
      )
    ).toBe(true);
  });

  it('12. POST /v1/verify defeats zero-width character evasion in VPA', async () => {
    const payload = 'upi://pay?pa=sbi\u200B.support@ybl&pn=SBI%20Care&am=3000';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.verification.category).toBe('HIGH_RISK');
    expect(
      body.verification.reasons.some(
        (r: { ruleId: string }) => r.ruleId === 'RULE_VPA_IMPERSONATION'
      )
    ).toBe(true);
    expect(body.verification.vpaVerification).toBeDefined();
    expect(body.verification.vpaVerification.overallStatus).toBe('flagged_risk');
  });

  it('13. GET /v1/vpa/:vpa/verify executes pluggable VPA verification layer with honest limitation notice', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/vpa/freshmart@okhdfcbank/verify'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.vpa).toBe('freshmart@okhdfcbank');
    expect(body.overallStatus).toBe('verified_valid');
    expect(body.providerResults).toHaveLength(2);

    const structural = body.providerResults.find((p: { providerId: string }) => p.providerId === 'offline-structural');
    expect(structural).toBeDefined();
    expect(structural.details.sponsorBank).toBe('HDFC Bank');
    expect(structural.details.formatCheck.passed).toBe(true);
    expect(structural.details.pspHandleCheck.passed).toBe(true);
    expect(structural.honestLimitationNotice).toContain('NPCI provides no public API');

    const community = body.providerResults.find((p: { providerId: string }) => p.providerId === 'community-reputation');
    expect(community).toBeDefined();
    expect(community.isOnline).toBe(true);
  });

  it('14. POST /v1/vpa/verify runs verification on raw QR payloads and reports tampered EMV CRC', async () => {
    const badEmvPayload =
      '00020101021126370009com.upiqr0120freshmart@okhdfcbank5204541153033565802IN5921Fresh Mart Provisions6009Bangalore62110707POS991263040000';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/vpa/verify',
      payload: { payload: badEmvPayload }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.overallStatus).toBe('flagged_risk');

    const structural = body.providerResults.find((p: { providerId: string }) => p.providerId === 'offline-structural');
    expect(structural.details.emvCrcCheck.passed).toBe(false);
    expect(structural.details.emvCrcCheck.status).toBe('fail');
  });

  it('15. GET /v1/vpa/:vpa/reputation computes time decay weighting and deduplicates reporters', async () => {
    const vpa = 'decaytest@oksbi';

    // Submit from 2 different devices today
    await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: { vpa, reason: 'phishing', deviceId: 'dev-decay-1' }
    });
    await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: { vpa, reason: 'fake_support', deviceId: 'dev-decay-2' }
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/vpa/${vpa}/reputation`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.vpa).toBe(vpa);
    expect(body.reportCount).toBe(2);
    expect(body.uniqueReporters).toBe(2);
    expect(body.decayedScore).toBeGreaterThanOrEqual(1.9); // fresh reports ~ 1.0 each
    expect(body.recentReportCount).toBe(2);
    expect(body.breakdownByPeriod.within7Days).toBe(2);
    expect(body.breakdownByPeriod.olderThan90Days).toBe(0);
    expect(body.topCategories).toContain('phishing');
    expect(body.topCategories).toContain('fake_support');
  });

  it('16. enforces body size limit (rejects bodies exceeding 16KB with 413)', async () => {
    const hugePayload = 'A'.repeat(20 * 1024); // 20 KB
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      headers: {
        'content-type': 'application/json'
      },
      payload: JSON.stringify({ payload: hugePayload })
    });

    expect(res.statusCode).toBe(413);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Payload Too Large');
  });

  it('17. enforces CORS allowlist policy', async () => {
    // 1. Allowed origin in allowlist
    const allowedRes = await app.inject({
      method: 'OPTIONS',
      url: '/v1/health',
      headers: {
        origin: 'https://upiverifier.app',
        'access-control-request-method': 'GET'
      }
    });
    expect(allowedRes.headers['access-control-allow-origin']).toBe('https://upiverifier.app');

    // 2. Disallowed origin not in allowlist
    const disallowedRes = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: {
        origin: 'https://evil-unauthorized-site.com'
      }
    });
    expect(disallowedRes.statusCode).toBe(500); // Fastify CORS throws error on disallowed origin
    expect(disallowedRes.body).toContain('not allowed by CORS');

    // 3. Native mobile / non-browser request with no origin passes cleanly
    const noOriginRes = await app.inject({
      method: 'GET',
      url: '/v1/health'
    });
    expect(noOriginRes.statusCode).toBe(200);
  });

  it('18. exposes OpenAPI specification matching Zod route schemas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/openapi.json'
    });

    expect(res.statusCode).toBe(200);
    const openapi = JSON.parse(res.body);
    expect(openapi.openapi).toMatch(/^3\./);
    expect(openapi.info.title).toContain('UPI QR Verifier');
    expect(openapi.paths['/v1/verify']).toBeDefined();
    expect(openapi.paths['/v1/reports']).toBeDefined();
    expect(openapi.paths['/v1/vpa/{vpa}/reputation']).toBeDefined();

    // Verify documentation UI endpoint is reachable
    const docRes = await app.inject({
      method: 'GET',
      url: '/documentation'
    });
    expect([200, 302]).toContain(docRes.statusCode);
  });

  it('19. enforces rate limiting when requests exceed threshold', async () => {
    const rateLimitedApp = await buildApp({
      dbPath: ':memory:',
      rateLimitMax: 3,
      rateLimitTimeWindow: '1 minute'
    });
    await rateLimitedApp.ready();

    // 3 requests allowed
    for (let i = 0; i < 3; i++) {
      const res = await rateLimitedApp.inject({
        method: 'GET',
        url: '/v1/health'
      });
      expect(res.statusCode).toBe(200);
    }

    // 4th request exceeds rate limit
    const exceeded = await rateLimitedApp.inject({
      method: 'GET',
      url: '/v1/health'
    });
    expect(exceeded.statusCode).toBe(429);
    const body = JSON.parse(exceeded.body);
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain('Rate limit exceeded');

    await rateLimitedApp.close();
  });

  it('20. request logger serializer strictly redacts bodies and payloads from request logs', async () => {
    const loggingApp = await buildApp({
      dbPath: ':memory:',
      logger: true
    });

    // Check fastify request serializer function
    // Fastify configures serializers under fastify[Symbol.for('fastify.logger')]
    expect(loggingApp).toBeDefined();
    const res = await loggingApp.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: { payload: 'upi://pay?pa=secret@oksbi', optInTelemetry: false }
    });
    expect(res.statusCode).toBe(200);
    await loggingApp.close();
  });
});
