import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { decodeAllQrFromImageData, detectAllWithNativeBarcodeDetector } from '../lib/web-qr';
import { COLORS } from '../lib/theme';

export interface HalfScreenCameraProps {
  onQrDetected: (data: string) => void;
  onMultiQrDetected?: (codes: string[]) => void;
  isPaused?: boolean;
  height?: number;
}

export function HalfScreenCamera({
  onQrDetected,
  onMultiQrDetected,
  isPaused = false,
  height = 320
}: HalfScreenCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Multi-code accumulation buffer for live frames
  const collectedCodesRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Web camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const [_webReady, setWebReady] = useState(false);
  const [webFailed, setWebFailed] = useState(false);

  const handleDetected = (data: string) => {
    if (isPaused || !data) return;
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onQrDetected(data);
  };

  // Web camera setup
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let animId: number;
    let isActive = true;

    async function startWebCamera() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          setWebFailed(true);
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
          if (!isActive || isPaused) {
            if (isActive) animId = requestAnimationFrame(scanFrame);
            return;
          }

          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            // 1. Try hardware-accelerated BarcodeDetector
            const nativeCodes = await detectAllWithNativeBarcodeDetector(video);
            if (nativeCodes.length > 1) {
              if (onMultiQrDetected) {
                onMultiQrDetected(nativeCodes);
              } else {
                handleDetected(nativeCodes[0]!);
              }
              return;
            } else if (nativeCodes.length === 1) {
              handleDetected(nativeCodes[0]!);
              return;
            }

            // 2. Fall back to canvas & jsQR
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const codes = decodeAllQrFromImageData(imgData.data, imgData.width, imgData.height);
                if (codes.length > 1) {
                  if (onMultiQrDetected) {
                    onMultiQrDetected(codes);
                  } else {
                    handleDetected(codes[0]!);
                  }
                  return;
                } else if (codes.length === 1) {
                  handleDetected(codes[0]!);
                  return;
                }
              }
            }
          }

          if (isActive && !isPaused) {
            animId = requestAnimationFrame(scanFrame);
          }
        };

        animId = requestAnimationFrame(scanFrame);
      } catch (err) {
        console.warn('Web camera init failed:', err);
        setWebFailed(true);
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
  }, [isPaused]);

  // Handle permission requesting view
  if (Platform.OS !== 'web' && !permission?.granted) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Live Camera Scanner</Text>
          <Text style={styles.permissionSubtitle}>
            Enable camera access to scan UPI standees in real time like Google Lens.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {/* Live Video / Camera Feed */}
      {Platform.OS !== 'web' ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{
            barcodeTypes: ['qr']
          }}
          onBarcodeScanned={(result) => {
            if (isPaused || !result.data) return;
            const trimmed = result.data.trim();
            if (!trimmed) return;

            collectedCodesRef.current.add(trimmed);

            if (collectedCodesRef.current.size > 1) {
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
              }
              const codes = Array.from(collectedCodesRef.current);
              collectedCodesRef.current.clear();
              if (onMultiQrDetected) {
                onMultiQrDetected(codes);
              } else {
                handleDetected(codes[0]!);
              }
              return;
            }

            if (!debounceTimerRef.current) {
              debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                const codes = Array.from(collectedCodesRef.current);
                collectedCodesRef.current.clear();
                if (codes.length > 1 && onMultiQrDetected) {
                  onMultiQrDetected(codes);
                } else if (codes.length > 0) {
                  handleDetected(codes[0]!);
                }
              }, 250);
            }
          }}
        />
      ) : (
        /* Web Video View */
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
          {webFailed ? (
            <View style={styles.webFallbackBox}>
              <Text style={styles.webFallbackIcon}>📷</Text>
              <Text style={styles.webFallbackText}>Camera preview unavailable in this browser</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Cyber Reticle Viewfinder HUD Overlay */}
      <View style={styles.overlay}>
        {/* Top Control Bar */}
        <View style={styles.topHudBar}>
          <View style={styles.statusPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.statusPillText}>LIVE SCANNER</Text>
          </View>

          {Platform.OS !== 'web' ? (
            <TouchableOpacity
              style={[styles.torchBtn, torchEnabled && styles.torchBtnActive]}
              activeOpacity={0.8}
              onPress={() => setTorchEnabled(!torchEnabled)}
            >
              <Text style={styles.torchBtnText}>{torchEnabled ? '🔦 ON' : '🔦 FLASH'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Center Scanner Reticle Frame */}
        <View style={styles.reticleCenterWrapper}>
          <View style={styles.reticleFrame}>
            <View style={[styles.reticleCorner, styles.cornerTL]} />
            <View style={[styles.reticleCorner, styles.cornerTR]} />
            <View style={[styles.reticleCorner, styles.cornerBL]} />
            <View style={[styles.reticleCorner, styles.cornerBR]} />
            <View style={styles.centerAimDot} />
          </View>
        </View>

        {/* Bottom Helper Caption */}
        <View style={styles.bottomHudBar}>
          <Text style={styles.reticleHelperText}>
            Align payment QR inside frame · Instant prompt
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#020617',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
    backgroundColor: '#0F172A'
  },
  permissionIcon: {
    fontSize: 34
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  permissionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12
  },
  topHudBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981'
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.6
  },
  torchBtn: {
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  torchBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    borderColor: '#F59E0B'
  },
  torchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  reticleCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  reticleFrame: {
    width: 190,
    height: 190,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  reticleCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#38BDF8'
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 10
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 10
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 10
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 10
  },
  centerAimDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(56, 189, 248, 0.85)'
  },
  bottomHudBar: {
    alignItems: 'center'
  },
  reticleHelperText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8
  },
  webFallbackBox: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8
  },
  webFallbackIcon: {
    fontSize: 32
  },
  webFallbackText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center'
  }
});
