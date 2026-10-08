import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../lib/theme';
import { submitScamReport } from '../lib/api-client';

const REASON_OPTIONS = [
  { id: 'phishing', label: '🎣 Phishing / Fake Banking Portal' },
  { id: 'fake_support', label: '📞 Fake Support / Helpline Impersonation' },
  { id: 'impersonation', label: '🎭 Brand or Government Identity Theft' },
  { id: 'unauthorized_charge', label: '💳 "Scan to Receive Money" PIN Trap' },
  { id: 'other', label: '⚠️ Other Fraudulent Activity' }
] as const;

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vpa?: string }>();

  const [vpa, setVpa] = useState(params.vpa ?? '');
  const [reason, setReason] = useState<string>('fake_support');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSubmit = async () => {
    if (!vpa.trim() || !vpa.includes('@')) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid UPI address (e.g. username@bank).'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const result = await submitScamReport(vpa.trim(), reason, note.trim() || undefined);
    setIsSubmitting(false);

    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: result.message
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: result.message
      });
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Submit Scam Intelligence</Text>
        <Text style={styles.subtitle}>
          Help protect other users by submitting verified fraudulent UPI handles to the community database.
        </Text>

        {/* VPA Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>UPI ID / VPA to Report *</Text>
          <TextInput
            style={styles.textInput}
            value={vpa}
            onChangeText={setVpa}
            placeholder="e.g. sbi.refund.desk@ybl"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Reason Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Select Scam Category *</Text>
          {REASON_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.reasonChip,
                reason === opt.id && styles.reasonChipSelected
              ]}
              onPress={() => setReason(opt.id)}
            >
              <Text
                style={[
                  styles.reasonChipText,
                  reason === opt.id && styles.reasonChipTextSelected
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Additional Note */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Additional Context (Optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="Describe how the scammer approached you (e.g. OLX listing, WhatsApp refund link)..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <Text style={styles.privacyText}>
            Privacy Guaranteed: We never collect your name, phone number, or bank details. Only a cryptographic one-way hash of your device identifier is stored to prevent automated spam.
          </Text>
        </View>

        {/* Status Feedback */}
        {statusMessage ? (
          <View
            style={[
              styles.feedbackBox,
              statusMessage.type === 'success'
                ? styles.feedbackSuccess
                : styles.feedbackError
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                statusMessage.type === 'success'
                  ? styles.feedbackSuccessText
                  : styles.feedbackErrorText
              ]}
            >
              {statusMessage.text}
            </Text>
          </View>
        ) : null}

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </View>
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
    padding: 20
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
    marginBottom: 20
  },
  inputGroup: {
    marginBottom: 16
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  textInput: {
    backgroundColor: COLORS.bgInput,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.textPrimary,
    fontSize: 14,
    padding: 14
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top'
  },
  reasonChip: {
    backgroundColor: COLORS.bgInput,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8
  },
  reasonChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.15)'
  },
  reasonChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500'
  },
  reasonChipTextSelected: {
    color: COLORS.primaryLight,
    fontWeight: '700'
  },
  privacyNote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
    alignItems: 'flex-start'
  },
  privacyIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2
  },
  privacyText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    flex: 1
  },
  feedbackBox: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: COLORS.safe
  },
  feedbackSuccessText: {
    color: COLORS.safe
  },
  feedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: COLORS.highRisk
  },
  feedbackErrorText: {
    color: '#FCA5A5'
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700'
  }
});
