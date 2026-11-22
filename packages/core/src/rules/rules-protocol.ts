import type { RuleContext, RuleResult } from '../types/rules.js';
import type { UrlFields } from '../types/payload.js';
import { parseUrlPayload } from '../parser/url-parser.js';
import { isUtilityNonPaymentScheme } from '../parser/payload-parser.js';

function getTargetUrlFields(ctx: RuleContext): UrlFields | undefined {
  if (ctx.parsed.kind === 'url' && ctx.parsed.fields.kind === 'url') {
    return ctx.parsed.fields.url;
  }
  if (
    (ctx.parsed.kind === 'upi' || ctx.parsed.kind === 'emv') &&
    (ctx.parsed.fields.kind === 'upi' || ctx.parsed.fields.kind === 'emv') &&
    ctx.parsed.fields.upi.url
  ) {
    const parsed = parseUrlPayload(ctx.parsed.fields.upi.url);
    if (parsed.success && parsed.fields) {
      return parsed.fields;
    }
  }
  return undefined;
}

const SUSPICIOUS_TLD_SET = new Set([
  'top',
  'xyz',
  'buzz',
  'club',
  'work',
  'loan',
  'click',
  'gq',
  'cf',
  'ml',
  'ga',
  'tk'
]);

/**
 * Rule: Non-UPI QR code in a payment context.
 * Why: QR codes placed on payment counters or sent for payment that are actually web links or other schemes
 * are frequently malicious redirects, phishing portals, or malware download links.
 */
