import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform
} from 'react-native';
import { parsePayload } from '@upi-verifier/core';
import { COLORS } from '../lib/theme';

export interface MultipleQrModalProps {
  visible: boolean;
  qrCodes: string[];
  onSelect: (selectedPayload: string) => void;
  onCancel: () => void;
}

interface ParsedCandidate {
  index: number;
  rawPayload: string;
  payeeName: string;
  targetVpa: string;
  amount?: string;
  schemeLabel: string;
  schemeColor: string;
  isHighRiskIndicator: boolean;
  warningNote?: string;
}

function summarizeCandidate(payload: string, index: number): ParsedCandidate {
  try {
    const parsed = parsePayload(payload);

    if (parsed.fields.kind === 'emv') {
      const emv = parsed.fields.emv;
      const upi = parsed.fields.upi;
      const vpa = upi.pa || 'N/A';
      const name = emv.merchantName || upi.pn || 'Merchant Standee';
      const am = emv.amount || upi.am;

      return {
        index,
        rawPayload: payload,
        payeeName: name,
        targetVpa: vpa,
        amount: am,
        schemeLabel: '🏷️ BharatQR / EMVCo Standee',
        schemeColor: COLORS.primaryLight,
        isHighRiskIndicator: false
      };
    }

    if (parsed.fields.kind === 'upi') {
      const upi = parsed.fields.upi;
      const vpa = upi.pa || 'N/A';
      const name = upi.pn || 'UPI Recipient';
      const am = upi.am;
      const action = upi.action;
      const orig = parsed.originalScheme ?? '';

      if (action === 'collect') {
        return {
          index,
          rawPayload: payload,
          payeeName: name,
          targetVpa: vpa,
          amount: am,
          schemeLabel: '⚠️ Pull / Debit Collect Request',
          schemeColor: COLORS.highRisk,
          isHighRiskIndicator: true,
          warningNote: 'Requests money FROM you (Debit payment)'
        };
      }

      if (action === 'mandate') {
        return {
          index,
          rawPayload: payload,
          payeeName: name,
          targetVpa: vpa,
          amount: am,
          schemeLabel: '📅 AutoPay Recurring Mandate',
          schemeColor: COLORS.suspicious,
          isHighRiskIndicator: true,
          warningNote: 'Authorizes scheduled automatic debits'
        };
      }

      let label = '⚡ UPI Payment';
      let color: string = COLORS.primary;

      if (orig.startsWith('phonepe')) {
        label = '📱 PhonePe QR';
        color = '#5f259f';
      } else if (orig.startsWith('paytm')) {
        label = '📱 Paytm QR';
        color = '#00baf2';
      } else if (orig.startsWith('tez') || orig.startsWith('gpay')) {
        label = '📱 Google Pay QR';
        color = '#34a853';
      } else if (orig.startsWith('bhim')) {
        label = '🇮🇳 BHIM UPI QR';
        color = '#00843d';
      }

      return {
        index,
        rawPayload: payload,
        payeeName: name,
        targetVpa: vpa,
        amount: am,
        schemeLabel: label,
        schemeColor: color,
        isHighRiskIndicator: false
      };
    }

    if (parsed.fields.kind === 'url') {
      const url = parsed.fields.url;
      return {
        index,
        rawPayload: payload,
        payeeName: url.hostname || 'External Website Link',
        targetVpa: url.rawUrl || payload,
        schemeLabel: '🌐 External Web URL',
        schemeColor: COLORS.suspicious,
        isHighRiskIndicator: true,
        warningNote: 'External website link (not a direct UPI URI)'
      };
    }

    return {
      index,
      rawPayload: payload,
      payeeName: 'Non-UPI Code / Data',
      targetVpa: payload.length > 50 ? `${payload.substring(0, 50)}...` : payload,
      schemeLabel: '📄 Raw Code',
      schemeColor: COLORS.textMuted,
      isHighRiskIndicator: false
    };
  } catch {
    return {
      index,
      rawPayload: payload,
      payeeName: 'Unparsed QR Code',
      targetVpa: payload.length > 50 ? `${payload.substring(0, 50)}...` : payload,
      schemeLabel: '❓ Unknown QR',
      schemeColor: COLORS.textMuted,
      isHighRiskIndicator: false
    };
  }
}

