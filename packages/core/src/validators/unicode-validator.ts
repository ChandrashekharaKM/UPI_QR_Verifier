/**
 * Unicode homoglyph mapping table: maps confusable Cyrillic, Greek, fullwidth,
 * and mathematical alphanumeric characters to their visual Latin ASCII counterparts.
 */
const HOMOGLYPH_TABLE: Record<string, string> = {
  // Cyrillic lowercase lookalikes
  '\u0430': 'a', // Cyrillic small letter a
  '\u0431': 'b', // Cyrillic small letter be
  '\u0432': 'v', // Cyrillic small letter ve
  '\u0435': 'e', // Cyrillic small letter ie
  '\u0455': 's', // Cyrillic small letter dze (looks like 's')
  '\u0456': 'i', // Cyrillic small letter byelorussian-ukrainian i
  '\u0458': 'j', // Cyrillic small letter je
  '\u043A': 'k', // Cyrillic small letter ka
  '\u043C': 'm', // Cyrillic small letter em
  '\u043D': 'h', // Cyrillic small letter en
  '\u043E': 'o', // Cyrillic small letter o
  '\u0440': 'p', // Cyrillic small letter er
  '\u0441': 'c', // Cyrillic small letter es
  '\u0442': 't', // Cyrillic small letter te
  '\u0443': 'y', // Cyrillic small letter u
  '\u0445': 'x', // Cyrillic small letter ha

  // Cyrillic uppercase lookalikes
  '\u0410': 'A', // Cyrillic capital letter A
  '\u0412': 'B', // Cyrillic capital letter Ve
  '\u0415': 'E', // Cyrillic capital letter Ie
  '\u041A': 'K', // Cyrillic capital letter Ka
  '\u041C': 'M', // Cyrillic capital letter Em
  '\u041D': 'H', // Cyrillic capital letter En
  '\u041E': 'O', // Cyrillic capital letter O
  '\u0420': 'P', // Cyrillic capital letter Er
  '\u0421': 'C', // Cyrillic capital letter Es
  '\u0422': 'T', // Cyrillic capital letter Te
  '\u0423': 'Y', // Cyrillic capital letter U
  '\u0425': 'X', // Cyrillic capital letter Ha
  '\u0406': 'I', // Cyrillic capital letter Byelorussian-Ukrainian I
  '\u0408': 'J', // Cyrillic capital letter Je
  '\u0405': 'S', // Cyrillic capital letter Dze

  // Greek lowercase lookalikes
  '\u03B1': 'a', // Greek small letter alpha
  '\u03B2': 'b', // Greek small letter beta
  '\u03B5': 'e', // Greek small letter epsilon
  '\u03B9': 'i', // Greek small letter iota
  '\u03BA': 'k', // Greek small letter kappa
  '\u03BD': 'v', // Greek small letter nu (looks like 'v')
  '\u03BF': 'o', // Greek small letter omicron
  '\u03C1': 'p', // Greek small letter rho
  '\u03C4': 't', // Greek small letter tau
  '\u03C5': 'u', // Greek small letter upsilon
  '\u03C7': 'x', // Greek small letter chi

  // Greek uppercase lookalikes
  '\u0391': 'A', // Greek capital letter Alpha
  '\u0392': 'B', // Greek capital letter Beta
  '\u0395': 'E', // Greek capital letter Epsilon
  '\u0397': 'H', // Greek capital letter Eta
  '\u0399': 'I', // Greek capital letter Iota
  '\u039A': 'K', // Greek capital letter Kappa
  '\u039C': 'M', // Greek capital letter Mu
  '\u039D': 'N', // Greek capital letter Nu
  '\u039F': 'O', // Greek capital letter Omicron
  '\u03A1': 'P', // Greek capital letter Rho
  '\u03A4': 'T', // Greek capital letter Tau
  '\u03A7': 'X', // Greek capital letter Chi
  '\u0396': 'Z', // Greek capital letter Zeta

  // Fullwidth symbols & delimiters
  '\uFF20': '@', // Fullwidth @
  '\uFF0E': '.', // Fullwidth .
  '\uFF0D': '-', // Fullwidth -
  '\uFF3F': '_', // Fullwidth _
  '\uFF0F': '/', // Fullwidth /
  '\uFF1A': ':'  // Fullwidth :
};

