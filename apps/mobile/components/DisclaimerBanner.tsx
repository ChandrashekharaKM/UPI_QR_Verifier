import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../lib/theme';

interface DisclaimerBannerProps {
  customText?: string;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ customText }) => {
  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>⚠️</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title}>RISK-WARNING ADVISORY ONLY</Text>
        <Text style={styles.body}>
          {customText ??
            'This tool provides heuristic risk estimation before payment. It is NEVER a guarantee of safety. Always confirm the receiver identity independently before authorizing any UPI payment.'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#D97706',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12
  },
  icon: {
    fontSize: 20,
    marginRight: 10,
    marginTop: 2
  },
  textContainer: {
    flex: 1
  },
  title: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  body: {
    color: '#FEF3C7',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  }
});
