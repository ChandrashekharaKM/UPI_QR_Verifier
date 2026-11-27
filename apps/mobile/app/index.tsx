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
import {
  verifyQrPayload,
  describeQrIntent,
  type VerificationResult,
  type QrIntentDescription
} from '@upi-verifier/core';
import { COLORS, getRiskColor, getRiskBgColor } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';
import { getScanHistory, saveScanToHistory } from '../lib/storage';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { SAFETY_TIPS, SafetyTipCard } from '../components/SafetyTipCard';
import { HalfScreenCamera } from '../components/HalfScreenCamera';
import { LensScanPromptModal } from '../components/LensScanPromptModal';

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
  const { colors, isLight } = useTheme();
  const [recentScans, setRecentScans] = useState<VerificationResult[]>([]);
  const [quickInput, setQuickInput] = useState('');
  const [cameraPaused, setCameraPaused] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    rawPayload: string;
    verification: VerificationResult;
    intent: QrIntentDescription;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setCameraPaused(false);
      void getScanHistory().then((history) => {
        if (isMounted) {
          setRecentScans(history.slice(0, 3));
        }
      });
      return () => {
        isMounted = false;
        setCameraPaused(true);
      };
    }, [])
  );

  const handleLiveQrDetected = (data: string) => {
    if (!data || cameraPaused) return;
    setCameraPaused(true);

    const verified = verifyQrPayload(data, { isOffline: true });
    const intent = describeQrIntent(verified);
    void saveScanToHistory(verified);

    setScannedResult({
      rawPayload: data,
      verification: verified,
      intent
    });
  };

  const handleVerifyQuickInput = () => {
    const trimmed = quickInput.trim();
    if (!trimmed) return;
    router.push({
      pathname: '/result',
      params: { rawPayload: trimmed }
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.content}
    >
      {/* Top Security Status Pill */}
      <View style={styles.statusPillContainer}>
        <View style={[styles.statusPill, isLight && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
          <View style={styles.statusDot} />
          <Text style={[styles.statusPillText, isLight && { color: colors.textSecondary }]}>
            OFFLINE HEURISTIC SHIELD ACTIVE · ZERO DATA TRANSMITTED
          </Text>
        </View>
      </View>

      {/* Google Lens-Style Half-Screen Live Camera */}
      <View style={styles.cameraSection}>
        <HalfScreenCamera
          onQrDetected={handleLiveQrDetected}
          onExpandFullscreen={() => router.push('/scan')}
          isPaused={cameraPaused || Boolean(scannedResult)}
          height={320}
        />
      </View>

      {/* Gallery Upload Action (Single prominent button like Google Lens) */}
      <TouchableOpacity
        style={[
          styles.galleryButton,
          isLight && {
            backgroundColor: '#FFFFFF',
            borderColor: colors.primary,
            shadowColor: '#000',
            shadowOpacity: 0.06
          }
        ]}
        activeOpacity={0.88}
        onPress={() => router.push('/upload')}
        accessibilityLabel="Upload Image from Gallery"
      >
        <View style={[styles.iconCircleGallery, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={styles.buttonIcon}>🖼️</Text>
        </View>
        <View style={styles.buttonTextGroup}>
          <View style={styles.badgeRow}>
            <Text style={[styles.galleryButtonText, isLight && { color: colors.textPrimary }]}>
              Upload Image from Gallery
            </Text>
            <View style={[styles.pillTagGallery, isLight && { backgroundColor: '#E0F2FE' }]}>
              <Text style={[styles.pillTagGalleryText, isLight && { color: colors.primary }]}>
                PHOTO / GALLERY
              </Text>
            </View>
          </View>
          <Text style={[styles.buttonSubtext, isLight && { color: colors.textSecondary }]}>
            Inspect saved photos, laminated counter standees, or invoices
          </Text>
        </View>
      </TouchableOpacity>

      {/* Quick Text / Intent Tester */}
      <View
        style={[
          styles.quickTestCard,
          isLight && {
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOpacity: 0.05
          }
        ]}
      >
        <View style={styles.quickTestHeader}>
          <Text style={[styles.quickTestTitle, isLight && { color: colors.textPrimary }]}>
            Quick UPI Link / Payload Verifier
          </Text>
          <Text style={[styles.quickTestHint, isLight && { color: colors.textMuted }]}>
            Paste any raw QR text or intent
          </Text>
        </View>
        <View style={styles.quickInputRow}>
          <TextInput
            style={[
              styles.quickTextInput,
              isLight && {
                backgroundColor: '#F1F5F9',
                borderColor: '#CBD5E1',
                color: colors.textPrimary
              }
            ]}
            value={quickInput}
            onChangeText={setQuickInput}
            placeholder="Paste upi://pay?pa=... or BharatQR 000201..."
            placeholderTextColor={isLight ? '#94A3B8' : COLORS.textMuted}
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
          <Text style={[styles.demoPillsLabel, isLight && { color: colors.textMuted }]}>
            Quick Test Samples:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.demoScroll}>
            {DEMO_PAYLOADS.map((demo) => (
              <TouchableOpacity
                key={demo.label}
                style={[styles.demoChip, isLight && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}
                onPress={() => {
                  setQuickInput(demo.payload);
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: demo.payload }
                  });
                }}
              >
                <Text style={[styles.demoChipText, isLight && { color: colors.textPrimary }]}>
                  {demo.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Feature Badges Strip */}
      <View style={[styles.featureStrip, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔒</Text>
          <Text style={[styles.featureTitle, isLight && { color: colors.textPrimary }]}>100% Offline</Text>
          <Text style={[styles.featureDesc, isLight && { color: colors.textSecondary }]}>Zero data sent</Text>
        </View>
        <View style={[styles.featureDivider, isLight && { backgroundColor: '#E2E8F0' }]} />
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🏛️</Text>
          <Text style={[styles.featureTitle, isLight && { color: colors.textPrimary }]}>120+ Banks</Text>
          <Text style={[styles.featureDesc, isLight && { color: colors.textSecondary }]}>NPCI allowlist</Text>
        </View>
        <View style={[styles.featureDivider, isLight && { backgroundColor: '#E2E8F0' }]} />
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🏷️</Text>
          <Text style={[styles.featureTitle, isLight && { color: colors.textPrimary }]}>EMVCo Ready</Text>
          <Text style={[styles.featureDesc, isLight && { color: colors.textSecondary }]}>CRC16 standees</Text>
        </View>
      </View>

      {/* Secondary Nav Links */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navChip, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.navChipIcon}>📋</Text>
          <Text style={[styles.navChipText, isLight && { color: colors.textPrimary }]}>Audit Log</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navChip, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}
          onPress={() => router.push('/report')}
        >
          <Text style={styles.navChipIcon}>🚨</Text>
          <Text style={[styles.navChipText, isLight && { color: colors.textPrimary }]}>Report Scam</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navChip, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}
          onPress={() => router.push('/about')}
        >
          <Text style={styles.navChipIcon}>ℹ️</Text>
          <Text style={[styles.navChipText, isLight && { color: colors.textPrimary }]}>Security Specs</Text>
        </TouchableOpacity>
      </View>

      {/* Advisory Banner */}
      <DisclaimerBanner />

      {/* Recent Scans Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, isLight && { color: colors.textPrimary }]}>Recent Inspections</Text>
          {recentScans.length > 0 ? (
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={[styles.seeAllText, isLight && { color: colors.primary }]}>View All ({recentScans.length})</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {recentScans.length === 0 ? (
          <View style={[styles.emptyCard, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={[styles.emptyText, isLight && { color: colors.textPrimary }]}>No previous scans recorded yet.</Text>
            <Text style={[styles.emptySubtext, isLight && { color: colors.textSecondary }]}>
              All scan logs are kept strictly on this device and can be cleared at any time.
            </Text>
          </View>
        ) : (
          recentScans.map((scan) => {
            const riskColor = getRiskColor(scan.category, colors);
            const riskBg = getRiskBgColor(scan.category, colors);
            const isUpiOrEmv =
              (scan.parsed.kind === 'upi' || scan.parsed.kind === 'emv') &&
              (scan.parsed.fields.kind === 'upi' || scan.parsed.fields.kind === 'emv');
            const vpa = isUpiOrEmv ? scan.parsed.fields.upi.pa : scan.parsed.rawPayload.slice(0, 30);
            const name = isUpiOrEmv && scan.parsed.fields.upi.pn ? scan.parsed.fields.upi.pn : null;

            return (
              <TouchableOpacity
                key={scan.evaluatedAt}
                style={[
                  styles.recentItem,
                  isLight && {
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    shadowColor: '#000',
                    shadowOpacity: 0.05
                  }
                ]}
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
                    <Text style={[styles.recentName, isLight && { color: colors.textPrimary }]} numberOfLines={1}>
                      {name}
                    </Text>
                  ) : null}
                  <Text style={[styles.recentVpa, isLight && { color: colors.primary }]} numberOfLines={1}>
                    {vpa}
                  </Text>
                  <Text style={[styles.recentDate, isLight && { color: colors.textMuted }]}>
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
        <Text style={[styles.sectionTitle, isLight && { color: colors.textPrimary }]}>Essential Safety Tips</Text>
        {SAFETY_TIPS.map((tip) => (
          <SafetyTipCard key={tip.id} tip={tip} />
        ))}
      </View>

      {/* Google Lens Instant Scan & Payment Prompt */}
      {scannedResult ? (
        <LensScanPromptModal
          visible={Boolean(scannedResult)}
          rawPayload={scannedResult.rawPayload}
          verification={scannedResult.verification}
          intent={scannedResult.intent}
          onDismiss={() => {
            setScannedResult(null);
            setCameraPaused(false);
          }}
          onViewDetails={() => {
            const raw = scannedResult.rawPayload;
            setScannedResult(null);
            setCameraPaused(false);
            router.push({
              pathname: '/result',
              params: { rawPayload: raw }
            });
          }}
        />
      ) : null}
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
  qrLogoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38BDF8',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8
  },
  qrLogoIcon: {
    fontSize: 34,
    color: '#38BDF8',
    fontWeight: '800'
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
  cameraSection: {
    marginVertical: 10
  },
  galleryButton: {
    backgroundColor: COLORS.bgCard,
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  iconCircleGallery: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  buttonIcon: {
    fontSize: 22
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
  galleryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  pillTagGallery: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  pillTagGalleryText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#38BDF8',
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
