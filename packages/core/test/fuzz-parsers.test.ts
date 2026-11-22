import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parsePayload } from '../src/parser/payload-parser.js';
import { parseUpiPayload, type UpiParseResult } from '../src/parser/upi-parser.js';
import { parseEmvPayload, type EmvParseResult } from '../src/parser/emv-parser.js';
import { parseUpiDeepLink, type DeepLinkParseResult } from '../src/parser/deeplink-parser.js';
import { parseUrlPayload, type UrlParseResult } from '../src/parser/url-parser.js';
import type { ParsedPayload } from '../src/types/payload.js';

const MAX_PARSE_TIME_MS = 25; // Strict per-call time limit (25ms) to guard against ReDoS or algorithmic stalls

function assertValidParsedPayload(result: ParsedPayload, input: string): void {
  expect(result).toBeDefined();
  expect(typeof result).toBe('object');
  expect(result).not.toBeNull();

  expect(typeof result.rawPayload).toBe('string');
  expect(result.rawPayload).toBe(input.trim());

  expect(['upi', 'emv', 'url', 'other']).toContain(result.kind);
  expect(typeof result.payloadLength).toBe('number');
  expect(result.payloadLength).toBe(input.trim().length);

  expect(typeof result.hasDuplicateParams).toBe('boolean');
  expect(Array.isArray(result.parseWarnings)).toBe(true);

  expect(result.fields).toBeDefined();
  expect(typeof result.fields).toBe('object');
  expect(['upi', 'emv', 'url', 'other']).toContain(result.fields.kind);
}

function assertValidUpiParseResult(result: UpiParseResult): void {
  expect(result).toBeDefined();
  expect(typeof result.success).toBe('boolean');
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(typeof result.hasDuplicates).toBe('boolean');
  expect(Array.isArray(result.duplicateKeys)).toBe(true);
  if (result.success && result.fields) {
    expect(typeof result.fields.pa).toBe('string');
  }
}

function assertValidEmvParseResult(result: EmvParseResult): void {
  expect(result).toBeDefined();
  expect(typeof result.success).toBe('boolean');
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(typeof result.hasBadCrc).toBe('boolean');
  if (result.success && result.fields) {
    expect(typeof result.fields.rawPayload).toBe('string');
    expect(typeof result.fields.isValidCrc).toBe('boolean');
  }
}

function assertValidDeepLinkParseResult(result: DeepLinkParseResult): void {
  expect(result).toBeDefined();
  expect(typeof result.success).toBe('boolean');
  expect(typeof result.isDeepLink).toBe('boolean');
  expect(typeof result.originalScheme).toBe('string');
  expect(typeof result.action).toBe('string');
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(typeof result.hasDuplicates).toBe('boolean');
  expect(Array.isArray(result.duplicateKeys)).toBe(true);
}

function assertValidUrlParseResult(result: UrlParseResult): void {
  expect(result).toBeDefined();
  expect(typeof result.success).toBe('boolean');
  expect(Array.isArray(result.warnings)).toBe(true);
  if (result.success && result.fields) {
    expect(typeof result.fields.rawUrl).toBe('string');
    expect(typeof result.fields.protocol).toBe('string');
    expect(typeof result.fields.hostname).toBe('string');
    expect(typeof result.fields.isIpAddress).toBe('boolean');
  }
}

