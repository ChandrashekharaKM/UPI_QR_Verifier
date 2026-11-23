import brandData from './brand-keywords.json' with { type: 'json' };

export interface BrandMatch {
  readonly brandId: string;
  readonly brandDisplayName: string;
  readonly category: 'banks' | 'wallets' | 'govt' | 'utilities' | string;
  readonly matchedToken: string;
  readonly language: 'english' | 'devanagari' | 'hinglish' | 'tamil' | 'telugu' | 'bengali' | 'kannada' | 'transliteration';
}

export interface BrandValidationResult {
  readonly isImpersonation: boolean;
  readonly riskLevel: 'none' | 'low' | 'suspicious' | 'critical';
  readonly matchedBrands: readonly BrandMatch[];
  readonly matchedIntentKeywords: readonly string[];
  readonly matchedExemptions: readonly string[];
  readonly isExempt: boolean;
  readonly reason?: string;
  readonly message: string;
}

export interface ValidateBrandOptions {
  readonly payeeName?: string;
  readonly vpa?: string;
  readonly merchantCode?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a Latin token exists with appropriate word or delimiter boundaries.
 * Short tokens (<= 3 chars, e.g. "sbi", "bob", "rbi") require strict word/delimiter boundaries
 * to prevent false collisions in words like "inorbit", "bobcat", or "asbika".
 */
function matchesLatinToken(text: string, token: string, isVpaLocalPart: boolean = false): boolean {
  const normText = text.toLowerCase();
  const normToken = token.toLowerCase();

  if (normToken.length <= 3) {
    if (isVpaLocalPart) {
      // In VPA local part, delimiters are ., -, _, or string edges
      const regex = new RegExp(`(^|[._\\-])${escapeRegex(normToken)}([._\\-]|$)`, 'i');
      return regex.test(normText);
    }
    // In free text (payee name), standard word boundaries or punctuation
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(normToken)}([^a-z0-9]|$)`, 'i');
    return regex.test(normText);
  }

  if (isVpaLocalPart) {
    // For VPA local part (e.g. sbi.refund, paytmcare, paytm-support)
    return normText.includes(normToken);
  }

  // In payee name, require non-alphanumeric boundary for clean word separation
  const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(normToken)}([^a-z0-9]|$)`, 'i');
  return regex.test(normText);
}

/**
 * Checks for non-Latin script matches (Devanagari, Tamil, Telugu, Bengali, Kannada).
 * Uses whitespace/punctuation boundaries suitable for Indic scripts.
 */
function matchesScriptToken(text: string, token: string): boolean {
  if (!token || token.trim().length === 0) return false;
  const trimmed = token.trim();
  const escaped = escapeRegex(trimmed);
  // In Indic scripts, check whitespace/punctuation boundaries or compound prefix
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, 'u');
  return regex.test(text) || text.includes(trimmed);
}

/**
 * Detects brand mentions in the provided text across English tokens and Indian language transliterations.
 */
export function detectBrandMatches(text?: string, isVpaLocalPart: boolean = false): BrandMatch[] {
  if (!text || text.trim().length === 0) return [];
  const matches: BrandMatch[] = [];
  const seenBrands = new Set<string>();

  const categories = ['banks', 'wallets', 'govt', 'utilities'] as const;

  for (const cat of categories) {
    const list = brandData.categories[cat] ?? [];
    for (const brand of list) {
      if (seenBrands.has(brand.id)) continue;

      // 1. Check English/Latin tokens
      for (const token of brand.tokens) {
        if (matchesLatinToken(text, token, isVpaLocalPart)) {
          matches.push({
            brandId: brand.id,
            brandDisplayName: brand.displayName,
            category: cat,
            matchedToken: token,
            language: 'english'
          });
          seenBrands.add(brand.id);
          break;
        }
      }

      if (seenBrands.has(brand.id)) continue;

      // 2. Check Indian language transliterations
      if (brand.transliterations) {
        const transRecord = brand.transliterations as Record<string, string[]>;
        for (const [lang, transList] of Object.entries(transRecord)) {
          if (!Array.isArray(transList)) continue;
          for (const transToken of transList) {
            const matched =
              lang === 'hinglish'
                ? matchesLatinToken(text, transToken, isVpaLocalPart)
                : matchesScriptToken(text, transToken);

            if (matched) {
              matches.push({
                brandId: brand.id,
                brandDisplayName: brand.displayName,
                category: cat,
                matchedToken: transToken,
                language: lang as BrandMatch['language']
              });
              seenBrands.add(brand.id);
              break;
            }
          }
          if (seenBrands.has(brand.id)) break;
        }
      }
    }
  }

  return matches;
}

