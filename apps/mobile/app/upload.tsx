import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { decodeAllQrFromFile } from '../lib/web-qr';
import { COLORS } from '../lib/theme';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { MultipleQrModal } from '../components/MultipleQrModal';

export default function UploadScreen() {
  const router = useRouter();
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidateQrs, setCandidateQrs] = useState<string[]>([]);
  const [showMultiQrModal, setShowMultiQrModal] = useState(false);

  const handleDecodedPayload = (payload: string) => {
    setIsProcessing(false);
    setShowMultiQrModal(false);
    router.replace({
      pathname: '/result',
      params: { rawPayload: payload }
    });
  };

  const pickImage = async () => {
    setErrorMessage(null);
    setCandidateQrs([]);
    setShowMultiQrModal(false);

    try {
      if (Platform.OS === 'web') {
        // Trigger web file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: Event) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (!file) return;

          setSelectedUri(URL.createObjectURL(file));
          setIsProcessing(true);

          const results = await decodeAllQrFromFile(file);
          if (results.length === 0) {
            setIsProcessing(false);
            setErrorMessage(
              'No readable QR code detected in this image. Please ensure good lighting and clear contrast.'
            );
          } else if (results.length === 1) {
            handleDecodedPayload(results[0]!);
          } else {
            // Multiple QR codes found: NEVER silently pick one!
            setIsProcessing(false);
            setCandidateQrs(results);
            setShowMultiQrModal(true);
          }
        };
        input.click();
        return;
      }

      // Native Mobile Image Picker
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Gallery permission is required to select photos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]) {
        return;
      }

      const asset = pickerResult.assets[0];
      setSelectedUri(asset.uri);
      setIsProcessing(true);

      const discovered = new Set<string>();

      // 1. Try with expo-camera native barcode scanner
      try {
        const barcodes = await Camera.scanFromURLAsync(asset.uri, ['qr']);
        if (barcodes && barcodes.length > 0) {
          for (const b of barcodes) {
            if (b?.data && b.data.trim()) {
              discovered.add(b.data.trim());
            }
          }
        }
      } catch (scanErr) {
        console.warn('Camera.scanFromURLAsync failed, attempting multi-pass fallback:', scanErr);
      }

      // 2. Also run multi-pass image decoder if <= 1 found to discover all distinct counter standees
      if (discovered.size <= 1) {
        try {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          const fallbackResults = await decodeAllQrFromFile(blob);
          for (const r of fallbackResults) {
            if (r && r.trim()) {
              discovered.add(r.trim());
            }
          }
        } catch (fallbackErr) {
          console.warn('Fallback multi-pass decode failed:', fallbackErr);
        }
      }

      const allCodes = Array.from(discovered);
      if (allCodes.length === 0) {
        setIsProcessing(false);
        setErrorMessage(
          'Could not decode any payment QR code from the selected image. Please try another image or scan directly using camera.'
        );
      } else if (allCodes.length === 1) {
        handleDecodedPayload(allCodes[0]!);
      } else {
        // Multiple QR codes found: NEVER silently pick one!
        setIsProcessing(false);
        setCandidateQrs(allCodes);
        setShowMultiQrModal(true);
      }
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(`Failed to process image: ${msg}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Inspect Stored QR Codes</Text>
        <Text style={styles.subtitle}>
          Select a saved QR image, bill screenshot, or payment stand photo from your gallery.
        </Text>

        {selectedUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedUri }} style={styles.previewImage} resizeMode="contain" />
          </View>
        ) : (
          <TouchableOpacity style={styles.dropZone} activeOpacity={0.8} onPress={pickImage}>
            <Text style={styles.dropIcon}>📂</Text>
            <Text style={styles.dropText}>Tap to Browse Gallery / Files</Text>
            <Text style={styles.dropSubtext}>Supports PNG, JPG, WEBP</Text>
          </TouchableOpacity>
        )}

        {isProcessing ? (
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.processingText}>Analyzing QR code patterns & security features...</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <View style={styles.errorHeaderRow}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>No Readable QR Code Found</Text>
            </View>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <View style={styles.tipsBox}>
              <Text style={styles.tipsTitle}>💡 Helpful Tips for Clear Capture:</Text>
              <Text style={styles.tipItem}>• Ensure all 4 corner finder patterns of the QR code are inside the frame.</Text>
              <Text style={styles.tipItem}>• Avoid overhead glare, specular reflections, or deep shadows on laminated stands.</Text>
              <Text style={styles.tipItem}>• Hold device steady or clean camera lens to eliminate motion blur.</Text>
              <Text style={styles.tipItem}>• For small stickers, crop closer or position camera 15-20 cm away.</Text>
            </View>
          </View>
        ) : null}

        {selectedUri && !isProcessing ? (
          <TouchableOpacity style={styles.retryButton} onPress={pickImage}>
            <Text style={styles.retryButtonText}>Select Different Image</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <DisclaimerBanner />

      {/* Multiple QR Codes Modal Selector */}
      <MultipleQrModal
        visible={showMultiQrModal}
        qrCodes={candidateQrs}
        onSelect={(payload) => {
          setShowMultiQrModal(false);
          handleDecodedPayload(payload);
        }}
        onCancel={() => {
          setShowMultiQrModal(false);
          setCandidateQrs([]);
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
    padding: 20
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 18
  },
  dropZone: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    marginVertical: 12
  },
  dropIcon: {
    fontSize: 40,
    marginBottom: 10
  },
  dropText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryLight,
    marginBottom: 4
  },
  dropSubtext: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  previewContainer: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.bgInput,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImage: {
    width: '100%',
    height: '100%'
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    padding: 14,
    borderRadius: 12,
    marginVertical: 10
  },
  processingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginLeft: 12,
    flex: 1
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 14
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  errorIcon: {
    fontSize: 18,
    marginRight: 8
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  errorText: {
    color: '#FECACA',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10
  },
  tipsBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 4
  },
  tipsTitle: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  tipItem: {
    color: '#E2E8F0',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 3
  },
  retryButton: {
    backgroundColor: COLORS.bgSecondary,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12
  },
  retryButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  }
});
