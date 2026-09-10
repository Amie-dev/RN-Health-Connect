import {
  aggregateRecord,
  RecordType,
  AggregateRequest,
} from 'react-native-health-connect';
import { queryHealthRecords, TimeRangeFilter } from './records';

export interface AggregateMetricResult {
  COUNT_TOTAL?: number;
  STEPS_COUNT_TOTAL?: number;
  ACTIVE_CALORIES_TOTAL?: number;
  ENERGY_TOTAL?: number;
  TOTAL_CALORIES_TOTAL?: number;
  DISTANCE_TOTAL?: {
    inMeters?: number;
    inKilometers?: number;
    inMiles?: number;
  };
  BPM_AVG?: number;
  BPM_MIN?: number;
  BPM_MAX?: number;
  HYDRATION_TOTAL?: {
    inLiters?: number;
    inMilliliters?: number;
  };
  [key: string]: any;
}

/** Helper to extract numeric energy in kilocalories from various Health Connect object/number formats */
function extractEnergyInKcal(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object') {
    const kcal = val.inKilocalories ?? val.inCalories ?? val.value ?? (val.inJoules ? val.inJoules / 4184 : 0);
    return isNaN(Number(kcal)) ? 0 : Number(kcal);
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

/** Helper to extract numeric distance in kilometers */
function extractDistanceKm(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object') {
    if (val.inKilometers != null) return Number(val.inKilometers) || 0;
    if (val.inMeters != null) return (Number(val.inMeters) || 0) / 1000;
    if (val.value != null) return Number(val.value) || 0;
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

/** Helper to extract numeric values safely */
function extractNumber(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'object') {
    const num = val.value ?? val.inKilograms ?? val.beatsPerMinute ?? val.count ?? null;
    return num != null && !isNaN(Number(num)) ? Number(num) : null;
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Computes single metric aggregations for a single recordType over a given time range.
 */
export async function getRecordAggregation(
  recordType: RecordType,
  timeRangeFilter: TimeRangeFilter,
  dataOriginFilter?: string[]
): Promise<AggregateMetricResult> {
  try {
    const request: AggregateRequest<any> = {
      recordType: recordType as any,
      timeRangeFilter: timeRangeFilter as any,
      dataOriginFilter,
    };
    const result = await aggregateRecord(request);
    return (result || {}) as AggregateMetricResult;
  } catch (error) {
    console.error(`[Aggregation] Failed aggregateRecord for ${recordType}:`, error);
    return {};
  }
}

/**
 * Helper to fetch summary metrics for today (Steps, Active Calories, Distance, Heart Rate average).
 */
export async function getTodayHealthSummary(): Promise<{
  steps: number;
  activeCalories: number;
  distanceKm: number;
  avgHeartRate: number | null;
}> {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const timeRangeFilter: TimeRangeFilter = {
    operator: 'between',
    startTime: startOfDay.toISOString(),
    endTime: now.toISOString(),
  };

  const [stepsRes, activeCalRes, totalCalRes, distanceRes, hrRes] = await Promise.all([
    getRecordAggregation('Steps', timeRangeFilter),
    getRecordAggregation('ActiveCaloriesBurned', timeRangeFilter),
    getRecordAggregation('TotalCaloriesBurned', timeRangeFilter),
    getRecordAggregation('Distance', timeRangeFilter),
    getRecordAggregation('HeartRate', timeRangeFilter),
  ]);

  let steps = extractNumber(stepsRes.COUNT_TOTAL ?? stepsRes.STEPS_COUNT_TOTAL ?? stepsRes.count) ?? 0;

  let activeCalories = extractEnergyInKcal(
    activeCalRes.ACTIVE_CALORIES_TOTAL ??
    activeCalRes.ENERGY_TOTAL ??
    totalCalRes.ENERGY_TOTAL ??
    totalCalRes.TOTAL_CALORIES_TOTAL
  );

  let distanceKm = extractDistanceKm(distanceRes.DISTANCE_TOTAL ?? distanceRes.distanceKm);
  let avgHeartRate = extractNumber(hrRes.BPM_AVG ?? hrRes.avgHeartRate);

  // Fallback: If steps aggregate returned 0, try summing raw step records for today
  if (!steps) {
    try {
      const rawSteps = await queryHealthRecords('Steps', { timeRangeFilter, pageSize: 500 });
      if (rawSteps.records && rawSteps.records.length > 0) {
        steps = rawSteps.records.reduce((sum: number, r: any) => sum + (extractNumber(r.count) || 0), 0);
      }
    } catch (e) {
      console.warn('[Aggregation] Raw steps fallback query error:', e);
    }
  }

  // Fallback: If calories aggregate returned 0, try summing raw calories for today
  if (!activeCalories) {
    try {
      const [rawActiveCal, rawTotalCal] = await Promise.all([
        queryHealthRecords('ActiveCaloriesBurned', { timeRangeFilter, pageSize: 500 }),
        queryHealthRecords('TotalCaloriesBurned', { timeRangeFilter, pageSize: 500 }),
      ]);
      const records = [...(rawActiveCal.records || []), ...(rawTotalCal.records || [])];
      if (records.length > 0) {
        activeCalories = records.reduce((sum: number, r: any) => {
          const cal = extractEnergyInKcal(r.energy ?? r.activeCalories ?? r.totalCalories);
          return sum + cal;
        }, 0);
      }
    } catch (e) {
      console.warn('[Aggregation] Raw calories fallback query error:', e);
    }
  }

  // Fallback: If heart rate aggregate returned null, try averaging raw heart rate records for today
  if (avgHeartRate == null) {
    try {
      const rawHr = await queryHealthRecords('HeartRate', { timeRangeFilter, pageSize: 500 });
      if (rawHr.records && rawHr.records.length > 0) {
        let totalBpm = 0;
        let count = 0;
        for (const r of rawHr.records) {
          if (Array.isArray(r.samples)) {
            for (const s of r.samples) {
              const bpm = extractNumber(s.beatsPerMinute);
              if (bpm != null) {
                totalBpm += bpm;
                count++;
              }
            }
          }
        }
        if (count > 0) {
          avgHeartRate = Math.round(totalBpm / count);
        }
      }
    } catch (e) {
      console.warn('[Aggregation] Raw heart rate fallback query error:', e);
    }
  }

  return {
    steps,
    activeCalories,
    distanceKm,
    avgHeartRate,
  };
}
