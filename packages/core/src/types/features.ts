export interface FeatureDefinition {
  readonly index: number;
  readonly name: string;
  readonly description: string;
  readonly range: [number, number]; // [min, max]
}

export interface FeatureVector {
  readonly version: string;
  readonly names: readonly string[];
  readonly values: readonly number[];
}
