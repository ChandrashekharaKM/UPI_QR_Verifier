export interface SampleRow {
  readonly payload: string;
  readonly label: 0 | 1; // 0 = Legitimate / Safe, 1 = Fraud / Scam / Malicious
  readonly source: 'synthetic' | 'real_phish' | 'real_manual';
  readonly patternType?: string;
  readonly note?: string;
}

export interface DatasetSplit {
  readonly train: readonly SampleRow[];
  readonly validation: readonly SampleRow[];
  readonly test: readonly SampleRow[];
}
