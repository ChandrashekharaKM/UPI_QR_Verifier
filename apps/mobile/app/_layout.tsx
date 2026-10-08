import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../lib/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bgPrimary} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.bgPrimary
          },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 17
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
    </>
  );
}