// Populate fullwidth letters & digits:
// U+FF10 - U+FF19 -> '0' - '9'
for (let i = 0; i < 10; i++) {
  HOMOGLYPH_TABLE[String.fromCharCode(0xff10 + i)] = String(i);
}
// U+FF21 - U+FF3A -> 'A' - 'Z'
for (let i = 0; i < 26; i++) {
  HOMOGLYPH_TABLE[String.fromCharCode(0xff21 + i)] = String.fromCharCode(65 + i);
}
// U+FF41 - U+FF5A -> 'a' - 'z'
for (let i = 0; i < 26; i++) {
  HOMOGLYPH_TABLE[String.fromCharCode(0xff41 + i)] = String.fromCharCode(97 + i);
}

/**
 * Zero-width, invisible formatting, bidirectional overrides, and control characters regex.
 */
export const ZERO_WIDTH_AND_INVISIBLE_REGEX =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00A0\u00AD\u180E\u2000-\u200A\u2028\u2029\u205F\u3000\u0000-\u001F\u007F]/;

export const ZERO_WIDTH_GLOBAL_REGEX =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00A0\u00AD\u180E\u2000-\u200A\u2028\u2029\u205F\u3000\u0000-\u001F\u007F]/g;

export interface HomoglyphMatch {
  readonly char: string;
  readonly codePoint: string;
  readonly replacement: string;
}

export interface UnicodeInspectionResult {
  readonly hasHiddenUnicode: boolean;
  readonly hasZeroWidth: boolean;
  readonly hasHomoglyphs: boolean;
  readonly zeroWidthFound: readonly string[];
  readonly homoglyphsFound: readonly HomoglyphMatch[];
  readonly sanitized: string;
  readonly normalizedAscii: string;
}

/**
 * Formats a character's Unicode hex code point (e.g. U+200B, U+0430).
 */
export function formatCodePoint(char: string): string {
  const code = char.codePointAt(0);
  if (code === undefined) return 'U+0000';
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Inspects any text for zero-width characters, bidirectional overrides, and Unicode homoglyphs.
 */
export function inspectUnicodeSafety(text: string): UnicodeInspectionResult {
  if (!text) {
    return {
      hasHiddenUnicode: false,
      hasZeroWidth: false,
      hasHomoglyphs: false,
      zeroWidthFound: [],
      homoglyphsFound: [],
      sanitized: '',
      normalizedAscii: ''
    };
  }

  const zeroWidthSet = new Set<string>();
  const homoglyphsFound: HomoglyphMatch[] = [];

  // 1. Check for zero-width / invisible control characters
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (ZERO_WIDTH_AND_INVISIBLE_REGEX.test(char)) {
      zeroWidthSet.add(formatCodePoint(char));
    }
  }

  // 2. Strip zero-width characters to obtain sanitized version
  const sanitized = text.replace(ZERO_WIDTH_GLOBAL_REGEX, '');

  // 3. Scan for homoglyphs and build normalized ASCII
  let normalizedAscii = '';
  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i]!;
    const replacement = HOMOGLYPH_TABLE[char];
    if (replacement !== undefined) {
      homoglyphsFound.push({
        char,
        codePoint: formatCodePoint(char),
        replacement
      });
      normalizedAscii += replacement;
    } else {
      normalizedAscii += char;
    }
  }

  const hasZeroWidth = zeroWidthSet.size > 0;
  const hasHomoglyphs = homoglyphsFound.length > 0;

  return {
    hasHiddenUnicode: hasZeroWidth || hasHomoglyphs,
    hasZeroWidth,
    hasHomoglyphs,
    zeroWidthFound: Array.from(zeroWidthSet),
    homoglyphsFound,
    sanitized,
    normalizedAscii
  };
}

/**
 * Normalises text by replacing Unicode homoglyphs with standard ASCII and stripping zero-width chars.
 */
export function canonicalizeUnicodeText(text: string): string {
  return inspectUnicodeSafety(text).normalizedAscii;
}
