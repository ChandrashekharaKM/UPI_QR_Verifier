import type { FeatureDefinition } from '../types/features.js';

export const FEATURE_SCHEMA_VERSION = '1.0.0';

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  { index: 0, name: 'is_upi_scheme', description: '1 if payload starts with upi://pay, 0 otherwise', range: [0, 1] },
  { index: 1, name: 'is_url_scheme', description: '1 if payload is an HTTP/HTTPS web URL', range: [0, 1] },
  { index: 2, name: 'is_insecure_http', description: '1 if URL uses unencrypted HTTP', range: [0, 1] },
  { index: 3, name: 'is_ip_address_url', description: '1 if URL hostname is a raw IP address', range: [0, 1] },
  { index: 4, name: 'is_shortened_url', description: '1 if URL hostname is a link shortener', range: [0, 1] },
  { index: 5, name: 'is_suspicious_tld', description: '1 if domain has high-risk TLD (.xyz, .top, etc.)', range: [0, 1] },
  { index: 6, name: 'is_punycode_url', description: '1 if domain contains punycode xn--', range: [0, 1] },
  { index: 7, name: 'payload_length_norm', description: 'QR payload character length normalized to [0, 1]', range: [0, 1] },
  { index: 8, name: 'has_duplicate_params', description: '1 if URI contains duplicate query parameters', range: [0, 1] },
  { index: 9, name: 'extra_params_count_norm', description: 'Count of non-standard query parameters', range: [0, 1] },
  { index: 10, name: 'vpa_is_known_psp', description: '1 if PSP handle is on NPCI allowlist', range: [0, 1] },
  { index: 11, name: 'vpa_is_phone_number', description: '1 if VPA local part is a 10-digit mobile number', range: [0, 1] },
  { index: 12, name: 'vpa_entropy_norm', description: 'Shannon entropy of VPA username normalized by 5.0', range: [0, 1] },
  { index: 13, name: 'vpa_digit_ratio', description: 'Ratio of numeric digits in VPA local part', range: [0, 1] },
  { index: 14, name: 'vpa_has_impersonation', description: '1 if VPA contains bank/support/authority keywords', range: [0, 1] },
  { index: 15, name: 'vpa_has_excessive_digits', description: '1 if non-phone VPA contains excessive digits', range: [0, 1] },
  { index: 16, name: 'has_payee_name', description: '1 if payee name (pn) is present and non-empty', range: [0, 1] },
  { index: 17, name: 'name_vpa_similarity', description: 'Jaro-Winkler lexical similarity between name and VPA', range: [0, 1] },
  { index: 18, name: 'has_urgency_in_name', description: '1 if payee name contains refund/prize/kyc keywords', range: [0, 1] },
  { index: 19, name: 'has_amount', description: '1 if transaction amount (am) is pre-filled', range: [0, 1] },
  { index: 20, name: 'amount_normalized', description: 'Pre-filled amount in INR normalized by 50,000', range: [0, 1] },
  { index: 21, name: 'is_high_amount', description: '1 if pre-filled amount >= 25,000 INR', range: [0, 1] },
  { index: 22, name: 'is_round_bait_amount', description: '1 if amount matches lure pricing (9999, 19999, etc.)', range: [0, 1] },
  { index: 23, name: 'is_currency_inr', description: '1 if currency is INR, 0 if other or invalid', range: [0, 1] },
  { index: 24, name: 'has_merchant_code', description: '1 if 4-digit MCC is declared', range: [0, 1] },
  { index: 25, name: 'missing_mc_for_business', description: '1 if claims business name but lacks MCC', range: [0, 1] },
  { index: 26, name: 'has_refund_note', description: '1 if transaction note mentions refund/verify/claim', range: [0, 1] },
  { index: 27, name: 'rule_risk_score_norm', description: 'Deterministic rule engine risk score / 100', range: [0, 1] },
  { index: 28, name: 'community_report_count_norm', description: 'Community scam reports count normalized to [0, 1]', range: [0, 1] },
  { index: 29, name: 'community_recent_report', description: '1 if scam report logged within last 7 days', range: [0, 1] }
];

export const FEATURE_NAMES: readonly string[] = FEATURE_DEFINITIONS.map((f) => f.name);
