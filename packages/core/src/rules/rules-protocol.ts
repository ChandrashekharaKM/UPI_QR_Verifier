import type { RuleContext, RuleResult } from '../types/rules.js';

/**
 * Rule: Non-UPI QR code in a payment context.
 * Why: QR codes placed on payment counters or sent for payment that are actually web links or other schemes
 * are frequently malicious redirects, phishing portals, or malware download links.
 */
export function ruleNonUpiScheme(ctx: RuleContext): RuleResult {
  const isNonUpi = ctx.parsed.kind !== 'upi';
  return {
    id: 'RULE_NON_UPI_SCHEME',
    triggered: isNonUpi,
    severity: 'critical',
    weight: 85,
    title: 'Non-UPI Payment QR Code',
    message: isNonUpi
      ? `This QR code does not contain a direct UPI payment link (kind: ${ctx.parsed.kind}). Scanning it could open an external webpage or malicious service.`
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
 * Rule: URL using unencrypted HTTP.
 * Why: In modern payment and authentication workflows, HTTP exposes users to man-in-the-middle attacks and eavesdropping.
 */
export function ruleHttpNotHttps(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'url') {
    return {
      id: 'RULE_HTTP_NOT_HTTPS',
      triggered: false,
      severity: 'high',
      weight: 70,
      title: 'Insecure HTTP Protocol',
      message: 'Not applicable.'
    };
  }

  const urlFields = ctx.parsed.fields.kind === 'url' ? ctx.parsed.fields.url : undefined;
  const isHttp = urlFields?.protocol === 'http:';

  return {
    id: 'RULE_HTTP_NOT_HTTPS',
    triggered: isHttp,
    severity: 'high',
    weight: 70,
    title: 'Insecure HTTP Protocol',
    message: isHttp
      ? 'The QR code links to an unencrypted HTTP web address. Legitimate financial portals strictly require HTTPS.'
      : 'URL uses secure HTTPS encryption.',
    evidence: isHttp && urlFields ? [{ key: 'url', value: urlFields.rawUrl }] : undefined
  };
}

/**
 * Rule: URL uses raw IP address instead of domain.
 * Why: Legitimate payment gateways and banks never host payment landing pages directly on raw IP addresses.
 */
export function ruleIpAddressUrl(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'url') {
    return {
      id: 'RULE_IP_ADDRESS_URL',
      triggered: false,
      severity: 'high',
      weight: 80,
      title: 'Direct IP Address URL',
      message: 'Not applicable.'
    };
  }

  const urlFields = ctx.parsed.fields.kind === 'url' ? ctx.parsed.fields.url : undefined;
  const isIp = Boolean(urlFields?.isIpAddress);

  return {
    id: 'RULE_IP_ADDRESS_URL',
    triggered: isIp,
    severity: 'high',
    weight: 80,
    title: 'Direct IP Address URL',
    message: isIp
      ? `The QR code points directly to a raw server IP address (${urlFields?.hostname ?? ''}) rather than an authenticated corporate domain name.`
      : 'Domain name is used instead of a direct IP address.',
    evidence: isIp && urlFields ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}

/**
 * Rule: Shortened URL service.
 * Why: URL shorteners hide the destination domain, a classic tactic to obscure phishing sites and malware.
 */
export function ruleShortenedUrl(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'url') {
    return {
      id: 'RULE_SHORTENED_URL',
      triggered: false,
      severity: 'medium',
      weight: 65,
      title: 'Obfuscated Shortened URL',
      message: 'Not applicable.'
    };
  }

  const urlFields = ctx.parsed.fields.kind === 'url' ? ctx.parsed.fields.url : undefined;
  const isShortened = Boolean(urlFields?.isShortened);

  return {
    id: 'RULE_SHORTENED_URL',
    triggered: isShortened,
    severity: 'medium',
    weight: 65,
    title: 'Obfuscated Shortened URL',
    message: isShortened
      ? `The destination address is masked by a link shortening service (${urlFields?.hostname ?? ''}), preventing verification of the actual payment destination.`
      : 'URL does not use a known shortening service.',
    evidence: isShortened && urlFields ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}

/**
 * Rule: High-risk suspicious top-level domain.
 * Why: Domains ending in spam-heavy TLDs (.xyz, .top, .buzz, etc.) are frequently utilized for disposable scam infrastructure.
 */
export function ruleSuspiciousTld(ctx: RuleContext): RuleResult {
  if (ctx.parsed.kind !== 'url') {
    return {
      id: 'RULE_SUSPICIOUS_TLD',
      triggered: false,
      severity: 'medium',
      weight: 60,
      title: 'Suspicious Domain Extension',
      message: 'Not applicable.'
    };
  }

  const urlFields = ctx.parsed.fields.kind === 'url' ? ctx.parsed.fields.url : undefined;
  const tld = urlFields?.topLevelDomain ?? '';
  const suspiciousTlds = new Set(['top', 'xyz', 'buzz', 'club', 'work', 'loan', 'click', 'gq', 'cf', 'ml', 'ga', 'tk']);
  const isSuspicious = suspiciousTlds.has(tld);

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
  if (ctx.parsed.kind !== 'url') {
    return {
      id: 'RULE_PUNYCODE_DOMAIN',
      triggered: false,
      severity: 'high',
      weight: 80,
      title: 'Punycode Homograph Domain',
      message: 'Not applicable.'
    };
  }

  const urlFields = ctx.parsed.fields.kind === 'url' ? ctx.parsed.fields.url : undefined;
  const isPunycode = Boolean(urlFields?.isPunycode);

  return {
    id: 'RULE_PUNYCODE_DOMAIN',
    triggered: isPunycode,
    severity: 'high',
    weight: 80,
    title: 'Punycode Homograph Domain',
    message: isPunycode
      ? 'The web address contains punycode characters (xn--), which attackers commonly use to visually impersonate legitimate banks and brands.'
      : 'No punycode character encoding detected.',
    evidence: isPunycode && urlFields ? [{ key: 'hostname', value: urlFields.hostname }] : undefined
  };
}
