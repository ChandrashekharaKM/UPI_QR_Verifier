import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../lib/theme';
import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0B0F19" />
      <View style={styles.appShell}>
        <View style={styles.responsiveWrapper}>
          <AppHeader />
          <View style={styles.stackWrapper}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: COLORS.bgPrimary
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: '#060911',
    alignItems: 'center'
  },
  responsiveWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 620 : '100%',
    backgroundColor: COLORS.bgPrimary,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'column'
  },
  stackWrapper: {
    flex: 1,
    width: '100%'
  }
});
