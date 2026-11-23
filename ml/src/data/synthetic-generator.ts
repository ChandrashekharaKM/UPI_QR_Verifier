import type { SampleRow } from './dataset-types.js';
import { calculateCrc16CcittFalse } from '@upi-verifier/core';

// Legitimate dataset seeds
const LEGIT_NAMES = [
  'Aarav Sharma',
  'Priya Patel',
  'Rohan Mehta',
  'Ananya Iyer',
  'Vikram Singh',
  'Deepa Nair',
  'Amit Kumar',
  'Pooja Gupta',
  'Siddharth Joshi',
  'Sneha Rao',
  'Rajesh Varma',
  'Kavita Reddy'
];

const LEGIT_MERCHANTS = [
  { name: 'Kalyan Supermarket', mcc: '5411', category: 'grocery', city: 'Mumbai' },
  { name: 'Apollo Pharmacy Retail', mcc: '5912', category: 'pharmacy', city: 'Bengaluru' },
  { name: 'Chai Point Cafe', mcc: '5814', category: 'cafe', city: 'Delhi' },
  { name: 'Reliance Digital Express', mcc: '5732', category: 'electronics', city: 'Hyderabad' },
  { name: 'Fabindia Apparel Store', mcc: '5651', category: 'clothing', city: 'Jaipur' },
  { name: 'Sri Krishna Sweets', mcc: '5441', category: 'bakery', city: 'Chennai' },
  { name: 'Indian Oil Fuel Station', mcc: '5541', category: 'fuel', city: 'Pune' },
  { name: 'Modern Stationery Works', mcc: '5943', category: 'stationery', city: 'Kolkata' },
  { name: 'Fresh Basket Organics', mcc: '5411', category: 'grocery', city: 'Ahmedabad' },
  { name: 'Crossword Bookstores', mcc: '5942', category: 'books', city: 'Pune' },
  { name: 'Bata Footwear Store', mcc: '5661', category: 'footwear', city: 'Lucknow' },
  { name: 'MedPlus Chemist Stand', mcc: '5912', category: 'pharmacy', city: 'Visakhapatnam' }
];

const LEGIT_PSPS = [
  'oksbi',
  'okhdfcbank',
  'okicici',
  'okaxis',
  'ybl',
  'paytm',
  'ibl',
  'axl',
  'kotak',
  'idfcbank',
  'bharatpe',
  'barodampay',
  'canarabank',
  'pnb'
];

const DEEP_SCHEMES = ['phonepe', 'paytmmp', 'tez', 'bhim', 'intent'] as const;

// Simple seeded PRNG for reproducible synthetic generation
class SimpleRng {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  choice<T>(arr: readonly T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx] as T;
  }
  intRange(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min));
  }
}

function buildSyntheticEmv(
  vpa: string,
  merchantName: string,
  mcc: string,
  city: string,
  amount?: string,
  corruptCrc = false,
  currency = '356'
): string {
  const tag26Val = `0011in.org.npci01${vpa.length.toString().padStart(2, '0')}${vpa}`;
  let raw = `00020101021126${tag26Val.length.toString().padStart(2, '0')}${tag26Val}5204${mcc}5303${currency}`;
  if (amount) {
    raw += `54${amount.length.toString().padStart(2, '0')}${amount}`;
  }
  raw += `5802IN59${merchantName.length.toString().padStart(2, '0')}${merchantName}60${city.length.toString().padStart(2, '0')}${city}6304`;
  const validCrc = calculateCrc16CcittFalse(raw);
  const finalCrc = corruptCrc ? (validCrc === 'ABCD' ? '1234' : 'ABCD') : validCrc;
  return `${raw}${finalCrc}`;
}

/**
 * Generates synthetic legitimate and fraudulent payment QR codes across UPI URI, BharatQR EMV, and App deep-links.
 * Every generated row is explicitly marked with source: "synthetic".
 */
