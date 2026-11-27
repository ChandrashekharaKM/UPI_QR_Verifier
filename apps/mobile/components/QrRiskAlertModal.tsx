import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { QrIntentDescription } from '@upi-verifier/core';
import { COLORS } from '../lib/theme';

export interface QrRiskAlertModalProps {
  visible: boolean;
  intent: QrIntentDescription;
  onDismiss: () => void;
  onAbortPayment: () => void;
  onCopyVpa?: (vpa: string) => void;
  onProceedToPay?: () => void;
}

export function QrRiskAlertModal({
  visible,
  intent,
  onDismiss,
  onAbortPayment,
  onCopyVpa,
  onProceedToPay
}: QrRiskAlertModalProps) {
  const [copiedVpa, setCopiedVpa] = useState(false);

  const isHighRisk = intent.riskLevel === 'HIGH_RISK';
  const isSuspicious = intent.riskLevel === 'SUSPICIOUS';
  const isSafe = intent.riskLevel === 'SAFE';

  const accentColor = isHighRisk
    ? COLORS.highRisk
    : isSuspicious
      ? COLORS.suspicious
      : COLORS.safe;

  const handleCopy = async () => {
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
      onCopyVpa?.(intent.payeeVpa);
    } catch (err) {
      console.warn('Failed to copy VPA:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { borderColor: accentColor }]}>
          {/* Top Status Header */}
          <View style={[styles.statusHeader, { backgroundColor: `${accentColor}18` }]}>
            <Text style={styles.statusIcon}>
              {isHighRisk ? '🚨' : isSuspicious ? '⚠️' : '✅'}
            </Text>
            <View style={styles.statusHeaderTextCol}>
              <Text style={[styles.statusTitle, { color: accentColor }]}>
                {isHighRisk
                  ? 'CRITICAL SECURITY ALERT'
                  : isSuspicious
                    ? 'SUSPICIOUS QR ALERT'
                    : 'CLEAN FORMAT VERIFIED'}
              </Text>
              <Text style={styles.statusSubtitle}>{intent.riskLevelLabel}</Text>
            </View>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* Section 1: How Many Risks We Have */}
            <View style={[styles.riskCountBanner, { borderLeftColor: accentColor }]}>
              <View style={styles.riskCountHeaderRow}>
                <Text style={styles.riskCountNumberIcon}>
                  {intent.totalRisks > 0 ? '⚠️' : '🛡️'}
                </Text>
                <View style={styles.riskCountTitleCol}>
                  <Text style={styles.riskCountHeadline}>
                    {intent.totalRisks === 0
                      ? '0 RISKS DETECTED'
                      : intent.totalRisks === 1
                        ? '1 RISK DETECTED'
                        : `${intent.totalRisks} RISKS DETECTED`}
                  </Text>
                  <Text style={styles.riskCountSubtext}>
                    {intent.totalRisks === 0
                      ? 'No malicious patterns found in QR payload'
                      : `${intent.criticalRisksCount} Critical Danger · ${intent.warningRisksCount} Cautionary Warnings`}
                  </Text>
                </View>
              </View>

              {/* Bullet list of risks */}
              {intent.totalRisks > 0 ? (
                <View style={styles.riskListContainer}>
                  {intent.riskBulletPoints.map((point: string, index: number) => (
                    <View key={index} style={styles.riskBulletRow}>
                      <Text style={[styles.riskBulletDot, { color: accentColor }]}>•</Text>
                      <Text style={styles.riskBulletText}>{point}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Deception Warning Callout (Refund / Reward / Micro-auth) */}
            {intent.deceptionAlert?.isDeceptive ? (
              <View style={styles.deceptionCard}>
                <View style={styles.deceptionHeaderRow}>
                  <Text style={styles.deceptionIcon}>🛑</Text>
                  <Text style={styles.deceptionTitle}>{intent.deceptionAlert.title}</Text>
                </View>
                <Text style={styles.deceptionMessage}>
                  {intent.deceptionAlert.warningMessage}
                </Text>
              </View>
            ) : null}

            {/* Section 2: What is the QR saying? (Plain English Decoder) */}
            <View style={styles.intentCard}>
              <View style={styles.intentHeaderRow}>
                <Text style={styles.intentHeaderIcon}>📢</Text>
                <Text style={styles.intentHeaderTitle}>WHAT THIS QR IS SAYING:</Text>
              </View>

              {/* Action Headline */}
              <Text style={styles.actionHeadline}>{intent.headline}</Text>

              {/* Detailed plain-English explanation */}
              <Text style={styles.plainEnglishAction}>{intent.plainEnglishAction}</Text>

              {/* Financial Impact Callout */}
              <View style={styles.impactBox}>
                <Text style={styles.impactLabel}>Financial Impact:</Text>
                <Text style={styles.impactValue}>{intent.financialImpact}</Text>
              </View>

              {/* Quick Summary Grid */}
              <View style={styles.metaGrid}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Pre-filled Amount:</Text>
                  <Text style={[styles.metaVal, intent.rawAmount ? styles.metaValHighlight : null]}>
                    {intent.amountText}
                  </Text>
                </View>

                {intent.payeeVpa && intent.payeeVpa !== 'N/A' ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaKey}>Recipient VPA:</Text>
                    <View style={styles.vpaCopyRow}>
                      <Text style={styles.metaValVpa}>{intent.payeeVpa}</Text>
                      <TouchableOpacity
                        style={styles.inlineCopyBtn}
                        onPress={handleCopy}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.inlineCopyText}>
                          {copiedVpa ? '✓ Copied' : '📋 Copy'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {intent.payeeName && intent.payeeName !== 'N/A' ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaKey}>Declared Name:</Text>
                    <Text style={styles.metaVal}>{intent.payeeName}</Text>
                  </View>
                ) : null}

                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Recipient Type:</Text>
                  <Text style={styles.metaVal}>{intent.payeeTypeLabel}</Text>
                </View>

                {intent.transactionNote ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaKey}>QR Note / Memo:</Text>
                    <Text style={styles.metaVal}>"{intent.transactionNote}"</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* When Safe: Prompt for Payment with Available Apps */}
            {isSafe ? (
              <View style={styles.safePayPromptCard}>
                <View style={styles.safePayPromptHeader}>
                  <Text style={styles.safePayPromptIcon}>⚡</Text>
                  <Text style={styles.safePayPromptTitle}>Verified Safe to Pay</Text>
                </View>
                <Text style={styles.safePayPromptBody}>
                  Format and banking handle verified clean. Tap "Proceed to Pay" to launch your installed UPI app (Google Pay, PhonePe, Paytm, etc.).
                </Text>
              </View>
            ) : null}

            {/* Mandatory PIN safety reminder */}
            <View style={styles.pinReminderBox}>
              <Text style={styles.pinReminderIcon}>💡</Text>
              <Text style={styles.pinReminderText}>
                <Text style={styles.pinReminderBold}>GOLDEN RULE OF UPI: </Text>
                You only enter your UPI PIN to SEND money, never to receive money. Always check the recipient name on your screen before typing your PIN.
              </Text>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            {isSafe ? (
              <TouchableOpacity
                style={styles.payNowButton}
                activeOpacity={0.85}
                onPress={() => {
                  onProceedToPay?.();
                  onDismiss();
                }}
              >
                <Text style={styles.payNowButtonText}>💳 Proceed to Pay</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.abortButton}
                activeOpacity={0.85}
                onPress={onAbortPayment}
              >
                <Text style={styles.abortButtonText}>🛑 Don't Pay / Cancel</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.detailsButton}
              activeOpacity={0.85}
              onPress={onDismiss}
            >
              <Text style={styles.detailsButtonText}>🔍 View Analysis</Text>
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
    backgroundColor: 'rgba(5, 8, 18, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 12
  },
  statusIcon: {
    fontSize: 28
  },
  statusHeaderTextCol: {
    flex: 1
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  statusSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500'
  },
  scrollBody: {
    flexShrink: 1
  },
  scrollContent: {
    padding: 18,
    gap: 16
  },
  riskCountBanner: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    gap: 10
  },
  riskCountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  riskCountNumberIcon: {
    fontSize: 22
  },
  riskCountTitleCol: {
    flex: 1
  },
  riskCountHeadline: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.4
  },
  riskCountSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  riskListContainer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 6
  },
  riskBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  riskBulletDot: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20
  },
  riskBulletText: {
    flex: 1,
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18
  },
  deceptionCard: {
    backgroundColor: '#450A0A',
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  deceptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  deceptionIcon: {
    fontSize: 20
  },
  deceptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 0.5
  },
  deceptionMessage: {
    fontSize: 13,
    color: '#FEE2E2',
    lineHeight: 18,
    fontWeight: '500'
  },
  intentCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3C5E',
    padding: 16,
    gap: 12
  },
  intentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  intentHeaderIcon: {
    fontSize: 18
  },
  intentHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.8
  },
  actionHeadline: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 24
  },
  plainEnglishAction: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20
  },
  impactBox: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    gap: 4
  },
  impactLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  impactValue: {
    fontSize: 13,
    color: '#F1F5F9',
    fontWeight: '600'
  },
  metaGrid: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#24324D'
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  metaKey: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  },
  metaVal: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1
  },
  metaValHighlight: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 13
  },
  metaValVpa: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
  },
  vpaCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  inlineCopyBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF8'
  },
  inlineCopyText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700'
  },
  pinReminderBox: {
    backgroundColor: '#1E293B80',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pinReminderIcon: {
    fontSize: 18
  },
  pinReminderText: {
    flex: 1,
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17
  },
  pinReminderBold: {
    fontWeight: '800',
    color: '#F8FAFC'
  },
  actionFooter: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0B1120',
    gap: 10
  },
  abortButton: {
    flex: 1,
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  abortButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  },
  payNowButton: {
    flex: 1.2,
    backgroundColor: '#059669',
    borderWidth: 1.5,
    borderColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  payNowButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  },
  safePayPromptCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    gap: 6
  },
  safePayPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  safePayPromptIcon: {
    fontSize: 18
  },
  safePayPromptTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981'
  },
  safePayPromptBody: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 17
  },
  detailsButton: {
    flex: 1.2,
    backgroundColor: '#0284C7',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  }
});
