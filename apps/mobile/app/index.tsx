import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { VerificationResult } from '@upi-verifier/core';
import { COLORS, getRiskColor, getRiskBgColor } from '../lib/theme';
import { getScanHistory } from '../lib/storage';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { SAFETY_TIPS, SafetyTipCard } from '../components/SafetyTipCard';

export default function HomeScreen() {
  const router = useRouter();
  const [recentScans, setRecentScans] = useState<VerificationResult[]>([]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Header */}
      <View style={styles.heroSection}>
        <View style={styles.shieldBadge}>
          <Text style={styles.shieldIcon}>🛡️</Text>
        </View>
        <Text style={styles.heroTitle}>Verify Before You Pay</Text>
        <Text style={styles.heroSubtitle}>
          Scan any UPI QR code to detect fake accounts, deceptive refund notes, and malicious links before approving payment.
        </Text>
      </View>

      {/* Primary Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={() => router.push('/scan')}
        >
          <Text style={styles.buttonIcon}>📷</Text>
          <View style={styles.buttonTextGroup}>
            <Text style={styles.primaryButtonText}>Scan QR Code</Text>
            <Text style={styles.buttonSubtext}>Live camera inspection</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() => router.push('/upload')}
        >
          <Text style={styles.buttonIcon}>🖼️</Text>
          <View style={styles.buttonTextGroup}>
            <Text style={styles.secondaryButtonText}>Upload Image</Text>
            <Text style={styles.buttonSubtext}>Scan QR from gallery or file</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Secondary Nav Links */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navChip}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.navChipIcon}>📋</Text>
          <Text style={styles.navChipText}>Scan Log</Text>
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
          <Text style={styles.navChipText}>How It Works</Text>
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
              All scans are analyzed locally on your device for maximum privacy.
            </Text>
          </View>
        ) : (
          recentScans.map((scan) => {
            const riskColor = getRiskColor(scan.category);
            const riskBg = getRiskBgColor(scan.category);
            const vpa =
              scan.parsed.kind === 'upi' && scan.parsed.fields.kind === 'upi'
                ? scan.parsed.fields.upi.pa
                : scan.parsed.rawPayload.slice(0, 30);

            return (
              <TouchableOpacity
                key={scan.evaluatedAt}
                style={styles.recentItem}
                onPress={() => {
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: scan.parsed.rawPayload }
                  });
                }}
              >
                <View style={styles.recentInfo}>
                  <Text style={styles.recentVpa} numberOfLines={1}>
                    {vpa}
                  </Text>
                  <Text style={styles.recentDate}>
                    {new Date(scan.evaluatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })} · {scan.reasons.length} flags
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
    padding: 20,
    paddingBottom: 40
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 12
  },
  shieldBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.primary,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  shieldIcon: {
    fontSize: 28
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340
  },
  actionContainer: {
    gap: 12,
    marginVertical: 16
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  secondaryButton: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center'
  },
  buttonIcon: {
    fontSize: 28,
    marginRight: 16
  },
  buttonTextGroup: {
    flex: 1
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 8
  },
  navChip: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
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
    fontWeight: '600',
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
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryLight
  },
  emptyCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
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
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center'
  },
  recentItem: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  recentInfo: {
    flex: 1,
    marginRight: 12
  },
  recentVpa: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  recentDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  recentBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center'
  },
  recentScore: {
    fontSize: 14,
    fontWeight: '800'
  },
  recentCategory: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5
  }
});