export function generateSyntheticDataset(count = 1200, seed = 42): SampleRow[] {
  const rng = new SimpleRng(seed);
  const rows: SampleRow[] = [];
  const halfCount = Math.floor(count / 2);

  // ----------------------------------------------------
  // 1. Legitimate Samples (label: 0)
  // ----------------------------------------------------
  for (let i = 0; i < halfCount; i++) {
    const roll = rng.next();
    let payload = '';
    let patternType = '';

    if (roll < 0.25) {
      // Authentic BharatQR standee
      const m = rng.choice(LEGIT_MERCHANTS);
      const psp = rng.choice(LEGIT_PSPS);
      const vpa = `${m.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@${psp}`;
      const am = rng.next() > 0.4 ? rng.intRange(30, 2500).toFixed(2) : undefined;
      payload = buildSyntheticEmv(vpa, m.name, m.mcc, m.city, am, false);
      patternType = 'synthetic_emv_standee';
    } else if (roll < 0.50) {
      // Authentic payment deep link or Android intent
      const m = rng.choice(LEGIT_MERCHANTS);
      const psp = rng.choice(LEGIT_PSPS);
      const handle = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const scheme = rng.choice(DEEP_SCHEMES);
      const am = (rng.intRange(50, 3500) + rng.intRange(0, 99) / 100).toFixed(2);
      if (scheme === 'intent') {
        payload = `intent://pay?pa=${handle}@${psp}&pn=${encodeURIComponent(m.name)}&mc=${m.mcc}&am=${am}&cu=INR#Intent;scheme=upi;package=in.org.npci.upiapp;end`;
      } else if (scheme === 'tez') {
        payload = `tez://upi/pay?pa=${handle}@${psp}&pn=${encodeURIComponent(m.name)}&mc=${m.mcc}&am=${am}&cu=INR`;
      } else {
        payload = `${scheme}://pay?pa=${handle}@${psp}&pn=${encodeURIComponent(m.name)}&mc=${m.mcc}&am=${am}&cu=INR`;
      }
      patternType = 'synthetic_deeplink';
    } else if (roll < 0.80) {
      // Authentic Merchant UPI URI
      const merchant = rng.choice(LEGIT_MERCHANTS);
      const psp = rng.choice(LEGIT_PSPS);
      const handleName = merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hasAmount = rng.next() > 0.3;
      const amount = hasAmount
        ? (rng.intRange(30, 2500) + rng.intRange(0, 99) / 100).toFixed(2)
        : undefined;
      const encodedName = encodeURIComponent(merchant.name);

      payload = `upi://pay?pa=${handleName}@${psp}&pn=${encodedName}&mc=${merchant.mcc}&cu=INR`;
      if (amount) payload += `&am=${amount}`;
      if (rng.next() > 0.5) payload += `&tn=Payment%20at%20counter`;
      patternType = 'synthetic_merchant_upi';
    } else {
      // Authentic P2P transfer
      const person = rng.choice(LEGIT_NAMES);
      const isPhone = rng.next() > 0.4;
      const psp = rng.choice(LEGIT_PSPS);
      const localPart = isPhone
        ? `9${rng.intRange(100000000, 999999999)}`
        : person.toLowerCase().replace(/\s+/g, '') + rng.intRange(10, 99);

      const encodedName = encodeURIComponent(person);
      const hasAmount = rng.next() > 0.6;
      const amount = hasAmount ? rng.intRange(50, 4000).toFixed(2) : undefined;

      payload = `upi://pay?pa=${localPart}@${psp}&pn=${encodedName}&cu=INR`;
      if (amount) payload += `&am=${amount}`;
      patternType = 'synthetic_p2p_upi';
    }

    rows.push({
      payload,
      label: 0,
      source: 'synthetic',
      patternType,
      note: 'Legitimate simulated UPI payment QR'
    });
  }

  // ----------------------------------------------------
  // 2. Fraudulent / Scam Samples (label: 1)
  // ----------------------------------------------------
  const scamGenerators = [
    // Pattern A: Corrupted CRC BharatQR standee (physical sticker overlay tampering)
    () => {
      const vpa = `tampered${rng.intRange(100, 999)}@ybl`;
      return {
        payload: buildSyntheticEmv(vpa, 'Counter Store Standee', '5411', 'Delhi', '500.00', true),
        patternType: 'synthetic_emv_bad_crc'
      };
    },

    // Pattern B: Malicious valid-CRC BharatQR standee (foreign currency injection or support spoof)
    () => {
      const vpa = `sbi.refund.helpline@oksbi`;
      return {
        payload: buildSyntheticEmv(
          vpa,
          'Instant Refund Support Desk',
          '5411',
          'Mumbai',
          '5000.00',
          false,
          '840'
        ),
        patternType: 'synthetic_emv_foreign_currency'
      };
    },

    // Pattern C: Malicious deep link collect request / mandate trap
    () => {
      const psp = rng.choice(LEGIT_PSPS);
      const scheme = rng.choice(['phonepe', 'intent', 'paytmmp']);
      if (scheme === 'intent') {
        return {
          payload: `intent://collect?pa=scammer${rng.intRange(100, 999)}@${psp}&pn=Refund%20Approval&am=4999.00&cu=INR#Intent;scheme=upi;end`,
          patternType: 'synthetic_deeplink_collect_lure'
        };
      }
      return {
        payload: `${scheme}://collect?pa=claimreward${rng.intRange(100, 999)}@${psp}&pn=Reward%20Claim&am=2500.00&cu=INR`,
        patternType: 'synthetic_deeplink_collect_lure'
      };
    },

    // Pattern D: Brand / Bank / Helpline impersonation
    () => {
      const brand = rng.choice(['sbi', 'paytm', 'hdfc', 'icici', 'axis', 'npci']);
      const role = rng.choice(['refund', 'support', 'customercare', 'kycupdate', 'helpdesk']);
      const psp = rng.choice(LEGIT_PSPS);
      const handle = `${brand}.${role}@${psp}`;
      const amount = rng.choice(['2000.00', '5000.00', '10000.00']);
      return {
        payload: `upi://pay?pa=${handle}&pn=${encodeURIComponent(brand.toUpperCase() + ' ' + role.toUpperCase())}&am=${amount}&tn=Refund%20Approval%20Fee`,
        patternType: 'synthetic_impersonation_refund'
      };
    },

    // Pattern E: Receive-money scam note ("scan to receive")
    () => {
      const psp = rng.choice(LEGIT_PSPS);
      const vpa = `claim${rng.intRange(1000, 9999)}@${psp}`;
      const amount = rng.choice(['1500.00', '3000.00', '500.00']);
      const note = rng.choice([
        'Scan%20QR%20to%20Receive%20Cashback',
        'Refund%20verification%20code',
        'Collect%20payment%20approval',
        'Scan%20to%20accept%20money'
      ]);
      return {
        payload: `upi://pay?pa=${vpa}&pn=Instant%20Cashback%20Reward&am=${amount}&tn=${note}`,
        patternType: 'synthetic_receive_money_lure'
      };
    },

    // Pattern F: Non-UPI phishing URL disguised as QR
    () => {
      const urlScams = [
        'http://192.168.1.105/sbi/verify-account.php',
        'http://45.33.22.11/paytm-kyc/update.html',
        'https://bit.ly/claim-googlepay-reward',
        'https://tinyurl.com/fast-refund-upi',
        'https://bank-kyc-update.xyz/login',
        'https://sbi-reward-points.buzz/claim',
        'https://xn--paytm-0qa.com/offers'
      ];
      return {
        payload: rng.choice(urlScams),
        patternType: 'synthetic_url_phishing'
      };
    },

    // Pattern G: Identity mismatch (claims govt/power utility, personal VPA)
    () => {
      const utilities = [
        'State Electricity Board Bill',
        'Traffic Police E Challan Department',
        'Income Tax Refund Cell',
        'Gas Agency Booking Portal'
      ];
      const psp = rng.choice(LEGIT_PSPS);
      const personalVpa = `rohit${rng.intRange(100, 999)}@${psp}`;
      const amount = rng.choice(['1250.00', '2500.00', '3750.00']);
      return {
        payload: `upi://pay?pa=${personalVpa}&pn=${encodeURIComponent(rng.choice(utilities))}&am=${amount}&tn=Utility%20payment`,
        patternType: 'synthetic_name_vpa_mismatch'
      };
    },

    // Pattern H: Parameter pollution / duplicate parameters
    () => {
      const innocent = `innocentstore@oksbi`;
      const attacker = `hacker${rng.intRange(10, 99)}@ybl`;
      return {
        payload: `upi://pay?pa=${innocent}&pa=${attacker}&pn=Local%20Store&am=4500.00`,
        patternType: 'synthetic_duplicate_parameter_tampering'
      };
    },

    // Pattern I: Disposable high-entropy burner account
    () => {
      const randomLocal = Array.from({ length: 12 }, () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng.next() * 36)]
      ).join('');
      const psp = rng.choice(['unknownpsp', 'shadywallet', 'oksbi']);
      return {
        payload: `upi://pay?pa=${randomLocal}@${psp}&pn=Quick%20Cash&am=9999.00&tn=Lottery%20Prize%20Claim`,
        patternType: 'synthetic_high_entropy_lure'
      };
    },

    // Pattern J: Commercial business claim without MCC
    () => {
      const fakeCompany = rng.choice([
        'Universal Electronics Pvt Ltd',
        'Apex Smartphone Distributors',
        'Gold Traders Enterprises'
      ]);
      const vpa = `retailshop${rng.intRange(100, 999)}@oksbi`;
      return {
        payload: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(fakeCompany)}&am=28500.00`,
        patternType: 'synthetic_unverified_business_high_amount'
      };
    },

    // Pattern K: Embedded phishing/malware download link in UPI QR
    () => {
      const psp = rng.choice(LEGIT_PSPS);
      const fakeUrl = rng.choice([
        'http://185.220.101.5/invoice.apk',
        'https://bit.ly/claim-cashback-now',
        'http://bank-verification.xyz/auth'
      ]);
      return {
        payload: `upi://pay?pa=billpay${rng.intRange(10, 99)}@${psp}&pn=Payment%20Invoice&url=${encodeURIComponent(fakeUrl)}`,
        patternType: 'synthetic_embedded_malicious_url'
      };
    }
  ];

  for (let i = 0; i < halfCount; i++) {
    const generator = rng.choice(scamGenerators);
    const scam = generator();
    rows.push({
      payload: scam.payload,
      label: 1,
      source: 'synthetic',
      patternType: scam.patternType,
      note: 'Simulated scam pattern'
    });
  }

  return rows;
}
