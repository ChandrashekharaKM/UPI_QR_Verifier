import { describe, it, expect } from 'vitest';
import { parsePayload } from '../src/parser/payload-parser.js';
import { evaluateRules } from '../src/rules/engine.js';
import {
  ruleNonUpiScheme,
  ruleHttpNotHttps,
  ruleIpAddressUrl,
  ruleShortenedUrl,
  ruleSuspiciousTld,
  rulePunycodeDomain
} from '../src/rules/rules-protocol.js';
import {
  ruleUnknownPsp,
  ruleVpaHighEntropy,
  ruleVpaExcessiveDigits,
  ruleVpaImpersonation
} from '../src/rules/rules-vpa.js';
import {
  ruleMissingPayeeName,
  ruleNameVpaMismatch,
  ruleUrgencyKeywords
} from '../src/rules/rules-payee.js';
import {
  ruleHighAmount,
  ruleRoundBaitAmount,
  ruleRefundVerifyNote,
  ruleMissingMcBusiness
} from '../src/rules/rules-transaction.js';
import {
  ruleDuplicateParameters,
  ruleUnknownParameters,
  ruleOversizedPayload,
  ruleInvalidCurrency
} from '../src/rules/rules-payload.js';
import {
  ruleCommunityHighReports,
  ruleCommunityRecentReports
} from '../src/rules/rules-community.js';

