import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput
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
  const [searchQuery, setSearchQuery] = useState('');

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
      if (window.confirm('Clear all local scan history from this device?')) {
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

  const filteredHistory = history.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const raw = item.parsed.rawPayload.toLowerCase();
    const isUpi =
      (item.parsed.kind === 'upi' || item.parsed.kind === 'emv') &&
      (item.parsed.fields.kind === 'upi' || item.parsed.fields.kind === 'emv');
    const pa = isUpi ? item.parsed.fields.upi.pa.toLowerCase() : '';
    const pn = isUpi && item.parsed.fields.upi.pn ? item.parsed.fields.upi.pn.toLowerCase() : '';
    return raw.includes(q) || pa.includes(q) || pn.includes(q);
  });

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
          <TouchableOpacity style={styles.clearBtn} activeOpacity={0.8} onPress={handleClearAll}>
            <Text style={styles.clearBtnText}>Clear All</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {history.length > 0 ? (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by Payee, VPA, or text..."
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
      ) : null}

      {history.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>📋</Text>
          </View>
          <Text style={styles.emptyTitle}>No Scan Records</Text>
          <Text style={styles.emptyText}>
            Scans you inspect will appear here. No personal payment data or logs ever leave your device.
          </Text>
        </View>
      ) : filteredHistory.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Matching Scans</Text>
          <Text style={styles.emptyText}>No inspection history matches "{searchQuery}".</Text>
        </View>
      ) : (
        filteredHistory.map((item) => {
          const riskColor = getRiskColor(item.category);
          const riskBg = getRiskBgColor(item.category);

          const isUpiOrEmv =
            (item.parsed.kind === 'upi' || item.parsed.kind === 'emv') &&
            (item.parsed.fields.kind === 'upi' || item.parsed.fields.kind === 'emv');

          const title = isUpiOrEmv ? item.parsed.fields.upi.pa : item.parsed.rawPayload;
          const declaredName = isUpiOrEmv ? item.parsed.fields.upi.pn : undefined;
          const amount = isUpiOrEmv && item.parsed.fields.upi.am ? `₹${item.parsed.fields.upi.am}` : null;

          return (
            <View key={item.evaluatedAt} style={styles.itemCard}>
              <TouchableOpacity
                style={styles.itemMain}
                activeOpacity={0.75}
                onPress={() => {
                  router.push({
                    pathname: '/result',
                    params: { rawPayload: item.parsed.rawPayload }
                  });
                }}
              >
                <View style={styles.itemInfo}>
                  <View style={styles.itemBadgeRow}>
                    <View style={[styles.badge, { backgroundColor: riskBg, borderColor: riskColor }]}>
                      <Text style={[styles.badgeScore, { color: riskColor }]}>{item.score}</Text>
                      <Text style={[styles.badgeCategory, { color: riskColor }]}>{item.category}</Text>
                    </View>
                    {amount ? (
                      <View style={styles.amountPill}>
                        <Text style={styles.amountPillText}>{amount}</Text>
                      </View>
                    ) : null}
                  </View>

                  {declaredName ? (
                    <Text style={styles.itemName} numberOfLines={1}>
                      {declaredName}
                    </Text>
                  ) : null}

                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {title}
                  </Text>

                  <Text style={styles.itemDate}>
                    {new Date(item.evaluatedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric'
                    })}{' '}
                    at{' '}
                    {new Date(item.evaluatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    · {item.reasons.length} flags
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => void handleDeleteItem(item.evaluatedAt)}
              >
                <Text style={styles.deleteIcon}>✕</Text>
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
    padding: 18,
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
    color: COLORS.textPrimary,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700'
  },
  searchRow: {
    marginBottom: 14
  },
  searchInput: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textPrimary
  },
  emptyCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    marginVertical: 20
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.bgCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  emptyIcon: {
    fontSize: 30
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280
  },
  itemCard: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2
  },
  itemMain: {
    flex: 1,
    padding: 14
  },
  itemInfo: {
    gap: 4
  },
  itemBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  badgeScore: {
    fontSize: 12,
    fontWeight: '900'
  },
  badgeCategory: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  amountPill: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  amountPillText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800'
  },
  itemName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  itemDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2
  },
  deleteBtn: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  deleteIcon: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '700'
  }
});
