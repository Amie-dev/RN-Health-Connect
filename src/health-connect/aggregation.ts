import {
  aggregateRecord,
  type AggregateResult,
  type AggregateResultRecordType,
} from 'react-native-health-connect';
import { readAllHealthRecords, queryHealthRecords, type QueryResult, type TimeRangeFilter } from './records';
import { HISTORY_WINDOW_DAYS, MS_PER_DAY } from '../config';

/**
 * Aggregation module.
 *
 * Every metric key below was verified against the native module
 * (`react-native-health-connect/react-native-health-connect` Android sources),
 * because the JS layer simply forwards whatever key the provider used:
 *
 *  - Steps                  -> COUNT_TOTAL
 *  - ActiveCaloriesBurned   -> ACTIVE_CALORIES_TOTAL
 *  - TotalCaloriesBurned    -> ENERGY_TOTAL
 *  - Distance               -> DISTANCE            (NOT "DISTANCE_TOTAL")
 *  - HeartRate              -> BPM_AVG
 *  - Hydration              -> VOLUME_TOTAL
 *  - SleepSession           -> SLEEP_DURATION_TOTAL (seconds)
 *
 * `aggregate()` is generic over the record type, so a wrong key is now a
 * compile error instead of a silent zero.
 */

export interface HealthSummary {
  steps: number;
  activeCalories: number;
  distanceKm: number;
  avgHeartRate: number | null;
  hydrationLiters: number;
  /** Total sleep duration inside the window, in minutes. */
  sleepMinutes: number | null;
  latestWeightKg: number | null;
  rangeStart: string;
  rangeEnd: string;
  /** True when at least one metric could not be resolved (permission/provider error). */
  partial: boolean;
}

/* -------------------------------------------------------------------------- */
/* Value extractors — the wrapper returns nested "<unit>Result" objects       */
/* -------------------------------------------------------------------------- */

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return toFiniteNumber((value as { value: unknown }).value);
  }
  return null;
}

function energyToKcal(value: unknown): number | null {
  if (!value || typeof value !== 'object') return toFiniteNumber(value);
  const energy = value as { inKilocalories?: number; inCalories?: number; inJoules?: number };
  if (energy.inKilocalories != null) return energy.inKilocalories;
  if (energy.inCalories != null) return energy.inCalories;
  if (energy.inJoules != null) return energy.inJoules / 4184;
  return null;
}

function lengthToKm(value: unknown): number | null {
  if (!value || typeof value !== 'object') return toFiniteNumber(value);
  const length = value as { inKilometers?: number; inMeters?: number; inMiles?: number };
  if (length.inKilometers != null) return length.inKilometers;
  if (length.inMeters != null) return length.inMeters / 1000;
  if (length.inMiles != null) return length.inMiles * 1.60934;
  return null;
}