describe('Security Rules Engine Individual Rule Evaluations', () => {
  it('31. ruleNonUpiScheme triggers on web URLs and plain text', () => {
    const ctxUrl = { parsed: parsePayload('https://bank-login.com') };
    const resUrl = ruleNonUpiScheme(ctxUrl);
    expect(resUrl.triggered).toBe(true);
    expect(resUrl.severity).toBe('critical');

    const ctxUpi = { parsed: parsePayload('upi://pay?pa=user@oksbi') };
    expect(ruleNonUpiScheme(ctxUpi).triggered).toBe(false);
  });

  it('32. ruleHttpNotHttps triggers on unencrypted HTTP web addresses', () => {
    const ctxHttp = { parsed: parsePayload('http://pay-portal.com/login') };
    expect(ruleHttpNotHttps(ctxHttp).triggered).toBe(true);

    const ctxHttps = { parsed: parsePayload('https://pay-portal.com/login') };
    expect(ruleHttpNotHttps(ctxHttps).triggered).toBe(false);
  });

  it('33. ruleIpAddressUrl triggers when hostname is an IP address', () => {
    const ctxIp = { parsed: parsePayload('http://192.168.1.100/upi') };
    expect(ruleIpAddressUrl(ctxIp).triggered).toBe(true);

    const ctxDomain = { parsed: parsePayload('https://merchant.com/upi') };
    expect(ruleIpAddressUrl(ctxDomain).triggered).toBe(false);
  });

  it('34. ruleShortenedUrl triggers on link shortening services', () => {
    const ctxBitly = { parsed: parsePayload('https://bit.ly/claim-cash') };
    expect(ruleShortenedUrl(ctxBitly).triggered).toBe(true);

    const ctxDirect = { parsed: parsePayload('https://legitshop.in/pay') };
    expect(ruleShortenedUrl(ctxDirect).triggered).toBe(false);
  });

  it('35. ruleSuspiciousTld triggers on high-risk domain extensions', () => {
    const ctxXyz = { parsed: parsePayload('https://reward-center.xyz/pay') };
    expect(ruleSuspiciousTld(ctxXyz).triggered).toBe(true);

    const ctxOrg = { parsed: parsePayload('https://charity.org/donate') };
    expect(ruleSuspiciousTld(ctxOrg).triggered).toBe(false);
  });

  it('36. rulePunycodeDomain triggers on homograph punycode URLs', () => {
    const ctxPuny = { parsed: parsePayload('https://xn--paytm-0qa.com') };
    expect(rulePunycodeDomain(ctxPuny).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('https://paytm.com') };
    expect(rulePunycodeDomain(ctxNormal).triggered).toBe(false);
  });

  it('37. ruleUnknownPsp triggers on unrecognized PSP handles', () => {
    const ctxUnknown = { parsed: parsePayload('upi://pay?pa=scammer@boguspsp') };
    expect(ruleUnknownPsp(ctxUnknown).triggered).toBe(true);

    const ctxKnown = { parsed: parsePayload('upi://pay?pa=user@okhdfcbank') };
    expect(ruleUnknownPsp(ctxKnown).triggered).toBe(false);
  });

  it('38. ruleVpaHighEntropy triggers on random machine-generated handles', () => {
    const ctxRandom = { parsed: parsePayload('upi://pay?pa=w8x2q9z4k7m1@oksbi') };
    expect(ruleVpaHighEntropy(ctxRandom).triggered).toBe(true);

    const ctxName = { parsed: parsePayload('upi://pay?pa=rahulsharma@oksbi') };
    expect(ruleVpaHighEntropy(ctxName).triggered).toBe(false);
  });

  it('39. ruleVpaExcessiveDigits triggers on excessive digit concentrations', () => {
    const ctxDigits = { parsed: parsePayload('upi://pay?pa=user84729184719284@oksbi') };
    expect(ruleVpaExcessiveDigits(ctxDigits).triggered).toBe(true);

    const ctxPhone = { parsed: parsePayload('upi://pay?pa=9876543210@paytm') };
    expect(ruleVpaExcessiveDigits(ctxPhone).triggered).toBe(false);
  });

  it('40. ruleVpaImpersonation triggers on bank/support/kyc impersonations', () => {
    const ctxSbi = { parsed: parsePayload('upi://pay?pa=sbi.refund.desk@ybl') };
    expect(ruleVpaImpersonation(ctxSbi).triggered).toBe(true);
    expect(ruleVpaImpersonation(ctxSbi).severity).toBe('critical');

    const ctxKyc = { parsed: parsePayload('upi://pay?pa=paytm-kycupdate@oksbi') };
    expect(ruleVpaImpersonation(ctxKyc).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=suresh@oksbi') };
    expect(ruleVpaImpersonation(ctxNormal).triggered).toBe(false);
  });

  it('41. ruleMissingPayeeName triggers when pn is omitted', () => {
    const ctxNoName = { parsed: parsePayload('upi://pay?pa=user@oksbi') };
    expect(ruleMissingPayeeName(ctxNoName).triggered).toBe(true);

    const ctxWithName = { parsed: parsePayload('upi://pay?pa=user@oksbi&pn=Rohan') };
    expect(ruleMissingPayeeName(ctxWithName).triggered).toBe(false);
  });

  it('42. ruleNameVpaMismatch triggers on disconnected name vs VPA identity', () => {
    const ctxMismatch = { parsed: parsePayload('upi://pay?pa=rohit9823@ybl&pn=Electricity%20Department%20Govt') };
    expect(ruleNameVpaMismatch(ctxMismatch).triggered).toBe(true);

    const ctxMatch = { parsed: parsePayload('upi://pay?pa=rohitsharma@ybl&pn=Rohit%20Sharma') };
    expect(ruleNameVpaMismatch(ctxMatch).triggered).toBe(false);
  });

  it('43. ruleUrgencyKeywords triggers on refund, lottery, or prize lures', () => {
    const ctxLottery = { parsed: parsePayload('upi://pay?pa=prize@oksbi&pn=Lottery%20Prize%20Winner') };
    expect(ruleUrgencyKeywords(ctxLottery).triggered).toBe(true);

    const ctxClean = { parsed: parsePayload('upi://pay?pa=store@oksbi&pn=Gupta%20Provisions') };
    expect(ruleUrgencyKeywords(ctxClean).triggered).toBe(false);
  });

  it('44. ruleHighAmount triggers on prefilled amounts >= 25,000 INR', () => {
    const ctxHigh = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=35000') };
    expect(ruleHighAmount(ctxHigh).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=250') };
    expect(ruleHighAmount(ctxNormal).triggered).toBe(false);
  });

  it('45. ruleRoundBaitAmount triggers on psychological lure pricing', () => {
    const ctxBait = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=19999') };
    expect(ruleRoundBaitAmount(ctxBait).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=500') };
    expect(ruleRoundBaitAmount(ctxNormal).triggered).toBe(false);
  });

  it('46. ruleRefundVerifyNote triggers on refund scam notes', () => {
    const ctxRefund = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=500&tn=Refund%20Approval%20Scan%20To%20Receive') };
    expect(ruleRefundVerifyNote(ctxRefund).triggered).toBe(true);
    expect(ruleRefundVerifyNote(ctxRefund).severity).toBe('critical');

    const ctxInvoice = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=500&tn=Invoice%20492') };
    expect(ruleRefundVerifyNote(ctxInvoice).triggered).toBe(false);
  });

  it('47. ruleMissingMcBusiness triggers when name claims business without MCC', () => {
    const ctxNoMc = { parsed: parsePayload('upi://pay?pa=user@oksbi&pn=Sharma%20Electronics%20Store%20Pvt%20Ltd') };
    expect(ruleMissingMcBusiness(ctxNoMc).triggered).toBe(true);

    const ctxWithMc = { parsed: parsePayload('upi://pay?pa=user@oksbi&pn=Sharma%20Electronics%20Store%20Pvt%20Ltd&mc=5732') };
    expect(ruleMissingMcBusiness(ctxWithMc).triggered).toBe(false);
  });

  it('48. ruleDuplicateParameters triggers on duplicate parameter injection', () => {
    const ctxDupe = { parsed: parsePayload('upi://pay?pa=innocent@oksbi&pa=hacker@ybl') };
    expect(ruleDuplicateParameters(ctxDupe).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=innocent@oksbi&am=100') };
    expect(ruleDuplicateParameters(ctxNormal).triggered).toBe(false);
  });

  it('49. ruleUnknownParameters triggers on unexpected query parameters', () => {
    const ctxUnknown = { parsed: parsePayload('upi://pay?pa=user@oksbi&unusual_token=xyz123') };
    expect(ruleUnknownParameters(ctxUnknown).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=100&cu=INR') };
    expect(ruleUnknownParameters(ctxNormal).triggered).toBe(false);
  });

  it('50. ruleOversizedPayload triggers on unusually long payload strings', () => {
    const ctxBig = { parsed: parsePayload(`upi://pay?pa=user@oksbi&tn=${'Z'.repeat(600)}`) };
    expect(ruleOversizedPayload(ctxBig).triggered).toBe(true);

    const ctxNormal = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=100') };
    expect(ruleOversizedPayload(ctxNormal).triggered).toBe(false);
  });

  it('51. ruleInvalidCurrency triggers on non-INR currencies', () => {
    const ctxUsd = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=100&cu=USD') };
    expect(ruleInvalidCurrency(ctxUsd).triggered).toBe(true);

    const ctxInr = { parsed: parsePayload('upi://pay?pa=user@oksbi&am=100&cu=INR') };
    expect(ruleInvalidCurrency(ctxInr).triggered).toBe(false);
  });

  it('52. ruleCommunityHighReports and ruleCommunityRecentReports trigger on community signals', () => {
    const ctxCommunity = {
      parsed: parsePayload('upi://pay?pa=scammer@oksbi'),
      community: {
        reportCount: 4,
        lastReportedDaysAgo: 2,
        topCategories: ['phishing', 'fake_support']
      }
    };

    expect(ruleCommunityHighReports(ctxCommunity).triggered).toBe(true);
    expect(ruleCommunityRecentReports(ctxCommunity).triggered).toBe(true);

    const ctxCleanCommunity = {
      parsed: parsePayload('upi://pay?pa=user@oksbi'),
      community: {
        reportCount: 0,
        topCategories: []
      }
    };

    expect(ruleCommunityHighReports(ctxCleanCommunity).triggered).toBe(false);
    expect(ruleCommunityRecentReports(ctxCleanCommunity).triggered).toBe(false);
  });

  it('53. evaluateRules evaluates full rule registry with diminishing returns', () => {
    const cleanCtx = { parsed: parsePayload('upi://pay?pa=merchant@okhdfcbank&pn=Merchant&am=100&cu=INR&mc=5411') };
    const cleanResult = evaluateRules(cleanCtx);
    expect(cleanResult.triggeredRules.length).toBe(0);
    expect(cleanResult.ruleRiskScore).toBe(0);

    const maliciousCtx = {
      parsed: parsePayload('upi://pay?pa=sbi.refund.care@ybl&pn=SBI%20Customer%20Care&am=10000&tn=Refund%20Verification')
    };
    const malResult = evaluateRules(maliciousCtx);
    expect(malResult.triggeredRules.length).toBeGreaterThanOrEqual(2);
    expect(malResult.ruleRiskScore).toBeGreaterThanOrEqual(80);
  });
});
