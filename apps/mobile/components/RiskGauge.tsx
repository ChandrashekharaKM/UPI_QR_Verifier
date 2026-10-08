import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RiskCategory } from '@upi-verifier/core';
import { getRiskColor, getRiskBgColor, COLORS } from '../lib/theme';

interface RiskGaugeProps {
  score: number;
  category: RiskCategory;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({ score, category }) => {
  const riskColor = getRiskColor(category);
  const riskBg = getRiskBgColor(category);

  const getCategoryLabel = () => {
    switch (category) {
      case 'SAFE':
        return 'SAFE (Low Risk)';
      case 'SUSPICIOUS':
        return 'SUSPICIOUS (Exercise Caution)';
      case 'HIGH_RISK':
        return 'HIGH RISK (Scam Alert)';
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.outerRing, { borderColor: riskColor, backgroundColor: riskBg }]}>
        <View style={styles.innerCircle}>
          <Text style={[styles.scoreText, { color: riskColor }]}>{score}</Text>
          <Text style={styles.scoreScale}>/ 100</Text>
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: riskColor }]}>
        <Text style={styles.badgeText}>{getCategoryLabel()}</Text>
      </View>
      <Text style={styles.scaleHelper}>0 = Minimal Risk Indicators · 100 = Severe Fraud Indicators</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16
  },
  outerRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8
  },
  innerCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scoreText: {
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1
  },
  scoreScale: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: -4
  },
  badge: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  scaleHelper: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center'
  }
});
