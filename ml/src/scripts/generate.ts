import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticDataset } from '../data/synthetic-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.join(dataDir, 'synthetic_dataset.json');
console.log('[Dataset Generator] Generating 1,000 synthetic UPI QR payloads...');

const dataset = generateSyntheticDataset(1000, 42);
fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8');

const legitCount = dataset.filter((d) => d.label === 0).length;
const scamCount = dataset.filter((d) => d.label === 1).length;

console.log(`[Dataset Generator] Successfully generated ${dataset.length} samples:`);
console.log(`  - Legitimate: ${legitCount}`);
console.log(`  - Fraud / Scam: ${scamCount}`);
console.log(`  - Saved to: ${outputPath}`);
