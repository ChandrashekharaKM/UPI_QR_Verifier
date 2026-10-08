import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ReasonItem } from '@upi-verifier/core';
import { COLORS, getSeverityColor } from '../lib/theme';

interface ReasonCardProps {
  reason: ReasonItem;
  rank: number;
}

export const ReasonCard: React.FC<ReasonCardProps> = ({ reason, rank }) => {
  const sevColor = getSeverityColor(reason.severity);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.rankContainer}>
          <Text style={styles.rankText}>#{rank}</Text>
          <Text style={styles.title}>{reason.title}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sevColor }]}>
          <Text style={styles.badgeText}>{reason.severity.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.message}>{reason.message}</Text>

      {reason.evidenceSummary ? (
        <View style={styles.evidenceContainer}>
          <Text style={styles.evidenceLabel}>Evidence:</Text>
          <Text style={styles.evidenceText}>{reason.evidenceSummary}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.impactText}>Impact: +{reason.impact} risk pts</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryLight,
    marginRight: 6
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 8
  },
  evidenceContainer: {
    backgroundColor: COLORS.bgInput,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2
  },
  evidenceText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: COLORS.textSecondary
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  impactText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted
  }
});
