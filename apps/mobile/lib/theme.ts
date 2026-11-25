export const COLORS = {
  // Backgrounds
  bgPrimary: '#0A0E1A',
  bgSecondary: '#111827',
  bgCard: '#151D30',
  bgCardHover: '#1E293B',
  bgCardElevated: '#1A2338',
  bgInput: '#0D1322',

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
} as const;

export function getRiskColor(category: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK'): string {
  switch (category) {
    case 'SAFE':
      return COLORS.safe;
    case 'SUSPICIOUS':
      return COLORS.suspicious;
    case 'HIGH_RISK':
      return COLORS.highRisk;
  }
}

export function getRiskBgColor(category: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK'): string {
  switch (category) {
    case 'SAFE':
      return COLORS.safeBg;
    case 'SUSPICIOUS':
      return COLORS.suspiciousBg;
    case 'HIGH_RISK':
      return COLORS.highRiskBg;
  }
}

export function getSeverityColor(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): string {
  switch (severity) {
    case 'critical':
      return COLORS.critical;
    case 'high':
      return COLORS.high;
    case 'medium':
      return COLORS.medium;
    case 'low':
      return COLORS.low;
    case 'info':
      return COLORS.info;
  }
}