export function MultipleQrModal({
  visible,
  qrCodes,
  onSelect,
  onCancel
}: MultipleQrModalProps) {
  if (!visible || qrCodes.length <= 1) {
    return null;
  }

  // Deduplicate payloads while maintaining order
  const distinctPayloads = Array.from(new Set(qrCodes));
  const candidates: ParsedCandidate[] = distinctPayloads.map((payload, idx) =>
    summarizeCandidate(payload, idx)
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {candidates.length} QR Codes Detected
                </Text>
              </View>
            </View>
            <Text style={styles.title}>Which QR Code Do You Want to Verify?</Text>
            <Text style={styles.subtitle}>
              This image contains multiple payment codes. Never guess which one to pay—select the specific code you intend to authorize:
            </Text>
          </View>

          {/* Security Advisory Callout */}
          <View style={styles.advisoryBox}>
            <Text style={styles.advisoryIcon}>🛡️</Text>
            <Text style={styles.advisoryText}>
              Counter stands frequently display multiple stickers (UPI, BharatQR, PhonePe). Verify the merchant name and VPA match what you see at the shop counter.
            </Text>
          </View>

          {/* Candidates List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {candidates.map((cand) => (
              <TouchableOpacity
                key={`candidate-${cand.index}-${cand.rawPayload.substring(0, 20)}`}
                style={[
                  styles.candidateCard,
                  cand.isHighRiskIndicator && styles.candidateCardWarning
                ]}
                activeOpacity={0.75}
                onPress={() => onSelect(cand.rawPayload)}
              >
                {/* Card Top Row: Number & Scheme Badge */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.numberPill}>
                    <Text style={styles.numberPillText}>Option {cand.index + 1}</Text>
                  </View>
                  <View
                    style={[
                      styles.schemePill,
                      { backgroundColor: `${cand.schemeColor}22`, borderColor: cand.schemeColor }
                    ]}
                  >
                    <Text style={[styles.schemePillText, { color: cand.schemeColor }]}>
                      {cand.schemeLabel}
                    </Text>
                  </View>
                </View>

                {/* Card Body: Name, VPA, Amount */}
                <View style={styles.cardBody}>
                  <Text style={styles.payeeName} numberOfLines={1}>
                    {cand.payeeName}
                  </Text>
                  <Text style={styles.vpaHandle} numberOfLines={1}>
                    {cand.targetVpa}
                  </Text>

                  {cand.amount ? (
                    <View style={styles.amountRow}>
                      <Text style={styles.amountLabel}>Pre-filled Amount:</Text>
                      <Text style={styles.amountValue}>₹{cand.amount}</Text>
                    </View>
                  ) : null}

                  {cand.warningNote ? (
                    <View style={styles.warningNoteBox}>
                      <Text style={styles.warningNoteText}>⚠️ {cand.warningNote}</Text>
                    </View>
                  ) : null}

                  {/* Monospace Raw Payload Snippet */}
                  <View style={styles.rawSnippetBox}>
                    <Text style={styles.rawSnippetText} numberOfLines={1}>
                      {cand.rawPayload}
                    </Text>
                  </View>
                </View>

                {/* Selection Action Button */}
                <View style={styles.selectButton}>
                  <Text style={styles.selectButtonText}>
                    Inspect This QR Code →
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Modal Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel / Choose Another Image</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalContainer: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
      },
      default: {
        elevation: 12
      }
    })
  },
  header: {
    marginBottom: 12
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8
  },
  countBadge: {
    backgroundColor: COLORS.primaryLight + '22',
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18
  },
  advisoryBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14
  },
  advisoryIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 1
  },
  advisoryText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16
  },
  scrollList: {
    maxHeight: 380,
    marginVertical: 4
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 6
  },
  candidateCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    padding: 14,
    gap: 10
  },
  candidateCardWarning: {
    borderColor: COLORS.highRiskBorder,
    backgroundColor: COLORS.highRiskBg + '15'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  numberPill: {
    backgroundColor: COLORS.bgPrimary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  numberPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  schemePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  schemePillText: {
    fontSize: 11,
    fontWeight: '700'
  },
  cardBody: {
    gap: 4
  },
  payeeName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  vpaHandle: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.primaryLight
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2
  },
  amountLabel: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.safe
  },
  warningNoteBox: {
    backgroundColor: COLORS.highRiskBg + '33',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.highRiskBorder + '55',
    marginTop: 4
  },
  warningNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.highRisk
  },
  rawSnippetBox: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4
  },
  rawSnippetText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.textMuted
  },
  selectButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 2
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  },
  footer: {
    marginTop: 14,
    alignItems: 'center'
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20
  },
  cancelButtonText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600'
  }
});
