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
  indigo: '#818CF8',
  indigoSoft: 'rgba(129, 140, 248, 0.16)',
} as const;

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
} as const;

/** Elevation presets — kept subtle so the dark theme stays flat and modern. */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

/** Motion tokens so every animation in the app shares one rhythm. */
export const motion = {
  fast: 180,
  base: 320,
  slow: 520,
  stagger: 55,
} as const;

export type CategoryKey = 'ALL' | 'Activity' | 'Body' | 'Vitals' | 'Sleep' | 'Nutrition';

export interface RecordMeta {
  /** Emoji glyph used across the UI. */
  icon: string;
  /** Human readable name (record types are PascalCase identifiers). */
  label: string;
  /** Accent colour for badges and value text. */
  color: string;
  /** Translucent accent used for icon backgrounds. */
  soft: string;
  /** Category the record belongs to (drives the explorer filter). */
  category: Exclude<CategoryKey, 'ALL'>;
  /** Whether the app holds write permission for this record type. */
  writable: boolean;
}

/**
 * Catalogue of every record type the app knows about. Adding a record type
 * here automatically wires it into filters, badges and the metrics panel.
 */
export const RECORD_CATALOG: Record<string, RecordMeta> = {
  Steps: { icon: '🚶', label: 'Steps', color: palette.teal, soft: palette.tealSoft, category: 'Activity', writable: true },
  ActiveCaloriesBurned: { icon: '🔥', label: 'Active Calories', color: palette.amber, soft: palette.amberSoft, category: 'Activity', writable: false },
  TotalCaloriesBurned: { icon: '🔥', label: 'Total Calories', color: palette.amber, soft: palette.amberSoft, category: 'Activity', writable: false },
  Distance: { icon: '📏', label: 'Distance', color: palette.indigo, soft: palette.indigoSoft, category: 'Activity', writable: false },
  ExerciseSession: { icon: '🏃', label: 'Exercise', color: palette.teal, soft: palette.tealSoft, category: 'Activity', writable: false },

  Weight: { icon: '⚖️', label: 'Weight', color: palette.sky, soft: palette.skySoft, category: 'Body', writable: true },
  Height: { icon: '📐', label: 'Height', color: palette.sky, soft: palette.skySoft, category: 'Body', writable: false },
  BodyFat: { icon: '🧬', label: 'Body Fat', color: palette.violet, soft: palette.violetSoft, category: 'Body', writable: false },

  HeartRate: { icon: '❤️', label: 'Heart Rate', color: palette.rose, soft: palette.roseSoft, category: 'Vitals', writable: true },
  BloodPressure: { icon: '🩺', label: 'Blood Pressure', color: palette.sky, soft: palette.skySoft, category: 'Vitals', writable: true },
  BloodGlucose: { icon: '🩸', label: 'Blood Glucose', color: palette.rose, soft: palette.roseSoft, category: 'Vitals', writable: false },
  OxygenSaturation: { icon: '🫁', label: 'Oxygen Saturation', color: palette.teal, soft: palette.tealSoft, category: 'Vitals', writable: false },
  BodyTemperature: { icon: '🌡️', label: 'Body Temperature', color: palette.amber, soft: palette.amberSoft, category: 'Vitals', writable: false },

  SleepSession: { icon: '😴', label: 'Sleep', color: palette.violet, soft: palette.violetSoft, category: 'Sleep', writable: false },

  Hydration: { icon: '💧', label: 'Hydration', color: palette.sky, soft: palette.skySoft, category: 'Nutrition', writable: true },
  Nutrition: { icon: '🥗', label: 'Nutrition', color: palette.green, soft: palette.greenSoft, category: 'Nutrition', writable: false },
};

const FALLBACK_META: RecordMeta = {
  icon: '📋',
  label: 'Record',
  color: palette.textSecondary,
  soft: palette.surfaceAlt,
  category: 'Vitals',
  writable: false,
};

/** Safe lookup — unknown record types get a neutral badge instead of crashing. */
export const getRecordMeta = (recordType: string): RecordMeta =>
  RECORD_CATALOG[recordType] ?? { ...FALLBACK_META, label: recordType };

/** Category filter definitions for the explorer tab. */
export const CATEGORY_FILTERS: Array<{
  key: CategoryKey;
  label: string;
  match: (recordType: string) => boolean;
}> = [
  { key: 'ALL', label: 'All', match: () => true },
  { key: 'Activity', label: 'Activity', match: (t) => getRecordMeta(t).category === 'Activity' },
  { key: 'Body', label: 'Body', match: (t) => getRecordMeta(t).category === 'Body' },
  { key: 'Vitals', label: 'Vitals', match: (t) => getRecordMeta(t).category === 'Vitals' },
  { key: 'Sleep', label: 'Sleep', match: (t) => getRecordMeta(t).category === 'Sleep' },
  { key: 'Nutrition', label: 'Nutrition', match: (t) => getRecordMeta(t).category === 'Nutrition' },
];

