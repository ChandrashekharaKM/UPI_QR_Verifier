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
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>#{rank}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {reason.title}
          </Text>
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
    borderColor: COLORS.borderCard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  rankBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)'
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryLight
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
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5
  },
  message: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 10
  },
  evidenceContainer: {
    backgroundColor: COLORS.bgInput,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primaryLight
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryLight,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  evidenceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 17
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8
  },
  impactText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600'
  }
});
