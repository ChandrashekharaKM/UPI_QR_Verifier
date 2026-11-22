import { Platform } from 'react-native';
import type {
  CommunityReputationSignal,
  CommunityPeriodBreakdown,
  VpaCompositeResult
} from '@upi-verifier/core';

// In Android emulator, 10.0.2.2 maps to localhost; in web, localhost:3001 or current host
function resolveApiBaseUrl(): string {
  if (process.env['EXPO_PUBLIC_API_URL']) {
    return process.env['EXPO_PUBLIC_API_URL'];
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location?.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `http://${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
}

export const API_BASE_URL = resolveApiBaseUrl();

export interface ReputationFetchResult {
  readonly isOnline: boolean;
  readonly signal?: CommunityReputationSignal;
  readonly notice?: string;
}

export async function fetchVpaReputation(vpa: string): Promise<ReputationFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s strict timeout

  try {
    const encodedVpa = encodeURIComponent(vpa.trim().toLowerCase());
    const response = await fetch(`${API_BASE_URL}/v1/vpa/${encodedVpa}/reputation`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        isOnline: true,
        notice: 'Community reports unavailable for this ID.'
      };
    }

    const data = (await response.json()) as {
      vpa: string;
      reportCount: number;
      uniqueReporters?: number;
      decayedScore?: number;
      recentReportCount?: number;
      lastReported?: string;
      lastReportedDaysAgo?: number;
      topCategories: string[];
      breakdownByPeriod?: CommunityPeriodBreakdown;
    };

    if (data.reportCount > 0) {
      return {
        isOnline: true,
        signal: {
          reportCount: data.reportCount,
          uniqueReporters: data.uniqueReporters,
          decayedScore: data.decayedScore,
          recentReportCount: data.recentReportCount,
          ...(data.lastReportedDaysAgo !== undefined ? { lastReportedDaysAgo: data.lastReportedDaysAgo } : {}),
          topCategories: data.topCategories,
          breakdownByPeriod: data.breakdownByPeriod
        }
      };
    }

    return {
      isOnline: true
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      isOnline: false,
      notice: 'offline: community reports unavailable'
    };
  }
}

export async function verifyVpaOnline(
  vpaOrPayload: string
): Promise<VpaCompositeResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const encoded = encodeURIComponent(vpaOrPayload.trim());
    const response = await fetch(`${API_BASE_URL}/v1/vpa/${encoded}/verify`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (response.ok) {
      return (await response.json()) as VpaCompositeResult;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function submitScamReport(
  vpa: string,
  reason: string,
  note?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        vpa,
        reason,
        ...(note ? { note } : {})
      })
    });

    const data = (await response.json()) as { success?: boolean; message?: string };

    if (response.ok) {
      return {
        success: true,
        message: data.message ?? 'Report submitted successfully.'
      };
    }

    if (response.status === 409) {
      return {
        success: false,
        message: data.message ?? 'You have already reported this UPI ID.'
      };
    }

    return {
      success: false,
      message: data.message ?? 'Failed to submit report.'
    };
  } catch {
    return {
      success: false,
      message: 'Network offline: Could not connect to reporting server.'
    };
  }
}
