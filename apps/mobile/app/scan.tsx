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
import { decodeQrFromImageData } from '../lib/web-qr';
import { COLORS } from '../lib/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Web specific camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const [webReady, setWebReady] = useState(false);

  const handleQrDetected = (data: string) => {
    if (scanned || !data) return;
    setScanned(true);

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

        const scanFrame = () => {
          if (!isActive || scanned) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = decodeQrFromImageData(imgData.data, imgData.width, imgData.height);
              if (code) {
                handleQrDetected(code);
                return;
              }
            }
          }
          animId = requestAnimationFrame(scanFrame);
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
  }, [scanned]);

  if (!permission && Platform.OS !== 'web') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.statusText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (Platform.OS !== 'web' && !permission?.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera Permission Required</Text>
        <Text style={styles.permissionDesc}>
          To inspect payment QR codes before paying, UPI QR Verifier needs access to your camera.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={() => setShowManual(true)}>
          <Text style={styles.textButtonText}>Enter QR Payload Text Manually</Text>
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
            if (result.data) {
              handleQrDetected(result.data);
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

      {/* Viewfinder Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <Text style={styles.hintText}>Align payment QR code within the frame</Text>
          <TouchableOpacity
            style={[styles.torchButton, torchEnabled && styles.torchActive]}
            onPress={() => setTorchEnabled(!torchEnabled)}
          >
            <Text style={styles.torchIcon}>{torchEnabled ? '🔦 ON' : '🔦 Torch'}</Text>
          </TouchableOpacity>
        </View>

        {/* Reticle Target Frame */}
        <View style={styles.reticleContainer}>
          <View style={styles.reticle}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.scanLine} />
          </View>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => setShowManual(!showManual)}
          >
            <Text style={styles.manualButtonText}>
              {showManual ? 'Hide Manual Input' : 'Type or Paste QR Text'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Manual Input Modal / Box */}
      {showManual ? (
        <View style={styles.manualModal}>
          <Text style={styles.manualTitle}>Manual QR Payload Input</Text>
          <Text style={styles.manualHelp}>
            Paste the raw `upi://pay` URI or scanned web link:
          </Text>
          <TextInput
            style={styles.manualInput}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="upi://pay?pa=merchant@okhdfcbank&pn=Store..."
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
              style={styles.manualSubmitBtn}
              onPress={() => {
                if (manualInput.trim()) {
                  handleQrDetected(manualInput.trim());
                }
              }}
            >
              <Text style={styles.manualSubmitText}>Analyze Risk</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
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
    marginTop: 12
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center'
  },
  permissionDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  grantButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center'
  },
  grantButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700'
  },
  textButton: {
    marginTop: 16,
    padding: 8
  },
  textButtonText: {
    color: COLORS.primaryLight,
    fontSize: 14,
    fontWeight: '600'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 24
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 15, 25, 0.75)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginTop: 16
  },
  hintText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  torchButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  torchActive: {
    backgroundColor: COLORS.primary
  },
  torchIcon: {
    color: '#FFF',
    fontSize: 12,
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
    justifyContent: 'center',
    alignItems: 'center'
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: COLORS.primary,
    borderWidth: 4
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 16
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 16
  },
  scanLine: {
    width: '90%',
    height: 2,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4
  },
  bottomBar: {
    alignItems: 'center',
    marginBottom: 20
  },
  manualButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  manualButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  manualModal: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: COLORS.bgCard,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  manualHelp: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 10
  },
  manualInput: {
    backgroundColor: COLORS.bgInput,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 14
  },
  manualActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  manualCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  manualCancelText: {
    color: COLORS.textMuted,
    fontWeight: '600'
  },
  manualSubmitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10
  },
  manualSubmitText: {
    color: '#FFF',
    fontWeight: '700'
  }
});
