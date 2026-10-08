export const COLORS = {
  // Backgrounds
  bgPrimary: '#0B0F19',
  bgSecondary: '#111827',
  bgCard: '#1E293B',
  bgCardHover: '#283548',
  bgInput: '#0F172A',

  // Borders
  borderLight: '#334155',
  borderHighlight: '#475569',

  // Typography
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Brand Accent
  primary: '#3B82F6',
  primaryHover: '#2563EB',
  primaryLight: '#60A5FA',

  // Status / Risk
  safe: '#10B981',
  safeBg: '#064E3B',
  safeBorder: '#059669',

  suspicious: '#F59E0B',
  suspiciousBg: '#78350F',
  suspiciousBorder: '#D97706',

  highRisk: '#EF4444',
  highRiskBg: '#7F1D1D',
  highRiskBorder: '#DC2626',

  // Severity
  critical: '#DC2626',
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
