import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VerificationResult } from '@upi-verifier/core';

const HISTORY_KEY = '@upi_verifier_scan_history_v1';
const MAX_HISTORY_ITEMS = 50;

export async function getScanHistory(): Promise<VerificationResult[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VerificationResult[];
  } catch (err) {
    console.error('Failed to load scan history:', err);
    return [];
  }
}

export async function saveScanToHistory(result: VerificationResult): Promise<void> {
  try {
    const current = await getScanHistory();
    // Prepend new scan, filter out duplicates by evaluatedAt or rawPayload
    const filtered = current.filter(
      (item) => item.evaluatedAt !== result.evaluatedAt
    );
    const updated = [result, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save scan result:', err);
  }
}

export async function deleteScanFromHistory(evaluatedAt: string): Promise<void> {
  try {
    const current = await getScanHistory();
    const filtered = current.filter((item) => item.evaluatedAt !== evaluatedAt);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete scan item:', err);
  }
}

export async function clearScanHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    console.error('Failed to clear scan history:', err);
  }
}
