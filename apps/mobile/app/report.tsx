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
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';
import { submitScamReport } from '../lib/api-client';

const REASON_OPTIONS = [
  { id: 'phishing', label: '🎣 Phishing / Fake Banking Portal' },
  { id: 'fake_support', label: '📞 Fake Support / Helpline Impersonation' },
  { id: 'impersonation', label: '🎭 Brand or Government Identity Theft' },
  { id: 'unauthorized_charge', label: '💳 "Scan to Receive Money" PIN Trap' },
  { id: 'other', label: '⚠️ Other Fraudulent Activity' }
] as const;

export default function ReportScreen() {
  const params = useLocalSearchParams<{ vpa?: string }>();
  const { colors, isLight } = useTheme();

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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.content}
    >
      <View
        style={[
          styles.card,
          isLight && {
            backgroundColor: '#FFFFFF',
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOpacity: 0.05
          }
        ]}
      >
        <View style={styles.badgeTop}>
          <Text style={styles.badgeTopText}>COMMUNITY THREAT INTELLIGENCE</Text>
        </View>
        <Text style={[styles.title, isLight && { color: colors.textPrimary }]}>Submit Scam Intelligence</Text>
        <Text style={[styles.subtitle, isLight && { color: colors.textSecondary }]}>
          Help protect other users by submitting verified fraudulent UPI handles to the decay-weighted community database.
        </Text>

        {/* VPA Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && { color: colors.textPrimary }]}>UPI ID / VPA to Report *</Text>
          <TextInput
            style={[
              styles.textInput,
              isLight && {
                backgroundColor: '#F1F5F9',
                borderColor: '#CBD5E1',
                color: colors.textPrimary
              }
            ]}
            value={vpa}
            onChangeText={setVpa}
            placeholder="e.g. sbi.refund.desk@ybl"
            placeholderTextColor={isLight ? '#94A3B8' : COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Reason Selector */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && { color: colors.textPrimary }]}>Select Scam Category *</Text>
          {REASON_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.reasonChip,
                isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
                reason === opt.id && styles.reasonChipSelected,
                reason === opt.id && isLight && { backgroundColor: '#EFF6FF', borderColor: colors.primary }
              ]}
              activeOpacity={0.8}
              onPress={() => setReason(opt.id)}
            >
              <Text
                style={[
                  styles.reasonChipText,
                  isLight && { color: colors.textSecondary },
                  reason === opt.id && styles.reasonChipTextSelected,
                  reason === opt.id && isLight && { color: colors.primary }
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notes Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && { color: colors.textPrimary }]}>Incident Evidence / Notes (Optional)</Text>
          <TextInput
            style={[
              styles.textInput,
              styles.textArea,
              isLight && {
                backgroundColor: '#F1F5F9',
                borderColor: '#CBD5E1',
                color: colors.textPrimary
              }
            ]}
            value={note}
            onChangeText={setNote}
            placeholder="Describe how the QR was encountered (e.g. sticker pasted over stall, SMS link, fake OLX buyer)..."
            placeholderTextColor={isLight ? '#94A3B8' : COLORS.textMuted}
            multiline
            numberOfLines={4}
          />
        </View>

        {statusMessage ? (
          <View
            style={[
              styles.statusBanner,
              statusMessage.type === 'success'
                ? styles.statusBannerSuccess
                : styles.statusBannerError
            ]}
          >
            <Text style={styles.statusBannerIcon}>
              {statusMessage.type === 'success' ? '✓' : '⚠️'}
            </Text>
            <Text
              style={[
                styles.statusBannerText,
                statusMessage.type === 'success'
                  ? styles.statusBannerTextSuccess
                  : styles.statusBannerTextError
              ]}
            >
              {statusMessage.text}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          disabled={isSubmitting}
          activeOpacity={0.85}
          onPress={handleSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit to Community Threat Database</Text>
          )}
        </TouchableOpacity>

        <View style={styles.privacyCallout}>
          <Text style={styles.privacyCalloutText}>
            🛡️ Submissions undergo automated reporter deduplication and exponential time decay (30-day half-life). Device identifiers are cryptographically hashed.
          </Text>
        </View>
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
    padding: 18,
    paddingBottom: 40
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  },
  badgeTop: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  badgeTopText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 20
  },
  inputGroup: {
    marginBottom: 18
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.2
  },
  textInput: {
    backgroundColor: COLORS.bgInput,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 14
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top'
  },
  reasonChip: {
    backgroundColor: COLORS.bgCardElevated,
    borderColor: COLORS.borderCard,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8
  },
  reasonChipSelected: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444'
  },
  reasonChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  reasonChipTextSelected: {
    color: '#F87171',
    fontWeight: '700'
  },
  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1
  },
  statusBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: COLORS.safe
  },
  statusBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: COLORS.highRisk
  },
  statusBannerIcon: {
    fontSize: 16,
    marginRight: 8
  },
  statusBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600'
  },
  statusBannerTextSuccess: {
    color: COLORS.safe
  },
  statusBannerTextError: {
    color: '#FCA5A5'
  },
  privacyCallout: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)'
  },
  privacyCalloutText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16
  }
});
