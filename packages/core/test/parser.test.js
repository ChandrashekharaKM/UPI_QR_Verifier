import { describe, it, expect } from 'vitest';
import { parsePayload } from '../src/parser/payload-parser.js';
import { parseUpiPayload } from '../src/parser/upi-parser.js';
import { parseUrlPayload } from '../src/parser/url-parser.js';
describe('UPI and Universal Payload Parser', () => {
    it('1. parses a standard UPI URI with all basic parameters', () => {
        const payload = 'upi://pay?pa=merchant@okhdfcbank&pn=SuperStore&am=250.00&cu=INR&mc=5411&tn=Groceries';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        expect(parsed.fields.kind).toBe('upi');
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.pa).toBe('merchant@okhdfcbank');
            expect(parsed.fields.upi.pn).toBe('SuperStore');
            expect(parsed.fields.upi.am).toBe('250.00');
            expect(parsed.fields.upi.cu).toBe('INR');
            expect(parsed.fields.upi.mc).toBe('5411');
            expect(parsed.fields.upi.tn).toBe('Groceries');
        }
    });
    it('2. parses minimal UPI URI with only mandatory pa parameter', () => {
        const payload = 'upi://pay?pa=alice@ybl';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.pa).toBe('alice@ybl');
            expect(parsed.fields.upi.pn).toBeUndefined();
            expect(parsed.fields.upi.am).toBeUndefined();
        }
    });
    it('3. handles URL-encoded parameters and plus signs correctly', () => {
        const payload = 'upi://pay?pa=store%40oksbi&pn=Sharma%20%26%20Sons+Electronics&tn=Invoice%23101';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.pa).toBe('store@oksbi');
            expect(parsed.fields.upi.pn).toBe('Sharma & Sons Electronics');
            expect(parsed.fields.upi.tn).toBe('Invoice#101');
        }
    });
    it('4. handles case-insensitivity in URI scheme and parameter keys', () => {
        const payload = 'UPI://PAY?PA=bob@paytm&Pn=Bob%20Kumar&AM=100.50';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.pa).toBe('bob@paytm');
            expect(parsed.fields.upi.pn).toBe('Bob Kumar');
            expect(parsed.fields.upi.am).toBe('100.50');
        }
    });
    it('5. detects and records duplicate query parameters (parameter pollution)', () => {
        const payload = 'upi://pay?pa=innocent@oksbi&pa=attacker@ybl&am=500';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        expect(parsed.hasDuplicateParams).toBe(true);
        expect(parsed.parseWarnings.some((w) => w.includes('Duplicate parameter detected'))).toBe(true);
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.duplicateKeys).toContain('pa');
        }
    });
    it('6. flags error when mandatory pa parameter is missing', () => {
        const payload = 'upi://pay?pn=Unknown&am=100';
        const res = parseUpiPayload(payload);
        expect(res.success).toBe(false);
        expect(res.warnings.some((w) => w.includes('pa'))).toBe(true);
    });
    it('7. detects non-standard extra query parameters', () => {
        const payload = 'upi://pay?pa=store@oksbi&pn=Store&custom_redirect=http://evil.com&tracking_id=999';
        const parsed = parsePayload(payload);
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.extraParams['custom_redirect']).toBe('http://evil.com');
            expect(parsed.fields.upi.extraParams['tracking_id']).toBe('999');
        }
        expect(parsed.parseWarnings.some((w) => w.includes('custom_redirect'))).toBe(true);
    });
    it('8. parses standard HTTP/HTTPS links and extracts URL components', () => {
        const payload = 'https://payments.example.com/checkout?order=123';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('url');
        if (parsed.fields.kind === 'url') {
            expect(parsed.fields.url.protocol).toBe('https:');
            expect(parsed.fields.url.hostname).toBe('payments.example.com');
            expect(parsed.fields.url.pathname).toBe('/checkout');
            expect(parsed.fields.url.searchParams['order']).toBe('123');
        }
    });
    it('9. identifies URL shorteners and raw IP addresses', () => {
        const shortener = parseUrlPayload('https://bit.ly/pay-now-claim');
        expect(shortener.fields?.isShortened).toBe(true);
        const ipUrl = parseUrlPayload('http://192.168.1.50:8080/pay');
        expect(ipUrl.fields?.isIpAddress).toBe(true);
        expect(ipUrl.fields?.protocol).toBe('http:');
    });
    it('10. identifies punycode domains and suspicious TLDs', () => {
        const puny = parseUrlPayload('https://xn--sbi-8ka.top/verify');
        expect(puny.fields?.isPunycode).toBe(true);
        expect(puny.fields?.topLevelDomain).toBe('top');
    });
    it('11. categorizes non-payment schemes (wifi, mailto, tel, plain text)', () => {
        const wifi = parsePayload('WIFI:S:MyNetwork;T:WPA;P:secret;;');
        expect(wifi.kind).toBe('other');
        if (wifi.fields.kind === 'other') {
            expect(wifi.fields.other.detectedScheme).toBe('wifi:');
        }
        const mail = parsePayload('mailto:support@bank.com');
        expect(mail.kind).toBe('other');
        const text = parsePayload('Just plain text without URI scheme');
        expect(text.kind).toBe('other');
    });
    it('12. flags oversized payloads exceeding typical length', () => {
        const hugeNote = 'A'.repeat(600);
        const payload = `upi://pay?pa=store@oksbi&pn=Store&tn=${hugeNote}`;
        const parsed = parsePayload(payload);
        expect(parsed.payloadLength).toBeGreaterThan(512);
        expect(parsed.parseWarnings.some((w) => w.includes('Oversized QR payload'))).toBe(true);
    });
    it('13. handles trimming and whitespace gracefully', () => {
        const payload = '   upi://pay?pa=merchant@okhdfcbank&pn=CleanStore   \n';
        const parsed = parsePayload(payload);
        expect(parsed.kind).toBe('upi');
        if (parsed.fields.kind === 'upi') {
            expect(parsed.fields.upi.pa).toBe('merchant@okhdfcbank');
            expect(parsed.fields.upi.pn).toBe('CleanStore');
        }
    });
});
//# sourceMappingURL=parser.test.js.map