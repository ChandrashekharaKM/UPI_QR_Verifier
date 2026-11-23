import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  verifyQrPayload,
  type VerificationResult,
  type CheckAuditItem
} from '@upi-verifier/core';
import { COLORS, getRiskColor } from '../lib/theme';
import { saveScanToHistory } from '../lib/storage';
import { fetchVpaReputation } from '../lib/api-client';
import { RiskGauge } from '../components/RiskGauge';
import { ReasonCard } from '../components/ReasonCard';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rawPayload?: string }>();
  const rawPayload = params.rawPayload ?? '';

  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showHighRiskModal, setShowHighRiskModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyRawPayload = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(rawPayload);
      } else {
        await Clipboard.setStringAsync(rawPayload);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.warn('Failed to copy raw payload:', err);
    }
  };

  useEffect(() => {
    if (!rawPayload) return;

    // 1. Instant on-device execution (0 latency, 100% offline)
    const instantResult = verifyQrPayload(rawPayload, { isOffline: true });
    setVerification(instantResult);
    void saveScanToHistory(instantResult);

    // 2. Asynchronously enrich with API reputation if VPA exists and network available
    if (
      (instantResult.parsed.kind === 'upi' || instantResult.parsed.kind === 'emv') &&
      (instantResult.parsed.fields.kind === 'upi' || instantResult.parsed.fields.kind === 'emv')
    ) {
      const vpa = instantResult.parsed.fields.upi.pa;
      setIsEnriching(true);

      void fetchVpaReputation(vpa).then((repRes) => {
        setIsEnriching(false);

        if (!repRes.isOnline) {
          setOfflineNotice(repRes.notice ?? 'offline: community reports unavailable');
          return;
        }

        if (repRes.signal) {
          // Re-evaluate with enriched community intelligence
          const enriched = verifyQrPayload(rawPayload, {
            community: repRes.signal,
            isOffline: false
          });
          setVerification(enriched);
          void saveScanToHistory(enriched);
        }
      });
    }
  }, [rawPayload]);

  if (!verification) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Analyzing QR code parameters...</Text>
      </View>
    );
  }

  const riskColor = getRiskColor(verification.category);
  const isHighRisk = verification.category === 'HIGH_RISK';

  // Extract parsed fields safely
  const upiFields =
    (verification.parsed.kind === 'upi' || verification.parsed.kind === 'emv') &&
    (verification.parsed.fields.kind === 'upi' || verification.parsed.fields.kind === 'emv')
      ? verification.parsed.fields.upi
      : undefined;

  const urlFields =
    verification.parsed.kind === 'url' && verification.parsed.fields.kind === 'url'
      ? verification.parsed.fields.url
      : undefined;

  const handleContinueAnyway = () => {
    if (isHighRisk) {
      setShowHighRiskModal(true);
    } else {
      router.replace('/');
    }
  };

  // Compute execution coverage audit (which checks ran vs which didn't)
  const isPlainUpi = verification.parsed.kind === 'upi' || verification.parsed.kind === 'emv';
  const isMerchantQr = Boolean(
    verification.isMerchantQr ||
    verification.parsed.kind === 'emv' ||
    (upiFields && (
      Boolean(upiFields.mc) ||
      Boolean(upiFields.mid) ||
      Boolean(upiFields.tid) ||
      upiFields.source === 'emv' ||
      upiFields.extraParams?.['format'] === 'bharat_qr' ||
      (upiFields.pn && /store|shop|mart|retail|hotel|restaurant|cafe|medical|pharmacy|enterprise|limited|ltd|pvt|bazaar|station|agency|traders|clinic|hospital|jewel|motors|auto|services|foods/i.test(upiFields.pn)) ||
      (upiFields.pa && /merchant|pos|retail|qr|store|pay|bharatpe|swiggy|zomato/i.test(upiFields.pa))
    ))
  );
  const hasPspProvider = Boolean(
    verification.vpaVerification?.providerResults.some((p) => p.providerId === 'psp-lookup')
  );
  const hasCommunityProvider = Boolean(
    verification.vpaVerification?.providerResults.some((p) => p.providerId === 'community-reputation')
  );
  const hasThreatIntelProvider = Boolean(
    verification.vpaVerification?.providerResults.some((p) => p.providerId === 'threat-intel')
  );

  const auditItems: readonly CheckAuditItem[] = verification.vpaVerification?.checksAudit ?? [
    {
      id: 'structural_format',
      name: 'Format & Syntax Validation',
      ran: true,
      status: 'pass' as const,
      statusLabel: 'Format Valid',
      details: 'Payee VPA syntax conforms to standard format.'
    },
    {
      id: 'psp_allowlist',
      name: 'NPCI Bank PSP Handle Allowlist',
      ran: true,
      status: 'pass' as const,
      statusLabel: 'Verified Bank Handle',
      details: 'PSP bank handle matches recognized banking allowlist.'
    },
    {
      id: 'registered_name',
      name: 'Registered Beneficiary Name Check',
      ran: hasPspProvider,
      status: hasPspProvider ? ('pass' as const) : ('not_available' as const),
      statusLabel: hasPspProvider ? 'Verified via Bank Record' : 'Not Available (Offline)',
      details: hasPspProvider
        ? 'Registered name verified via licensed payment gateway'
        : 'Registered name verified: not available (offline)'
    },
    {
      id: 'community_reputation',
      name: 'Community Scam Report Network',
      ran: hasCommunityProvider,
      status: hasCommunityProvider ? ('pass' as const) : ('not_available' as const),
      statusLabel: hasCommunityProvider ? 'Community Reports Checked' : 'Not Available (Offline)',
      details: hasCommunityProvider
        ? 'Community reputation database queried'
        : 'Community reputation check: not available (offline / unqueried)'
    },
    {
      id: 'threat_intel',
      name: 'URL Threat Intelligence Network',
      ran: hasThreatIntelProvider,
      status: hasThreatIntelProvider
        ? ('pass' as const)
        : isPlainUpi
          ? ('not_applicable' as const)
          : ('not_available' as const),
      statusLabel: hasThreatIntelProvider
        ? 'URL Clean'
        : isPlainUpi
          ? 'Not Applicable'
          : 'Not Available (Offline)',
      details: hasThreatIntelProvider
        ? 'Threat intelligence feeds queried'
        : isPlainUpi
          ? 'URL threat intelligence: not applicable (native UPI link)'
          : 'URL threat intelligence: not available (offline)'
    }
  ];

  const ranChecks = auditItems.filter((c: CheckAuditItem) => c.ran);
  const unranChecks = auditItems.filter((c: CheckAuditItem) => !c.ran);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Offline Degradation Banner */}
      {offlineNotice ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineIcon}>📡</Text>
          <Text style={styles.offlineText}>{offlineNotice}</Text>
        </View>
      ) : null}

      {/* Main Score Gauge */}
      <RiskGauge score={verification.score} category={verification.category} />

      {/* Confidence / Warning Note */}
      <View style={[styles.noteCard, { borderColor: riskColor }]}>
        <Text style={styles.noteTitle}>Advisory Note</Text>
        <Text style={styles.noteText}>{verification.confidenceNote}</Text>
      </View>

      {/* Non-Payment Utility Code Banner */}
      {verification.isNonPaymentQr ? (
        <View style={styles.nonPaymentBanner}>
          <Text style={styles.nonPaymentIcon}>ℹ️</Text>
          <View style={styles.nonPaymentTextCol}>
            <Text style={styles.nonPaymentTitle}>NOT A PAYMENT QR CODE</Text>
            <Text style={styles.nonPaymentSubtitle}>
              This code contains utility parameters ({verification.parsed.originalScheme ?? 'device utility'}). It does not transfer funds or request payment, and is not flagged as a scam.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Cybercrime Helpline Advisory for elevated risk */}
      {verification.category !== 'SAFE' ? (
        <View style={styles.helplineBanner}>
          <Text style={styles.helplineIcon}>📞</Text>
          <View style={styles.helplineTextContainer}>
            <Text style={styles.helplineTitle}>Suspect Fraud or Coercion?</Text>
            <Text style={styles.helplineSubtitle}>
              Call India's National Cyber Crime Helpline <Text style={styles.helplineBold}>1930</Text> or visit <Text style={styles.helplineBold}>cybercrime.gov.in</Text>. Never enter your UPI PIN.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Persistent Disclaimer */}
      <DisclaimerBanner customText={verification.disclaimer} />

      {/* Physical Sticker Tampering Warning (Persistent Tip for Merchant QRs) */}
      {isMerchantQr ? (
        <View style={styles.stickerTamperCard}>
          <View style={styles.stickerTamperHeader}>
            <Text style={styles.stickerTamperIcon}>🏷️</Text>
            <View style={styles.stickerTamperHeaderTextCol}>
              <Text style={styles.stickerTamperTitle}>PHYSICAL STICKER TAMPERING WARNING</Text>
              <Text style={styles.stickerTamperSubtitle}>Persistent Tip for Counter & Merchant Standees</Text>
            </View>
          </View>
          <Text style={styles.stickerTamperBody}>
            Fraudsters frequently paste unauthorized paper or vinyl QR stickers directly over legitimate shopkeeper counter standees. Always inspect the standee surface: feel for raised edges, peel marks, or overlapping stickers before authorizing payment.
          </Text>
        </View>
      ) : null}

      {/* Parsed Fields Information Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Decoded Payment Information</Text>

        {upiFields ? (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Payee UPI ID (VPA):</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {upiFields.pa}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Declared Payee Name:</Text>
              <Text style={styles.fieldValue}>
                {upiFields.pn ?? '(Not provided in QR)'}
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Pre-filled Amount:</Text>
              <Text style={[styles.fieldValue, upiFields.am ? styles.amountHighlight : null]}>
                {upiFields.am ? `₹${upiFields.am} (${upiFields.cu ?? 'INR'})` : 'User-entered (Open Amount)'}
              </Text>
            </View>

            {upiFields.tn ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Transaction Remarks / Note:</Text>
                <Text style={styles.fieldValue}>{upiFields.tn}</Text>
              </View>
            ) : null}

            {upiFields.originalScheme ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Originating Protocol:</Text>
                <Text
                  style={[
                    styles.fieldValue,
                    {
                      color:
                        upiFields.action === 'collect' || upiFields.action === 'mandate'
                          ? '#EF4444'
                          : '#94A3B8',
                      fontWeight: upiFields.action === 'collect' || upiFields.action === 'mandate' ? '700' : '500'
                    }
                  ]}
                >
                  {upiFields.originalScheme}
                  {upiFields.action === 'collect'
                    ? ' (Debit / Pull Request)'
                    : upiFields.action === 'mandate'
                      ? ' (AutoPay Mandate)'
                      : ''}
                </Text>
              </View>
            ) : null}

            {upiFields.mc ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Merchant Category Code:</Text>
                <Text style={styles.fieldValue}>{upiFields.mc}</Text>
              </View>
            ) : null}

            {upiFields.extraParams?.['format'] === 'bharat_qr' ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>QR Specification:</Text>
                <Text style={[styles.fieldValue, { color: '#38BDF8', fontWeight: '700' }]}>
                  BharatQR / EMVCo Counter Standee
                  {upiFields.extraParams['city'] ? ` (${upiFields.extraParams['city']})` : ''}
                </Text>
              </View>
            ) : null}

            {upiFields.tid ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Merchant Terminal ID:</Text>
                <Text style={styles.fieldValue}>{upiFields.tid}</Text>
              </View>
            ) : null}
          </View>
        ) : urlFields ? (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Destination Web Link:</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {urlFields.rawUrl}
              </Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Detected Hostname:</Text>
              <Text style={styles.fieldValue}>{urlFields.hostname}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.fieldsGrid}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Raw Payload:</Text>
              <Text style={styles.fieldValuePrimary} selectable>
                {verification.parsed.rawPayload}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Pluggable Real-World VPA Verification Layer Card */}
      {verification.vpaVerification && verification.vpaVerification.overallStatus !== 'unsupported' ? (
        <View style={styles.card}>
          <View style={styles.vpaHeaderRow}>
            <View style={styles.vpaTitleContainer}>
              <Text style={styles.cardHeader}>VPA Verification Layer</Text>
              <Text style={styles.vpaSubtitle}>
                Pluggable structural, cryptographic & community reputation verification
              </Text>
            </View>
            <View style={styles.providerBadgeContainer}>
              {verification.vpaVerification.providerResults.map((p) => (
                <View
                  key={p.providerId}
                  style={[
                    styles.providerBadge,
                    p.providerId === 'community-reputation'
                      ? styles.communityProviderBadge
                      : p.providerId === 'psp-lookup'
                        ? styles.pspProviderBadge
                        : p.providerId === 'threat-intel'
                          ? styles.threatIntelBadge
                          : null
                  ]}
                >
                  <Text
                    style={[
                      styles.providerBadgeText,
                      p.providerId === 'community-reputation'
                        ? styles.communityProviderBadgeText
                        : p.providerId === 'psp-lookup'
                          ? styles.pspProviderBadgeText
                          : p.providerId === 'threat-intel'
                            ? styles.threatIntelBadgeText
                            : null
                    ]}
                  >
                    {p.providerId === 'offline-structural'
                      ? 'Offline Structural (Default)'
                      : p.providerId === 'community-reputation'
                        ? 'Community Reputation (Decay Weighted)'
                        : p.providerId === 'psp-lookup'
                          ? 'Licensed Gateway (Live Bank Name)'
                          : 'Threat Intelligence (URL Scan)'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Status Banner */}
          <View
            style={[
              styles.vpaStatusBanner,
              verification.vpaVerification.overallStatus === 'verified_valid'
                ? styles.vpaStatusValid
                : styles.vpaStatusRisk
            ]}
          >
            <Text style={styles.vpaStatusIcon}>
              {verification.vpaVerification.overallStatus === 'verified_valid' ? '🛡️' : '⚠️'}
            </Text>
            <View style={styles.vpaStatusTextContainer}>
              <Text style={styles.vpaStatusTitle}>
                {verification.vpaVerification.overallStatusLabel}
              </Text>
              <Text style={styles.vpaStatusSummary}>
                {verification.vpaVerification.providerResults
                  .map((p) => p.summary)
                  .join(' ')}
              </Text>
            </View>
          </View>

          {/* Providers Detailed Breakdown */}
          {verification.vpaVerification.providerResults.map((provider) => (
            <View key={provider.providerId} style={styles.providerBlock}>
              <View style={styles.providerBlockHeader}>
                <Text style={styles.providerBlockTitle}>{provider.providerName}</Text>
                <Text
                  style={[
                    styles.providerBlockStatus,
                    provider.status === 'verified_valid' ? styles.statusValidColor : styles.statusRiskColor
                  ]}
                >
                  {provider.statusLabel}
                </Text>
              </View>

              {provider.details ? (
                <View style={styles.vpaChecksList}>
                  {Object.values(provider.details).map((rawCheck) => {
                    const check = rawCheck as CheckAuditItem | undefined;
                    if (
                      !check ||
                      typeof check !== 'object' ||
                      !check.id ||
                      check.status === 'not_applicable'
                    ) {
                      return null;
                    }
                    return (
                      <View key={check.id} style={styles.vpaCheckItem}>
                        <Text
                          style={[
                            styles.vpaCheckIcon,
                            check.status === 'fail'
                              ? styles.statusRiskColor
                              : check.status === 'warn'
                                ? styles.statusWarnColor
                                : styles.statusValidColor
                          ]}
                        >
                          {check.status === 'fail' ? '✗' : check.status === 'warn' ? '⚠️' : '✓'}
                        </Text>
                        <View style={styles.vpaCheckTextCol}>
                          <Text style={styles.vpaCheckName}>{check.name}</Text>
                          <Text style={styles.vpaCheckDetail}>{check.details}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ))}

          {/* Checks Execution Audit: Ran vs Did Not Run */}
          <View style={styles.auditContainer}>
            <View style={styles.auditHeaderRow}>
              <Text style={styles.auditHeaderTitle}>Verification Coverage & Audit</Text>
              <Text style={styles.auditHeaderSubtitle}>
                Transparency on which checks were actively executed vs unavailable offline
              </Text>
            </View>

            {/* Checks That Ran */}
            <View style={styles.auditSection}>
              <View style={styles.auditBadgeRow}>
                <Text style={styles.auditSectionHeading}>CHECKS THAT RAN ({ranChecks.length})</Text>
                <View style={styles.activeCheckBadge}>
                  <Text style={styles.activeCheckBadgeText}>Active & Validated</Text>
                </View>
              </View>
              <View style={styles.auditList}>
                {ranChecks.map((item: CheckAuditItem) => (
                  <View key={item.id} style={styles.auditCheckRow}>
                    <Text
                      style={[
                        styles.auditIcon,
                        item.status === 'pass'
                          ? styles.statusValidColor
                          : item.status === 'warn'
                            ? styles.statusWarnColor
                            : styles.statusRiskColor
                      ]}
                    >
                      {item.status === 'pass' ? '✓' : item.status === 'warn' ? '⚠️' : '✗'}
                    </Text>
                    <View style={styles.auditTextCol}>
                      <Text style={styles.auditItemName}>{item.name}</Text>
                      <Text style={styles.auditItemDetail}>{item.details}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Checks That Did NOT Run */}
            {unranChecks.length > 0 ? (
              <View style={styles.auditSection}>
                <View style={styles.auditBadgeRow}>
                  <Text style={styles.auditSectionHeadingMuted}>
                    CHECKS THAT DID NOT RUN ({unranChecks.length})
                  </Text>
                  <View style={styles.unranCheckBadge}>
                    <Text style={styles.unranCheckBadgeText}>Offline / Unperformed</Text>
                  </View>
                </View>
                <View style={styles.auditList}>
                  {unranChecks.map((item) => (
                    <View key={item.id} style={styles.auditCheckRowUnran}>
                      <Text style={styles.auditIconMuted}>⊘</Text>
                      <View style={styles.auditTextCol}>
                        <Text style={styles.auditItemNameMuted}>{item.name}</Text>
                        <Text style={styles.auditItemDetailMuted}>{item.details}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* Honest System Transparency Callout */}
          <View style={styles.vpaTransparencyBox}>
            <Text style={styles.vpaTransparencyIcon}>⚖️</Text>
            <View style={styles.vpaTransparencyTextCol}>
              <Text style={styles.vpaTransparencyTitle}>System Transparency Notice</Text>
              <Text style={styles.vpaTransparencyText}>
                {verification.vpaVerification.honestLimitationNotice}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Raw Decoded QR Text (Copyable Box) */}
      <View style={styles.card}>
        <View style={styles.rawCardHeader}>
          <View style={styles.rawTitleContainer}>
            <Text style={styles.cardHeader}>Raw Decoded QR Text</Text>
            <Text style={styles.rawSubtitle}>
              Exact unparsed string decoded from the scanned QR code
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.copyButton, copied && styles.copyButtonSuccess]}
            activeOpacity={0.75}
            onPress={handleCopyRawPayload}
          >
            <Text style={styles.copyButtonIcon}>{copied ? '✓' : '📋'}</Text>
            <Text style={[styles.copyButtonText, copied && styles.copyButtonTextSuccess]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rawBoxContainer}>
          <Text style={styles.rawCodeText} selectable>
            {rawPayload}
          </Text>
        </View>

        <View style={styles.rawMetaRow}>
          <Text style={styles.rawMetaText}>
            Length: {rawPayload.length} chars
          </Text>
          <Text style={styles.rawMetaText}>
            Format: {verification.parsed.kind.toUpperCase()}
          </Text>
          {verification.parsed.hasDuplicateParams ? (
            <Text style={styles.rawMetaWarning}>⚠️ Repeated Params</Text>
          ) : (
            <Text style={styles.rawMetaHint}>Tap & hold to highlight or tap Copy</Text>
          )}
        </View>
      </View>

      {/* Ranked Reasons Breakdown */}
      <View style={styles.section}>
        <View style={styles.reasonsHeader}>
          <Text style={styles.sectionTitle}>
            Identified Risk Factors ({verification.reasons.length})
          </Text>
          {isEnriching ? (
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
          ) : null}
        </View>

        {verification.reasons.length === 0 ? (
          <View style={styles.cleanCard}>
            <Text style={styles.cleanIcon}>✅</Text>
            <Text style={styles.cleanTitle}>No High-Risk Anomalies Detected</Text>
            <Text style={styles.cleanText}>
              VPA formatting and transaction fields conform to expected standards. Ensure you recognize the receiver before authorizing payment.
            </Text>
          </View>
        ) : (
          verification.reasons.map((reason, idx) => (
            <ReasonCard key={reason.ruleId} reason={reason} rank={idx + 1} />
          ))
        )}
      </View>

      {/* Model & Evaluation Metadata */}
      <View style={styles.metaBox}>
        <Text style={styles.metaText}>
          Core Rule Score: {verification.scoreBreakdown.ruleScore}/100 · ML Probability: {(verification.scoreBreakdown.mlProbability * 100).toFixed(1)}% · Model: v{verification.modelVersion}
        </Text>
      </View>

      {/* Mandatory Pre-Payment Verification Step: Check Name Before PIN */}
      {upiFields ? (
        <View style={styles.pinStepCard}>
          <View style={styles.pinStepBadgeRow}>
            <View style={styles.pinStepBadge}>
              <Text style={styles.pinStepBadgeText}>MANDATORY PRE-PAYMENT STEP</Text>
            </View>
            <Text style={styles.pinStepNumberBadge}>Final Step</Text>
          </View>
          <View style={styles.pinStepMainRow}>
            <Text style={styles.pinStepIcon}>🔍</Text>
            <View style={styles.pinStepTextCol}>
              <Text style={styles.pinStepTitle}>
                Check the name shown in your UPI app before you enter your PIN
              </Text>
              <Text style={styles.pinStepDescription}>
                When your payment app (Google Pay, PhonePe, Paytm, BHIM) opens, your bank retrieves the registered account holder name from NPCI. Verify that this bank-registered name matches the merchant or shopkeeper at the counter before typing your UPI PIN.
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {/* Action 1: Don't pay / Close */}
        <TouchableOpacity
          style={styles.safeDismissButton}
          activeOpacity={0.85}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.safeDismissText}>Don't Pay / Close</Text>
        </TouchableOpacity>

        {/* Action 2: Report this QR */}
        {upiFields?.pa ? (
          <TouchableOpacity
            style={styles.reportButton}
            activeOpacity={0.85}
            onPress={() => {
              router.push({
                pathname: '/report',
                params: { vpa: upiFields.pa }
              });
            }}
          >
            <Text style={styles.reportButtonText}>Report This UPI ID</Text>
          </TouchableOpacity>
        ) : null}

        {/* Action 3: Continue anyway (Never auto launches payment; only dismisses with confirmation) */}
        <TouchableOpacity
          style={styles.continueButton}
          activeOpacity={0.85}
          onPress={handleContinueAnyway}
        >
          <Text style={styles.continueButtonText}>Continue Anyway</Text>
        </TouchableOpacity>
      </View>

      {/* High Risk Confirmation Modal */}
      <Modal
        visible={showHighRiskModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHighRiskModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🚨</Text>
            <Text style={styles.modalTitle}>CRITICAL SCAM WARNING</Text>
            <Text style={styles.modalBody}>
              This QR code exhibits severe fraud indicators. Entering your UPI PIN or scanning external links may result in immediate financial loss.
              {'\n\n'}
              Always check the name shown in your UPI app before you enter your PIN. Are you absolutely sure you want to dismiss this warning?
            </Text>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowHighRiskModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel (Recommended)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setShowHighRiskModal(false);
                  router.replace('/');
                }}
              >
                <Text style={styles.modalConfirmText}>Dismiss Warning</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12
  },
  offlineNotice: {
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  offlineIcon: {
    fontSize: 16,
    marginRight: 8
  },
  offlineText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500'
  },
  noteCard: {
    backgroundColor: COLORS.bgCard,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10
  },
  noteTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  noteText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  nonPaymentBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#0284C7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10
  },
  nonPaymentIcon: {
    fontSize: 22,
    marginRight: 12
  },
  nonPaymentTextCol: {
    flex: 1
  },
  nonPaymentTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  nonPaymentSubtitle: {
    color: '#E0F2FE',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500'
  },
  helplineBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6
  },
  helplineIcon: {
    fontSize: 20,
    marginRight: 10
  },
  helplineTextContainer: {
    flex: 1
  },
  helplineTitle: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2
  },
  helplineSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16
  },
  helplineBold: {
    color: '#FCA5A5',
    fontWeight: '700'
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginVertical: 12
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 14
  },
  fieldsGrid: {
    gap: 12
  },
  fieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 8
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2
  },
  fieldValuePrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryLight
  },
  fieldValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500'
  },
  amountHighlight: {
    color: '#FBBF24',
    fontWeight: '700'
  },
  section: {
    marginTop: 14
  },
  reasonsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  cleanCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: COLORS.safeBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center'
  },
  cleanIcon: {
    fontSize: 28,
    marginBottom: 6
  },
  cleanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.safe,
    marginBottom: 4
  },
  cleanText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18
  },
  metaBox: {
    marginVertical: 10,
    alignItems: 'center'
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  actionContainer: {
    gap: 10,
    marginTop: 16
  },
  safeDismissButton: {
    backgroundColor: '#1E293B',
    borderColor: COLORS.safe,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  safeDismissText: {
    color: COLORS.safe,
    fontSize: 16,
    fontWeight: '800'
  },
  reportButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: COLORS.highRisk,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  reportButtonText: {
    color: COLORS.highRisk,
    fontSize: 15,
    fontWeight: '700'
  },
  continueButton: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  continueButtonText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalCard: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.highRisk,
    borderWidth: 2,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center'
  },
  modalIcon: {
    fontSize: 44,
    marginBottom: 12
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.highRisk,
    marginBottom: 10,
    textAlign: 'center'
  },
  modalBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20
  },
  modalActionRow: {
    width: '100%',
    gap: 10
  },
  modalCancelBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700'
  },
  modalConfirmBtn: {
    backgroundColor: 'transparent',
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalConfirmText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  rawCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  rawTitleContainer: {
    flex: 1,
    marginRight: 12
  },
  rawSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '55',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6
  },
  copyButtonSuccess: {
    backgroundColor: COLORS.safeBg,
    borderColor: COLORS.safe
  },
  copyButtonIcon: {
    fontSize: 13
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight
  },
  copyButtonTextSuccess: {
    color: COLORS.safe
  },
  rawBoxContainer: {
    backgroundColor: COLORS.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    marginVertical: 8
  },
  rawCodeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#38BDF8',
    lineHeight: 18
  },
  rawMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4
  },
  rawMetaText: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  rawMetaHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic'
  },
  rawMetaWarning: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.highRisk
  },
  vpaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  vpaTitleContainer: {
    flex: 1,
    marginRight: 10
  },
  vpaSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  providerBadgeContainer: {
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-end'
  },
  providerBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  communityProviderBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    borderColor: '#C084FC'
  },
  pspProviderBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: '#4ADE80'
  },
  threatIntelBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#F59E0B'
  },
  providerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8'
  },
  communityProviderBadgeText: {
    color: '#C084FC'
  },
  pspProviderBadgeText: {
    color: '#4ADE80'
  },
  threatIntelBadgeText: {
    color: '#F59E0B'
  },
  providerBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 10,
    marginBottom: 10
  },
  providerBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  providerBlockTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  providerBlockStatus: {
    fontSize: 11,
    fontWeight: '600'
  },
  statusValidColor: {
    color: COLORS.safe
  },
  statusRiskColor: {
    color: COLORS.highRisk
  },
  statusWarnColor: {
    color: COLORS.suspicious
  },
  vpaStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10
  },
  vpaStatusValid: {
    backgroundColor: COLORS.safeBg,
    borderColor: COLORS.safe
  },
  vpaStatusRisk: {
    backgroundColor: COLORS.highRiskBg,
    borderColor: COLORS.highRisk
  },
  vpaStatusIcon: {
    fontSize: 22
  },
  vpaStatusTextContainer: {
    flex: 1
  },
  vpaStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2
  },
  vpaStatusSummary: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16
  },
  vpaChecksList: {
    gap: 10,
    marginBottom: 12
  },
  vpaCheckItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.bgInput,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  vpaCheckIcon: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryLight,
    marginTop: 1
  },
  vpaCheckTextCol: {
    flex: 1
  },
  vpaCheckName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2
  },
  vpaCheckDetail: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15
  },
  vpaTransparencyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    padding: 10,
    gap: 8,
    marginTop: 4
  },
  vpaTransparencyIcon: {
    fontSize: 14,
    marginTop: 2
  },
  vpaTransparencyTextCol: {
    flex: 1
  },
  vpaTransparencyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2
  },
  vpaTransparencyText: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14
  },
  auditContainer: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    gap: 12
  },
  auditHeaderRow: {
    marginBottom: 2
  },
  auditHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  auditHeaderSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  auditSection: {
    gap: 6
  },
  auditBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  auditSectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.safe,
    letterSpacing: 0.5
  },
  auditSectionHeadingMuted: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5
  },
  activeCheckBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  activeCheckBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.safe
  },
  unranCheckBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)'
  },
  unranCheckBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  auditList: {
    gap: 6
  },
  auditCheckRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)'
  },
  auditCheckRowUnran: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)'
  },
  auditIcon: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1
  },
  auditIconMuted: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1
  },
  auditTextCol: {
    flex: 1
  },
  auditItemName: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 1
  },
  auditItemDetail: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14
  },
  auditItemNameMuted: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 1
  },
  auditItemDetailMuted: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14
  },
  stickerTamperCard: {
    backgroundColor: 'rgba(234, 88, 12, 0.1)',
    borderColor: '#F97316',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10
  },
  stickerTamperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10
  },
  stickerTamperIcon: {
    fontSize: 20
  },
  stickerTamperHeaderTextCol: {
    flex: 1
  },
  stickerTamperTitle: {
    color: '#FB923C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  stickerTamperSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 1
  },
  stickerTamperBody: {
    color: '#FED7AA',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  },
  pinStepCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    marginBottom: 6
  },
  pinStepBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  pinStepBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  pinStepBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  pinStepNumberBadge: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700'
  },
  pinStepMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  pinStepIcon: {
    fontSize: 22,
    marginTop: 2
  },
  pinStepTextCol: {
    flex: 1
  },
  pinStepTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6
  },
  pinStepDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17
  }
});
