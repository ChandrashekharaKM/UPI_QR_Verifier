/**
 * Pure TypeScript string distance algorithms for fuzzy matching payee names with VPA identifiers.
 */

/**
 * Standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix to minimize memory
  let prevRow = new Array<number>(n + 1);
  let currRow = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const aChar = a.charAt(i - 1);

    for (let j = 1; j <= n; j++) {
      const bChar = b.charAt(j - 1);
      const cost = aChar === bChar ? 0 : 1;
      const val1 = (prevRow[j] ?? 0) + 1;
      const val2 = (currRow[j - 1] ?? 0) + 1;
      const val3 = (prevRow[j - 1] ?? 0) + cost;
      currRow[j] = Math.min(val1, val2, val3);
    }

    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[n] ?? 0;
}

/**
 * Normalized Levenshtein similarity: 1.0 = identical, 0.0 = completely different.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Jaro distance between two strings (0.0 to 1.0).
 */
export function jaroDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1.charAt(i) !== s2.charAt(j)) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k] && k < len2) {
      k++;
    }
    if (k < len2 && s1.charAt(i) !== s2.charAt(k)) {
      transpositions++;
    }
    k++;
  }

  const m = matches;
  const t = transpositions / 2;
  return (m / len1 + m / len2 + (m - t) / m) / 3.0;
}

/**
 * Jaro-Winkler similarity: boosts scores for common prefix up to 4 characters.
 */
export function jaroWinklerSimilarity(s1: string, s2: string, prefixScale = 0.1): number {
  const jaro = jaroDistance(s1, s2);
  if (jaro < 0.7) {
    return jaro;
  }

  // Common prefix up to 4 characters
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1.charAt(i) === s2.charAt(i)) {
      prefix++;
    } else {
      break;
    }
  }

  return Math.min(1.0, jaro + prefix * prefixScale * (1.0 - jaro));
}
