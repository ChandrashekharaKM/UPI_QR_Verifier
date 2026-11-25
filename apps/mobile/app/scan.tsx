import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { decodeAllQrFromImageData, detectAllWithNativeBarcodeDetector } from '../lib/web-qr';
import { COLORS } from '../lib/theme';
import { MultipleQrModal } from '../components/MultipleQrModal';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [candidateQrs, setCandidateQrs] = useState<string[]>([]);
  const [showMultiQrModal, setShowMultiQrModal] = useState(false);

  // Buffer for multi-barcode accumulation in live camera feed
  const collectedCodesRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Web specific camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const [_webReady, setWebReady] = useState(false);

  const handleQrDetected = (data: string) => {
    if (scanned || !data) return;
    setScanned(true);
    setShowMultiQrModal(false);

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Stop web camera stream if running
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    router.replace({
      pathname: '/result',
      params: { rawPayload: data }
    });
  };

  // Web camera implementation with getUserMedia & jsQR
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let animId: number;
    let isActive = true;

    async function startWebCamera() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          setShowManual(true);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        webStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          if (isActive) setWebReady(true);
        }

        const scanFrame = async () => {
          if (!isActive || scanned || showMultiQrModal) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            // 1. Try native BarcodeDetector directly on live video stream (hardware accelerated)
            const nativeCodes = await detectAllWithNativeBarcodeDetector(video);
            if (nativeCodes.length > 1) {
              setScanned(true);
              if (webStreamRef.current) {
                webStreamRef.current.getTracks().forEach((track) => track.stop());
              }
              setCandidateQrs(nativeCodes);
              setShowMultiQrModal(true);
              return;
            } else if (nativeCodes.length === 1) {
              handleQrDetected(nativeCodes[0]!);
              return;
            }

            // 2. Fall back to canvas & jsQR with iterative multi-QR extraction
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const codes = decodeAllQrFromImageData(imgData.data, imgData.width, imgData.height);
                if (codes.length > 1) {
                  setScanned(true);
                  if (webStreamRef.current) {
                    webStreamRef.current.getTracks().forEach((track) => track.stop());
                  }
                  setCandidateQrs(codes);
                  setShowMultiQrModal(true);
                  return;
                } else if (codes.length === 1) {
                  handleQrDetected(codes[0]!);
                  return;
                }
              }
            }
          }
          if (isActive && !scanned && !showMultiQrModal) {
            animId = requestAnimationFrame(scanFrame);
          }
        };

        animId = requestAnimationFrame(scanFrame);
      } catch (err) {
        console.warn('Web camera access failed:', err);
        setShowManual(true);
      }
    }

    void startWebCamera();

    return () => {
      isActive = false;
      cancelAnimationFrame(animId);
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [scanned, showMultiQrModal]);

  if (!permission && Platform.OS !== 'web') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={styles.statusText}>Initializing camera hardware...</Text>
      </View>
    );
  }

  if (Platform.OS !== 'web' && !permission?.granted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.lockBadge}>
          <Text style={styles.errorIcon}>📷</Text>
        </View>
        <Text style={styles.permissionTitle}>Camera Permission Required</Text>
        <Text style={styles.permissionDesc}>
          To inspect payment standees and QR codes before paying, UPI QR Verifier needs camera permission.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={() => setShowManual(true)}>
          <Text style={styles.textButtonText}>Or Enter QR Payload Text Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mobile Camera View */}
      {Platform.OS !== 'web' ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{
            barcodeTypes: ['qr']
          }}
          onBarcodeScanned={(result) => {
            if (scanned || showMultiQrModal || !result.data) return;
            const trimmed = result.data.trim();
            if (!trimmed) return;

            collectedCodesRef.current.add(trimmed);

            if (collectedCodesRef.current.size > 1) {
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
              }
              setScanned(true);
              if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }
              setCandidateQrs(Array.from(collectedCodesRef.current));
              setShowMultiQrModal(true);
              return;
            }

            if (!debounceTimerRef.current) {
              debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                const codes = Array.from(collectedCodesRef.current);
                if (codes.length > 1) {
                  setScanned(true);
                  if (Platform.OS !== 'web') {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  }
                  setCandidateQrs(codes);
                  setShowMultiQrModal(true);
                } else if (codes.length === 1) {
                  handleQrDetected(codes[0]!);
                }
              }, 250);
            }
          }}
        />
      ) : (
        /* Web HTML5 Camera View */
        <View style={StyleSheet.absoluteFillObject}>
          <video
            ref={videoRef as unknown as React.LegacyRef<HTMLVideoElement>}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <canvas
            ref={canvasRef as unknown as React.LegacyRef<HTMLCanvasElement>}
            style={{ display: 'none' }}
          />
        </View>
      )}

      {/* High-Tech Viewfinder HUD Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <View style={styles.hudPill}>
            <View style={styles.hudDot} />
            <Text style={styles.hintText}>ALIGN PAYMENT QR INSIDE RETICLE</Text>
          </View>
          <TouchableOpacity
            style={[styles.torchButton, torchEnabled && styles.torchActive]}
            activeOpacity={0.8}
            onPress={() => setTorchEnabled(!torchEnabled)}
          >
            <Text style={styles.torchText}>{torchEnabled ? '🔦 FLASH ON' : '🔦 FLASH'}</Text>
          </TouchableOpacity>
        </View>

        {/* Reticle Target Frame */}
        <View style={styles.reticleContainer}>
          <View style={styles.reticle}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.reticleCenterPlus} />
          </View>
          <Text style={styles.reticleHelperText}>Auto-analyzing offline · Multi-standee aware</Text>
        </View>

        {/* Bottom Control Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualButton}
            activeOpacity={0.8}
            onPress={() => setShowManual(!showManual)}
          >
            <Text style={styles.manualButtonText}>
              {showManual ? 'Hide Manual Input' : '⌨️ Type or Paste QR Code'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Manual Input Sheet */}
      {showManual ? (
        <View style={styles.manualModal}>
          <Text style={styles.manualTitle}>Manual QR Payload Inspector</Text>
          <Text style={styles.manualHelp}>
            Paste any `upi://pay`, intent deep link, or BharatQR raw text:
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
              <Text style={styles.manualSubmitText}>Inspect Payload</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Multiple QR Codes Modal Selector */}
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
          collectedCodesRef.current.clear();
          setScanned(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 14,
    fontWeight: '600'
  },
  lockBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.bgCardElevated,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  errorIcon: {
    fontSize: 36
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'center'
  },
  permissionDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320
  },
  grantButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  grantButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15
  },
  textButton: {
    paddingVertical: 12
  },
  textButtonText: {
    color: COLORS.primaryLight,
    fontWeight: '700',
    fontSize: 14
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)'
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? 44 : 20
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  hudDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primaryLight,
    marginRight: 8
  },
  hintText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  torchButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  torchActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: '#F59E0B'
  },
  torchText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700'
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  reticle: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent'
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#38BDF8',
    borderWidth: 4
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 10
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 10
  },
  reticleCenterPlus: {
    position: 'absolute',
    top: 128,
    left: 128,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(56, 189, 248, 0.6)'
  },
  reticleHelperText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    letterSpacing: 0.3
  },
  bottomBar: {
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 34 : 20
  },
  manualButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6
  },
  manualButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700'
  },
  manualModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgCardElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12
  },
  manualTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  manualHelp: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 14
  },
  manualInput: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: COLORS.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 16
  },
  manualActionRow: {
    flexDirection: 'row',
    gap: 12
  },
  manualCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.bgCardHover,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  manualCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 14
  },
  manualSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  manualSubmitDisabled: {
    opacity: 0.5
  },
  manualSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  }
});
