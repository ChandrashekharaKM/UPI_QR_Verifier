import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import type { VerificationResult } from '@upi-verifier/core';
import { COLORS, getRiskColor, getRiskBgColor } from '../lib/theme';
import {
  getScanHistory,
  deleteScanFromHistory,
  clearScanHistory
} from '../lib/storage';

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<VerificationResult[]>([]);

  const loadHistory = async () => {
    const list = await getScanHistory();
    setHistory(list);
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const handleDeleteItem = async (evaluatedAt: string) => {
    await deleteScanFromHistory(evaluatedAt);
    void loadHistory();
  };

  const handleClearAll = () => {
    const performClear = async () => {
      await clearScanHistory();
      setHistory([]);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Clear all local scan history?')) {
        void performClear();
      }
    } else {
      Alert.alert(
        'Clear History',
        'Are you sure you want to delete all saved scan logs from this device?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: () => void performClear() }
        ]
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Scan Audit Log</Text>
          <Text style={styles.subtitle}>
            {history.length} {history.length === 1 ? 'record' : 'records'} stored locally on device
          </Text>
        </View>

        {history.length > 0 ? (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
            <Text style={styles.clearBtnText}>Clear All</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Scan History</Text>
          <Text style={styles.emptyText}>
            Scans you inspect will appear here. No personal payment data leaves your device.
          </Text>
        </View>
      ) : (
        history.map((item) => {
          const riskColor = getRiskColor(item.category);
          const riskBg = getRiskBgColor(item.category);

          const title =
            item.parsed.kind === 'upi' && item.parsed.fields.kind === 'upi'
              ? item.parsed.fields.upi.pa
              : item.parsed.rawPayload;

          const declaredName =
            item.parsed.kind === 'upi' && item.parsed.fields.kind === 'upi'
              ? item.parsed.fields.upi.pn
              : undefined;

          return (
            <View key={item.evaluatedAt} style={styles.itemCard}>
              <TouchableOpacity
                style={styles.itemMain}
                activeOpacity={0.7}
                onPress={() => {
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: item.parsed.rawPayload }
                  });
                }}
              >
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {declaredName ? (
                    <Text style={styles.itemName} numberOfLines={1}>
                      {declaredName}
                    </Text>
                  ) : null}
                  <Text style={styles.itemDate}>
                    {new Date(item.evaluatedAt).toLocaleDateString()} at{' '}
                    {new Date(item.evaluatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    · {item.reasons.length} risk flags
                  </Text>
                </View>

                <View style={[styles.badge, { backgroundColor: riskBg, borderColor: riskColor }]}>
                  <Text style={[styles.scoreText, { color: riskColor }]}>{item.score}</Text>
                  <Text style={[styles.categoryText, { color: riskColor }]}>{item.category}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => void handleDeleteItem(item.evaluatedAt)}
              >
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  clearBtnText: {
    color: COLORS.highRisk,
    fontSize: 12,
    fontWeight: '700'
  },
  emptyCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 24
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18
  },
  itemCard: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden'
  },
  itemMain: {
    flex: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  itemInfo: {
    flex: 1,
    marginRight: 12
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2
  },
  itemName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4
  },
  itemDate: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center'
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '800'
  },
  categoryText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  deleteBtn: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.borderLight
  },
  deleteBtnText: {
    fontSize: 16
  }
});
