import type { UrlFields } from '../types/payload.js';

const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'is.gd',
  'buff.ly',
  'ow.ly',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'soo.gd',
  's.id'
]);

const SUSPICIOUS_TLDS = new Set([
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
  'tk',
  'monster',
  'rest',
  'fit'
]);

export interface UrlParseResult {
  readonly success: boolean;
  readonly fields?: UrlFields;
  readonly warnings: readonly string[];
}

export function parseUrlPayload(rawPayload: string): UrlParseResult {
  const warnings: string[] = [];
  const trimmed = rawPayload.trim();

  let urlObj: URL | undefined;
  let protocol = '';
  let hostname = '';
  const searchParams: Record<string, string> = {};
  let hasLoginCredentials = false;

  try {
    urlObj = new URL(trimmed);
    hostname = urlObj.hostname.toLowerCase();
    protocol = urlObj.protocol.toLowerCase();
    for (const [k, v] of urlObj.searchParams.entries()) {
      searchParams[k] = v;
    }
    hasLoginCredentials = Boolean(urlObj.username || urlObj.password);
  } catch {
    // Resilient fallback: If standard URL parser fails (e.g. malformed IDNA punycode delta sequence or non-standard characters),
    // extract components using regex to inspect punycode, ip, or scheme risks without crashing.
    const match = trimmed.match(/^(https?:\/\/)([^\/?#:]+)(?::(\d+))?([^\s]*)$/i);
    if (!match) {
      return {
        success: false,
        warnings: ['Invalid URL format']
      };
    }
    protocol = match[1]!.toLowerCase();
    hostname = match[2]!.toLowerCase();
  }

  // IP address check: IPv4 regex or IPv6 check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const isIpv4 = ipv4Regex.test(hostname);
  const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
  const isIpAddress = isIpv4 || isIpv6;

  // Shortener check
  const isShortened = KNOWN_SHORTENERS.has(hostname);

  // Punycode check
  const isPunycode = hostname.includes('xn--');

  // TLD extraction
  const parts = hostname.split('.');
  const topLevelDomain = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';

  if (SUSPICIOUS_TLDS.has(topLevelDomain)) {
    warnings.push(`URL uses high-risk suspicious top-level domain: .${topLevelDomain}`);
  }

  if (protocol === 'http:') {
    warnings.push('URL uses unencrypted insecure HTTP protocol');
  }

  if (isIpAddress) {
    warnings.push('URL points directly to an IP address instead of a recognized domain');
  }

  if (isShortened) {
    warnings.push('URL is obfuscated with a URL shortening service');
  }

  if (isPunycode) {
    warnings.push('URL uses punycode characters, potential homograph/lookalike phishing domain');
  }

  if (hasLoginCredentials) {
    warnings.push('URL contains embedded user credentials');
  }

  const fields: UrlFields = {
    rawUrl: trimmed,
    protocol,
    hostname,
    ...(urlObj?.port ? { port: urlObj.port } : {}),
    pathname: urlObj?.pathname ?? '/',
    searchParams,
    isIpAddress,
    isShortened,
    isPunycode,
    topLevelDomain,
    hasLoginCredentials
  };

  return {
    success: true,
    fields,
    warnings
  };
}
