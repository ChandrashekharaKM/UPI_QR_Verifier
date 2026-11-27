import { describe, it, expect } from 'vitest';
import { verifyQrPayload } from '../src/verifier.js';
import { describeQrIntent } from '../src/parser/qr-intent.js';

describe('describeQrIntent: Plain-English QR Intent & Risk Counter Engine', () => {
  it('1. Correctly decodes authentic merchant standee (0 risks, clear payment explanation)', () => {
    const payload = 'upi://pay?pa=store@okhdfcbank&pn=Fresh+Mart&mc=5411&am=350.00&cu=INR';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('PAYMENT');
    expect(intent.totalRisks).toBe(0);
    expect(intent.criticalRisksCount).toBe(0);
    expect(intent.riskLevel).toBe('SAFE');
    expect(intent.headline).toContain('paying ₹350.00 to Fresh Mart');
    expect(intent.plainEnglishAction).toContain('authorizing a one-time payment of ₹350.00');
    expect(intent.financialImpact).toContain('₹350.00 will be debited from your bank account');
    expect(intent.payeeName).toBe('Fresh Mart');
    expect(intent.payeeVpa).toBe('store@okhdfcbank');
    expect(intent.payeeType).toBe('MERCHANT_VERIFIED');
    expect(intent.amountText).toContain('₹350.00');
    expect(intent.deceptionAlert).toBeUndefined();
  });

  it('2. Flags deceptive refund scam trap with critical warning and accurate risk count', () => {
    const payload = 'upi://pay?pa=refund.dept99@paytm&pn=Electricity+Refund&am=25000&tn=Electricity+Bill+Refund+Claim';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('REFUND_SCAM_TRAP');
    expect(intent.totalRisks).toBeGreaterThanOrEqual(1);
    expect(intent.criticalRisksCount).toBeGreaterThanOrEqual(1);
    expect(intent.riskLevel).toBe('HIGH_RISK');
    expect(intent.headline).toContain('DECEPTION TRAP');
    expect(intent.headline).toContain('SENDING ₹25000, NOT receiving money');
    expect(intent.plainEnglishAction).toContain('YOU NEVER SCAN A QR CODE OR ENTER YOUR PIN TO RECEIVE MONEY');
    expect(intent.financialImpact).toContain('₹25000 will be DEBITED');
    expect(intent.deceptionAlert?.isDeceptive).toBe(true);
    expect(intent.deceptionAlert?.title).toContain('REFUND / REWARD SCAM');
    expect(intent.riskBulletPoints.length).toBe(intent.totalRisks);
  });

  it('3. Identifies collect / pull debit requests asking for funds from the user', () => {
    const payload = 'upi://collect?pa=requester@axisbank&pn=Demanding+User&am=5000';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('COLLECT_REQUEST');
    expect(intent.headline).toContain('COLLECT REQUEST');
    expect(intent.headline).toContain('withdraw ₹5000');
    expect(intent.plainEnglishAction).toContain('PULL / DEBIT REQUEST');
    expect(intent.financialImpact).toContain('will be DEDUCTED');
  });

  it('4. Identifies AutoPay mandate recurring subscription deductions', () => {
    const payload = 'upi://mandate?pa=ott.subscription@yesbank&pn=StreamPlus&am=999';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('AUTOPAY_MANDATE');
    expect(intent.headline).toContain('AUTOPAY MANDATE');
    expect(intent.plainEnglishAction).toContain('RECURRING AUTOPAY SUBSCRIPTION');
    expect(intent.financialImpact).toContain('Automatic recurring bank debits');
  });

  it('5. Identifies external browser links / phishing URLs', () => {
    const payload = 'https://fake-sbi-portal.com/claim-reward';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('EXTERNAL_LINK');
    expect(intent.headline).toContain('External Web Link');
    expect(intent.plainEnglishAction).toContain('NOT a direct UPI payment');
    expect(intent.financialImpact).toContain('No direct payment is initiated');
  });

  it('6. Identifies open-amount P2P transfers where user manually enters amount', () => {
    const payload = 'upi://pay?pa=friend@upi&pn=Amit';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('PAYMENT');
    expect(intent.amountText).toContain('Open Amount');
    expect(intent.headline).toContain('sending money to Amit');
    expect(intent.plainEnglishAction).toContain('prompt you to enter how much you want to pay');
  });

  it('7. Handles utility non-payment QR codes (Wi-Fi, mailto)', () => {
    const payload = 'WIFI:S:OfficeGuest;T:WPA;P:SuperSecret;;';
    const result = verifyQrPayload(payload, { isOffline: true });
    const intent = describeQrIntent(result);

    expect(intent.actionType).toBe('NON_PAYMENT');
    expect(intent.headline).toContain('Non-Payment Code');
    expect(intent.plainEnglishAction).toContain('does NOT initiate a financial payment');
    expect(intent.financialImpact).toContain('No money will leave your bank account');
  });
});
