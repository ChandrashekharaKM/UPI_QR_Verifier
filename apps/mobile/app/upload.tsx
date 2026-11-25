import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { scanFromURLAsync, Camera } from 'expo-camera';
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
  const [manualText, setManualText] = useState('');

  const handleDecodedPayload = (payload: string) => {
    setIsProcessing(false);
    setShowMultiQrModal(false);
    router.replace({
      pathname: '/result',
      params: { rawPayload: payload }
    });
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim()) {
        setManualText(text.trim());
      }
    } catch {
      // Ignore clipboard read error
    }
  };

  const pickImage = async () => {
    setErrorMessage(null);
    setCandidateQrs([]);
    setShowMultiQrModal(false);

    try {
      if (Platform.OS === 'web') {
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

      // 1. Try with expo-camera barcode scanner
      try {
        const scanFn = scanFromURLAsync ?? Camera?.scanFromURLAsync;
        if (typeof scanFn === 'function') {
          const barcodes = await scanFn(asset.uri, ['qr']);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              if (b?.data && b.data.trim()) {
                discovered.add(b.data.trim());
              }
            }
          }
        }
      } catch (scanErr) {
        console.warn('Native scanFromURLAsync check failed, proceeding to fallback:', scanErr);
      }

      // 2. Also run multi-pass image decoder if <= 1 found to discover all distinct standees
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
        <Text style={styles.title}>Inspect Image or Standee Photo</Text>
        <Text style={styles.subtitle}>
          Select a saved QR photo, screenshot, bill invoice, or paste raw intent text.
        </Text>

        {selectedUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedUri }} style={styles.previewImage} resizeMode="contain" />
          </View>
        ) : (
          <TouchableOpacity style={styles.dropZone} activeOpacity={0.82} onPress={pickImage}>
            <View style={styles.dropIconCircle}>
              <Text style={styles.dropIcon}>📂</Text>
            </View>
            <Text style={styles.dropText}>Tap to Select QR Image</Text>
            <Text style={styles.dropSubtext}>Browse Photos, Files, or Downloads (PNG, JPG, WEBP)</Text>
          </TouchableOpacity>
        )}

        {isProcessing ? (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
            <Text style={styles.processingText}>Executing multi-pass contrast & TLV extraction...</Text>
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
              <Text style={styles.tipsTitle}>💡 Tips for Clear QR Scanning:</Text>
              <Text style={styles.tipItem}>• Ensure all 4 corner finder patterns of the QR code are inside the frame.</Text>
              <Text style={styles.tipItem}>• Avoid overhead glare, specular reflections, or deep shadows on laminated stands.</Text>
              <Text style={styles.tipItem}>• Hold device steady or clean camera lens to eliminate motion blur.</Text>
              <Text style={styles.tipItem}>• For small stickers, crop closer or position camera 15-20 cm away.</Text>
            </View>
          </View>
        ) : null}

        {selectedUri && !isProcessing ? (
          <TouchableOpacity style={styles.retryButton} activeOpacity={0.8} onPress={pickImage}>
            <Text style={styles.retryButtonText}>Choose Different Photo</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Manual Payload Paste Card */}
      <View style={styles.manualCard}>
        <View style={styles.manualHeader}>
          <Text style={styles.manualTitle}>Or Paste UPI Intent Link</Text>
          <TouchableOpacity style={styles.pasteBtn} onPress={handlePasteClipboard}>
            <Text style={styles.pasteBtnText}>📋 Paste Clipboard</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.manualInput}
          value={manualText}
          onChangeText={setManualText}
          placeholder="upi://pay?pa=shop@bank&pn=Merchant... or BharatQR 000201..."
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <TouchableOpacity
          style={[styles.verifyManualBtn, !manualText.trim() && styles.verifyManualBtnDisabled]}
          disabled={!manualText.trim()}
          onPress={() => handleDecodedPayload(manualText.trim())}
        >
          <Text style={styles.verifyManualBtnText}>Verify Pasted Link</Text>
        </TouchableOpacity>
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
    padding: 18,
    paddingBottom: 40
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.2
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 16
  },
  dropZone: {
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.04)',
    marginVertical: 8
  },
  dropIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.bgCardElevated,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  dropIcon: {
    fontSize: 28
  },
  dropText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  dropSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center'
  },
  previewContainer: {
    width: '100%',
    height: 220,
    backgroundColor: COLORS.bgInput,
    borderRadius: 14,
    overflow: 'hidden',
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight
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
    marginVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  processingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginLeft: 12,
    flex: 1,
    fontWeight: '600'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 14,
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
    fontWeight: '800',
    letterSpacing: 0.3
  },
  errorText: {
    color: '#FECACA',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10
  },
  tipsBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4
  },
  tipsTitle: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '800',
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
    backgroundColor: COLORS.bgCardElevated,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12
  },
  retryButtonText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  manualCard: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14
  },
  manualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  manualTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  pasteBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  pasteBtnText: {
    color: COLORS.primaryLight,
    fontSize: 11,
    fontWeight: '700'
  },
  manualInput: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 10
  },
  verifyManualBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3
  },
  verifyManualBtnDisabled: {
    backgroundColor: COLORS.bgCardElevated,
    opacity: 0.5
  },
  verifyManualBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});
