import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { COLORS } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export default function AboutScreen() {
  const { colors, isLight } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.content}
    >
      {/* Title Header */}
      <View style={styles.header}>
        <View style={[styles.headerBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.headerBadgeText, isLight && { color: colors.primary }]}>ARCHITECTURE & SPECS</Text>
        </View>
        <Text style={[styles.title, isLight && { color: colors.textPrimary }]}>Payment QR Code Alert System</Text>
        <Text style={[styles.subtitle, isLight && { color: colors.textSecondary }]}>
          How UPI QR Verifier analyzes transactions to keep you safe from digital payment fraud before you pay.
        </Text>
      </View>

      <DisclaimerBanner />

      {/* Layer 1: Protocol & Scheme Analysis */}
      <View style={[styles.card, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05 }]}>
        <View style={[styles.cardBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.badgeText, isLight && { color: colors.primary }]}>LAYER 1</Text>
        </View>
        <Text style={[styles.cardTitle, isLight && { color: colors.textPrimary }]}>Protocol & Scheme Inspection</Text>
        <Text style={[styles.cardBody, isLight && { color: colors.textSecondary }]}>
          Official UPI QR codes must use the standard <Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>upi://pay</Text> URI scheme. Attackers frequently substitute web links (<Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>http://</Text>), raw server IP addresses, or shortened URLs (<Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>bit.ly</Text>) that redirect victims to credential-harvesting phishing portals or malicious APK downloads.
        </Text>
      </View>

      {/* Layer 2: NPCI Banking Allowlist & Entropy */}
      <View style={[styles.card, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05 }]}>
        <View style={[styles.cardBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.badgeText, isLight && { color: colors.primary }]}>LAYER 2</Text>
        </View>
        <Text style={[styles.cardTitle, isLight && { color: colors.textPrimary }]}>NPCI Banking Allowlist & Entropy</Text>
        <Text style={[styles.cardBody, isLight && { color: colors.textSecondary }]}>
          The app validates payment handles against an official NPCI allowlist of authorized bank PSP suffixes (<Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>@oksbi</Text>, <Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>@okhdfcbank</Text>, <Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>@paytm</Text>, etc.). It computes the <Text style={[styles.highlightText, isLight && { color: colors.primary }]}>Shannon Entropy</Text> of usernames to detect machine-generated disposable routing addresses and screens for bank or customer care impersonation keywords.
        </Text>
      </View>

      {/* Layer 3: Identity Cross-Validation */}
      <View style={[styles.card, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05 }]}>
        <View style={[styles.cardBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.badgeText, isLight && { color: colors.primary }]}>LAYER 3</Text>
        </View>
        <Text style={[styles.cardTitle, isLight && { color: colors.textPrimary }]}>Identity Cross-Validation</Text>
        <Text style={[styles.cardBody, isLight && { color: colors.textSecondary }]}>
          Using <Text style={[styles.highlightText, isLight && { color: colors.primary }]}>Jaro-Winkler lexical distance</Text>, the engine compares the displayed Payee Name (<Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>pn</Text>) with the underlying UPI handle. When a QR claims to be "State Electricity Board" but routes to an unrelated individual, this discrepancy is immediately flagged.
        </Text>
      </View>

      {/* Layer 4: On-Device Random Forest ML */}
      <View style={[styles.card, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05 }]}>
        <View style={[styles.cardBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.badgeText, isLight && { color: colors.primary }]}>LAYER 4</Text>
        </View>
        <Text style={[styles.cardTitle, isLight && { color: colors.textPrimary }]}>On-Device Random Forest Inference</Text>
        <Text style={[styles.cardBody, isLight && { color: colors.textSecondary }]}>
          A 12-tree Random Forest classifier traverses a 30-dimensional normalized feature vector directly on your device. Implemented in pure TypeScript, the tree traversal requires <Text style={[styles.highlightText, isLight && { color: colors.primary }]}>zero native dependencies and executes 100% offline</Text> in less than 5 milliseconds.
        </Text>
      </View>

      {/* System Limitations Section */}
      <View style={[styles.card, styles.warningCard, isLight && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
        <Text style={[styles.warningTitle, isLight && { color: '#B45309' }]}>⚠️ Critical System Limitations</Text>
        <Text style={[styles.warningBody, isLight && { color: '#78350F' }]}>
          While UPI QR Verifier catches protocol anomalies and deceptive patterns, you must be aware of physical and systemic limitations:
        </Text>

        <View style={styles.bulletItem}>
          <Text style={[styles.bulletDot, isLight && { color: '#D97706' }]}>•</Text>
          <Text style={[styles.bulletText, isLight && { color: '#78350F' }]}>
            <Text style={[styles.boldText, isLight && { color: '#92400E' }]}>Physical Sticker Tampering:</Text> Criminals sometimes paste legitimate-looking paper QR stickers over a vendor's original counter stand. The QR itself may be syntactically valid while routing money to an unauthorized individual. Always physically inspect counter QR stands.
          </Text>
        </View>

        <View style={styles.bulletItem}>
          <Text style={[styles.bulletDot, isLight && { color: '#D97706' }]}>•</Text>
          <Text style={[styles.bulletText, isLight && { color: '#78350F' }]}>
            <Text style={[styles.boldText, isLight && { color: '#92400E' }]}>Zero-Day Scam Accounts:</Text> A freshly opened bank account used by a scammer will have zero prior community reports and valid syntax. The app flags these as "Unverified", requiring your manual verification.
          </Text>
        </View>

        <View style={styles.bulletItem}>
          <Text style={[styles.bulletDot, isLight && { color: '#D97706' }]}>•</Text>
          <Text style={[styles.bulletText, isLight && { color: '#78350F' }]}>
            <Text style={[styles.boldText, isLight && { color: '#92400E' }]}>No Auto-Payment Launch:</Text> This app strictly acts as an independent alert warning. It will NEVER auto-launch banking apps or authorize payments.
          </Text>
        </View>
      </View>

      {/* Real-World QR Standards Support */}
      <View style={[styles.card, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05 }]}>
        <View style={[styles.cardBadge, isLight && { backgroundColor: '#E0F2FE', borderColor: colors.primary }]}>
          <Text style={[styles.badgeText, isLight && { color: colors.primary }]}>STANDARDS</Text>
        </View>
        <Text style={[styles.cardTitle, isLight && { color: colors.textPrimary }]}>Real-World Standees & Formats</Text>
        <Text style={[styles.cardBody, isLight && { color: colors.textSecondary }]}>
          In addition to standard <Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>upi://pay</Text> links, the verifier natively decodes and verifies official <Text style={[styles.highlightText, isLight && { color: colors.primary }]}>BharatQR / EMVCo</Text> merchant standees (Tag-Length-Value format starting with 000201), Android intent links (<Text style={[styles.codeText, isLight && { backgroundColor: '#F1F5F9', color: colors.primary }]}>intent://pay</Text>), and cryptographically signed merchant stickers from PhonePe, Paytm, Google Pay, and Pine Labs.
        </Text>
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
  header: {
    marginBottom: 16
  },
  headerBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.8
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14
  },
  cardBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.6
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8
  },
  cardBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    fontSize: 12
  },
  highlightText: {
    color: '#38BDF8',
    fontWeight: '600'
  },
  warningCard: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)'
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 8
  },
  warningBody: {
    fontSize: 13,
    color: '#FDE68A',
    lineHeight: 18,
    marginBottom: 12
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingRight: 10
  },
  bulletDot: {
    fontSize: 16,
    color: '#F59E0B',
    marginRight: 8,
    lineHeight: 18
  },
  bulletText: {
    fontSize: 12,
    color: '#FDE68A',
    lineHeight: 17,
    flex: 1
  },
  boldText: {
    fontWeight: '700',
    color: '#FEF3C7'
  }
});
