import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// Mock react-native primitives to run cleanly in pure Node test runner without Flow syntax errors
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
    ScrollView: createComp('ScrollView'),
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
    Modal: (props: MockProps & { visible?: boolean }) =>
      props.visible
        ? R.createElement('Modal', { ...props, 'data-testid': 'modal-container' }, props.children)
        : null,
    ActivityIndicator: createComp('ActivityIndicator')
  };
});

// Mock expo-router navigation hooks
const mockReplace = vi.fn();
const mockPush = vi.fn();
let currentPayload = '';

vi.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush
  }),
  useLocalSearchParams: () => ({
    rawPayload: currentPayload
  })
}));

// Mock expo native modules
vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn().mockResolvedValue(true)
}));

vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn().mockResolvedValue(true),
  NotificationFeedbackType: { Success: 'success' }
}));

vi.mock('../lib/storage', () => ({
  saveScanToHistory: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../lib/api-client', () => ({
  fetchVpaReputation: vi.fn().mockResolvedValue({
    isOnline: false,
    notice: 'offline: test mode'
  })
}));

import ResultScreen from '../app/result';

function collectAllText(node: unknown): string[] {
  const texts: string[] = [];
  function recurse(n: unknown) {
    if (!n) return;
    if (typeof n === 'string' || typeof n === 'number') {
      texts.push(String(n));
      return;
    }
    const elem = n as { props?: { children?: unknown }; children?: unknown[] };
    if (elem.props && elem.props.children) {
      if (Array.isArray(elem.props.children)) {
        for (const c of elem.props.children) recurse(c);
      } else {
        recurse(elem.props.children);
      }
    }
    if (elem.children && Array.isArray(elem.children)) {
      for (const c of elem.children) recurse(c);
    }
  }
  recurse(node);
  return texts;
}

