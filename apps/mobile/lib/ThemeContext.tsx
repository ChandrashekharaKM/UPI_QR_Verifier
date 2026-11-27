import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { DARK_COLORS, LIGHT_COLORS, type ThemeColors } from './theme';

export type ThemeMode = 'dark' | 'light';

export interface ThemeContextValue {
  themeMode: ThemeMode;
  isLight: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = '@upi_verifier_theme_mode_v1';

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'dark',
  isLight: false,
  colors: DARK_COLORS,
  toggleTheme: () => {},
  setThemeMode: () => {}
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeState] = useState<ThemeMode>('dark');

  // Load saved theme from storage
  useEffect(() => {
    let isMounted = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (isMounted && (saved === 'light' || saved === 'dark')) {
        setThemeState(saved);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    if (Platform.OS !== 'web') {
      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // Haptics might fail in test/mock environments
      }
    }
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const isLight = themeMode === 'light';
  const colors: ThemeColors = isLight ? LIGHT_COLORS : DARK_COLORS;

  // Web background sync
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        document.documentElement.setAttribute('data-theme', themeMode);
        if (document.body) {
          document.body.style.backgroundColor = colors.appShellBg;
          document.body.style.color = colors.textPrimary;
        }
        let styleTag = document.getElementById('upi-verifier-theme-styles') as HTMLStyleElement | null;
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'upi-verifier-theme-styles';
          document.head.appendChild(styleTag);
        }
        if (isLight) {
          styleTag.textContent = `
            html, body {
              background-color: ${colors.appShellBg} !important;
              color: ${colors.textPrimary} !important;
            }
            input, textarea {
              color-scheme: light;
            }
          `;
        } else {
          styleTag.textContent = `
            html, body {
              background-color: ${colors.appShellBg} !important;
              color: ${colors.textPrimary} !important;
            }
            input, textarea {
              color-scheme: dark;
            }
          `;
        }
      } catch {
        // Ignore DOM errors if running in non-browser environment
      }
    }
  }, [themeMode, isLight, colors]);

  const value: ThemeContextValue = {
    themeMode,
    isLight,
    colors,
    toggleTheme,
    setThemeMode
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
