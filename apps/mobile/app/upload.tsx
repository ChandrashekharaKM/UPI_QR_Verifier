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
import { decodeQrFromFile } from '../lib/web-qr';
import { COLORS } from '../lib/theme';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export default function UploadScreen() {
  const router = useRouter();
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDecodedPayload = (payload: string) => {
    setIsProcessing(false);
    router.replace({
      pathname: '/result',
      params: { rawPayload: payload }
    });
  };

  const pickImage = async () => {
    setErrorMessage(null);

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

          const result = await decodeQrFromFile(file);
          if (result) {
            handleDecodedPayload(result);
          } else {
            setIsProcessing(false);
            setErrorMessage(
              'No readable QR code detected in this image. Please ensure good lighting and clear contrast.'
            );
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

      // Decode with expo-camera barcode scanner
      try {
        const barcodes = await Camera.scanFromURLAsync(asset.uri, ['qr']);
        if (barcodes && barcodes.length > 0 && barcodes[0]?.data) {
          handleDecodedPayload(barcodes[0].data);
          return;
        }
      } catch (scanErr) {
        console.warn('Camera.scanFromURLAsync failed, falling back:', scanErr);
      }

      setIsProcessing(false);
      setErrorMessage(
        'Could not decode any payment QR code from the selected image. Please try another image or scan directly using camera.'
      );
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
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {selectedUri && !isProcessing ? (
          <TouchableOpacity style={styles.retryButton} onPress={pickImage}>
            <Text style={styles.retryButtonText}>Select Different Image</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <DisclaimerBanner />
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
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    alignItems: 'flex-start'
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 1
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    flex: 1,
    lineHeight: 18
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
