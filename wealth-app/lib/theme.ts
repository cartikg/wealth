// lib/theme.ts — Design system for Wealth mobile app
export const colors = {
  bg: '#0B0F19',
  surface: '#111827',
  surface2: '#1F2937',
  surface3: '#374151',
  border: '#1F2937',
  border2: '#374151',

  text: '#F9FAFB',
  text2: '#9CA3AF',
  text3: '#6B7280',

  primary: '#3B82F6',
  primaryDim: 'rgba(59,130,246,0.10)',
  primaryLight: '#60A5FA',

  teal: '#22C55E',
  tealDim: 'rgba(34,197,94,0.12)',

  rose: '#EF4444',
  roseDim: 'rgba(239,68,68,0.12)',

  lavender: '#8B5CF6',
  lavenderDim: 'rgba(139,92,246,0.12)',

  blue: '#3B82F6',
  blueDim: 'rgba(59,130,246,0.12)',

  cyan: '#22D3EE',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 18,
  full: 999,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
};

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#F59E0B',
  'Shopping': '#8B5CF6',
  'Transport': '#3B82F6',
  'Entertainment': '#EC4899',
  'Bills & Utilities': '#6366F1',
  'Health & Fitness': '#22C55E',
  'Travel': '#14B8A6',
  'Rent/Mortgage': '#F97316',
  'Salary': '#22C55E',
  'Investment Return': '#3B82F6',
  'Transfer': '#6B7280',
  'Education': '#8B5CF6',
  'Personal Care': '#EC4899',
  'Gifts & Donations': '#F59E0B',
  'Subscriptions': '#6366F1',
  'Other': '#6B7280',
};
