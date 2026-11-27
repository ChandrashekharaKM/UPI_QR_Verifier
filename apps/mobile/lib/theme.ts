export interface ThemeColors {
  readonly bgPrimary: string;
  readonly bgSecondary: string;
  readonly bgCard: string;
  readonly bgCardHover: string;
  readonly bgCardElevated: string;
  readonly bgInput: string;
  readonly headerBg: string;
  readonly footerBg: string;
  readonly appShellBg: string;

  readonly borderLight: string;
  readonly borderHighlight: string;
  readonly borderCard: string;
  readonly borderCardHover: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textDim: string;

  readonly primary: string;
  readonly primaryHover: string;
  readonly primaryLight: string;
  readonly accentCyan: string;
  readonly accentIndigo: string;

  readonly safe: string;
  readonly safeBg: string;
  readonly safeBorder: string;
  readonly safeGlow: string;

  readonly suspicious: string;
  readonly suspiciousBg: string;
  readonly suspiciousBorder: string;
  readonly suspiciousGlow: string;

  readonly highRisk: string;
  readonly highRiskBg: string;
  readonly highRiskBorder: string;
  readonly highRiskGlow: string;

  readonly critical: string;
  readonly high: string;
  readonly medium: string;
  readonly low: string;
  readonly info: string;
}

export const DARK_COLORS: ThemeColors = {
  // Backgrounds
  bgPrimary: '#0A0E1A',
  bgSecondary: '#111827',
  bgCard: '#151D30',
  bgCardHover: '#1E293B',
  bgCardElevated: '#1A2338',
  bgInput: '#0D1322',
  headerBg: '#0B0F19',
  footerBg: '#0B0F19',
  appShellBg: '#060911',

  // Borders & Dividers
  borderLight: '#26334D',
  borderHighlight: '#3B82F6',
  borderCard: 'rgba(255, 255, 255, 0.08)',
  borderCardHover: 'rgba(59, 130, 246, 0.35)',

  // Typography
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDim: '#475569',

  // Brand Accent
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: '#38BDF8',
  accentCyan: '#06B6D4',
  accentIndigo: '#6366F1',

  // Status / Risk
  safe: '#10B981',
  safeBg: 'rgba(16, 185, 129, 0.12)',
  safeBorder: '#059669',
  safeGlow: 'rgba(16, 185, 129, 0.25)',

  suspicious: '#F59E0B',
  suspiciousBg: 'rgba(245, 158, 11, 0.12)',
  suspiciousBorder: '#D97706',
  suspiciousGlow: 'rgba(245, 158, 11, 0.25)',

  highRisk: '#F43F5E',
  highRiskBg: 'rgba(244, 63, 94, 0.14)',
  highRiskBorder: '#E11D48',
  highRiskGlow: 'rgba(244, 63, 94, 0.25)',

  // Severity Badges
  critical: '#E11D48',
  high: '#EA580C',
  medium: '#D97706',
  low: '#2563EB',
  info: '#64748B'
};

export const LIGHT_COLORS: ThemeColors = {
  // Backgrounds (Clean, modern White Theme)
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgCardHover: '#F1F5F9',
  bgCardElevated: '#FFFFFF',
  bgInput: '#F1F5F9',
  headerBg: '#FFFFFF',
  footerBg: '#FFFFFF',
  appShellBg: '#F8FAFC',

  // Borders & Dividers
  borderLight: '#E2E8F0',
  borderHighlight: '#0284C7',
  borderCard: '#E2E8F0',
  borderCardHover: '#CBD5E1',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textDim: '#94A3B8',

  // Brand Accent
  primary: '#0284C7',
  primaryHover: '#0369A1',
  primaryLight: '#0284C7',
  accentCyan: '#0891B2',
  accentIndigo: '#4F46E5',

  // Status / Risk
  safe: '#059669',
  safeBg: '#ECFDF5',
  safeBorder: '#10B981',
  safeGlow: 'rgba(16, 185, 129, 0.15)',

  suspicious: '#D97706',
  suspiciousBg: '#FFFBEB',
  suspiciousBorder: '#F59E0B',
  suspiciousGlow: 'rgba(245, 158, 11, 0.15)',

  highRisk: '#E11D48',
  highRiskBg: '#FFF1F2',
  highRiskBorder: '#F43F5E',
  highRiskGlow: 'rgba(244, 63, 94, 0.15)',

  // Severity Badges
  critical: '#E11D48',
  high: '#EA580C',
  medium: '#D97706',
  low: '#0284C7',
  info: '#64748B'
};

// Default exported COLORS (matches DARK_COLORS for static styles backward compatibility)
export const COLORS = DARK_COLORS;

export function getRiskColor(
  category: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK',
  palette: ThemeColors = DARK_COLORS
): string {
  switch (category) {
    case 'SAFE':
      return palette.safe;
    case 'SUSPICIOUS':
      return palette.suspicious;
    case 'HIGH_RISK':
      return palette.highRisk;
  }
}

export function getRiskBgColor(
  category: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK',
  palette: ThemeColors = DARK_COLORS
): string {
  switch (category) {
    case 'SAFE':
      return palette.safeBg;
    case 'SUSPICIOUS':
      return palette.suspiciousBg;
    case 'HIGH_RISK':
      return palette.highRiskBg;
  }
}

export function getSeverityColor(
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
  palette: ThemeColors = DARK_COLORS
): string {
  switch (severity) {
    case 'critical':
      return palette.critical;
    case 'high':
      return palette.high;
    case 'medium':
      return palette.medium;
    case 'low':
      return palette.low;
    case 'info':
      return palette.info;
  }
}
