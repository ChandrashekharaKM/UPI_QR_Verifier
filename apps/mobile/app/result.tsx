import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  verifyQrPayload,
  type VerificationResult,
  type CommunityReputationSignal
} from '@upi-verifier/core';
import { COLORS, getRiskColor, getRiskBgColor } from '../lib/theme';
import { saveScanToHistory } from '../lib/storage';
import { fetchVpaReputation } from '../lib/api-client';
import { RiskGauge } from '../components/RiskGauge';
import { ReasonCard } from '../components/ReasonCard';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rawPayload?: string }>();
  const rawPayload = params.rawPayload ?? '';

  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showHighRiskModal, setShowHighRiskModal] = useState(false);

  useEffect(() => {
    if (!rawPayload) return;

    // 1. Instant on-device execution (0 latency, 100% offline)
    const instantResult = verifyQrPayload(rawPayload, { isOffline: true });
    setVerification(instantResult);
    void saveScanToHistory(instantResult);

    // 2. Asynchronously enrich with API reputation if VPA exists and network available
    if (instantResult.parsed.kind === 'upi' && instantResult.parsed.fields.kind === 'upi') {
      const vpa = instantResult.parsed.fields.upi.pa;
      setIsEnriching(true);

      void fetchVpaReputation(vpa).then((repRes) => {
        setIsEnriching(false);

        if (!repRes.isOnline) {
          setOfflineNotice(repRes.notice ?? 'offline: community reports unavailable');
          return;
        }

        if (repRes.signal) {
          // Re-evaluate with enriched community intelligence
          const enriched = verifyQrPayload(rawPayload, {
            community: repRes.signal,
            isOffline: false
          });
          setVerification(enriched);
          void saveScanToHistory(enriched);
        }
      });
    }
  }, [rawPayload]);

  if (!verification) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Analyzing QR code parameters...</Text>
      </View>
    );
  }

  const riskColor = getRiskColor(verification.category);
  const isHighRisk = verification.category === 'HIGH_RISK';

  // Extract parsed fields safely
  const upiFields =
    verification.parsed.kind === 'upi' && verification.parsed.fields.kind === 'upi'
      ? verification.parsed.fields.upi
      : undefined;

  const urlFields =
    verification.parsed.kind === 'url' && verification.parsed.fields.kind === 'url'
      ? verification.parsed.fields.url
      : undefined;

  const handleContinueAnyway = () => {
    if (isHighRisk) {
      setShowHighRiskModal(true);
    } else {
      router.replace('/');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Offline Degradation Banner */}
      {offlineNotice ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineIcon}>📡</Text>
          <Text style={styles.offlineText}>{offlineNotice}</Text>
        </View>
      ) : null}

      {/* Main Score Gauge */}
      <RiskGauge score={verification.score} category={verification.category} />

      {/* Confidence / Warning Note */}
      <View style={[styles.noteCard, { borderColor: riskColor }]}>
        <Text style={styles.noteTitle}>Advisory Note</Text>
        <Text style={styles.noteText}>{verification.confidenceNote}</Text>
      </View>

      {/* Persistent Disclaimer */}
      <DisclaimerBanner customText={verification.disclaimer} />

      {/* Parsed Fields Information Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Decoded Payment Information</Text>

        {upiFields ? (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Payee UPI ID (VPA):</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {upiFields.pa}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Declared Payee Name:</Text>
              <Text style={styles.fieldValue}>
                {upiFields.pn ?? '(Not provided in QR)'}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Pre-filled Amount:</Text>
              <Text style={[styles.fieldValue, upiFields.am ? styles.amountHighlight : null]}>
                {upiFields.am ? `₹${upiFields.am} (${upiFields.cu ?? 'INR'})` : 'User-entered (Open Amount)'}
              </Text>
            </View>

            {upiFields.tn ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Transaction Remarks / Note:</Text>
                <Text style={styles.fieldValue}>{upiFields.tn}</Text>
              </View>
            ) : null}

            {upiFields.mc ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Merchant Category Code:</Text>
                <Text style={styles.fieldValue}>{upiFields.mc}</Text>
              </View>
            ) : null}
          </View>
        ) : urlFields ? (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Destination Web Link:</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {urlFields.rawUrl}
              </Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Detected Hostname:</Text>
              <Text style={styles.fieldValue}>{urlFields.hostname}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Raw Payload:</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {verification.parsed.rawPayload}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Ranked Reasons Breakdown */}
      <View style={styles.section}>
        <View style={styles.reasonsHeader}>
          <Text style={styles.sectionTitle}>
            Identified Risk Factors ({verification.reasons.length})
          </Text>
          {isEnriching ? (
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
          ) : null}
        </View>

        {verification.reasons.length === 0 ? (
          <View style={styles.cleanCard}>
            <Text style={styles.cleanIcon}>✅</Text>
            <Text style={styles.cleanTitle}>No High-Risk Anomalies Detected</Text>
            <Text style={styles.cleanText}>
              VPA formatting and transaction fields conform to expected standards. Ensure you recognize the receiver before authorizing payment.
            </Text>
          </View>
        ) : (
          verification.reasons.map((reason, idx) => (
            <ReasonCard key={reason.ruleId} reason={reason} rank={idx + 1} />
          ))
        )}
      </View>

      {/* Model & Evaluation Metadata */}
      <View style={styles.metaBox}>
        <Text style={styles.metaText}>
          Core Rule Score: {verification.scoreBreakdown.ruleScore}/100 · ML Probability: {(verification.scoreBreakdown.mlProbability * 100).toFixed(1)}% · Model: v{verification.modelVersion}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {/* Action 1: Don't pay / Close */}
        <TouchableOpacity
          style={styles.safeDismissButton}
          activeOpacity={0.85}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.safeDismissText}>Don't Pay / Close</Text>
        </TouchableOpacity>

        {/* Action 2: Report this QR */}
        {upiFields?.pa ? (
          <TouchableOpacity
            style={styles.reportButton}
            activeOpacity={0.85}
            onPress={() => {
              router.push({
                pathname: '/report',
                params: { vpa: upiFields.pa }
              });
            }}
          >
            <Text style={styles.reportButtonText}>Report This UPI ID</Text>
          </TouchableOpacity>
        ) : null}

        {/* Action 3: Continue anyway (Never auto launches payment; only dismisses with confirmation) */}
        <TouchableOpacity
          style={styles.continueButton}
          activeOpacity={0.85}
          onPress={handleContinueAnyway}
        >
          <Text style={styles.continueButtonText}>Continue Anyway</Text>
        </TouchableOpacity>
      </View>

      {/* High Risk Confirmation Modal */}
      <Modal
        visible={showHighRiskModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHighRiskModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🚨</Text>
            <Text style={styles.modalTitle}>CRITICAL SCAM WARNING</Text>
            <Text style={styles.modalBody}>
              This QR code exhibits severe fraud indicators. Entering your UPI PIN or scanning external links may result in immediate financial loss.
              {'\n\n'}
              Are you absolutely sure you want to dismiss this warning?
            </Text>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowHighRiskModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel (Recommended)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setShowHighRiskModal(false);
                  router.replace('/');
                }}
              >
                <Text style={styles.modalConfirmText}>Dismiss Warning</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12
  },
  offlineNotice: {
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  offlineIcon: {
    fontSize: 16,
    marginRight: 8
  },
  offlineText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500'
  },
  noteCard: {
    backgroundColor: COLORS.bgCard,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10
  },
  noteTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  noteText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginVertical: 12
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 14
  },
  fieldsGrid: {
    gap: 12
  },
  fieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 8
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2
  },
  fieldValuePrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryLight
  },
  fieldValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500'
  },
  amountHighlight: {
    color: '#FBBF24',
    fontWeight: '700'
  },
  section: {
    marginTop: 14
  },
  reasonsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  cleanCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: COLORS.safeBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center'
  },
  cleanIcon: {
    fontSize: 28,
    marginBottom: 6
  },
  cleanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.safe,
    marginBottom: 4
  },
  cleanText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18
  },
  metaBox: {
    marginVertical: 10,
    alignItems: 'center'
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  actionContainer: {
    gap: 10,
    marginTop: 16
  },
  safeDismissButton: {
    backgroundColor: '#1E293B',
    borderColor: COLORS.safe,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  safeDismissText: {
    color: COLORS.safe,
    fontSize: 16,
    fontWeight: '800'
  },
  reportButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  reportButtonText: {
    color: COLORS.highRisk,
    fontSize: 15,
    fontWeight: '700'
  },
  continueButton: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  continueButtonText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalCard: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.highRisk,
    borderWidth: 2,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center'
  },
  modalIcon: {
    fontSize: 44,
    marginBottom: 12
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.highRisk,
    marginBottom: 10,
    textAlign: 'center'
  },
  modalBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20
  },
  modalActionRow: {
    width: '100%',
    gap: 10
  },
  modalCancelBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700'
  },
  modalConfirmBtn: {
    backgroundColor: 'transparent',
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalConfirmText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600'
  }
});