export function ruleNonUpiScheme(ctx: RuleContext): RuleResult {
  const isUtility = isUtilityNonPaymentScheme(ctx.parsed);
  const isNonUpi = !isUtility && (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv');
  return {
    id: 'RULE_NON_UPI_SCHEME',
    triggered: isNonUpi,
    severity: 'critical',
    weight: 85,
    title: 'Non-UPI Payment QR Code',
    message: isNonUpi
      ? `This QR code does not contain a direct UPI payment link (kind: ${ctx.parsed.kind}). Scanning it could open an external webpage or malicious service.`
      : isUtility
        ? 'This is a utility QR code (such as Wi-Fi, email, or telephone) and not a payment code.'
        : 'QR code contains a standard UPI payment URI.',
    evidence: isNonUpi
      ? [
          { key: 'kind', value: ctx.parsed.kind },
          { key: 'rawPreview', value: ctx.parsed.rawPayload.slice(0, 60) }
        ]
      : undefined
  };
}

/**
 * Rule: Collect or Mandate (Pull-payment / debit request).
 * Why: Scammers frequently send upi://collect or upi://mandate links claiming they are "sending" money or "refunding" fees.
 * In UPI, scanning a QR or entering a PIN is strictly for AUTHORIZING money to leave your account.
 */
export function ruleCollectOrMandate(ctx: RuleContext): RuleResult {
  if (
    (ctx.parsed.kind !== 'upi' && ctx.parsed.kind !== 'emv') ||
    (ctx.parsed.fields.kind !== 'upi' && ctx.parsed.fields.kind !== 'emv')
  ) {
    return {
      id: 'RULE_COLLECT_OR_MANDATE',
      triggered: false,
      severity: 'high',
      weight: 75,
      title: 'Pull-Payment / Collect or Mandate Request',
      message: 'Not applicable.'
    };
  }

  const upi = ctx.parsed.fields.upi;
  const action = (upi.action ?? '').toLowerCase();
  const originalScheme = (upi.originalScheme ?? ctx.parsed.originalScheme ?? '').toLowerCase();
  const raw = ctx.parsed.rawPayload.toLowerCase();

  const isCollect = action === 'collect' || originalScheme.includes('collect') || raw.startsWith('upi://collect');
  const isMandate = action === 'mandate' || originalScheme.includes('mandate') || raw.startsWith('upi://mandate');
  const isTriggered = isCollect || isMandate;

  return {
    id: 'RULE_COLLECT_OR_MANDATE',
    triggered: isTriggered,
    severity: 'high',
    weight: 75,
    title: isMandate
      ? 'Recurring AutoPay Mandate Request'
      : 'Pull-Payment / Collect Request',
    message: isTriggered
      ? 'This QR requests money from you instead of paying you. In UPI, you never scan a QR code or enter your PIN to receive funds. Proceeding will deduct money or authorize recurring debits from your bank account.'
      : 'Standard payment transfer intent (pay).',
    evidence: isTriggered
      ? [
          { key: 'action', value: isMandate ? 'mandate' : 'collect' },
          { key: 'scheme', value: upi.originalScheme ?? (isMandate ? 'upi://mandate' : 'upi://collect') }
        ]
      : undefined
  };
}

/**
 * Rule: URL using unencrypted HTTP.
 * Why: In modern payment and authentication workflows, HTTP exposes users to man-in-the-middle attacks and eavesdropping.
 */
export function ruleHttpNotHttps(ctx: RuleContext): RuleResult {
  const urlFields = getTargetUrlFields(ctx);
  if (!urlFields) {
    return {
      id: 'RULE_HTTP_NOT_HTTPS',
      triggered: false,
      severity: 'high',
      weight: 70,
      title: 'Insecure HTTP Protocol',
      message: 'Not applicable.'
    };
  }

  const isHttp = urlFields.protocol === 'http:';

  return {
    id: 'RULE_HTTP_NOT_HTTPS',
    triggered: isHttp,
    severity: 'high',
    weight: 70,
    title: 'Insecure HTTP Protocol',
    message: isHttp
      ? 'The QR code links to an unencrypted HTTP web address. Legitimate financial portals strictly require HTTPS.'
      : 'URL uses secure HTTPS encryption.',
    evidence: isHttp ? [{ key: 'url', value: urlFields.rawUrl }] : undefined
  };
}

/**
 * Rule: URL uses raw IP address instead of domain.
 * Why: Legitimate payment gateways and banks never host payment landing pages directly on raw IP addresses.
 */
export function ruleIpAddressUrl(ctx: RuleContext): RuleResult {
  const urlFields = getTargetUrlFields(ctx);
  if (!urlFields) {
    return {
      id: 'RULE_IP_ADDRESS_URL',
      triggered: false,
      severity: 'high',
      weight: 80,
      title: 'Direct IP Address URL',
      message: 'Not applicable.'
    };
  }

  const isIp = Boolean(urlFields.isIpAddress);

  return {
    id: 'RULE_IP_ADDRESS_URL',
    triggered: isIp,
    severity: 'high',
    weight: 80,
    title: 'Direct IP Address URL',
    message: isIp
      ? `The QR code points directly to a raw server IP address (${urlFields.hostname}) rather than an authenticated corporate domain name.`
      : 'Domain name is used instead of a direct IP address.',
    evidence: isIp ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}

/**
 * Rule: Shortened URL service.
 * Why: URL shorteners hide the destination domain, a classic tactic to obscure phishing sites and malware.
 */
export function ruleShortenedUrl(ctx: RuleContext): RuleResult {
  const urlFields = getTargetUrlFields(ctx);
  if (!urlFields) {
    return {
      id: 'RULE_SHORTENED_URL',
      triggered: false,
      severity: 'medium',
      weight: 65,
      title: 'Obfuscated Shortened URL',
      message: 'Not applicable.'
    };
  }

  const isShortened = Boolean(urlFields.isShortened);

  return {
    id: 'RULE_SHORTENED_URL',
    triggered: isShortened,
    severity: 'medium',
    weight: 65,
    title: 'Obfuscated Shortened URL',
    message: isShortened
      ? `The destination address is masked by a link shortening service (${urlFields.hostname}), preventing verification of the actual payment destination.`
      : 'URL does not use a known shortening service.',
    evidence: isShortened ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}

/**
 * Rule: High-risk suspicious top-level domain.
 * Why: Domains ending in spam-heavy TLDs (.xyz, .top, .buzz, etc.) are frequently utilized for disposable scam infrastructure.
 */
export function ruleSuspiciousTld(ctx: RuleContext): RuleResult {
  const urlFields = getTargetUrlFields(ctx);
  if (!urlFields) {
    return {
      id: 'RULE_SUSPICIOUS_TLD',
      triggered: false,
      severity: 'medium',
      weight: 60,
      title: 'Suspicious Domain Extension',
      message: 'Not applicable.'
    };
  }

  const tld = urlFields.topLevelDomain ?? '';
  const isSuspicious = SUSPICIOUS_TLD_SET.has(tld);

  return {
    id: 'RULE_SUSPICIOUS_TLD',
    triggered: isSuspicious,
    severity: 'medium',
    weight: 60,
    title: 'Suspicious Domain Extension',
    message: isSuspicious
      ? `The domain uses an extension (.${tld}) heavily associated with disposable phishing campaigns rather than trusted financial institutions.`
      : 'Domain extension is standard.',
    evidence: isSuspicious ? [{ key: 'tld', value: tld }] : undefined
  };
}

/**
 * Rule: Punycode / Lookalike domain.
 * Why: Punycode (xn--) allows attackers to register visual lookalike domains (homograph attacks) that mimic legitimate banks.
 */
export function rulePunycodeDomain(ctx: RuleContext): RuleResult {
  const urlFields = getTargetUrlFields(ctx);
  if (!urlFields) {
    return {
      id: 'RULE_PUNYCODE_DOMAIN',
      triggered: false,
      severity: 'high',
      weight: 80,
      title: 'Punycode Homograph Domain',
      message: 'Not applicable.'
    };
  }

  const isPunycode = Boolean(urlFields.isPunycode);

  return {
    id: 'RULE_PUNYCODE_DOMAIN',
    triggered: isPunycode,
    severity: 'high',
    weight: 80,
    title: 'Punycode Homograph Domain',
    message: isPunycode
      ? 'The web address contains punycode characters (xn--), which attackers commonly use to visually impersonate legitimate banks and brands.'
      : 'No punycode character encoding detected.',
    evidence: isPunycode ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}

/**
 * Rule: Malicious URL confirmed by Threat Intelligence (Google Safe Browsing / PhishTank).
 * Why: URL is actively listed on global threat intelligence feeds as a confirmed phishing site,
 * malware payload, or credential harvesting portal.
 */
export function ruleThreatIntelMalicious(ctx: RuleContext): RuleResult {
  if (!ctx.threatIntel) {
    return {
      id: 'RULE_THREAT_INTEL_MALICIOUS',
      triggered: false,
      severity: 'critical',
      weight: 95,
      title: 'Threat Intelligence Malicious URL Flag',
      message: 'Threat intelligence lookup not performed or unavailable.'
    };
  }

  const isTriggered = Boolean(ctx.threatIntel.isMalicious);
  const threatType = ctx.threatIntel.threatType ?? 'MALICIOUS_URL';
  const source = ctx.threatIntel.source ?? 'Threat Intelligence';

  return {
    id: 'RULE_THREAT_INTEL_MALICIOUS',
    triggered: isTriggered,
    severity: 'critical',
    weight: 95,
    title: 'Threat Intelligence Malicious URL Flag',
    message: isTriggered
      ? `CRITICAL THREAT: This URL was flagged as a confirmed ${threatType} threat by ${source}. Visiting this URL may result in phishing, malware installation, or credential theft.`
      : `Threat intelligence check clean: No active threats reported by ${source}.`,
    evidence: isTriggered
      ? [
          { key: 'threatType', value: threatType },
          { key: 'source', value: source },
          ...(ctx.threatIntel.targetUrl ? [{ key: 'targetUrl', value: ctx.threatIntel.targetUrl }] : []),
          ...(ctx.threatIntel.details ? [{ key: 'details', value: ctx.threatIntel.details }] : [])
        ]
      : undefined
  };
}
