import { Linking, Platform } from 'react-native';
import type { VerificationResult } from '@upi-verifier/core';

export interface PaymentApp {
  id: string;
  name: string;
  icon: string;
  scheme: string;
  color: string;
  badge: string;
  isAvailable: boolean;
  launchUri: string;
}

/**
 * Normalizes any QR payload (raw UPI string, deep link, or parsed BharatQR EMVCo)
 * into a standard, spec-compliant `upi://pay?...` URI ready for banking apps.
 */
export function buildUpiPaymentUri(rawPayload: string, result?: VerificationResult): string {
  if (!rawPayload) return '';

  // 1. If already native upi:// URI, return
  if (rawPayload.startsWith('upi://')) {
    return rawPayload;
  }

  // 2. If app deep link like phonepe://pay?..., paytmmp://pay?..., tez://upi/pay?...
  if (
    rawPayload.startsWith('phonepe://') ||
    rawPayload.startsWith('paytmmp://') ||
    rawPayload.startsWith('tez://') ||
    rawPayload.startsWith('gpay://') ||
    rawPayload.startsWith('bhim://') ||
    rawPayload.startsWith('cred://')
  ) {
    const queryIdx = rawPayload.indexOf('?');
    if (queryIdx !== -1) {
      return `upi://pay${rawPayload.slice(queryIdx)}`;
    }
  }

  // 3. If BharatQR EMVCo or parsed fields exist in verification result
  if (result && result.parsed && result.parsed.fields) {
    const fields = result.parsed.fields;
    if (fields.kind === 'upi' || fields.kind === 'emv') {
      const upi = fields.upi;
      if (upi && upi.pa) {
        const params: string[] = [];
        params.push(`pa=${encodeURIComponent(upi.pa)}`);
        if (upi.pn) params.push(`pn=${encodeURIComponent(upi.pn)}`);
        if (upi.am) params.push(`am=${encodeURIComponent(upi.am)}`);
        if (upi.cu) params.push(`cu=${encodeURIComponent(upi.cu)}`);
        if (upi.mc) params.push(`mc=${encodeURIComponent(upi.mc)}`);
        if (upi.tr) params.push(`tr=${encodeURIComponent(upi.tr)}`);
        if (upi.tn) params.push(`tn=${encodeURIComponent(upi.tn)}`);
        return `upi://pay?${params.join('&')}`;
      }
    }
  }

  return rawPayload;
}

/**
 * Scans the mobile device using Linking.canOpenURL to identify
 * which installed UPI payment apps are available.
 */
export async function detectAvailablePaymentApps(standardUpiUri: string): Promise<PaymentApp[]> {
  const queryIdx = standardUpiUri.indexOf('?');
  const query = queryIdx !== -1 ? standardUpiUri.slice(queryIdx + 1) : '';

  const APP_DEFINITIONS = [
    {
      id: 'gpay',
      name: 'Google Pay',
      icon: '🟢',
      scheme: 'tez://upi/pay',
      color: '#4285F4',
      badge: 'GPay'
    },
    {
      id: 'phonepe',
      name: 'PhonePe',
      icon: '🟣',
      scheme: 'phonepe://pay',
      color: '#5F259F',
      badge: 'PhonePe'
    },
    {
      id: 'paytm',
      name: 'Paytm',
      icon: '🔷',
      scheme: 'paytmmp://pay',
      color: '#00BAF2',
      badge: 'Paytm'
    },
    {
      id: 'bhim',
      name: 'BHIM UPI',
      icon: '🇮🇳',
      scheme: 'bhim://pay',
      color: '#00823B',
      badge: 'BHIM'
    },
    {
      id: 'cred',
      name: 'CRED Pay',
      icon: '💳',
      scheme: 'cred://upi/pay',
      color: '#1E293B',
      badge: 'CRED'
    },
    {
      id: 'universal',
      name: 'Any UPI App',
      icon: '⚡',
      scheme: 'upi://pay',
      color: '#2563EB',
      badge: 'All Apps'
    }
  ];

  const results: PaymentApp[] = [];

  for (const def of APP_DEFINITIONS) {
    const launchUri = query ? `${def.scheme}?${query}` : def.scheme;
    let isAvailable = false;

    try {
      if (Platform.OS !== 'web' && Linking.canOpenURL) {
        isAvailable = await Linking.canOpenURL(`${def.scheme}?pa=test@upi`);
      }
    } catch {
      isAvailable = false;
    }

    results.push({
      ...def,
      isAvailable,
      launchUri
    });
  }

  return results;
}

/**
 * Prompts and launches the selected payment app on the mobile device.
 */
export async function launchPaymentApp(
  launchUri: string,
  fallbackUri: string,
  appName: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.location.href = launchUri;
        return { success: true, message: `Redirecting to ${appName}...` };
      }
    }

    const canOpen = await Linking.canOpenURL(launchUri);
    if (canOpen) {
      await Linking.openURL(launchUri);
      return { success: true, message: `Opened ${appName}. Verify payee name before typing PIN.` };
    }

    // Try universal fallback (upi://pay?...)
    const canOpenFallback = await Linking.canOpenURL(fallbackUri);
    if (canOpenFallback) {
      await Linking.openURL(fallbackUri);
      return { success: true, message: `Opened UPI app chooser.` };
    }

    // Force open launchUri as last attempt (useful on Android when queries not registered)
    await Linking.openURL(launchUri);
    return { success: true, message: `Redirecting to ${appName}...` };
  } catch (err) {
    try {
      await Linking.openURL(fallbackUri);
      return { success: true, message: `Opened standard UPI app.` };
    } catch {
      return {
        success: false,
        message: `Could not launch ${appName}. Please ensure the app is installed or copy the UPI ID.`
      };
    }
  }
}
