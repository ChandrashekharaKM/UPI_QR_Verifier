import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  verifyQrPayload,
  describeQrIntent,
  type VerificationResult,
  type QrIntentDescription
} from '@upi-verifier/core';
import { saveScanToHistory } from '../lib/storage';
import { COLORS } from '../lib/theme';
import { HalfScreenCamera } from '../components/HalfScreenCamera';
import { LensScanPromptModal } from '../components/LensScanPromptModal';
import { MultipleQrModal } from '../components/MultipleQrModal';

export default function ScanScreen() {
  const router = useRouter();
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [candidateQrs, setCandidateQrs] = useState<string[]>([]);
  const [showMultiQrModal, setShowMultiQrModal] = useState(false);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    rawPayload: string;
    verification: VerificationResult;
    intent: QrIntentDescription;
  } | null>(null);

  const handleQrDetected = (data: string) => {
    if (!data || cameraPaused) return;
    setCameraPaused(true);
    setShowMultiQrModal(false);

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const verified = verifyQrPayload(data, { isOffline: true });
    const intent = describeQrIntent(verified);
    void saveScanToHistory(verified);

    setScannedResult({
      rawPayload: data,
      verification: verified,
      intent
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Half: Google Lens Live Camera Viewfinder */}
      <View style={styles.cameraContainer}>
        <HalfScreenCamera
          onQrDetected={handleQrDetected}
          onMultiQrDetected={(codes) => {
            setCandidateQrs(codes);
            setShowMultiQrModal(true);
            setCameraPaused(true);
          }}
          isPaused={cameraPaused || Boolean(scannedResult) || showMultiQrModal}
          height={320}
        />
      </View>

      {/* Bottom Half: Quick Controls like Google Lens */}
      <View style={styles.bottomControls}>
        {/* Gallery Upload Button */}
        <TouchableOpacity
          style={styles.galleryButton}
          activeOpacity={0.85}
          onPress={() => router.push('/upload')}
        >
          <View style={styles.galleryIconCircle}>
            <Text style={styles.galleryIcon}>🖼️</Text>
          </View>
          <View style={styles.galleryTextGroup}>
            <Text style={styles.galleryTitle}>Choose from Gallery</Text>
            <Text style={styles.gallerySub}>Inspect saved photo, screenshot, or bill</Text>
          </View>
          <Text style={styles.navArrow}>➔</Text>
        </TouchableOpacity>

        {/* Manual Input Toggle Button */}
        <TouchableOpacity
          style={styles.manualToggleButton}
          activeOpacity={0.85}
          onPress={() => setShowManual(!showManual)}
        >
          <Text style={styles.manualToggleText}>
            {showManual ? '✕ Hide Manual Input' : '⌨️ Type or Paste UPI QR Code'}
          </Text>
        </TouchableOpacity>

        {/* Manual Input Sheet */}
        {showManual ? (
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Manual QR Payload Inspector</Text>
            <Text style={styles.manualHelp}>
              Paste any `upi://pay`, intent deep link, or BharatQR text:
            </Text>
            <TextInput
              style={styles.manualInput}
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="upi://pay?pa=merchant@okhdfcbank&pn=Store&am=150.00..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.manualActionRow}>
              <TouchableOpacity
                style={styles.manualCancelBtn}
                onPress={() => setShowManual(false)}
              >
                <Text style={styles.manualCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualSubmitBtn, !manualInput.trim() && styles.manualSubmitDisabled]}
                disabled={!manualInput.trim()}
                onPress={() => {
                  if (manualInput.trim()) {
                    handleQrDetected(manualInput.trim());
                  }
                }}
              >
                <Text style={styles.manualSubmitText}>Inspect & Prompt</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Real-time Status Card */}
        <View style={styles.statusBox}>
          <Text style={styles.statusBoxIcon}>🛡️</Text>
          <View style={styles.statusBoxTextCol}>
            <Text style={styles.statusBoxTitle}>Instant Heuristic & Deception Shield</Text>
            <Text style={styles.statusBoxSub}>
              Point at any payment standee. The app detects fake refund schemes, collect requests, and tampering offline before prompting.
            </Text>
          </View>
        </View>
      </View>

      {/* Google Lens Instant Scan & Payment Prompt */}
      {scannedResult ? (
        <LensScanPromptModal
          visible={Boolean(scannedResult)}
          rawPayload={scannedResult.rawPayload}
          verification={scannedResult.verification}
          intent={scannedResult.intent}
          onDismiss={() => {
            setScannedResult(null);
            setCameraPaused(false);
          }}
          onViewDetails={() => {
            const raw = scannedResult.rawPayload;
            setScannedResult(null);
            setCameraPaused(false);
            router.push({
              pathname: '/result',
              params: { rawPayload: raw }
            });
          }}
        />
      ) : null}

      {/* Multiple QR Selector */}
      <MultipleQrModal
        visible={showMultiQrModal}
        qrCodes={candidateQrs}
        onSelect={(payload) => {
          setShowMultiQrModal(false);
          handleQrDetected(payload);
        }}
        onCancel={() => {
          setShowMultiQrModal(false);
          setCandidateQrs([]);
          setCameraPaused(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16
  },
  cameraContainer: {
    width: '100%',
    marginVertical: 4
  },
  bottomControls: {
    gap: 12
  },
  galleryButton: {
    backgroundColor: COLORS.bgCard,
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  galleryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  galleryIcon: {
    fontSize: 22
  },
  galleryTextGroup: {
    flex: 1
  },
  galleryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  gallerySub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  navArrow: {
    fontSize: 18,
    color: '#38BDF8',
    fontWeight: '800'
  },
  manualToggleButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  manualToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0'
  },
  manualCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  manualTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  manualHelp: {
    fontSize: 11,
    color: '#94A3B8'
  },
  manualInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: '#F8FAFC',
    minHeight: 64,
    textAlignVertical: 'top'
  },
  manualActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  manualCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1E293B'
  },
  manualCancelText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  },
  manualSubmitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0284C7'
  },
  manualSubmitDisabled: {
    opacity: 0.5
  },
  manualSubmitText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '800'
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14,
    gap: 12
  },
  statusBoxIcon: {
    fontSize: 22,
    marginTop: 2
  },
  statusBoxTextCol: {
    flex: 1
  },
  statusBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2
  },
  statusBoxSub: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16
  }
});
