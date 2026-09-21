import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { palette as C, radius as R, spacing as S } from '../theme';
import { CountUp, GoalBar, PressableScale } from './ui';
import type { HealthSummary } from '../health-connect/aggregation';
import type { SummaryRange } from '../hooks/useHealthSummary';

const RANGE_LABELS: Array<{ key: SummaryRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

interface MetricDefinition {
  key: 'steps' | 'activeCalories' | 'distanceKm' | 'avgHeartRate';
  icon: string;
  label: string;
  unit: string;
  accent: string;
  soft: string;
  goal?: number;
  format: (value: number) => string;
}

const PRIMARY_METRICS: MetricDefinition[] = [
  {
    key: 'steps',
    icon: '🚶',
    label: 'Steps',
    unit: 'steps',
    accent: C.primary,
    soft: C.primarySoft,
    goal: 10000,
    format: (value) => Math.round(value).toLocaleString(),
  },
  {
    key: 'activeCalories',
    icon: '🔥',
    label: 'Calories',
    unit: 'kcal',
    accent: C.amber,
    soft: C.amberSoft,
    goal: 500,
    format: (value) => Math.round(value).toLocaleString(),
  },
  {
    key: 'distanceKm',
    icon: '📏',
    label: 'Distance',
    unit: 'km',
    accent: C.indigo,
    soft: C.indigoSoft,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'avgHeartRate',
    icon: '❤️',
    label: 'Heart rate',
    unit: 'avg bpm',
    accent: C.rose,
    soft: C.roseSoft,
    format: (value) => Math.round(value).toString(),
  },
];

function formatSleep(minutes: number | null): string {
  if (minutes == null) return '--';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

interface MetricsPanelProps {
  summary: HealthSummary | null;
  loading: boolean;
  range: SummaryRange;
  onRangeChange: (range: SummaryRange) => void;
  /** Shows a hint when read permissions are incomplete. */
  permissionHint?: string;
}

/**
 * Primary metrics grid + secondary strip.
 *
 * Distance is now part of the summary (it was previously fetched but never
 * displayed) and sleep/hydration/weight round out the picture.
 */
export const MetricsPanel = React.memo(function MetricsPanel({
  summary,
  loading,
  range,
  onRangeChange,
  permissionHint,
}: MetricsPanelProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Summary</Text>
        <View style={styles.rangeRow}>
          {RANGE_LABELS.map((option) => {
            const isActive = option.key === range;
            return (
              <PressableScale
                key={option.key}
                onPress={() => onRangeChange(option.key)}
                style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                accessibilityLabel={`Show ${option.label} summary`}
              >
                <Text style={[styles.rangeText, isActive && styles.rangeTextActive]}>
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={styles.grid}>
        {PRIMARY_METRICS.map((metric) => {
          const value = summary ? (summary[metric.key] as number | null) : null;
          const percentage =
            metric.goal && value != null ? (value / metric.goal) * 100 : undefined;

          return (
            <View key={metric.key} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconWrap, { backgroundColor: metric.soft }]}>
                  <Text style={styles.icon}>{metric.icon}</Text>
                </View>
                {loading ? <ActivityIndicator size="small" color={metric.accent} /> : null}
              </View>

              <CountUp
                value={value}
                format={metric.format}
                style={[styles.value, { color: metric.accent }]}
              />
              <Text style={styles.unit} numberOfLines={1}>
                {metric.unit}
              </Text>

              <View style={styles.cardFooter}>
                {percentage !== undefined ? (
                  <>
                    <GoalBar pct={percentage} color={metric.accent} track={C.surfaceDeep} />
                    <Text style={styles.goalText}>
                      {Math.round(percentage)}% of {(metric.goal ?? 0).toLocaleString()}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.goalText}>{metric.label}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.secondaryRow}>
        <SecondaryStat
          icon="😴"
          label="Sleep"
          value={formatSleep(summary?.sleepMinutes ?? null)}
          accent={C.violet}
        />
        <SecondaryStat
          icon="💧"
          label="Water"
          value={summary ? `${summary.hydrationLiters.toFixed(1)} L` : '--'}
          accent={C.sky}
        />
        <SecondaryStat
          icon="⚖️"
          label="Weight"
          value={summary?.latestWeightKg != null ? `${summary.latestWeightKg.toFixed(1)} kg` : '--'}
          accent={C.teal}
        />
      </View>

      {permissionHint ? <Text style={styles.hint}>{permissionHint}</Text> : null}
    </View>
  );
});

function SecondaryStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: S.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
    gap: S.sm,
  },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  rangeRow: { flexDirection: 'row', gap: 6 },
  rangeChip: {
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  rangeChipActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  rangeText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  rangeTextActive: { color: C.mint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 15 },
  value: { fontSize: 24, fontWeight: '800', marginTop: S.sm, letterSpacing: -0.5 },
  unit: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  cardFooter: { marginTop: S.md },
  goalText: { fontSize: 10, color: C.textMuted, marginTop: 5, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: S.md, marginTop: S.md },
  statCard: {
    flex: 1,
    backgroundColor: C.surfaceAlt,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: S.md,
  },
  statIcon: { fontSize: 14 },
  statLabel: { fontSize: 10, color: C.textMuted, fontWeight: '700', marginTop: 4, letterSpacing: 0.3 },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  hint: { fontSize: 11, color: C.amber, marginTop: S.md, fontWeight: '600' },
});

