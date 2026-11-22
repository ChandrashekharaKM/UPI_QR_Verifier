export type PayloadKind = 'upi' | 'emv' | 'url' | 'other';

export interface UpiFields {
  readonly source?: 'upi' | 'emv';
  readonly originalScheme?: string;      // e.g. 'upi://pay', 'upi://collect', 'phonepe://pay', 'tez://upi/pay', etc.
  readonly action?: 'pay' | 'collect' | 'mandate' | string;
  readonly pa: string;                   // Payee VPA / UPI ID (e.g. merchant@okhdfcbank)
  readonly pn?: string;                  // Payee Name
  readonly am?: string;                  // Amount string (e.g. 500.00)
  readonly cu?: string;                  // Currency (e.g. INR)
  readonly mc?: string;                  // Merchant Category Code (4 digits)
  readonly tr?: string;                  // Transaction Reference ID
  readonly tn?: string;                  // Transaction Note / Remarks
  readonly url?: string;                 // Reference URL
  readonly mode?: string;                // Initiation mode (e.g. 01)
  readonly sign?: string;                // Base64 digital signature
  readonly orgid?: string;               // Originating Organization ID
  readonly mid?: string;                 // Merchant ID
  readonly msid?: string;                // Terminal / Store ID
  readonly mtid?: string;                // Terminal / Device ID
  readonly tid?: string;                 // Terminal ID / Transaction ID
  readonly purpose?: string;             // Purpose Code (e.g. 00, 11)
  readonly ver?: string;                 // UPI version specification
  readonly extraParams: Readonly<Record<string, string>>; // Unknown / non-standard params
  readonly duplicateKeys: readonly string[];              // Any keys that appeared multiple times
}

export interface EmvFields {
  readonly rawPayload: string;
  readonly tlvMap: Readonly<Record<string, string>>;
  readonly isValidCrc: boolean;
  readonly declaredCrc?: string;
  readonly calculatedCrc?: string;
  readonly upi: UpiFields;
  readonly merchantName?: string;
  readonly merchantCity?: string;
  readonly postalCode?: string;
  readonly mcc?: string;
  readonly currency?: string;
  readonly amount?: string;
  readonly tipIndicator?: string;
  readonly tipValueFixed?: string;
  readonly tipValuePercentage?: string;
  readonly pointOfInitiation?: 'static' | 'dynamic';
}

export interface UrlFields {
  readonly rawUrl: string;
  readonly protocol: string;             // 'http:', 'https:', etc.
  readonly hostname: string;             // Domain or IP
  readonly port?: string;
  readonly pathname: string;
  readonly searchParams: Readonly<Record<string, string>>;
  readonly isIpAddress: boolean;
  readonly isShortened: boolean;
  readonly isPunycode: boolean;
  readonly topLevelDomain: string;
  readonly hasLoginCredentials: boolean;
}

export interface OtherFields {
  readonly raw: string;
  readonly detectedScheme?: string;      // 'wifi:', 'mailto:', 'tel:', 'intent:', etc.
}

export type ParsedFields =
  | { readonly kind: 'upi'; readonly upi: UpiFields }
  | { readonly kind: 'emv'; readonly emv: EmvFields; readonly upi: UpiFields }
  | { readonly kind: 'url'; readonly url: UrlFields }
  | { readonly kind: 'other'; readonly other: OtherFields };

export interface ParsedPayload {
  readonly kind: PayloadKind;
  readonly rawPayload: string;
  readonly fields: ParsedFields;
  readonly parseWarnings: readonly string[];
  readonly hasDuplicateParams: boolean;
  readonly payloadLength: number;
  readonly originalScheme?: string;      // e.g. 'upi://collect', 'phonepe://pay', 'tez://upi/pay', etc.
}
