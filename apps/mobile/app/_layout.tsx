import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';

function RootLayoutContent() {
  const { colors, isLight } = useTheme();

  return (
    <>
      <StatusBar
        style={isLight ? 'dark' : 'light'}
        backgroundColor={colors.headerBg}
      />
      <View style={[styles.appShell, { backgroundColor: colors.appShellBg }]}>
        <View
          style={[
            styles.responsiveWrapper,
            {
              backgroundColor: colors.bgPrimary,
              borderLeftColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
              borderRightColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)'
            }
          ]}
        >
          <AppHeader />
          <View style={styles.stackWrapper}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: colors.bgPrimary
                },
                animation: 'fade'
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="scan" />
              <Stack.Screen name="upload" />
              <Stack.Screen name="result" />
              <Stack.Screen name="history" />
              <Stack.Screen name="report" />
              <Stack.Screen name="about" />
            </Stack>
          </View>
          <AppFooter />
        </View>
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootLayoutContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    alignItems: 'center'
  },
  responsiveWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 620 : '100%',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    flexDirection: 'column'
  },
  stackWrapper: {
    flex: 1,
    width: '100%'
  }
});
