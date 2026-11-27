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
    Platform: { OS: 'ios', select: (objs: Record<string, unknown>) => objs['ios'] ?? objs['default'] },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T): T => s,
      absoluteFillObject: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }
    },
    View: createComp('View'),
    Text: createComp('Text'),
    ScrollView: createComp('ScrollView'),
    Modal: (props: MockProps & { visible?: boolean }) =>
      props.visible ? R.createElement('Modal', props, props.children) : null,
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
      canOpenURL: vi.fn(async () => true),
      openURL: vi.fn(async () => {})
    }
  };
});

// Mock expo-camera
let mockPermissionGranted = true;
vi.mock('expo-camera', () => {
  const R = require('react');
  return {
    useCameraPermissions: () => [{ granted: mockPermissionGranted }, vi.fn()],
    CameraView: (props: any) => R.createElement('CameraView', props)
  };
});

vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: 'success' }
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(),
  getStringAsync: vi.fn(async () => '')
}));

import { HalfScreenCamera } from '../components/HalfScreenCamera';
import { LensScanPromptModal } from '../components/LensScanPromptModal';
import { describeQrIntent, type VerificationResult } from '@upi-verifier/core';

describe('HalfScreenCamera Viewfinder Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionGranted = true;
  });

  it('renders live camera reticle, status HUD pill, and helper text', () => {
    const mockOnDetect = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HalfScreenCamera onQrDetected={mockOnDetect} height={320} />);
    });

    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('LIVE SCANNER');
    expect(texts).toContain('Align payment QR inside frame · Instant prompt');
  });

  it('displays permission grant view when camera access not yet granted', () => {
    mockPermissionGranted = false;
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HalfScreenCamera onQrDetected={vi.fn()} />);
    });

    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('Live Camera Scanner');
    expect(texts).toContain('Enable Camera');
  });

  it('triggers onQrDetected when barcode is scanned by CameraView', () => {
    vi.useFakeTimers();
    const mockOnDetect = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HalfScreenCamera onQrDetected={mockOnDetect} />);
    });

    const root = renderer!.root;
    const cameraView = root.findByType('CameraView' as any);

    act(() => {
      cameraView.props.onBarcodeScanned({ data: 'upi://pay?pa=store@upi' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockOnDetect).toHaveBeenCalledWith('upi://pay?pa=store@upi');
    vi.useRealTimers();
  });
});

describe('LensScanPromptModal Component', () => {
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

  it('renders Google Lens prompt with Safe status, payee details, and 1-tap app launch', async () => {
    const intent = describeQrIntent(mockSafeVerification);
    const mockDismiss = vi.fn();
    const mockViewDetails = vi.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LensScanPromptModal
          visible={true}
          rawPayload={mockSafeVerification.parsed.raw}
          verification={mockSafeVerification}
          intent={intent}
          onDismiss={mockDismiss}
          onViewDetails={mockViewDetails}
        />
      );
    });

    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('VERIFIED SAFE · 0 RISKS');
    expect(texts).toContain('Fresh Provisions');
    expect(texts).toContain('freshmart@okhdfcbank');
    expect(texts).toContain('Scan Another');
    expect(texts).toContain('🔍 Full Analysis');
  });
});
