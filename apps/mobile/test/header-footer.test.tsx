import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// Mock react-native primitives
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
    StyleSheet: { create: <T extends Record<string, unknown>>(s: T): T => s },
    View: createComp('View'),
    Text: createComp('Text'),
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
    }
  };
});

// Mock expo-haptics
vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' }
}));

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => store[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete store[key];
      }),
      clear: vi.fn(async () => {
        store = {};
      })
    }
  };
});

// Mock react-native-safe-area-context
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
}));

// Mock expo-router
const mockPush = vi.fn();
const mockBack = vi.fn();
const mockReplace = vi.fn();
let currentPathname = '/';

vi.mock('expo-router', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true
  })
}));

import { AppHeader } from '../components/AppHeader';
import { AppFooter } from '../components/AppFooter';
import { ThemeProvider } from '../lib/ThemeContext';

describe('AppHeader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = '/';
  });

  it('renders branding title and 100% OFFLINE badge on home screen', () => {
    currentPathname = '/';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppHeader />);
    });
    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('UPI QR VERIFIER');
    expect(texts).toContain('OFFLINE FRAUD DEFENSE');
    expect(texts).toContain('100% OFFLINE');
    expect(texts).toContain('⛶');
  });

  it('renders back navigation button and screen title on inner screens', () => {
    currentPathname = '/scan';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppHeader />);
    });
    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('Back');
    expect(texts).toContain('Scan Payment QR');
    expect(texts).toContain('OFFLINE');

    // Test back button press
    const backBtn = root.findByProps({ accessibilityLabel: 'Go back' });
    act(() => {
      backBtn.props.onPress();
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders correct titles for all sub-routes', () => {
    const routes = [
      { path: '/upload', title: 'Upload QR Image' },
      { path: '/result', title: 'Verification Result' },
      { path: '/history', title: 'Scan History' },
      { path: '/about', title: 'Security & Rules' },
      { path: '/report', title: 'Report Scam VPA' }
    ];

    for (const route of routes) {
      currentPathname = route.path;
      let renderer: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(<AppHeader />);
      });
      const texts = renderer!.root.findAllByType('Text' as any).map((t) => t.props.children);
      expect(texts).toContain(route.title);
    }
  });

  it('toggles to white theme when 100% OFFLINE badge is tapped', () => {
    currentPathname = '/';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider>
          <AppHeader />
        </ThemeProvider>
      );
    });

    const root = renderer!.root;
    let texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('100% OFFLINE');

    const togglePill = root.findByProps({ accessibilityLabel: 'Toggle White Theme' });
    expect(togglePill).toBeDefined();

    // Tap on 100
    act(() => {
      togglePill.props.onPress();
    });

    // Now in white theme
    texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('100% ☀️ WHITE');

    // Tap again to toggle back to dark theme
    act(() => {
      togglePill.props.onPress();
    });

    texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('100% OFFLINE');
  });
});

describe('AppFooter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = '/';
  });

  it('renders all 5 primary navigation tabs', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppFooter />);
    });
    const root = renderer!.root;
    const texts = root.findAllByType('Text' as any).map((t) => t.props.children);
    expect(texts).toContain('Home');
    expect(texts).toContain('Scan');
    expect(texts).toContain('Upload');
    expect(texts).toContain('History');
    expect(texts).toContain('About');
  });

  it('navigates to the selected tab when pressed', () => {
    currentPathname = '/';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppFooter />);
    });
    const root = renderer!.root;

    // Tap Scan tab
    const scanTab = root.findByProps({ accessibilityLabel: 'Scan tab' });
    act(() => {
      scanTab.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/scan');

    // Tap History tab
    const historyTab = root.findByProps({ accessibilityLabel: 'History tab' });
    act(() => {
      historyTab.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/history');
  });

  it('does not re-push if tab is already active', () => {
    currentPathname = '/scan';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppFooter />);
    });
    const root = renderer!.root;

    const scanTab = root.findByProps({ accessibilityLabel: 'Scan tab' });
    act(() => {
      scanTab.props.onPress();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
