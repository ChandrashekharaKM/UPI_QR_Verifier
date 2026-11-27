import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/ThemeContext';

export function AppHeader() {
  const { colors, isLight, toggleTheme } = useTheme();

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
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: colors.headerBg,
          borderBottomColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
          paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 10)
        }
      ]}
    >
      <View style={styles.headerContent}>
        {isHome ? (
          /* Home Screen Header: QR Code Brand & Title */
          <View style={styles.brandRow}>
            <View
              style={[
                styles.qrBadge,
                isLight && {
                  backgroundColor: '#E0F2FE',
                  borderColor: colors.primary
                }
              ]}
            >
              <Text style={[styles.qrIcon, isLight && { color: colors.primary }]}>⛶</Text>
            </View>
            <View style={styles.brandTextGroup}>
              <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>UPI QR VERIFIER</Text>
              <Text style={[styles.brandSubtitle, { color: colors.primary }]}>OFFLINE FRAUD DEFENSE</Text>
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
              <Text style={[styles.backChevron, { color: colors.primary }]}>‹</Text>
              <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {getScreenTitle(pathname)}
            </Text>
          </View>
        )}

        {/* Universal Privacy & Offline Status Pill (Tap 100 to toggle White Theme) */}
        <TouchableOpacity
          style={[
            styles.offlinePill,
            isLight && styles.offlinePillLight
          ]}
          activeOpacity={0.7}
          onPress={toggleTheme}
          accessibilityLabel="Toggle White Theme"
          accessibilityRole="button"
        >
          <View style={[styles.pulseDot, isLight && styles.pulseDotLight]} />
          <Text style={[styles.offlineText, isLight && styles.offlineTextLight]}>
            {isLight ? (isHome ? '100% ☀️ WHITE' : '☀️ WHITE') : (isHome ? '100% OFFLINE' : 'OFFLINE')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
  qrBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrIcon: {
    fontSize: 20,
    color: '#38BDF8',
    fontWeight: '800'
  },
  brandTextGroup: {
    flexDirection: 'column'
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '700',
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
    fontWeight: '300',
    marginRight: 2
  },
  backText: {
    fontSize: 14,
    fontWeight: '600'
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '700',
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
  offlinePillLight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981'
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981'
  },
  pulseDotLight: {
    backgroundColor: '#059669'
  },
  offlineText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.4
  },
  offlineTextLight: {
    color: '#059669'
  }
});
