import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../lib/theme';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  isHero?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: '🏠', path: '/' },
  { id: 'upload', label: 'Upload', icon: '🖼️', path: '/upload' },
  { id: 'scan', label: 'Scan', icon: '📷', path: '/scan', isHero: true },
  { id: 'history', label: 'History', icon: '🕒', path: '/history' },
  { id: 'about', label: 'About', icon: 'ℹ️', path: '/about' }
];

export function AppFooter() {
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
    router = { push: () => {}, back: () => {}, replace: () => {} };
  }

  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch {
    insets = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const isCurrentActive = (itemPath: string) => {
    if (itemPath === '/') {
      return pathname === '/' || pathname === '/index';
    }
    return pathname.startsWith(itemPath);
  };

  const handleNav = (itemPath: string) => {
    if (isCurrentActive(itemPath)) return;
    if (router && typeof router.push === 'function') {
      router.push(itemPath);
    }
  };

  return (
    <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8) }]}>
      <View style={styles.navRow}>
        {NAV_ITEMS.map((item) => {
          const active = isCurrentActive(item.path);

          if (item.isHero) {
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.heroTabContainer}
                activeOpacity={0.85}
                onPress={() => handleNav(item.path)}
                accessibilityLabel={`${item.label} tab`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.heroButtonCircle, active && styles.heroButtonActive]}>
                  <Text style={styles.heroIcon}>{item.icon}</Text>
                </View>
                <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelHero]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.tabItem}
              activeOpacity={0.7}
              onPress={() => handleNav(item.path)}
              accessibilityLabel={`${item.label} tab`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.iconContainer, active && styles.iconContainerActive]}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>
                  {item.icon}
                </Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    backgroundColor: '#0B0F19',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 6,
    paddingHorizontal: 8,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4
  },
  iconContainer: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconContainerActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)'
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.75
  },
  tabIconActive: {
    opacity: 1
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    letterSpacing: 0.2
  },
  tabLabelActive: {
    color: '#38BDF8',
    fontWeight: '700'
  },
  tabLabelHero: {
    color: '#94A3B8',
    fontWeight: '600'
  },
  heroTabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16
  },
  heroButtonCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6
  },
  heroButtonActive: {
    backgroundColor: '#0284C7',
    borderColor: '#7DD3FC'
  },
  heroIcon: {
    fontSize: 22
  }
});
