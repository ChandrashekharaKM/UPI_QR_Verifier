import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FixtureDefinition {
  readonly filename: string;
  readonly expectedCategory: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK';
  readonly payload: string;
  readonly description: string;
}

export const FIXTURES: readonly FixtureDefinition[] = [
  {
    filename: 'safe_grocery_store.png',
    expectedCategory: 'SAFE',
    payload: 'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Mart%20Supermarket&am=250.00&cu=INR&mc=5411&tn=Groceries',
    description: 'Legitimate registered merchant with valid MCC, authentic bank handle, and typical retail amount'
  },
  {
    filename: 'safe_p2p_phone.png',
    expectedCategory: 'SAFE',
    payload: 'upi://pay?pa=9876543210@paytm&pn=Aarav%20Sharma&am=100.00&cu=INR',
    description: 'Legitimate personal peer-to-peer transfer to 10-digit mobile number'
  },
  {
    filename: 'suspicious_round_bait_amount.png',
    expectedCategory: 'SUSPICIOUS',
    payload: 'upi://pay?pa=discount.deal@oksbi&pn=Discount%20Store&am=19999.00&cu=INR',
    description: 'Promotional lure pricing pattern with pre-filled 19999 round bait amount'
  },
  {
    filename: 'suspicious_missing_mc_store.png',
    expectedCategory: 'SUSPICIOUS',
    payload: 'upi://pay?pa=store201@oksbi&pn=Sharma%20Electronics%20Store%20Pvt%20Ltd&am=18500.00&cu=INR',
    description: 'Entity claiming formal Pvt Ltd commercial business without 4-digit Merchant Category Code'
  },
  {
    filename: 'malicious_sbi_refund_scam.png',
    expectedCategory: 'HIGH_RISK',
    payload: 'upi://pay?pa=sbi.refund.helpline@ybl&pn=SBI%20Customer%20Helpline&am=4999.00&cu=INR&tn=Refund%20Approval%20Fee',
    description: 'Classic impersonation of bank customer care asking for QR scan to receive refund'
  },
  {
    filename: 'malicious_phishing_ip.png',
    expectedCategory: 'HIGH_RISK',
    payload: 'http://185.220.101.5/sbi/auth/index.php',
    description: 'Direct IP address unencrypted HTTP phishing credential harvester'
  },
  {
    filename: 'malicious_tampered_param_pollution.png',
    expectedCategory: 'HIGH_RISK',
    payload: 'upi://pay?pa=innocent@oksbi&pa=attacker@ybl&am=50000.00&cu=INR&tn=Refund%20Verification',
    description: 'Parameter pollution attack combined with high amount and refund lure'
  }
];

async function generateAllFixtures() {
  const outputDir = __dirname;
  console.log(`[Fixtures Generator] Output directory: ${outputDir}`);

  const manifest: Record<string, FixtureDefinition> = {};

  for (const fix of FIXTURES) {
    const filePath = path.join(outputDir, fix.filename);
    await QRCode.toFile(filePath, fix.payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    manifest[fix.filename] = fix;
    console.log(`  ✓ Generated QR: ${fix.filename} [Expected: ${fix.expectedCategory}]`);
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Fixtures Generator] Manifest written to: ${manifestPath}`);
}

void generateAllFixtures();
