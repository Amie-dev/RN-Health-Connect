/**
 * Centralized design tokens for the Health Connect app.
 * Single source of truth for colors, spacing, radii, and typography.
 */

export const palette = {
  // Backgrounds — deep "midnight pine" surfaces with a cool green undertone
  bg: '#0A0F1D',
  surface: '#0F1A2E',
  surfaceAlt: '#182338',
  surfaceDeep: '#070C18',
  border: '#223049',
  borderSoft: '#182238',

  // Text
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Accents — vitality emerald as the brand primary (replaces generic indigo)
  primary: '#10B981',
  primarySoft: 'rgba(16, 185, 129, 0.15)',
  mint: '#6EE7B7',
  teal: '#2DD4BF',
  tealSoft: 'rgba(45, 212, 191, 0.16)',
  violet: '#A78BFA',
  violetSoft: 'rgba(167, 139, 250, 0.16)',
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
