import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.bgPrimary} />
      <View style={styles.appShell}>
        <View style={styles.responsiveWrapper}>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: COLORS.bgPrimary
              },
              headerTintColor: COLORS.textPrimary,
              headerTitleStyle: {
                fontWeight: '700',
                fontSize: 17,
                color: COLORS.textPrimary
              },
              contentStyle: {
                backgroundColor: COLORS.bgPrimary
              },
              headerShadowVisible: false
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                title: 'UPI QR Verifier',
                headerTitle: 'Payment QR Code Alert System'
              }}
            />
            <Stack.Screen
              name="scan"
              options={{
                title: 'Scan Payment QR',
                headerBackTitle: 'Back'
              }}
            />
            <Stack.Screen
              name="upload"
              options={{
                title: 'Upload QR Image',
                headerBackTitle: 'Back'
              }}
            />
            <Stack.Screen
              name="result"
              options={{
                title: 'Verification Result',
                headerBackTitle: 'Home'
              }}
            />
            <Stack.Screen
              name="history"
              options={{
                title: 'Scan History',
                headerBackTitle: 'Back'
              }}
            />
            <Stack.Screen
              name="report"
              options={{
                title: 'Report Scam UPI ID',
                headerBackTitle: 'Back'
              }}
            />
            <Stack.Screen
              name="about"
              options={{
                title: 'How It Works & Limitations',
                headerBackTitle: 'Back'
              }}
            />
          </Stack>
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
    borderColor: 'rgba(255, 255, 255, 0.08)'
  }
});
