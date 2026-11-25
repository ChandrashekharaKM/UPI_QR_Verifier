import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../lib/theme';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title Header */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>ARCHITECTURE & SPECS</Text>
        </View>
        <Text style={styles.title}>Payment QR Code Alert System</Text>
        <Text style={styles.subtitle}>
          How UPI QR Verifier analyzes transactions to keep you safe from digital payment fraud before you pay.
        </Text>
      </View>

      <DisclaimerBanner />

      {/* Layer 1: Protocol & Scheme Analysis */}
      <View style={styles.card}>
        <View style={styles.cardBadge}>
          <Text style={styles.badgeText}>LAYER 1</Text>
        </View>
        <Text style={styles.cardTitle}>Protocol & Scheme Inspection</Text>
        <Text style={styles.cardBody}>
          Official UPI QR codes must use the standard <Text style={styles.codeText}>upi://pay</Text> URI scheme. Attackers frequently substitute web links (<Text style={styles.codeText}>http://</Text>), raw server IP addresses, or shortened URLs (<Text style={styles.codeText}>bit.ly</Text>) that redirect victims to credential-harvesting phishing portals or malicious APK downloads.
        </Text>
      </View>

      {/* Layer 2: NPCI Banking Allowlist & Entropy */}
      <View style={styles.card}>
        <View style={styles.cardBadge}>
          <Text style={styles.badgeText}>LAYER 2</Text>
        </View>
        <Text style={styles.cardTitle}>NPCI Banking Allowlist & Entropy</Text>
        <Text style={styles.cardBody}>
          The app validates payment handles against an official NPCI allowlist of authorized bank PSP suffixes (<Text style={styles.codeText}>@oksbi</Text>, <Text style={styles.codeText}>@okhdfcbank</Text>, <Text style={styles.codeText}>@paytm</Text>, etc.). It computes the <Text style={styles.highlightText}>Shannon Entropy</Text> of usernames to detect machine-generated disposable routing addresses and screens for bank or customer care impersonation keywords.
        </Text>
      </View>

      {/* Layer 3: Identity Cross-Validation */}
      <View style={styles.card}>
        <View style={styles.cardBadge}>
          <Text style={styles.badgeText}>LAYER 3</Text>
        </View>
        <Text style={styles.cardTitle}>Identity Cross-Validation</Text>
        <Text style={styles.cardBody}>
          Using <Text style={styles.highlightText}>Jaro-Winkler lexical distance</Text>, the engine compares the displayed Payee Name (<Text style={styles.codeText}>pn</Text>) with the underlying UPI handle. When a QR claims to be "State Electricity Board" but routes to an unrelated individual, this discrepancy is immediately flagged.
        </Text>
      </View>

      {/* Layer 4: On-Device Random Forest ML */}
      <View style={styles.card}>
        <View style={styles.cardBadge}>
          <Text style={styles.badgeText}>LAYER 4</Text>
        </View>
        <Text style={styles.cardTitle}>On-Device Random Forest Inference</Text>
        <Text style={styles.cardBody}>
          A 12-tree Random Forest classifier traverses a 30-dimensional normalized feature vector directly on your device. Implemented in pure TypeScript, the tree traversal requires <Text style={styles.highlightText}>zero native dependencies and executes 100% offline</Text> in less than 5 milliseconds.
        </Text>
      </View>

      {/* System Limitations Section */}
      <View style={[styles.card, styles.warningCard]}>
        <Text style={styles.warningTitle}>⚠️ Critical System Limitations</Text>
        <Text style={styles.warningBody}>
          While UPI QR Verifier catches protocol anomalies and deceptive patterns, you must be aware of physical and systemic limitations:
        </Text>

        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>Physical Sticker Tampering:</Text> Criminals sometimes paste legitimate-looking paper QR stickers over a vendor's original counter stand. The QR itself may be syntactically valid while routing money to an unauthorized individual. Always physically inspect counter QR stands.
          </Text>
        </View>

        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>Zero-Day Scam Accounts:</Text> A freshly opened bank account used by a scammer will have zero prior community reports and valid syntax. The app flags these as "Unverified", requiring your manual verification.
          </Text>
        </View>

        <View style={styles.bulletItem}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.boldText}>No Auto-Payment Launch:</Text> This app strictly acts as an independent alert warning. It will NEVER auto-launch banking apps or authorize payments.
          </Text>
        </View>
      </View>

      {/* Real-World QR Standards Support */}
      <View style={styles.card}>
        <View style={styles.cardBadge}>
          <Text style={styles.badgeText}>STANDARDS</Text>
        </View>
        <Text style={styles.cardTitle}>Real-World Standees & Formats</Text>
        <Text style={styles.cardBody}>
          In addition to standard <Text style={styles.codeText}>upi://pay</Text> links, the verifier natively decodes and verifies official <Text style={styles.highlightText}>BharatQR / EMVCo</Text> merchant standees (Tag-Length-Value format starting with 000201), Android intent links (<Text style={styles.codeText}>intent://pay</Text>), and cryptographically signed merchant stickers from PhonePe, Paytm, Google Pay, and Pine Labs.
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
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2
  },
  cardBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 10
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8
  },
  cardBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20
  },
  codeText: {
    color: '#38BDF8',
    fontFamily: 'monospace',
    fontWeight: '700'
  },
  highlightText: {
    color: '#F8FAFC',
    fontWeight: '700'
  },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1.5
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 8
  },
  warningBody: {
    fontSize: 13,
    color: '#FECACA',
    lineHeight: 19,
    marginBottom: 12
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  bulletDot: {
    fontSize: 14,
    color: '#F87171',
    marginRight: 8,
    marginTop: 1
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 18
  },
  boldText: {
    fontWeight: '700',
    color: '#FFFFFF'
  }
});
