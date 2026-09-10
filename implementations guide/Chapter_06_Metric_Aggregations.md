# Chapter 6: Metric Aggregations & Analytics Engine

This chapter details computing metric aggregations for total steps, active calories, distance, and heart rate average with local calendar day semantics.

**File Path:** [src/health-connect/aggregation.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/aggregation.ts)

```typescript
import {
  aggregateRecord,
  RecordType,
  AggregateRequest,
} from 'react-native-health-connect';
import { TimeRangeFilter } from './records';

export interface AggregateMetricResult {
  COUNT_TOTAL?: number;
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
    return result as AggregateMetricResult;
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

  return {
    steps: stepsRes.COUNT_TOTAL ?? 0,
    activeCalories: caloriesRes.ACTIVE_CALORIES_TOTAL ?? caloriesRes.ENERGY_TOTAL ?? 0,
    distanceKm: distanceRes.DISTANCE_TOTAL?.inKilometers ?? 0,
    avgHeartRate: hrRes.BPM_AVG ?? null,
  };
}
```

---

## Detailed Code Explanation

1. **`aggregateRecord` Metrics**:
   - `Steps` returns `COUNT_TOTAL`.
   - `ActiveCaloriesBurned` returns `ACTIVE_CALORIES_TOTAL`.
   - `Distance` returns normalized `DISTANCE_TOTAL.inKilometers`.
   - `HeartRate` computes statistical metrics `BPM_AVG`, `BPM_MIN`, and `BPM_MAX`.
2. **Local Day Calendar Boundaries**:
   - Sets hours to `0, 0, 0, 0` on local date object to match local calendar day bounds rather than UTC midnight.