/**
 * Detects high-risk intent keywords (helpline, customer care, refund, kyc, power cut, etc.)
 * in English, Hinglish, Devanagari, and other Indian languages.
 */
export function detectHighRiskIntent(text?: string, isVpaLocalPart: boolean = false): string[] {
  if (!text || text.trim().length === 0) return [];
  const detected = new Set<string>();
  const normText = text.toLowerCase();

  // English intent keywords
  for (const kw of brandData.highRiskIntentKeywords) {
    if (isVpaLocalPart) {
      const cleanKw = kw.replace(/[-. ]/g, '');
      if (normText.includes(kw) || normText.includes(cleanKw)) {
        detected.add(kw);
      }
    } else {
      if (matchesLatinToken(text, kw, false)) {
        detected.add(kw);
      }
    }
  }

  // Transliterated intent keywords
  const transliterations = brandData.highRiskIntentTransliterations as Record<string, string[]>;
  for (const [lang, list] of Object.entries(transliterations)) {
    if (!Array.isArray(list)) continue;
    for (const kw of list) {
      const matched =
        lang === 'hinglish'
          ? matchesLatinToken(text, kw, isVpaLocalPart)
          : matchesScriptToken(text, kw);

      if (matched) {
        detected.add(kw);
      }
    }
  }

  return Array.from(detected);
}

/**
 * Detects legitimate professional exemptions (agent, advisor, mutual fund, broker, canteen, store, etc.)
 * in English and Indian language transliterations.
 */
export function detectExemptions(text?: string, isVpaLocalPart: boolean = false): string[] {
  if (!text || text.trim().length === 0) return [];
  const detected = new Set<string>();

  // English exempt keywords
  for (const kw of brandData.exemptContextKeywords) {
    if (matchesLatinToken(text, kw, isVpaLocalPart)) {
      detected.add(kw);
    }
  }

  // Transliterated exempt keywords
  const transliterations = brandData.exemptContextTransliterations as Record<string, string[]>;
  for (const [lang, list] of Object.entries(transliterations)) {
    if (!Array.isArray(list)) continue;
    for (const kw of list) {
      const matched =
        lang === 'hinglish'
          ? matchesLatinToken(text, kw, isVpaLocalPart)
          : matchesScriptToken(text, kw);

      if (matched) {
        detected.add(kw);
      }
    }
  }

  return Array.from(detected);
}

/**
 * High-precision, low-false-positive brand impersonation validator.
 * Distinguishes legitimate intermediaries (e.g. "SBI Mutual Fund Agent", "HDFC Life Insurance Advisor")
 * from deceptive phishing/social-engineering lures (e.g. "SBI Helpline", "Paytm Customer Care", "एसबीआई सहायता केंद्र").
 */
