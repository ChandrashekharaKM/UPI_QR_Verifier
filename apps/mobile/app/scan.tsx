import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal
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
    <View style={styles.container}>
      {/* Full-Screen Camera Viewfinder */}
      <HalfScreenCamera
        fullScreen={true}
        onQrDetected={handleQrDetected}
        onMultiQrDetected={(codes) => {
          setCandidateQrs(codes);
          setShowMultiQrModal(true);
          setCameraPaused(true);
        }}
        isPaused={cameraPaused || Boolean(scannedResult) || showMultiQrModal || showManual}
        renderBottomBar={() => (
          <View style={styles.floatingControls}>
            {/* Type or Paste QR Code Button */}
            <TouchableOpacity
              style={styles.manualBtn}
              activeOpacity={0.85}
              onPress={() => setShowManual(true)}
              accessibilityLabel="Type or Paste QR Code"
            >
              <Text style={styles.manualBtnIcon}>💳</Text>
              <Text style={styles.manualBtnText}>Type or Paste QR Code</Text>
            </TouchableOpacity>

            {/* Gallery Button */}
            <TouchableOpacity
              style={styles.galleryBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/upload')}
              accessibilityLabel="Upload from Gallery"
            >
              <Text style={styles.galleryBtnIcon}>🖼️</Text>
              <Text style={styles.galleryBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Manual Input Sheet Modal */}
      <Modal
        visible={showManual}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowManual(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manual QR Payload Inspector</Text>
              <TouchableOpacity
                onPress={() => setShowManual(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelp}>
              Paste any `upi://pay`, BharatQR raw string, or deep link:
            </Text>

            <TextInput
              style={styles.modalInput}
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="upi://pay?pa=merchant@okhdfcbank&pn=Store&am=150.00..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowManual(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  !manualInput.trim() && styles.modalSubmitDisabled
                ]}
                disabled={!manualInput.trim()}
                onPress={() => {
                  const trimmed = manualInput.trim();
                  if (trimmed) {
                    setShowManual(false);
                    handleQrDetected(trimmed);
                  }
                }}
              >
                <Text style={styles.modalSubmitText}>Inspect & Prompt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Google Lens Instant Scan & Payment Prompt Sheet */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative'
  },
  floatingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingHorizontal: 16
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    gap: 8
  },
  manualBtnIcon: {
    fontSize: 16
  },
  manualBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700'
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
    gap: 6
  },
  galleryBtnIcon: {
    fontSize: 16
  },
  galleryBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    gap: 12
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  modalCloseBtn: {
    padding: 4
  },
  modalCloseText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '700'
  },
  modalHelp: {
    fontSize: 12,
    color: '#94A3B8'
  },
  modalInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#F8FAFC',
    minHeight: 80,
    textAlignVertical: 'top'
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#1E293B'
  },
  modalCancelText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600'
  },
  modalSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#0284C7'
  },
  modalSubmitDisabled: {
    opacity: 0.5
  },
  modalSubmitText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '800'
  }
});
