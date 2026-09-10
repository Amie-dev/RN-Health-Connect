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

  const [stepsRes, caloriesRes, distanceRes, hrRes] = await Promise.all([
    getRecordAggregation('Steps', timeRangeFilter),
    getRecordAggregation('ActiveCaloriesBurned', timeRangeFilter),
    getRecordAggregation('Distance', timeRangeFilter),
    getRecordAggregation('HeartRate', timeRangeFilter),
  ]);

  let steps = stepsRes.COUNT_TOTAL ?? stepsRes.STEPS_COUNT_TOTAL ?? stepsRes.count ?? 0;
  let activeCalories = caloriesRes.ACTIVE_CALORIES_TOTAL ?? caloriesRes.ENERGY_TOTAL ?? caloriesRes.activeCalories ?? 0;
  let distanceKm = distanceRes.DISTANCE_TOTAL?.inKilometers ?? distanceRes.distanceKm ?? 0;
  let avgHeartRate = hrRes.BPM_AVG ?? hrRes.avgHeartRate ?? null;

  // Fallback: If steps aggregate returned 0, try summing raw step records for today
  if (!steps) {
    try {
      const rawSteps = await queryHealthRecords('Steps', { timeRangeFilter, pageSize: 500 });
      if (rawSteps.records && rawSteps.records.length > 0) {
        steps = rawSteps.records.reduce((sum: number, r: any) => sum + (Number(r.count) || 0), 0);
      }
    } catch (e) {
      console.warn('[Aggregation] Raw steps fallback query error:', e);
    }
  }

  // Fallback: If calories aggregate returned 0, try summing raw calories for today
  if (!activeCalories) {
    try {
      const rawCalories = await queryHealthRecords('ActiveCaloriesBurned', { timeRangeFilter, pageSize: 500 });
      if (rawCalories.records && rawCalories.records.length > 0) {
        activeCalories = rawCalories.records.reduce((sum: number, r: any) => {
          const cal = r.energy?.inKilocalories ?? r.energy?.inCalories ?? r.activeCalories ?? 0;
          return sum + (Number(cal) || 0);
        }, 0);
      }
    } catch (e) {
      console.warn('[Aggregation] Raw calories fallback query error:', e);
    }
  }

  return {
    steps,
    activeCalories,
    distanceKm,
    avgHeartRate,
  };
}

