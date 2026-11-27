import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// Mock react-native
vi.mock('react-native', () => {
  const R = require('react');
  interface MockProps {
    children?: React.ReactNode;
    [key: string]: unknown;
  }
  const createComp = (name: string) => {
    const Comp = ({ children, ...rest }: MockProps) => {
      const childrenArray = children === undefined ? [] : Array.isArray(children) ? children : [children];
      return R.createElement(name, rest, ...childrenArray);
    };
    Comp.displayName = name;
    return Comp;
  };
  return {
    Platform: { OS: 'android', select: (objs: Record<string, unknown>) => objs['android'] ?? objs['default'] },
    StyleSheet: { create: <T extends Record<string, unknown>>(s: T): T => s },
    View: createComp('View'),
    Text: createComp('Text'),
    ActivityIndicator: createComp('ActivityIndicator'),
    TouchableOpacity: (props: MockProps & { onPress?: () => void }) => {
      const { children, ...rest } = props || {};
      const childrenArray = children === undefined ? [] : Array.isArray(children) ? children : [children];
      return R.createElement(
        'TouchableOpacity',
        {
          ...rest,
          onClick: props?.onPress,
          onPress: props?.onPress
        },
        ...childrenArray
      );
    },
    Linking: {
      canOpenURL: vi.fn(async (url: string) => {
        // Mock Google Pay and PhonePe as installed
        return url.startsWith('tez://') || url.startsWith('phonepe://') || url.startsWith('upi://');
      }),
      openURL: vi.fn(async () => {})
    }
  };
});

vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: 'success' }
}));

import { Linking } from 'react-native';
import {
  buildUpiPaymentUri,
  detectAvailablePaymentApps,
  launchPaymentApp
} from '../lib/payment-apps';
import { PaymentAppPrompt } from '../components/PaymentAppPrompt';
import type { VerificationResult } from '@upi-verifier/core';

describe('Payment Apps Utility & Launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes deep link and raw UPI payloads into standard upi:// URIs', () => {
    expect(buildUpiPaymentUri('upi://pay?pa=store@upi&pn=Store')).toBe('upi://pay?pa=store@upi&pn=Store');
    expect(buildUpiPaymentUri('phonepe://pay?pa=store@ybl&pn=Merchant')).toBe('upi://pay?pa=store@ybl&pn=Merchant');
    expect(buildUpiPaymentUri('paytmmp://pay?pa=paytm@paytm&pn=Store')).toBe('upi://pay?pa=paytm@paytm&pn=Store');
  });

  it('detects available installed apps based on Linking.canOpenURL', async () => {
    const apps = await detectAvailablePaymentApps('upi://pay?pa=fresh@hdfc&pn=FreshMart&am=100');
    expect(apps.length).toBe(6);

    const gpay = apps.find((a) => a.id === 'gpay');
    const phonepe = apps.find((a) => a.id === 'phonepe');
    const paytm = apps.find((a) => a.id === 'paytm');

    expect(gpay?.isAvailable).toBe(true);
    expect(phonepe?.isAvailable).toBe(true);
    expect(paytm?.isAvailable).toBe(false);
  });

  it('launches payment app and falls back to universal UPI URI if needed', async () => {
    const res = await launchPaymentApp(
      'tez://upi/pay?pa=merchant@upi&am=100',
      'upi://pay?pa=merchant@upi&am=100',
      'Google Pay'
    );
    expect(res.success).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('tez://upi/pay?pa=merchant@upi&am=100');
  });
});

describe('PaymentAppPrompt Component', () => {
  const mockSafeVerification: VerificationResult = {
    score: 10,
    category: 'SAFE',
    confidenceNote: 'Format and PSP handle clean',
    disclaimer: 'Format verified offline',
    reasons: [],
    scoreBreakdown: { ruleScore: 10, mlProbability: 0.05 },
    modelVersion: '1.0.0',
    evaluatedAt: new Date().toISOString(),
    parsed: {
      raw: 'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Provisions&am=150.00&cu=INR&mc=5411',
      kind: 'upi',
      originalScheme: 'upi',
      fields: {
        kind: 'upi',
        upi: {
          pa: 'freshmart@okhdfcbank',
          pn: 'Fresh Provisions',
          am: '150.00',
          cu: 'INR',
          mc: '5411'
        }
      }
    }
  };

  it('renders safe prompt with payee name, UPI ID, and amount', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PaymentAppPrompt
          rawPayload={mockSafeVerification.parsed.raw}
          verification={mockSafeVerification}
        />
      );
    });

    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('Proceed to Pay');
    expect(texts).toContain('Fresh Provisions');
    expect(texts).toContain('freshmart@okhdfcbank');
    expect(texts).toContain('₹150.00');
  });

  it('prompts user and launches selected app when pressed', async () => {
    const mockInitiate = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PaymentAppPrompt
          rawPayload={mockSafeVerification.parsed.raw}
          verification={mockSafeVerification}
          onPaymentInitiated={mockInitiate}
        />
      );
    });

    const root = renderer!.root;
    const gpayBtn = root.findByProps({ accessibilityLabel: 'Pay with Google Pay' });

    await act(async () => {
      gpayBtn.props.onPress();
    });

    expect(mockInitiate).toHaveBeenCalledWith('Google Pay');
    expect(Linking.openURL).toHaveBeenCalled();
  });
});