describe('Property-Based / Fuzz Testing for All Core Parsers (fast-check)', () => {
  describe('1. Master parsePayload Gateway Parser', () => {
    it('never throws on arbitrary random strings and returns typed ParsedPayload within time limit', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (input) => {
          const t0 = performance.now();
          let result: ParsedPayload;

          expect(() => {
            result = parsePayload(input);
          }).not.toThrow();

          const elapsed = performance.now() - t0;
          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);

          result = parsePayload(input);
          assertValidParsedPayload(result, input);
        }),
        { numRuns: 300 }
      );
    });

    it('safely handles prefix injections and malformed query strings across schemes', () => {
      const schemePrefixes = fc.constantFrom(
        'upi://pay?',
        'upi://mandate?',
        'upi://collect?',
        'http://',
        'https://',
        'intent://pay?',
        'phonepe://pay?',
        'paytmmp://pay?',
        'gpay://upi/pay?',
        'bharatqr://'
      );

      fc.assert(
        fc.property(schemePrefixes, fc.string({ maxLength: 500 }), (prefix, suffix) => {
          const input = prefix + suffix;
          const t0 = performance.now();
          const result = parsePayload(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidParsedPayload(result, input);
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('2. Dedicated parseUpiPayload Fuzzer', () => {
    it('never throws on arbitrary random input strings and returns typed UpiParseResult', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 800 }), (input) => {
          const t0 = performance.now();
          const result = parseUpiPayload(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidUpiParseResult(result);
        }),
        { numRuns: 250 }
      );
    });

    it('fuzzes key-value parameter pairs with corrupted percent-encodings and broken delimiters', () => {
      const brokenEncodingArbitrary = fc
        .tuple(
          fc.constantFrom('pa', 'pn', 'mc', 'am', 'cu', 'tn', 'tr', 'url', 'mode'),
          fc.string({ maxLength: 40 }),
          fc.constantFrom('%', '%2', '%ZZ', '%%', '%E0%A4', '%00', '&', '=', '?')
        )
        .map(([key, val, broken]) => `${key}=${val}${broken}`);

      fc.assert(
        fc.property(
          fc.array(brokenEncodingArbitrary, { minLength: 1, maxLength: 8 }),
          (pairs) => {
            const input = `upi://pay?${pairs.join('&')}`;
            const t0 = performance.now();
            const result = parseUpiPayload(input);
            const elapsed = performance.now() - t0;

            expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
            assertValidUpiParseResult(result);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('3. Dedicated parseEmvPayload (BharatQR) Fuzzer', () => {
    it('never throws on arbitrary binary or string data and respects time limit', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 600 }), (input) => {
          const t0 = performance.now();
          const result = parseEmvPayload(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidEmvParseResult(result);
        }),
        { numRuns: 250 }
      );
    });

    it('handles truncated or overflowing TLV chunks without infinite loop or buffer exception', () => {
      const tagArbitrary = fc.integer({ min: 0, max: 99 }).map((n) => n.toString().padStart(2, '0'));
      const lengthArbitrary = fc.integer({ min: 0, max: 99 }).map((n) => n.toString().padStart(2, '0'));
      const payloadArbitrary = fc.string({ maxLength: 60 });

      fc.assert(
        fc.property(
          fc.array(fc.tuple(tagArbitrary, lengthArbitrary, payloadArbitrary), { maxLength: 6 }),
          (chunks) => {
            const input = chunks.map(([t, l, v]) => `${t}${l}${v}`).join('');
            const t0 = performance.now();
            const result = parseEmvPayload(input);
            const elapsed = performance.now() - t0;

            expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
            assertValidEmvParseResult(result);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('4. Dedicated parseUpiDeepLink Fuzzer', () => {
    it('never throws on arbitrary intent strings within time limit', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 800 }), (input) => {
          const t0 = performance.now();
          const result = parseUpiDeepLink(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidDeepLinkParseResult(result);
        }),
        { numRuns: 250 }
      );
    });

    it('safely parses nested Intent URIs with random actions and package tokens', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 80 }),
          fc.string({ maxLength: 40 }),
          fc.string({ maxLength: 40 }),
          (data, pkg, scheme) => {
            const input = `intent://${data}#Intent;package=${pkg};scheme=${scheme};end`;
            const t0 = performance.now();
            const result = parseUpiDeepLink(input);
            const elapsed = performance.now() - t0;

            expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
            assertValidDeepLinkParseResult(result);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('5. Dedicated parseUrlPayload Fuzzer', () => {
    it('never throws on arbitrary URL candidates within time limit', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 800 }), (input) => {
          const t0 = performance.now();
          const result = parseUrlPayload(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidUrlParseResult(result);
        }),
        { numRuns: 250 }
      );
    });

    it('safely handles adversarial URL components (userinfo, port, punycode, path traversal)', () => {
      const adversaryUrlArbitrary = fc
        .tuple(
          fc.constantFrom('http://', 'https://', 'ftp://', 'javascript:', 'data:'),
          fc.string({ maxLength: 30 }),
          fc.constantFrom('@', ':', '/', '?', '#', '\\', '..', 'xn--'),
          fc.string({ maxLength: 50 })
        )
        .map(([scheme, host, separator, rest]) => `${scheme}${host}${separator}${rest}`);

      fc.assert(
        fc.property(adversaryUrlArbitrary, (input) => {
          const t0 = performance.now();
          const result = parseUrlPayload(input);
          const elapsed = performance.now() - t0;

          expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
          assertValidUrlParseResult(result);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('6. Extreme Stress and Adversarial Edge Cases', () => {
    it('safely parses oversized 15,000-character payload within time limit', () => {
      const oversized = `upi://pay?pa=merchant@oksbi&note=${'A'.repeat(15000)}`;
      const t0 = performance.now();
      const res = parsePayload(oversized);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(50); // Under 50ms for 15k characters
      assertValidParsedPayload(res, oversized);
    });

    it('safely parses recursive deeply-nested percent-encoded URLs', () => {
      let nested = 'https://phishing-site.example.com/steal?target=bank';
      for (let i = 0; i < 5; i++) {
        nested = encodeURIComponent(nested);
      }
      const payload = `upi://pay?pa=user@oksbi&url=${nested}`;

      const t0 = performance.now();
      const res = parsePayload(payload);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
      assertValidParsedPayload(res, payload);
    });

    it('safely parses inputs with zero-width characters and RTL directional overrides', () => {
      const deceptive = 'upi://pay?pa=\u200Buser\u200C@\u200Doksbi\u202Epn=Hacked';
      const t0 = performance.now();
      const res = parsePayload(deceptive);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(MAX_PARSE_TIME_MS);
      assertValidParsedPayload(res, deceptive);
    });
  });
});
