import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RiskCategory } from '@upi-verifier/core';
import { getRiskColor, getRiskBgColor, COLORS } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';

interface RiskGaugeProps {
  score: number;
  category: RiskCategory;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({ score, category }) => {
  const { colors, isLight } = useTheme();
  const riskColor = getRiskColor(category, colors);
  const riskBg = getRiskBgColor(category, colors);

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

  const getCategorySubtitle = () => {
    switch (category) {
      case 'SAFE':
        return 'Standard Protocol Verified · No Active Warnings';
      case 'SUSPICIOUS':
        return 'Heuristic Irregularities · Manual Verification Needed';
      case 'HIGH_RISK':
        return 'Critical Fraud / Impersonation Indicators Detected';
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.outerGlow, { backgroundColor: riskBg, borderColor: riskColor }]}>
        <View style={[styles.ringTrack, { borderColor: riskColor }, isLight && { backgroundColor: '#F8FAFC' }]}>
          <View style={[styles.innerDial, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <Text style={[styles.scoreNumber, { color: riskColor }]}>{score}</Text>
            <Text style={[styles.scoreScale, isLight && { color: '#64748B' }]}>/ 100</Text>
            <Text style={[styles.scoreLabel, isLight && { color: '#475569' }]}>RISK INDEX</Text>
          </View>
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: riskColor }]}>
        <Text style={styles.badgeText}>{getCategoryLabel()}</Text>
      </View>

      <Text style={[styles.categorySubtext, isLight && { color: '#334155' }]}>{getCategorySubtitle()}</Text>
      <Text style={[styles.scaleHelper, isLight && { color: '#64748B' }]}>0 = Minimal Risk Indicators · 100 = Severe Fraud Indicators</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 18
  },
  outerGlow: {
    padding: 6,
    borderRadius: 95,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10
  },
  ringTrack: {
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgCardElevated
  },
  innerDial: {
    width: 134,
    height: 134,
    borderRadius: 67,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)'
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 56
  },
  scoreScale: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: -2
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    marginTop: 2
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.6,
    textAlign: 'center'
  },
  categorySubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center'
  },
  scaleHelper: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center'
  }
});
