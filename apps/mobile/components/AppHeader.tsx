import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../lib/theme';

export function AppHeader() {
  let pathname = '/';
  try {
    pathname = usePathname() || '/';
  } catch {
    pathname = '/';
  }

  let router: any;
  try {
    router = useRouter();
  } catch {
    router = { push: () => {}, back: () => {}, replace: () => {}, canGoBack: () => false };
  }

  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch {
    insets = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const isHome = pathname === '/' || pathname === '/index';

  const getScreenTitle = (path: string): string => {
    if (path.startsWith('/scan')) return 'Scan Payment QR';
    if (path.startsWith('/upload')) return 'Upload QR Image';
    if (path.startsWith('/result')) return 'Verification Result';
    if (path.startsWith('/history')) return 'Scan History';
    if (path.startsWith('/report')) return 'Report Scam VPA';
    if (path.startsWith('/about')) return 'Security & Rules';
    return 'UPI QR Verifier';
  };

  const handleBack = () => {
    if (router && typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 10) }]}>
      <View style={styles.headerContent}>
        {isHome ? (
          /* Home Screen Header: Brand Shield & Title */
          <View style={styles.brandRow}>
            <View style={styles.shieldBadge}>
              <Text style={styles.shieldIcon}>🛡️</Text>
            </View>
            <View style={styles.brandTextGroup}>
              <Text style={styles.brandTitle}>UPI SHIELD</Text>
              <Text style={styles.brandSubtitle}>OFFLINE QR VERIFIER</Text>
            </View>
          </View>
        ) : (
          /* Inner Screens: Back Navigation Button & Title */
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.7}
              onPress={handleBack}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Text style={styles.backChevron}>‹</Text>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle} numberOfLines={1}>
              {getScreenTitle(pathname)}
            </Text>
          </View>
        )}

        {/* Universal Privacy & Offline Status Pill */}
        <View style={styles.offlinePill}>
          <View style={styles.pulseDot} />
          <Text style={styles.offlineText}>
            {isHome ? '100% OFFLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#0B0F19',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  shieldBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shieldIcon: {
    fontSize: 18
  },
  brandTextGroup: {
    flexDirection: 'column'
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.6
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.8
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 10
  },
  backChevron: {
    fontSize: 24,
    lineHeight: 24,
    color: '#38BDF8',
    fontWeight: '300',
    marginRight: 2
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8'
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    flexShrink: 1
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981'
  },
  offlineText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.4
  }
});
