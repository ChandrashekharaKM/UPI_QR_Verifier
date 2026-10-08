import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../lib/theme';

export interface SafetyTip {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export const SAFETY_TIPS: SafetyTip[] = [
  {
    id: 'tip-1',
    icon: '🛡️',
    title: 'UPI PIN is ONLY for Paying',
    description: 'You NEVER need to enter your UPI PIN or scan a QR code to receive money. Any request claiming you must scan to get a refund is a scam.'
  },
  {
    id: 'tip-2',
    icon: '🔍',
    title: 'Inspect Payee Identity',
    description: 'Fraudsters often display trusted names like "Electricity Dept" while routing payments to personal accounts. Always verify the VPA suffix.'
  },
  {
    id: 'tip-3',
    icon: '🔗',
    title: 'Beware of Web Links in QR',
    description: 'A payment QR code should always open directly with upi://. If a QR takes you to a browser page (especially shortened URLs), do not proceed.'
  },
  {
    id: 'tip-4',
    icon: '🏷️',
    title: 'Physical Sticker Swapping',
    description: 'Check physical QR stands at shops. Criminals stick their own fraudulent QR stickers over legitimate shopkeeper codes.'
  }
];

export const SafetyTipCard: React.FC<{ tip: SafetyTip }> = ({ tip }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{tip.icon}</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{tip.title}</Text>
        <Text style={styles.desc}>{tip.description}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  icon: {
    fontSize: 24,
    marginRight: 14,
    marginTop: 2
  },
  content: {
    flex: 1
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  desc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18
  }
});