describe('Mobile Result Screen Policy Rules Suite (React Native Testing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Policy 1: No Bare "Safe" (Honest Caveats & Transparency Guaranteed)', () => {
    it('displays "SAFE (Low Risk)" and explicit caveat when recipient identity is unverified', async () => {
      currentPayload =
        'upi://pay?pa=freshmart@okhdfcbank&pn=Fresh%20Provisions&am=150.00&cu=INR&mc=5411';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const allTexts = collectAllText(renderer!.toJSON());
      const fullTextBlob = allTexts.join(' ');

      // 1. Asserts category badge is "SAFE (Low Risk)"
      expect(fullTextBlob).toContain('SAFE (Low Risk)');

      // 2. CRITICAL POLICY: Assert that a bare, unqualified "Safe" or "SAFE" does NOT appear without caveat
      // Filter standalone exact match tokens
      const bareSafeMatches = allTexts.filter(
        (t) => t.trim() === 'Safe' || t.trim() === 'SAFE'
      );
      expect(bareSafeMatches).toHaveLength(0);

      // 3. Mandatory caveat when no registered-name lookup ran
      expect(fullTextBlob).toContain(
        'No major risk indicators found; recipient identity NOT independently verified'
      );

      // 4. Verification Coverage audit explicitly lists Registered Beneficiary Name Check under checks that did not run
      expect(fullTextBlob).toContain('Registered Beneficiary Name Check');
      expect(fullTextBlob).toContain('Registered name verified: not available (offline)');

      // 5. Persistent risk-warning disclaimer is rendered
      expect(fullTextBlob).toContain('Risk-warning tool: This score is a heuristic estimation');
      expect(fullTextBlob).toContain('It is NOT a guarantee of payment safety');
    });

    it('renders physical sticker tampering warning and mandatory pre-PIN check on merchant QRs', async () => {
      currentPayload =
        'upi://pay?pa=kirana@oksbi&pn=Gupta%20General%20Store&am=250.00&cu=INR&mc=5411';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const fullText = collectAllText(renderer!.toJSON()).join(' ');

      // 1. Physical Sticker Tampering Card
      expect(fullText).toContain('PHYSICAL STICKER TAMPERING WARNING');
      expect(fullText).toContain('Persistent Tip for Counter & Merchant Standees');
      expect(fullText).toContain('feel for raised edges, peel marks, or overlapping stickers');

      // 2. Mandatory Pre-Payment Step before PIN
      expect(fullText).toContain('MANDATORY PRE-PAYMENT STEP');
      expect(fullText).toContain('Check the name shown in your UPI app before you enter your PIN');
    });
  });

  describe('Policy 2: Two-Step Confirm on HIGH_RISK (Anti-Bypass Protection)', () => {
    it('requires explicit secondary confirmation before continuing on a HIGH_RISK QR code', async () => {
      // Deceptive scam QR (SBI Helpline impersonation)
      currentPayload = 'upi://pay?pa=sbi.refund.portal@ybl&pn=SBI%20Helpline&am=9999.00';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const root = renderer!.root;
      const fullText = collectAllText(renderer!.toJSON()).join(' ');

      // Initial state: Risk score is high, category badge is HIGH RISK
      expect(fullText).toContain('HIGH RISK (Scam Alert)');
      expect(fullText).toContain('Critical fraud indicators or deceptive patterns detected');

      // Find the "Continue Anyway" button
      const touchables = root.findAllByType('TouchableOpacity');
      const continueBtn = touchables.find((btn) => {
        const txt = collectAllText(btn).join(' ');
        return txt.includes('Continue Anyway');
      });
      expect(continueBtn).toBeDefined();

      // STEP 1: User taps "Continue Anyway"
      await act(async () => {
        continueBtn!.props.onPress();
      });

      // CRITICAL ASSERTION: router.replace MUST NOT have been called yet!
      expect(mockReplace).not.toHaveBeenCalled();

      // The secondary confirmation modal MUST be displayed
      const modalText = collectAllText(renderer!.toJSON()).join(' ');
      expect(modalText).toContain('CRITICAL SCAM WARNING');
      expect(modalText).toContain('This QR code exhibits severe fraud indicators');
      expect(modalText).toContain('Are you absolutely sure you want to dismiss this warning?');

      // STEP 2A: Tapping "Cancel (Recommended)" dismisses the modal without routing
      const updatedTouchables = root.findAllByType('TouchableOpacity');
      const cancelBtn = updatedTouchables.find((btn) => {
        const txt = collectAllText(btn).join(' ');
        return txt.includes('Cancel (Recommended)');
      });
      expect(cancelBtn).toBeDefined();

      await act(async () => {
        cancelBtn!.props.onPress();
      });

      expect(mockReplace).not.toHaveBeenCalled();

      // STEP 2B: User re-triggers modal and confirms dismissal
      await act(async () => {
        continueBtn!.props.onPress();
      });

      const confirmTouchables = root.findAllByType('TouchableOpacity');
      const confirmDismissBtn = confirmTouchables.find((btn) => {
        const txt = collectAllText(btn).join(' ');
        return txt.includes('Dismiss Warning');
      });
      expect(confirmDismissBtn).toBeDefined();

      await act(async () => {
        confirmDismissBtn!.props.onPress();
      });

      // Now and only now is router.replace called
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('immediately allows single-step dismiss on low-risk / clean QR without secondary modal', async () => {
      currentPayload = 'upi://pay?pa=cleanmerchant@okhdfcbank&pn=CleanStore&am=50.00&cu=INR&mc=5411';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const root = renderer!.root;
      const touchables = root.findAllByType('TouchableOpacity');
      const continueBtn = touchables.find((btn) => {
        const txt = collectAllText(btn).join(' ');
        return txt.includes('Continue Anyway');
      });

      await act(async () => {
        continueBtn!.props.onPress();
      });

      // Directly navigates away
      expect(mockReplace).toHaveBeenCalledWith('/');

      const modalText = collectAllText(renderer!.toJSON()).join(' ');
      expect(modalText).not.toContain('CRITICAL SCAM WARNING');
    });

    it('provides direct "Don\'t Pay / Close" button to safely exit without paying', async () => {
      currentPayload = 'upi://pay?pa=store@oksbi&pn=Store';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const root = renderer!.root;
      const touchables = root.findAllByType('TouchableOpacity');
      const dontPayBtn = touchables.find((btn) => {
        const txt = collectAllText(btn).join(' ');
        return txt.includes("Don't Pay / Close");
      });
      expect(dontPayBtn).toBeDefined();

      await act(async () => {
        dontPayBtn!.props.onPress();
      });

      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  describe('Policy 6: Instant Pop-Up Risk Counter & Plain-English Intent Alert', () => {
    it('pops up alert stating exact risk count and what the QR is saying for clean merchant', async () => {
      currentPayload = 'upi://pay?pa=store@okhdfcbank&pn=Fresh+Mart&mc=5411&am=350.00&cu=INR';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const allText = collectAllText(renderer!.toJSON()).join(' ');
      expect(allText).toContain('0 RISKS DETECTED');
      expect(allText).toContain('WHAT THIS QR IS SAYING:');
      expect(allText).toContain('paying ₹350.00 to Fresh Mart');
    });

    it('pops up alert stating risk count and deception alert for refund scam trap', async () => {
      currentPayload = 'upi://pay?pa=refund.dept99@paytm&pn=Electricity+Refund&am=25000&tn=Electricity+Bill+Refund+Claim';

      let renderer: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(<ResultScreen />);
      });

      const allText = collectAllText(renderer!.toJSON()).join(' ');
      expect(allText).toContain('RISKS DETECTED');
      expect(allText).toContain('WHAT THIS QR IS SAYING:');
      expect(allText).toContain('CRITICAL REFUND / REWARD SCAM');
      expect(allText).toContain('DECEPTION TRAP: You are SENDING ₹25000, NOT receiving money');
      expect(allText).toContain('YOU NEVER SCAN A QR CODE OR ENTER YOUR PIN TO RECEIVE MONEY');
    });
  });
});
