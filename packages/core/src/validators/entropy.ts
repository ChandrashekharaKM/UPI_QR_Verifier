/**
 * Calculates Shannon entropy of a string.
 * H(X) = - sum(P(x) * log2(P(x)))
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const frequencies = new Map<string, number>();
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Returns character composition statistics for an identifier string.
 */
export interface CharComposition {
  readonly length: number;
  readonly digitCount: number;
  readonly digitRatio: number;
  readonly alphaCount: number;
  readonly alphaRatio: number;
  readonly vowelCount: number;
  readonly consonantCount: number;
  readonly vowelToAlphaRatio: number;
  readonly entropy: number;
}

export function analyzeStringComposition(str: string): CharComposition {
  const length = str.length;
  if (length === 0) {
    return {
      length: 0,
      digitCount: 0,
      digitRatio: 0,
      alphaCount: 0,
      alphaRatio: 0,
      vowelCount: 0,
      consonantCount: 0,
      vowelToAlphaRatio: 0,
      entropy: 0
    };
  }

  let digitCount = 0;
  let alphaCount = 0;
  let vowelCount = 0;
  let consonantCount = 0;

  const vowels = new Set(['a', 'e', 'i', 'o', 'u']);

  for (let i = 0; i < length; i++) {
    const char = str.charAt(i).toLowerCase();
    if (char >= '0' && char <= '9') {
      digitCount++;
    } else if (char >= 'a' && char <= 'z') {
      alphaCount++;
      if (vowels.has(char)) {
        vowelCount++;
      } else {
        consonantCount++;
      }
    }
  }

  return {
    length,
    digitCount,
    digitRatio: digitCount / length,
    alphaCount,
    alphaRatio: alphaCount / length,
    vowelCount,
    consonantCount,
    vowelToAlphaRatio: alphaCount > 0 ? vowelCount / alphaCount : 0,
    entropy: calculateShannonEntropy(str)
  };
}