function volumeToLiters(value: unknown): number | null {
  if (!value || typeof value !== 'object') return toFiniteNumber(value);
  const volume = value as { inLiters?: number; inMilliliters?: number; inFluidOuncesUs?: number };
  if (volume.inLiters != null) return volume.inLiters;
  if (volume.inMilliliters != null) return volume.inMilliliters / 1000;
  if (volume.inFluidOuncesUs != null) return volume.inFluidOuncesUs * 0.0295735;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Generic aggregate call                                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Generic aggregate call                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Runs a single-record-type aggregation. Returns `null` (instead of throwing or
 * a bogus zero) when Health Connect refuses the request, so callers can tell
 * "no data" apart from "could not read".
 */
export async function aggregate<T extends AggregateResultRecordType>(
  recordType: T,
  timeRangeFilter: TimeRangeFilter,
  dataOriginFilter?: string[]
): Promise<AggregateResult<T> | null> {
  try {
    const result = await aggregateRecord<T>({ recordType, timeRangeFilter, dataOriginFilter });
    return result ?? null;
  } catch (error) {
    console.warn(`[Aggregation] aggregateRecord failed for ${recordType}:`, error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Raw-record fallbacks                                                       */
/*                                                                            */
/* Health Connect sometimes reports an aggregate while the provider has no    */
/* pre-computed value yet (or refuses a specific metric), so each metric falls */
/* back to summing the underlying records — the same defensive pattern the     */
/* app already had for steps/calories, now applied consistently.              */
/* -------------------------------------------------------------------------- */

interface MetricResult<T> {
  value: T;
  /** True when neither the aggregate nor the fallback produced a number. */
  failed: boolean;
}

const ok = <T>(value: T): MetricResult<T> => ({ value, failed: false });
const failed = <T>(value: T): MetricResult<T> => ({ value, failed: true });

async function readWindow(
  recordType: Parameters<typeof readAllHealthRecords>[0],
  range: TimeRangeFilter
): Promise<QueryResult<HealthChangeRecordLike>> {
  return readAllHealthRecords<HealthChangeRecordLike>(recordType, { timeRangeFilter: range });
}

/** Shape we rely on when summing raw records. */
type HealthChangeRecordLike = Record<string, any>;

async function sumSteps(range: TimeRangeFilter): Promise<MetricResult<number>> {
  const page = await readWindow('Steps', range);
  if (page.error) return failed(0);
  return ok(page.records.reduce((total, record) => total + (toFiniteNumber(record.count) ?? 0), 0));
}

async function sumCalories(range: TimeRangeFilter): Promise<MetricResult<number>> {
  const [active, total] = await Promise.all([
    readWindow('ActiveCaloriesBurned', range),
    readWindow('TotalCaloriesBurned', range),
  ]);
  if (active.error && total.error) return failed(0);

  // Prefer active calories; only fall back to total when active is empty.
  const activeKcal = active.records.reduce(
    (sum, record) => sum + (energyToKcal(record.energy) ?? 0),
    0
  );
  if (activeKcal > 0) return ok(activeKcal);

  return ok(total.records.reduce((sum, record) => sum + (energyToKcal(record.energy) ?? 0), 0));
}

async function sumDistanceKm(range: TimeRangeFilter): Promise<MetricResult<number>> {
  const page = await readWindow('Distance', range);
  if (page.error) return failed(0);
  return ok(page.records.reduce((sum, record) => sum + (lengthToKm(record.distance) ?? 0), 0));
}

async function sumHydrationLiters(range: TimeRangeFilter): Promise<MetricResult<number>> {
  const page = await readWindow('Hydration', range);
  if (page.error) return failed(0);
  return ok(page.records.reduce((sum, record) => sum + (volumeToLiters(record.volume) ?? 0), 0));
}

async function averageHeartRate(range: TimeRangeFilter): Promise<MetricResult<number | null>> {
  const page = await readWindow('HeartRate', range);
  if (page.error) return failed(null);

  let totalBpm = 0;
  let sampleCount = 0;
  for (const record of page.records) {
    if (!Array.isArray(record.samples)) continue;
    for (const sample of record.samples) {
      const bpm = toFiniteNumber(sample?.beatsPerMinute);
      if (bpm != null) {
        totalBpm += bpm;
        sampleCount += 1;
      }
    }
  }

  return ok(sampleCount > 0 ? Math.round(totalBpm / sampleCount) : null);
}

async function sumSleepMinutes(range: TimeRangeFilter): Promise<MetricResult<number | null>> {
  const page = await readWindow('SleepSession', range);
  if (page.error) return failed(null);

  const minutes = page.records.reduce((total, record) => {
    const start = Date.parse(record.startTime ?? '');
    const end = Date.parse(record.endTime ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return total;
    return total + (end - start) / 60000;
  }, 0);

  return ok(minutes > 0 ? Math.round(minutes) : null);
}

/** Latest weight measurement inside the window (Health Connect has no "latest" aggregate). */
async function latestWeight(range: TimeRangeFilter): Promise<MetricResult<number | null>> {
  const page = await queryHealthRecords<HealthChangeRecordLike>('Weight', {
    timeRangeFilter: range,
    pageSize: 1,
    ascendingOrder: false,
  });
  if (page.error) return failed(null);

  const weight = page.records[0]?.weight;
  const kilograms = weight?.inKilograms ?? toFiniteNumber(weight);
  return ok(kilograms ?? null);
}

/* -------------------------------------------------------------------------- */
/* Public summary API                                                         */
/* -------------------------------------------------------------------------- */

/** Inclusive time range for a query. */
export function buildTimeRange(start: Date, end: Date): TimeRangeFilter {
  return {
    operator: 'between',
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
  };
}

/** Midnight (local time) of the day the given date belongs to. */
export function startOfLocalDay(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Resolves every dashboard metric for a time window.
 *
 * Aggregates run in parallel first (one IPC batch), then only the metrics that
 * came back empty trigger a raw-record fallback — so a normal refresh costs a
 * handful of calls instead of a full history read.
 */
export async function getHealthSummary(
  start: Date = startOfLocalDay(),
  end: Date = new Date()
): Promise<HealthSummary> {
  const rangeStart = new Date(start).toISOString();
  const rangeEnd = new Date(end).toISOString();
  const range: TimeRangeFilter = { operator: 'between', startTime: rangeStart, endTime: rangeEnd };

  const [stepsAgg, activeCalAgg, totalCalAgg, distanceAgg, hrAgg, hydrationAgg, sleepAgg] =
    await Promise.all([
      aggregate('Steps', range),
      aggregate('ActiveCaloriesBurned', range),
      aggregate('TotalCaloriesBurned', range),
      aggregate('Distance', range),
      aggregate('HeartRate', range),
      aggregate('Hydration', range),
      aggregate('SleepSession', range),
    ]);

  // Aggregate values (correct native metric keys — see the module header).
  const aggregateSteps = stepsAgg?.COUNT_TOTAL ?? null;
  const aggregateCalories =
    energyToKcal(activeCalAgg?.ACTIVE_CALORIES_TOTAL) ??
    energyToKcal(totalCalAgg?.ENERGY_TOTAL);
  const aggregateDistanceKm = lengthToKm(distanceAgg?.DISTANCE);
  const aggregateHeartRate =
    hrAgg && (hrAgg.MEASUREMENTS_COUNT ?? 0) > 0 ? hrAgg.BPM_AVG ?? null : null;
  const aggregateHydrationLiters = volumeToLiters(hydrationAgg?.VOLUME_TOTAL);
  const aggregateSleepSeconds = sleepAgg?.SLEEP_DURATION_TOTAL ?? null;

  // Fallbacks only where the aggregate is unavailable or zero.
  const [steps, calories, distanceKm, hydrationLiters, heartRate, sleepMinutes, weight] =
    await Promise.all([
      aggregateSteps ? Promise.resolve(ok(aggregateSteps)) : sumSteps(range),
      aggregateCalories ? Promise.resolve(ok(aggregateCalories)) : sumCalories(range),
      aggregateDistanceKm ? Promise.resolve(ok(aggregateDistanceKm)) : sumDistanceKm(range),
      aggregateHydrationLiters ? Promise.resolve(ok(aggregateHydrationLiters)) : sumHydrationLiters(range),
      aggregateHeartRate != null ? Promise.resolve(ok(aggregateHeartRate)) : averageHeartRate(range),
      aggregateSleepSeconds != null
        ? Promise.resolve(ok(Math.round((aggregateSleepSeconds ?? 0) / 60)))
        : sumSleepMinutes(range),
      latestWeight(range),
    ]);

  const metrics = [steps, calories, distanceKm, hydrationLiters, heartRate, sleepMinutes, weight];
  const partial = metrics.some((metric) => metric.failed);

  return {
    steps: steps.value ?? 0,
    activeCalories: Math.round(calories.value ?? 0),
    distanceKm: distanceKm.value ?? 0,
    avgHeartRate: heartRate.value,
    hydrationLiters: Number((hydrationLiters.value ?? 0).toFixed(2)),
    sleepMinutes: sleepMinutes.value,
    latestWeightKg: weight.value,
    rangeStart,
    rangeEnd,
    partial,
  };
}

/** Summary for the current calendar day (midnight → now). */
export function getTodaySummary(): Promise<HealthSummary> {
  return getHealthSummary(startOfLocalDay(), new Date());
}

/** Summary for the trailing `days` window, ending now. */
export function getWindowSummary(days = HISTORY_WINDOW_DAYS): Promise<HealthSummary> {
  const end = new Date();
  return getHealthSummary(new Date(end.getTime() - days * MS_PER_DAY), end);
}


