import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { VerificationResult } from '@upi-verifier/core';
import { COLORS, getRiskColor, getRiskBgColor } from '../lib/theme';
import { getScanHistory } from '../lib/storage';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { SAFETY_TIPS, SafetyTipCard } from '../components/SafetyTipCard';

const DEMO_PAYLOADS = [
  {
    label: 'Authentic Store (Safe)',
    payload: 'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Provisions&am=150.00&cu=INR&mc=5411'
  },
  {
    label: 'BharatQR Standee',
    payload: '00020101021126480010in.org.npci0117freshmart@hdfcbank5204541153033565406150.005802IN5913Fresh Grocery6009Bangalore63042A27'
  },
  {
    label: 'Refund Trap (High Risk)',
    payload: 'upi://pay?pa=sbi.refund.portal@ybl&pn=SBI%20Helpline&am=9999.00'
  }
];

export default function HomeScreen() {
  const router = useRouter();
  const [recentScans, setRecentScans] = useState<VerificationResult[]>([]);
  const [quickInput, setQuickInput] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void getScanHistory().then((history) => {
        if (isMounted) {
          setRecentScans(history.slice(0, 3));
        }
      });
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const handleVerifyQuickInput = () => {
    const trimmed = quickInput.trim();
    if (!trimmed) return;
    router.push({
      pathname: '/result',
      params: { rawPayload: trimmed }
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Security Status Pill */}
      <View style={styles.statusPillContainer}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>OFFLINE HEURISTIC SHIELD ACTIVE · ZERO DATA TRANSMITTED</Text>
        </View>
      </View>

      {/* Hero Header */}
      <View style={styles.heroSection}>
        <View style={styles.shieldBadge}>
          <Text style={styles.shieldIcon}>🛡️</Text>
        </View>
        <Text style={styles.heroTitle}>Verify Before You Authorize</Text>
        <Text style={styles.heroSubtitle}>
          Scan shop standees, bill QRs, and UPI links before paying to detect phishing handles, fake refunds, and tampered QR stickers.
        </Text>
      </View>

      {/* Primary Action Cards */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.88}
          onPress={() => router.push('/scan')}
        >
          <View style={styles.iconCirclePrimary}>
            <Text style={styles.buttonIcon}>📷</Text>
          </View>
          <View style={styles.buttonTextGroup}>
            <View style={styles.badgeRow}>
              <Text style={styles.primaryButtonText}>Scan QR Code</Text>
              <View style={styles.pillTagPrimary}>
                <Text style={styles.pillTagPrimaryText}>LIVE CAMERA</Text>
              </View>
            </View>
            <Text style={styles.buttonSubtext}>
              Real-time camera viewfinder with multi-QR detection
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.88}
          onPress={() => router.push('/upload')}
        >
          <View style={styles.iconCircleSecondary}>
            <Text style={styles.buttonIcon}>🖼️</Text>
          </View>
          <View style={styles.buttonTextGroup}>
            <View style={styles.badgeRow}>
              <Text style={styles.secondaryButtonText}>Upload Image</Text>
              <View style={styles.pillTagSecondary}>
                <Text style={styles.pillTagSecondaryText}>STAND-IN / PHOTO</Text>
              </View>
            </View>
            <Text style={styles.buttonSubtext}>
              Inspect saved screenshot, laminated photo, or invoice
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Quick Text / Intent Tester */}
      <View style={styles.quickTestCard}>
        <View style={styles.quickTestHeader}>
          <Text style={styles.quickTestTitle}>Quick UPI Link / Payload Verifier</Text>
          <Text style={styles.quickTestHint}>Paste any raw QR text or intent</Text>
        </View>
        <View style={styles.quickInputRow}>
          <TextInput
            style={styles.quickTextInput}
            value={quickInput}
            onChangeText={setQuickInput}
            placeholder="Paste upi://pay?pa=... or BharatQR 000201..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.quickVerifyBtn, !quickInput.trim() && styles.quickVerifyBtnDisabled]}
            disabled={!quickInput.trim()}
            onPress={handleVerifyQuickInput}
          >
            <Text style={styles.quickVerifyBtnText}>Inspect</Text>
          </TouchableOpacity>
        </View>

        {/* Demo Payload Pills */}
        <View style={styles.demoPillsContainer}>
          <Text style={styles.demoPillsLabel}>Quick Test Samples:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.demoScroll}>
            {DEMO_PAYLOADS.map((demo) => (
              <TouchableOpacity
                key={demo.label}
                style={styles.demoChip}
                onPress={() => {
                  setQuickInput(demo.payload);
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: demo.payload }
                  });
                }}
              >
                <Text style={styles.demoChipText}>{demo.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Feature Badges Strip */}
      <View style={styles.featureStrip}>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔒</Text>
          <Text style={styles.featureTitle}>100% Offline</Text>
          <Text style={styles.featureDesc}>Zero data sent</Text>
        </View>
        <View style={styles.featureDivider} />
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🏛️</Text>
          <Text style={styles.featureTitle}>120+ Banks</Text>
          <Text style={styles.featureDesc}>NPCI allowlist</Text>
        </View>
        <View style={styles.featureDivider} />
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🏷️</Text>
          <Text style={styles.featureTitle}>EMVCo Ready</Text>
          <Text style={styles.featureDesc}>CRC16 standees</Text>
        </View>
      </View>

      {/* Secondary Nav Links */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navChip}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.navChipIcon}>📋</Text>
          <Text style={styles.navChipText}>Audit Log</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navChip}
          onPress={() => router.push('/report')}
        >
          <Text style={styles.navChipIcon}>🚨</Text>
          <Text style={styles.navChipText}>Report Scam</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navChip}
          onPress={() => router.push('/about')}
        >
          <Text style={styles.navChipIcon}>ℹ️</Text>
          <Text style={styles.navChipText}>Security Specs</Text>
        </TouchableOpacity>
      </View>

      {/* Advisory Banner */}
      <DisclaimerBanner />

      {/* Recent Scans Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Inspections</Text>
          {recentScans.length > 0 ? (
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={styles.seeAllText}>View All ({recentScans.length})</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {recentScans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No previous scans recorded yet.</Text>
            <Text style={styles.emptySubtext}>
              All scan logs are kept strictly on this device and can be cleared at any time.
            </Text>
          </View>
        ) : (
          recentScans.map((scan) => {
            const riskColor = getRiskColor(scan.category);
            const riskBg = getRiskBgColor(scan.category);
            const isUpiOrEmv =
              (scan.parsed.kind === 'upi' || scan.parsed.kind === 'emv') &&
              (scan.parsed.fields.kind === 'upi' || scan.parsed.fields.kind === 'emv');
            const vpa = isUpiOrEmv ? scan.parsed.fields.upi.pa : scan.parsed.rawPayload.slice(0, 30);
            const name = isUpiOrEmv && scan.parsed.fields.upi.pn ? scan.parsed.fields.upi.pn : null;

            return (
              <TouchableOpacity
                key={scan.evaluatedAt}
                style={styles.recentItem}
                activeOpacity={0.8}
                onPress={() => {
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: scan.parsed.rawPayload }
                  });
                }}
              >
                <View style={styles.recentInfo}>
                  {name ? (
                    <Text style={styles.recentName} numberOfLines={1}>
                      {name}
                    </Text>
                  ) : null}
                  <Text style={styles.recentVpa} numberOfLines={1}>
                    {vpa}
                  </Text>
                  <Text style={styles.recentDate}>
                    {new Date(scan.evaluatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })} · {scan.reasons.length} rule flags
                  </Text>
                </View>
                <View style={[styles.recentBadge, { backgroundColor: riskBg, borderColor: riskColor }]}>
                  <Text style={[styles.recentScore, { color: riskColor }]}>{scan.score}</Text>
                  <Text style={[styles.recentCategory, { color: riskColor }]}>{scan.category}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Security Guidance Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Essential Safety Tips</Text>
        {SAFETY_TIPS.map((tip) => (
          <SafetyTipCard key={tip.id} tip={tip} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  statusPillContainer: {
    alignItems: 'center',
    marginBottom: 10
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.safe,
    marginRight: 6
  },
  statusPillText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 14
  },
  shieldBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.bgCardElevated,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6
  },
  shieldIcon: {
    fontSize: 32
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 350
  },
  actionContainer: {
    gap: 12,
    marginVertical: 14
  },
  primaryButton: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
  },
  iconCirclePrimary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  secondaryButton: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3
  },
  iconCircleSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  buttonIcon: {
    fontSize: 24
  },
  buttonTextGroup: {
    flex: 1
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  pillTagPrimary: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4
  },
  pillTagPrimaryText: {
    color: '#93C5FD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  pillTagSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4
  },
  pillTagSecondaryText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 16
  },
  quickTestCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    padding: 14,
    marginVertical: 6
  },
  quickTestHeader: {
    marginBottom: 10
  },
  quickTestTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  quickTestHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  quickInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  quickTextInput: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  quickVerifyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  quickVerifyBtnDisabled: {
    backgroundColor: COLORS.bgCardHover,
    opacity: 0.5
  },
  quickVerifyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  demoPillsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8
  },
  demoPillsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  demoScroll: {
    gap: 6
  },
  demoChip: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  demoChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primaryLight
  },
  featureStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 10,
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  featureItem: {
    alignItems: 'center',
    flex: 1
  },
  featureIcon: {
    fontSize: 18,
    marginBottom: 2
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  featureDesc: {
    fontSize: 10,
    color: COLORS.textMuted
  },
  featureDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.08)'
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 8
  },
  navChip: {
    flex: 1,
    backgroundColor: COLORS.bgCardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  navChipIcon: {
    fontSize: 14
  },
  navChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  section: {
    marginTop: 20
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.2
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryLight
  },
  emptyCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center'
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18
  },
  recentItem: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
  },
  recentInfo: {
    flex: 1,
    marginRight: 12
  },
  recentName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 1
  },
  recentVpa: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  recentDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3
  },
  recentBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 54
  },
  recentScore: {
    fontSize: 14,
    fontWeight: '800'
  },
  recentCategory: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4
  }
});
