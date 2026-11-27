import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { VerificationResult } from '@upi-verifier/core';
import {
  detectAvailablePaymentApps,
  launchPaymentApp,
  buildUpiPaymentUri,
  type PaymentApp
} from '../lib/payment-apps';
import { COLORS } from '../lib/theme';

export interface PaymentAppPromptProps {
  rawPayload: string;
  verification: VerificationResult;
  onPaymentInitiated?: (appName: string) => void;
}

export function PaymentAppPrompt({
  rawPayload,
  verification,
  onPaymentInitiated
}: PaymentAppPromptProps) {
  const [apps, setApps] = useState<PaymentApp[]>([]);
  const [isScanningApps, setIsScanningApps] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const upiFields =
    (verification.parsed?.kind === 'upi' || verification.parsed?.kind === 'emv') &&
    (verification.parsed.fields?.kind === 'upi' || verification.parsed.fields?.kind === 'emv')
      ? verification.parsed.fields.upi
      : undefined;

  const payeeName = upiFields?.pn || upiFields?.pa || 'Merchant';
  const payeeVpa = upiFields?.pa || 'Verified VPA';
  const amount = upiFields?.am ? `₹${upiFields.am}` : 'Open / Unset Amount';
  const standardUpiUri = buildUpiPaymentUri(rawPayload, verification);

  useEffect(() => {
    let isMounted = true;
    async function scan() {
      setIsScanningApps(true);
      try {
        const detected = await detectAvailablePaymentApps(standardUpiUri);
        if (isMounted) {
          setApps(detected);
        }
      } catch {
        if (isMounted) {
          setApps([]);
        }
      } finally {
        if (isMounted) {
          setIsScanningApps(false);
        }
      }
    }

    void scan();
    return () => {
      isMounted = false;
    };
  }, [standardUpiUri]);

  const handlePay = async (app: PaymentApp) => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setStatusMessage(`Opening ${app.name}... Check recipient name before PIN.`);
    onPaymentInitiated?.(app.name);

    const res = await launchPaymentApp(app.launchUri, standardUpiUri, app.name);
    setStatusMessage(res.message);

    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Split into installed vs available apps
  const installedApps = apps.filter((a) => a.isAvailable);
  const otherApps = apps.filter((a) => !a.isAvailable);

  return (
    <View style={styles.container}>
      {/* Safe Verification Badge */}
      <View style={styles.safeHeader}>
        <View style={styles.safeBadge}>
          <Text style={styles.safeCheckIcon}>✅</Text>
          <Text style={styles.safeBadgeText}>FORMAT VERIFIED SAFE · 0 ANOMALIES</Text>
        </View>
        <Text style={styles.headline}>Proceed to Pay</Text>
        <Text style={styles.subheadline}>
          Select your installed payment app to authorize transaction
        </Text>
      </View>

      {/* Transaction Details Pill */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payee:</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {payeeName}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>UPI ID:</Text>
          <Text style={styles.detailValueVpa} numberOfLines={1}>
            {payeeVpa}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount:</Text>
          <Text style={styles.detailValueAmount}>{amount}</Text>
        </View>
      </View>

      {/* Status or Launch Message */}
      {statusMessage ? (
        <View style={styles.statusToast}>
          <Text style={styles.statusToastText}>{statusMessage}</Text>
        </View>
      ) : null}

      {/* App Buttons Section */}
      <View style={styles.appSection}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>
            {isScanningApps ? 'Scanning Available Apps...' : 'Installed Payment Apps'}
          </Text>
          {isScanningApps ? (
            <ActivityIndicator size="small" color="#38BDF8" />
          ) : installedApps.length > 0 ? (
            <View style={styles.installedBadge}>
              <Text style={styles.installedBadgeText}>{installedApps.length} Detected</Text>
            </View>
          ) : null}
        </View>

        {/* Grid of payment apps */}
        <View style={styles.appsGrid}>
          {apps.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={[
                styles.appButton,
                app.isAvailable && styles.appButtonDetected,
                { borderColor: app.isAvailable ? app.color : '#334155' }
              ]}
              activeOpacity={0.8}
              onPress={() => handlePay(app)}
              accessibilityLabel={`Pay with ${app.name}`}
              accessibilityRole="button"
            >
              <View style={[styles.appIconCircle, { backgroundColor: `${app.color}25` }]}>
                <Text style={styles.appIcon}>{app.icon}</Text>
              </View>
              <View style={styles.appTextGroup}>
                <Text style={styles.appName}>{app.name}</Text>
                <Text
                  style={[
                    styles.appStatusTag,
                    app.isAvailable ? styles.appStatusInstalled : styles.appStatusOpen
                  ]}
                >
                  {app.isAvailable ? '● Installed' : 'Tap to Launch'}
                </Text>
              </View>
              <Text style={styles.payArrow}>➔</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pre-Payment PIN Golden Rule Callout */}
      <View style={styles.safetyFootnote}>
        <Text style={styles.safetyFootnoteIcon}>💡</Text>
        <Text style={styles.safetyFootnoteText}>
          <Text style={styles.safetyFootnoteBold}>Golden Rule: </Text>
          When your app opens, confirm the bank-verified recipient name on your screen before typing your secret UPI PIN.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 16,
    marginVertical: 12,
    gap: 14,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6
  },
  safeHeader: {
    alignItems: 'center',
    gap: 4
  },
  safeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6
  },
  safeCheckIcon: {
    fontSize: 13
  },
  safeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5
  },
  headline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 6
  },
  subheadline: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center'
  },
  detailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    maxWidth: '70%'
  },
  detailValueVpa: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    maxWidth: '70%'
  },
  detailValueAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981'
  },
  statusToast: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center'
  },
  statusToastText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    textAlign: 'center'
  },
  appSection: {
    gap: 10
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.3
  },
  installedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10
  },
  installedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981'
  },
  appsGrid: {
    gap: 8
  },
  appButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12
  },
  appButtonDetected: {
    backgroundColor: '#1A2744'
  },
  appIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appIcon: {
    fontSize: 18
  },
  appTextGroup: {
    flex: 1
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  appStatusTag: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1
  },
  appStatusInstalled: {
    color: '#10B981'
  },
  appStatusOpen: {
    color: '#64748B'
  },
  payArrow: {
    fontSize: 16,
    color: '#38BDF8',
    fontWeight: '700'
  },
  safetyFootnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    padding: 10,
    gap: 8
  },
  safetyFootnoteIcon: {
    fontSize: 16
  },
  safetyFootnoteText: {
    fontSize: 11,
    color: '#E2E8F0',
    lineHeight: 16,
    flex: 1
  },
  safetyFootnoteBold: {
    fontWeight: '800',
    color: '#F59E0B'
  }
});