export function validateBrandImpersonation(options: ValidateBrandOptions): BrandValidationResult {
  const { payeeName = '', vpa = '', merchantCode = '' } = options;

  const vpaLocalPart = vpa.includes('@') ? (vpa.split('@')[0] ?? '') : vpa;

  // 1. Detect brand matches in both payeeName and VPA local part
  const nameBrands = detectBrandMatches(payeeName, false);
  const vpaBrands = detectBrandMatches(vpaLocalPart, true);

  const combinedBrandsMap = new Map<string, BrandMatch>();
  for (const m of [...nameBrands, ...vpaBrands]) {
    if (!combinedBrandsMap.has(m.brandId)) {
      combinedBrandsMap.set(m.brandId, m);
    }
  }
  const matchedBrands = Array.from(combinedBrandsMap.values());

  // 2. Detect high-risk intent keywords
  const nameIntents = detectHighRiskIntent(payeeName, false);
  const vpaIntents = detectHighRiskIntent(vpaLocalPart, true);
  const matchedIntentKeywords = Array.from(new Set([...nameIntents, ...vpaIntents]));

  // 3. Detect legitimate contextual exemptions
  const nameExemptions = detectExemptions(payeeName, false);
  const vpaExemptions = detectExemptions(vpaLocalPart, true);
  const matchedExemptions = Array.from(new Set([...nameExemptions, ...vpaExemptions]));

  // 4. MCC category exemptions
  const mcTrimmed = merchantCode.trim();
  const isUtilityMcc = brandData.categoryMccExemptions.utilities.includes(mcTrimmed);
  const isFinanceMcc = brandData.categoryMccExemptions.financial_intermediaries.includes(mcTrimmed);
  const isTollMcc = brandData.categoryMccExemptions.transit_tolls.includes(mcTrimmed);
  const isCourierMcc = brandData.categoryMccExemptions.courier.includes(mcTrimmed);

  const hasExemptMcc = isUtilityMcc || isFinanceMcc || isTollMcc || isCourierMcc;

  // No brand detected and no high-risk intent detected
  if (matchedBrands.length === 0 && matchedIntentKeywords.length === 0) {
    return {
      isImpersonation: false,
      riskLevel: 'none',
      matchedBrands: [],
      matchedIntentKeywords: [],
      matchedExemptions: [],
      isExempt: false,
      message: 'No brand or authority impersonation patterns detected.'
    };
  }

  // Brand detected: Evaluate whether legitimate or impersonation
  const brandNames = matchedBrands.map((b) => b.brandDisplayName).join(', ');

  // SCENARIO 1: Legitimate utility or official bill collection with MCC 4900
  const isAllUtilities =
    matchedBrands.length > 0 &&
    matchedBrands.every((b) => b.category === 'utilities');

  if (isAllUtilities && isUtilityMcc) {
    // If it's a utility brand with MCC 4900, it's legitimate bill payment unless explicit extortion lures appear
    const extortionIntents = matchedIntentKeywords.filter(
      (k) => k.includes('cut') || k.includes('disconnection') || k.includes('penalty')
    );
    if (extortionIntents.length === 0) {
      return {
        isImpersonation: false,
        riskLevel: 'none',
        matchedBrands,
        matchedIntentKeywords,
        matchedExemptions: ['MCC 4900 Utility Exemption'],
        isExempt: true,
        message: `Legitimate utility bill collection for ${brandNames} (MCC 4900).`
      };
    }
  }

  // SCENARIO 2: Contextual Exemption (e.g. "SBI Mutual Fund Agent", "HDFC Life Insurance Advisor", "SBI Canteen")
  // An exemption keyword (agent, advisor, canteen, store, etc.) must NOT be combined with a strong scam intent keyword (helpline, refund, etc.)
  const strongScamIntents = matchedIntentKeywords.filter((k) =>
    ['helpline', 'helpdesk', 'customercare', 'customer care', 'customer-care', 'refund', 'kyc', 'unblock', 'power cut', 'disconnection', 'सहायता', 'मदद', 'रिफंड', 'केवाईसी'].some(
      (s) => k.toLowerCase().includes(s)
    )
  );

  const hasLegitimateContext = matchedExemptions.length > 0 || (isFinanceMcc && matchedBrands.some((b) => b.category === 'banks'));

  if (hasLegitimateContext && strongScamIntents.length === 0) {
    return {
      isImpersonation: false,
      riskLevel: 'none',
      matchedBrands,
      matchedIntentKeywords,
      matchedExemptions,
      isExempt: true,
      reason: `Payee indicates authorized intermediary, agent, or commercial facility (${matchedExemptions.join(', ')}).`,
      message: `Legitimate entity or intermediary associated with ${brandNames} (${matchedExemptions.join(', ')}). Low false-positive exemption applied.`
    };
  }

  // SCENARIO 3: Active Scam / Social Engineering Impersonation
  // If high-risk intent keywords are present with or without brand
  if (matchedIntentKeywords.length > 0) {
    const isBrandImpersonation = matchedBrands.length > 0;
    const desc = isBrandImpersonation
      ? `Brand impersonation detected: claims affiliation with "${brandNames}" combined with deceptive support/urgency lure (${matchedIntentKeywords.join(', ')}).`
      : `Deceptive authority or customer support lure detected (${matchedIntentKeywords.join(', ')}).`;

    return {
      isImpersonation: true,
      riskLevel: 'critical',
      matchedBrands,
      matchedIntentKeywords,
      matchedExemptions,
      isExempt: false,
      reason: isBrandImpersonation ? 'Brand + Deceptive Support Lure' : 'Deceptive Support Lure',
      message: desc
    };
  }

  // SCENARIO 4: Bare Brand Name Claimed on Unverified Personal Account
  // E.g. pn="State Bank of India" or "Paytm" with personal VPA, no MCC, no agent/store qualifier
  if (matchedBrands.length > 0 && !hasExemptMcc && matchedExemptions.length === 0) {
    // If the payee name strictly or prominently claims the brand name without legitimate merchant credentials
    return {
      isImpersonation: true,
      riskLevel: 'suspicious',
      matchedBrands,
      matchedIntentKeywords,
      matchedExemptions,
      isExempt: false,
      reason: `Unverified claim of official brand identity: ${brandNames}.`,
      message: `Payee directly claims official brand identity "${brandNames}" without registered merchant categorization or legitimate intermediary qualifier.`
    };
  }

  return {
    isImpersonation: false,
    riskLevel: 'none',
    matchedBrands,
    matchedIntentKeywords,
    matchedExemptions,
    isExempt: false,
    message: 'No impersonation detected.'
  };
}

export function getBrandKeywordsData() {
  return brandData;
}
