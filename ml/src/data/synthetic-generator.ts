import type { SampleRow } from './dataset-types.js';

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
  { name: 'Kalyan Supermarket', mcc: '5411', category: 'grocery' },
  { name: 'Apollo Pharmacy Retail', mcc: '5912', category: 'pharmacy' },
  { name: 'Chai Point Cafe', mcc: '5814', category: 'cafe' },
  { name: 'Reliance Digital Express', mcc: '5732', category: 'electronics' },
  { name: 'Fabindia Apparel Store', mcc: '5651', category: 'clothing' },
  { name: 'Sri Krishna Sweets', mcc: '5441', category: 'bakery' },
  { name: 'Indian Oil Fuel Station', mcc: '5541', category: 'fuel' },
  { name: 'Modern Stationery Works', mcc: '5943', category: 'stationery' },
  { name: 'Fresh Basket Organics', mcc: '5411', category: 'grocery' },
  { name: 'Crossword Bookstores', mcc: '5942', category: 'books' }
];

const LEGIT_PSPS = ['oksbi', 'okhdfcbank', 'okicici', 'okaxis', 'ybl', 'paytm', 'ibl', 'apl', 'upi'];

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

/**
 * Generates synthetic legitimate and fraudulent payment QR codes.
 * Every generated row is explicitly marked with source: "synthetic".
 */
export function generateSyntheticDataset(count = 1000, seed = 42): SampleRow[] {
  const rng = new SimpleRng(seed);
  const rows: SampleRow[] = [];
  const halfCount = Math.floor(count / 2);

  // ----------------------------------------------------
  // 1. Legitimate Samples (label: 0)
  // ----------------------------------------------------
  for (let i = 0; i < halfCount; i++) {
    const isMerchant = rng.next() > 0.4;
    let payload = '';
    let patternType = '';

    if (isMerchant) {
      const merchant = rng.choice(LEGIT_MERCHANTS);
      const psp = rng.choice(LEGIT_PSPS);
      const handleName = merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hasAmount = rng.next() > 0.3;
      const amount = hasAmount ? (rng.intRange(30, 2500) + rng.intRange(0, 99) / 100).toFixed(2) : undefined;
      const encodedName = encodeURIComponent(merchant.name);

      payload = `upi://pay?pa=${handleName}@${psp}&pn=${encodedName}&mc=${merchant.mcc}&cu=INR`;
      if (amount) payload += `&am=${amount}`;
      if (rng.next() > 0.5) payload += `&tn=Payment%20at%20counter`;
      patternType = 'legit_merchant';
    } else {
      // P2P transfer
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
      patternType = 'legit_p2p';
    }

    rows.push({
      payload,
      label: 0,
      source: 'synthetic',
      patternType,
      note: 'Legitimate simulated UPI transaction QR'
    });
  }

  // ----------------------------------------------------
  // 2. Fraudulent / Scam Samples (label: 1)
  // ----------------------------------------------------
  const scamGenerators = [
    // Pattern A: Brand / Bank / Helpline impersonation
    () => {
      const brand = rng.choice(['sbi', 'paytm', 'hdfc', 'icici', 'axis', 'npci']);
      const role = rng.choice(['refund', 'support', 'customercare', 'kycupdate', 'helpdesk']);
      const psp = rng.choice(LEGIT_PSPS);
      const handle = `${brand}.${role}@${psp}`;
      const amount = rng.choice(['2000.00', '5000.00', '10000.00']);
      return {
        payload: `upi://pay?pa=${handle}&pn=${encodeURIComponent(brand.toUpperCase() + ' ' + role.toUpperCase())}&am=${amount}&tn=Refund%20Approval%20Fee`,
        patternType: 'impersonation_refund'
      };
    },

    // Pattern B: Receive-money scam note ("scan to receive")
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
        patternType: 'receive_money_lure'
      };
    },

    // Pattern C: Non-UPI phishing URL disguised as QR
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
        patternType: 'url_phishing'
      };
    },

    // Pattern D: Identity mismatch (claims govt/power utility, personal VPA)
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
        patternType: 'name_vpa_mismatch'
      };
    },

    // Pattern E: Parameter pollution / duplicate parameters
    () => {
      const innocent = `innocentstore@oksbi`;
      const attacker = `hacker${rng.intRange(10, 99)}@ybl`;
      return {
        payload: `upi://pay?pa=${innocent}&pa=${attacker}&pn=Local%20Store&am=4500.00`,
        patternType: 'duplicate_parameter_tampering'
      };
    },

    // Pattern F: Disposable high-entropy burner account
    () => {
      const randomLocal = Array.from({ length: 12 }, () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng.next() * 36)]
      ).join('');
      const psp = rng.choice(['unknownpsp', 'shadywallet', 'oksbi']);
      return {
        payload: `upi://pay?pa=${randomLocal}@${psp}&pn=Quick%20Cash&am=9999.00&tn=Lottery%20Prize%20Claim`,
        patternType: 'high_entropy_lure'
      };
    },

    // Pattern G: Commercial business claim without MCC
    () => {
      const fakeCompany = rng.choice([
        'Universal Electronics Pvt Ltd',
        'Apex Smartphone Distributors',
        'Gold Traders Enterprises'
      ]);
      const vpa = `retailshop${rng.intRange(100, 999)}@oksbi`;
      return {
        payload: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(fakeCompany)}&am=28500.00`,
        patternType: 'unverified_business_high_amount'
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
