/**
 * Centralized design tokens for the Health Connect app.
 * Single source of truth for colors, spacing, radii, and typography.
 */

export const palette = {
  // Backgrounds
  bg: '#0B1020',
  surface: '#151B2E',
  surfaceAlt: '#1B2338',
  surfaceDeep: '#0A0F1E',
  border: '#232C45',
  borderSoft: '#1B2338',

  // Text
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Accents
  primary: '#6366F1',
  primarySoft: 'rgba(99, 102, 241, 0.16)',
  teal: '#2DD4BF',
  tealSoft: 'rgba(45, 212, 191, 0.16)',
  amber: '#FBBF24',
  amberSoft: 'rgba(251, 191, 36, 0.16)',
  rose: '#FB7185',
  roseSoft: 'rgba(251, 113, 133, 0.16)',
  sky: '#38BDF8',
  skySoft: 'rgba(56, 189, 248, 0.16)',
  green: '#34D399',
  greenSoft: 'rgba(52, 211, 153, 0.16)',
  red: '#F87171',
  redSoft: 'rgba(248, 113, 113, 0.16)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const typography = {
  title: { fontSize: 28, fontWeight: '800' as const, color: palette.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: palette.text },
  body: { fontSize: 14, fontWeight: '500' as const, color: palette.textSecondary },
  caption: { fontSize: 12, fontWeight: '600' as const, color: palette.textMuted },
  mono: 'monospace' as const,
};
