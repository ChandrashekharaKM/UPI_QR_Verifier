import type { FeatureVector } from '../types/features.js';
import type { RuleContext } from '../types/rules.js';
import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION } from './feature-schema.js';
import { validateVpa } from '../validators/psp-validator.js';
import { analyzeStringComposition } from '../validators/entropy.js';
import { validateAmountAndCurrency } from '../validators/amount-validator.js';
import { validateMerchantAndUrgency } from '../validators/merchant-validator.js';
import { jaroWinklerSimilarity } from '../validators/string-distance.js';

export function extractFeatureVector(
  ctx: RuleContext,
  ruleRiskScore: number
): FeatureVector {
  const { parsed, community } = ctx;
  const values = new Array<number>(FEATURE_NAMES.length).fill(0);

  // 0: is_upi_scheme
  values[0] = parsed.kind === 'upi' ? 1.0 : 0.0;
  // 1: is_url_scheme
  values[1] = parsed.kind === 'url' ? 1.0 : 0.0;

  if (parsed.kind === 'url' && parsed.fields.kind === 'url') {
    const url = parsed.fields.url;
    // 2: is_insecure_http
    values[2] = url.protocol === 'http:' ? 1.0 : 0.0;
    // 3: is_ip_address_url
    values[3] = url.isIpAddress ? 1.0 : 0.0;
    // 4: is_shortened_url
    values[4] = url.isShortened ? 1.0 : 0.0;
    // 5: is_suspicious_tld
    const suspiciousTlds = new Set(['top', 'xyz', 'buzz', 'club', 'work', 'loan', 'click', 'gq', 'cf', 'ml', 'ga', 'tk']);
    values[5] = suspiciousTlds.has(url.topLevelDomain) ? 1.0 : 0.0;
    // 6: is_punycode_url
    values[6] = url.isPunycode ? 1.0 : 0.0;
  }

  // 7: payload_length_norm (clamped to 500)
  values[7] = Math.min(1.0, parsed.payloadLength / 500);

  // 8: has_duplicate_params
  values[8] = parsed.hasDuplicateParams ? 1.0 : 0.0;

  if (parsed.kind === 'upi' && parsed.fields.kind === 'upi') {
    const upi = parsed.fields.upi;
    const extraCount = Object.keys(upi.extraParams).length;
    // 9: extra_params_count_norm
    values[9] = Math.min(1.0, extraCount / 5);

    const vpaCheck = validateVpa(upi.pa);
    // 10: vpa_is_known_psp
    values[10] = vpaCheck.isKnownPsp ? 1.0 : 0.0;
    // 11: vpa_is_phone_number
    values[11] = vpaCheck.isPhoneVpa ? 1.0 : 0.0;

    const comp = analyzeStringComposition(vpaCheck.localPart);
    // 12: vpa_entropy_norm
    values[12] = Math.min(1.0, comp.entropy / 5.0);
    // 13: vpa_digit_ratio
    values[13] = comp.digitRatio;
    // 14: vpa_has_impersonation
    values[14] = vpaCheck.impersonationKeywords.length > 0 ? 1.0 : 0.0;
    // 15: vpa_has_excessive_digits
    values[15] = vpaCheck.excessiveDigits ? 1.0 : 0.0;

    // 16: has_payee_name
    const hasName = Boolean(upi.pn && upi.pn.trim().length > 0);
    values[16] = hasName ? 1.0 : 0.0;

    // 17: name_vpa_similarity
    if (hasName && upi.pn) {
      const cleanName = upi.pn.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanLocal = vpaCheck.localPart.toLowerCase().replace(/[^a-z0-9]/g, '');
      values[17] = jaroWinklerSimilarity(cleanName, cleanLocal);
    } else {
      values[17] = 0.5; // neutral fallback when name missing
    }

    const merchantCheck = validateMerchantAndUrgency(upi.pn, upi.mc, upi.tn);
    // 18: has_urgency_in_name
    values[18] = merchantCheck.urgencyKeywordsInName.length > 0 ? 1.0 : 0.0;

    const amountCheck = validateAmountAndCurrency(upi.am, upi.cu);
    // 19: has_amount
    values[19] = amountCheck.hasAmount ? 1.0 : 0.0;
    // 20: amount_normalized
    values[20] = amountCheck.amountValue ? Math.min(1.0, amountCheck.amountValue / 50000) : 0.0;
    // 21: is_high_amount
    values[21] = amountCheck.isHighAmount || amountCheck.isAboveNpciLimit ? 1.0 : 0.0;
    // 22: is_round_bait_amount
    values[22] = amountCheck.isRoundBaitAmount ? 1.0 : 0.0;
    // 23: is_currency_inr
    values[23] = amountCheck.isCurrencyValid ? 1.0 : 0.0;

    // 24: has_merchant_code
    values[24] = merchantCheck.hasMerchantCode && merchantCheck.isMerchantCodeValidFormat ? 1.0 : 0.0;
    // 25: missing_mc_for_business
    values[25] = merchantCheck.missingMerchantCodeForBusiness ? 1.0 : 0.0;

    // 26: has_refund_note
    const hasRefund = (upi.tn ?? '').toLowerCase().includes('refund') ||
      (upi.tn ?? '').toLowerCase().includes('verify') ||
      merchantCheck.urgencyKeywordsInNote.length > 0;
    values[26] = hasRefund ? 1.0 : 0.0;
  }

  // 27: rule_risk_score_norm
  values[27] = Math.min(1.0, Math.max(0.0, ruleRiskScore / 100));

  // 28: community_report_count_norm
  const reportCount = community?.reportCount ?? 0;
  values[28] = Math.min(1.0, reportCount / 10);

  // 29: community_recent_report
  const daysAgo = community?.lastReportedDaysAgo;
  values[29] = daysAgo !== undefined && daysAgo <= 7 ? 1.0 : 0.0;

  return {
    version: FEATURE_SCHEMA_VERSION,
    names: FEATURE_NAMES,
    values
  };
}
