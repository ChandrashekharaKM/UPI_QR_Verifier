import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { VerificationResult, QrIntentDescription } from '@upi-verifier/core';
import {
  detectAvailablePaymentApps,
  launchPaymentApp,
  buildUpiPaymentUri,
  type PaymentApp
} from '../lib/payment-apps';
import { COLORS } from '../lib/theme';

export interface LensScanPromptModalProps {
  visible: boolean;
  rawPayload: string;
  verification: VerificationResult;
  intent: QrIntentDescription;
  onDismiss: () => void;
  onViewDetails: () => void;
}

export function LensScanPromptModal({
  visible,
  rawPayload,
  verification,
  intent,
  onDismiss,
  onViewDetails
}: LensScanPromptModalProps) {
  const [apps, setApps] = useState<PaymentApp[]>([]);
  const [isScanningApps, setIsScanningApps] = useState(false);
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

  const isSafe = intent.riskLevel === 'SAFE';
  const isHighRisk = intent.riskLevel === 'HIGH_RISK';
  const standardUpiUri = buildUpiPaymentUri(rawPayload, verification);

  const accentColor = isHighRisk
    ? COLORS.highRisk
    : isSafe
      ? COLORS.safe
      : COLORS.suspicious;

  useEffect(() => {
    if (!visible || !isSafe) return;
    let isMounted = true;
    setIsScanningApps(true);

    void detectAvailablePaymentApps(standardUpiUri).then((detected) => {
      if (isMounted) {
        setApps(detected);
        setIsScanningApps(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [visible, isSafe, standardUpiUri]);

  const handleCopyVpa = async () => {
    if (!intent.payeeVpa || intent.payeeVpa === 'N/A') return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(intent.payeeVpa);
      } else {
        await Clipboard.setStringAsync(intent.payeeVpa);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    } catch (err) {
      console.warn('Failed to copy VPA:', err);
    }
  };

  const handleLaunchApp = async (app: PaymentApp) => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setLaunchMessage(`Launching ${app.name}...`);
    const res = await launchPaymentApp(app.launchUri, standardUpiUri, app.name);
    setLaunchMessage(res.message);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheetCard, { borderColor: accentColor }]}>
          {/* Top Grab Bar */}
          <View style={styles.dragPillContainer}>
            <View style={styles.dragPill} />
          </View>

          {/* Prompt Header */}
          <View style={[styles.headerRow, { backgroundColor: `${accentColor}15` }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerIcon}>
                {isHighRisk ? '🚨' : isSafe ? '✅' : '⚠️'}
              </Text>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerBadge, { color: accentColor }]}>
                  {intent.totalRisks === 0
                    ? 'VERIFIED SAFE · 0 RISKS'
                    : `${intent.totalRisks} RISK${intent.totalRisks > 1 ? 'S' : ''} DETECTED`}
                </Text>
                <Text style={styles.headerHeadline} numberOfLines={1}>
                  {intent.headline}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* If High Risk Deception (e.g. Refund Scam Trap) */}
            {intent.deceptionAlert && intent.deceptionAlert.isDeceptive ? (
              <View style={styles.deceptionCard}>
                <Text style={styles.deceptionIcon}>🛑</Text>
                <View style={styles.deceptionTextCol}>
                  <Text style={styles.deceptionTitle}>{intent.deceptionAlert.title}</Text>
                  <Text style={styles.deceptionBody}>{intent.deceptionAlert.warningMessage}</Text>
                </View>
              </View>
            ) : null}

            {/* Transaction Payee & Amount Card */}
            <View style={styles.transactionCard}>
              <View style={styles.transactionRow}>
                <View style={styles.transactionCol}>
                  <Text style={styles.transLabel}>Recipient / Shop</Text>
                  <Text style={styles.transValue} numberOfLines={1}>
                    {intent.payeeName}
                  </Text>
                </View>
                <View style={styles.transactionAmountCol}>
                  <Text style={styles.transLabel}>Amount</Text>
                  <Text
                    style={[
                      styles.transAmount,
                      { color: isSafe ? '#10B981' : isHighRisk ? '#EF4444' : '#F59E0B' }
                    ]}
                  >
                    {intent.amountText}
                  </Text>
                </View>
              </View>

              {/* UPI ID Row */}
              <View style={styles.vpaRow}>
                <Text style={styles.vpaLabel}>UPI ID:</Text>
                <Text style={styles.vpaValue} numberOfLines={1}>
                  {intent.payeeVpa}
                </Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyVpa}>
                  <Text style={styles.copyBtnText}>{copiedVpa ? '✓ Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Launch Status Notification */}
            {launchMessage ? (
              <View style={styles.launchToast}>
                <Text style={styles.launchToastText}>{launchMessage}</Text>
              </View>
            ) : null}

            {/* When Safe: Prompt to Pay with Installed Apps */}
            {isSafe ? (
              <View style={styles.paymentPromptSection}>
                <View style={styles.paymentSectionHeader}>
                  <Text style={styles.paymentSectionTitle}>
                    {isScanningApps ? 'Scanning available payment apps...' : 'Pay with Installed UPI App'}
                  </Text>
                  {isScanningApps ? (
                    <ActivityIndicator size="small" color="#38BDF8" />
                  ) : null}
                </View>

                {/* 1-Tap App Launcher Grid */}
                <View style={styles.appsGrid}>
                  {apps.map((app) => (
                    <TouchableOpacity
                      key={app.id}
                      style={[
                        styles.appLaunchCard,
                        app.isAvailable && styles.appLaunchCardActive,
                        { borderColor: app.isAvailable ? app.color : '#334155' }
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleLaunchApp(app)}
                      accessibilityLabel={`Pay with ${app.name}`}
                    >
                      <View style={[styles.appIconCircle, { backgroundColor: `${app.color}20` }]}>
                        <Text style={styles.appIconText}>{app.icon}</Text>
                      </View>
                      <View style={styles.appInfoCol}>
                        <Text style={styles.appTitle}>{app.name}</Text>
                        <Text
                          style={[
                            styles.appSub,
                            app.isAvailable ? styles.appSubActive : styles.appSubMuted
                          ]}
                        >
                          {app.isAvailable ? '● Installed & Ready' : 'Tap to Launch'}
                        </Text>
                      </View>
                      <Text style={styles.appArrow}>➔</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              /* When Risky: Prominent Abort / Don't Pay Button */
              <View style={styles.dangerActionSection}>
                <TouchableOpacity style={styles.abortPaymentBtn} onPress={onDismiss}>
                  <Text style={styles.abortPaymentBtnText}>🛑 Don't Pay / Abort Payment</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Safety Reminder */}
            <View style={styles.securityNote}>
              <Text style={styles.securityNoteIcon}>💡</Text>
              <Text style={styles.securityNoteText}>
                Always check the bank-registered name on your payment app screen before entering your secret UPI PIN.
              </Text>
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissBtnText}>Scan Another</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.viewAnalysisBtn} onPress={onViewDetails}>
              <Text style={styles.viewAnalysisBtnText}>🔍 Full Analysis</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end'
  },
  sheetCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderBottomWidth: 0,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20
  },
  dragPillContainer: {
    alignItems: 'center',
    paddingVertical: 8
  },
  dragPill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#334155'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  headerIcon: {
    fontSize: 26
  },
  headerTextCol: {
    flex: 1
  },
  headerBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  headerHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 1
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700'
  },
  scrollBody: {
    flexShrink: 1
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  deceptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  deceptionIcon: {
    fontSize: 22
  },
  deceptionTextCol: {
    flex: 1
  },
  deceptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444'
  },
  deceptionBody: {
    fontSize: 12,
    color: '#FCA5A5',
    lineHeight: 17,
    marginTop: 2
  },
  transactionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  transactionCol: {
    flex: 1,
    marginRight: 12
  },
  transactionAmountCol: {
    alignItems: 'flex-end'
  },
  transLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B'
  },
  transValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 2
  },
  transAmount: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2
  },
  vpaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8
  },
  vpaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600'
  },
  vpaValue: {
    fontSize: 12,
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1
  },
  copyBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  copyBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8'
  },
  launchToast: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center'
  },
  launchToastText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    textAlign: 'center'
  },
  paymentPromptSection: {
    gap: 10
  },
  paymentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  paymentSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3
  },
  appsGrid: {
    gap: 8
  },
  appLaunchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12
  },
  appLaunchCardActive: {
    backgroundColor: '#16223B'
  },
  appIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appIconText: {
    fontSize: 18
  },
  appInfoCol: {
    flex: 1
  },
  appTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  appSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1
  },
  appSubActive: {
    color: '#10B981'
  },
  appSubMuted: {
    color: '#64748B'
  },
  appArrow: {
    fontSize: 16,
    color: '#38BDF8',
    fontWeight: '700'
  },
  dangerActionSection: {
    gap: 8
  },
  abortPaymentBtn: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  abortPaymentBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    padding: 10,
    gap: 8
  },
  securityNoteIcon: {
    fontSize: 15
  },
  securityNoteText: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 16,
    flex: 1
  },
  footerRow: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 10,
    backgroundColor: '#0B1120'
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  dismissBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13
  },
  viewAnalysisBtn: {
    flex: 1.2,
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  viewAnalysisBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});
