# Chapter 5 — Aggregations & Analytics

Health Connect provides an **Aggregation API** for calculating totals, averages, minimums, maximums, durations, and other statistical metrics without manually reading and processing every raw record.

Aggregation is especially important for cumulative data such as:

* Steps
* Distance
* Active calories
* Total calories
* Floors climbed
* Hydration

For cumulative records such as Steps, Android recommends aggregation instead of manually summing raw records because the Aggregate API can account for duplicate data from multiple sources according to Health Connect's priority rules. ([Android Developers][2])

When using `react-native-health-connect`, there are three main aggregation methods:

```text id="q4k1m7"
aggregateRecord()
        │
        ├── One time range
        └── One record type

aggregateGroupByDuration()
        │
        ├── Fixed-length buckets
        └── e.g. every 1 hour

aggregateGroupByPeriod()
        │
        ├── Calendar-based buckets
        └── e.g. every day/week/month
```

---

# 5.1 Important: Native API vs React Native API

There is a major difference between the native Android Health Connect API and `react-native-health-connect`.

### Native Android

Native Kotlin code can look like:

```kotlin
val response = healthConnectClient.aggregate(
    AggregateRequest(
        metrics = setOf(
            StepsRecord.COUNT_TOTAL
        ),
        timeRangeFilter = TimeRangeFilter.between(
            startTime,
            endTime
        )
    )
)
```

The native API accepts a set of metric objects. ([Android Developers][3])

### React Native

The React Native wrapper uses:

```ts
aggregateRecord({
  recordType: 'Steps',
  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

The wrapper's current API is based on `recordType`, and its returned object contains metric identifiers such as `COUNT_TOTAL`. ([Matinzd][4])

Therefore, **do not copy native Kotlin aggregation syntax directly into React Native code**.

---

# 5.2 `aggregateRecord()`

`aggregateRecord()` calculates an aggregate over one requested record type and one time range.

### Basic example

```ts id="9f3k2a"
import { aggregateRecord } from 'react-native-health-connect';

export async function getDailySteps() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const end = new Date();

  const result = await aggregateRecord({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });

  return result;
}
```

The wrapper's aggregation API uses `recordType: 'Steps'` rather than a `metrics` array. ([Matinzd][4])

---

# 5.3 `Steps` Aggregation

For Steps, the aggregate metric is:

```text id="d6p1r8"
COUNT_TOTAL
```

Example result:

```json
{
  "dataOrigins": [
    "com.example.source"
  ],
  "COUNT_TOTAL": 8450
}
```

The native Health Connect equivalent is:

```text id="1k9s4x"
StepsRecord.COUNT_TOTAL
```

The React Native wrapper exposes the resulting metric using:

```text id="0m7b2q"
COUNT_TOTAL
```

The official Android aggregation table confirms that Steps supports `COUNT_TOTAL`. ([Android Developers][3])

---

# 5.4 Active Calories

Active calories use:

```text id="w3c9x1"
ACTIVE_CALORIES_TOTAL
```

Example:

```ts id="e8p4v2"
const result = await aggregateRecord({
  recordType: 'ActiveCaloriesBurned',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});

console.log(result);
```

Conceptually:

```json
{
  "dataOrigins": [],
  "ACTIVE_CALORIES_TOTAL": {
    "inKilocalories": 420.5,
    "inJoules": 1759...
  }
}
```

Do not assume that the React Native aggregation result is:

```json
{
  "value": 420.5,
  "unit": "kilocalories"
}
```

The wrapper normalizes unit-bearing values into its own result representation.

---

# 5.5 Total Calories

```ts id="r1j5x8"
const result = await aggregateRecord({
  recordType: 'TotalCaloriesBurned',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

Metric:

```text id="v5q7m3"
ENERGY_TOTAL
```

Native equivalent:

```text id="k1x8r4"
TotalCaloriesBurnedRecord.ENERGY_TOTAL
```

The current Android API lists `ENERGY_TOTAL` for Total Calories Burned. ([Android Developers][3])

---

# 5.6 Distance

Distance uses:

```text id="x4p8n2"
DISTANCE_TOTAL
```

Example:

```ts id="5s3v8a"
const result = await aggregateRecord({
  recordType: 'Distance',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});

console.log(result);
```

The underlying Android metric is:

```text id="q9c6t1"
DistanceRecord.DISTANCE_TOTAL
```

and the native result can be accessed in meters. ([Android Developers][3])

---

# 5.7 Elevation Gained

Metric:

```text id="h7k3v9"
ELEVATION_GAINED_TOTAL
```

Example:

```ts id="p2x5m8"
const result = await aggregateRecord({
  recordType: 'ElevationGained',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

---

# 5.8 Floors Climbed

Metric:

```text id="c4n7q1"
FLOORS_CLIMBED_TOTAL
```

```ts id="z9m2k6"
const result = await aggregateRecord({
  recordType: 'FloorsClimbed',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

---

# 5.9 Hydration

Metric:

```text id="r7v4p2"
VOLUME_TOTAL
```

Example:

```ts id="m8q1x6"
const result = await aggregateRecord({
  recordType: 'Hydration',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

The native API exposes this as:

```text id="k5c9w3"
HydrationRecord.VOLUME_TOTAL
```

The official aggregation reference confirms this metric. ([Android Developers][3])

---

# 5.10 Heart Rate Aggregation

Heart Rate supports:

```text id="b4n8x2"
BPM_AVG
BPM_MAX
BPM_MIN
MEASUREMENTS_COUNT
```

Example:

```ts id="m1v6q8"
const result = await aggregateRecord({
  recordType: 'HeartRate',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});

console.log(result);
```

Possible result:

```json
{
  "dataOrigins": [],
  "BPM_AVG": 74,
  "BPM_MAX": 142,
  "BPM_MIN": 51,
  "MEASUREMENTS_COUNT": 120
}
```

The current Android aggregation reference explicitly supports all four metrics. ([Android Developers][3])

---

# 5.11 Resting Heart Rate

Supported metrics:

```text id="q7m2v9"
BPM_AVG
BPM_MAX
BPM_MIN
```

```ts id="d8x4k1"
const result = await aggregateRecord({
  recordType: 'RestingHeartRate',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

---

# 5.12 Weight Aggregation

Weight supports:

```text id="n3p7x5"
WEIGHT_AVG
WEIGHT_MAX
WEIGHT_MIN
```

```ts id="w6m2c8"
const result = await aggregateRecord({
  recordType: 'Weight',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

The Android API lists average, maximum and minimum weight aggregation. ([Android Developers][3])

---

# 5.13 Blood Pressure Aggregation

Blood Pressure supports:

```text id="k4v8m2"
SYSTOLIC_AVG
SYSTOLIC_MAX
SYSTOLIC_MIN

DIASTOLIC_AVG
DIASTOLIC_MAX
DIASTOLIC_MIN
```

Example:

```ts id="r5x1q9"
const result = await aggregateRecord({
  recordType: 'BloodPressure',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

---

# 5.14 Height Aggregation

Height supports:

```text id="p7n2v5"
HEIGHT_AVG
HEIGHT_MAX
HEIGHT_MIN
```

---

# 5.15 Cycling Pedaling Cadence

Supported metrics:

```text id="x8m4c1"
RPM_AVG
RPM_MAX
RPM_MIN
```

---

# 5.16 Power

Supported metrics:

```text id="q2v7n5"
POWER_AVG
POWER_MAX
POWER_MIN
```

---

# 5.17 Speed

Supported metrics:

```text id="j6m1x8"
SPEED_AVG
SPEED_MAX
SPEED_MIN
```

---

# 5.18 Steps Cadence

Supported metrics:

```text id="n4c8v2"
RATE_AVG
RATE_MAX
RATE_MIN
```

---

# 5.19 Sleep Duration

Sleep sessions support:

```text id="v9x2m5"
SLEEP_DURATION_TOTAL
```

Example:

```ts id="c1q7k4"
const result = await aggregateRecord({
  recordType: 'SleepSession',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

This is useful for applications displaying:

```text id="g4p8n1"
Total sleep
Average sleep duration
Sleep trends
Weekly sleep charts
```

The current Android API lists `SLEEP_DURATION_TOTAL` for Sleep Session. ([Android Developers][3])

---

# 5.20 Exercise Session Duration

Exercise sessions support:

```text id="x5m8q2"
EXERCISE_DURATION_TOTAL
```

```ts id="r2v7k5"
const result = await aggregateRecord({
  recordType: 'ExerciseSession',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

This is useful for calculating total workout time.

---

# 5.21 Mindfulness Duration

Current Health Connect also supports:

```text id="m7c2x9"
MINDFULNESS_DURATION_TOTAL
```

Example:

```ts id="q4n8v1"
const result = await aggregateRecord({
  recordType: 'MindfulnessSession',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

Mindfulness aggregation is available with the current Health Connect data model. ([Android Developers][3])

---

# 5.22 Activity Intensity Aggregation

Activity Intensity supports:

```text id="c8v3m6"
DURATION_TOTAL
INTENSITY_MINUTES_TOTAL
MODERATE_DURATION_TOTAL
VIGOROUS_DURATION_TOTAL
```

This allows applications to calculate metrics such as:

```text id="n1x5q7"
Total active duration
Intensity minutes
Moderate activity duration
Vigorous activity duration
```

The official aggregation table lists all four metrics. ([Android Developers][3])

---

# 5.23 Basal Metabolic Rate

Basal Metabolic Rate supports:

```text id="p6m2x8"
BASAL_CALORIES_TOTAL
```

This can be used to calculate total basal energy over a requested interval. ([Android Developers][3])

---

# 5.24 Nutrition Aggregation

Nutrition is one of the largest aggregation surfaces.

It supports totals for nutrients including:

```text id="z8q4v1"
ENERGY_TOTAL
PROTEIN_TOTAL
TOTAL_CARBOHYDRATE_TOTAL
TOTAL_FAT_TOTAL
DIETARY_FIBER_TOTAL
SUGAR_TOTAL

CALCIUM_TOTAL
IRON_TOTAL
MAGNESIUM_TOTAL
POTASSIUM_TOTAL
SODIUM_TOTAL
ZINC_TOTAL

VITAMIN_A_TOTAL
VITAMIN_B6_TOTAL
VITAMIN_B12_TOTAL
VITAMIN_C_TOTAL
VITAMIN_D_TOTAL
VITAMIN_E_TOTAL
VITAMIN_K_TOTAL
```

There are many additional nutrient metrics.

The current Android documentation lists the complete Nutrition aggregate metric set, including vitamins, minerals, fats, carbohydrates, caffeine and other nutrients. ([Android Developers][3])

---

# 5.25 Skin Temperature Aggregation

Current Health Connect supports:

```text id="k5v8n2"
TEMPERATURE_DELTA_AVG
TEMPERATURE_DELTA_MAX
TEMPERATURE_DELTA_MIN
```

This is associated with the Skin Temperature feature. ([Android Developers][3])

---

# 5.26 Complete Current Aggregate Metric Reference

| Record Type              | Aggregate Metrics                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `ActiveCaloriesBurned`   | `ACTIVE_CALORIES_TOTAL`                                                                           |
| `ActivityIntensity`      | `DURATION_TOTAL`, `INTENSITY_MINUTES_TOTAL`, `MODERATE_DURATION_TOTAL`, `VIGOROUS_DURATION_TOTAL` |
| `BasalMetabolicRate`     | `BASAL_CALORIES_TOTAL`                                                                            |
| `BloodPressure`          | `SYSTOLIC_*`, `DIASTOLIC_*`                                                                       |
| `CyclingPedalingCadence` | `RPM_AVG`, `RPM_MAX`, `RPM_MIN`                                                                   |
| `Distance`               | `DISTANCE_TOTAL`                                                                                  |
| `ElevationGained`        | `ELEVATION_GAINED_TOTAL`                                                                          |
| `ExerciseSession`        | `EXERCISE_DURATION_TOTAL`                                                                         |
| `FloorsClimbed`          | `FLOORS_CLIMBED_TOTAL`                                                                            |
| `HeartRate`              | `BPM_AVG`, `BPM_MAX`, `BPM_MIN`, `MEASUREMENTS_COUNT`                                             |
| `Height`                 | `HEIGHT_AVG`, `HEIGHT_MAX`, `HEIGHT_MIN`                                                          |
| `Hydration`              | `VOLUME_TOTAL`                                                                                    |
| `MindfulnessSession`     | `MINDFULNESS_DURATION_TOTAL`                                                                      |
| `Nutrition`              | Multiple nutrient `*_TOTAL` metrics                                                               |
| `Power`                  | `POWER_AVG`, `POWER_MAX`, `POWER_MIN`                                                             |
| `RestingHeartRate`       | `BPM_AVG`, `BPM_MAX`, `BPM_MIN`                                                                   |
| `SkinTemperature`        | `TEMPERATURE_DELTA_AVG`, `TEMPERATURE_DELTA_MAX`, `TEMPERATURE_DELTA_MIN`                         |
| `SleepSession`           | `SLEEP_DURATION_TOTAL`                                                                            |
| `Speed`                  | `SPEED_AVG`, `SPEED_MAX`, `SPEED_MIN`                                                             |
| `Steps`                  | `COUNT_TOTAL`                                                                                     |
| `StepsCadence`           | `RATE_AVG`, `RATE_MAX`, `RATE_MIN`                                                                |
| `TotalCaloriesBurned`    | `ENERGY_TOTAL`                                                                                    |
| `Weight`                 | `WEIGHT_AVG`, `WEIGHT_MAX`, `WEIGHT_MIN`                                                          |
| `WheelchairPushes`       | `COUNT_TOTAL`                                                                                     |

This reflects the current Android aggregation reference. ([Android Developers][3])

---

# 5.27 `aggregateGroupByDuration()`

Use this method when you need **fixed-length buckets**.

Examples:

```text id="y5c8m2"
Every 15 minutes
Every 30 minutes
Every 1 hour
Every 2 hours
Every 1 day
```

The React Native wrapper accepts:

```ts id="m4q7v1"
timeRangeSlicer: {
  duration: 'HOURS',
  length: 1,
}
```

The current wrapper documentation defines:

```text id="r8n2x5"
MILLIS
SECONDS
MINUTES
HOURS
DAYS
```

for duration grouping. ([Matinzd][5])

---

# 5.28 Hourly Steps

```ts id="p6v1k9"
import { aggregateGroupByDuration } from 'react-native-health-connect';

export async function getHourlySteps(
  startTime: string,
  endTime: string
) {
  return aggregateGroupByDuration({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime,
      endTime,
    },

    timeRangeSlicer: {
      duration: 'HOURS',
      length: 1,
    },
  });
}
```

This is the correct React Native wrapper shape.

---

# 5.29 Duration Aggregation Result

A result can look conceptually like:

```json
[
  {
    "startTime": "2026-09-09T08:00:00.000Z",
    "endTime": "2026-09-09T09:00:00.000Z",
    "zoneOffset": "+05:30",
    "result": {
      "dataOrigins": [],
      "COUNT_TOTAL": 1250
    }
  },
  {
    "startTime": "2026-09-09T09:00:00.000Z",
    "endTime": "2026-09-09T10:00:00.000Z",
    "zoneOffset": "+05:30",
    "result": {
      "dataOrigins": [],
      "COUNT_TOTAL": 890
    }
  }
]
```

The wrapper documentation shows `dataOrigins` inside each bucket's `result`. ([Matinzd][5])

---

# 5.30 Fixed Duration vs Calendar Period

This distinction is extremely important.

### Duration

```text id="c9x3m7"
duration: 'HOURS'
length: 1
```

means a fixed-length duration.

### Period

```text id="q2v8n5"
period: 'DAYS'
length: 1
```

means a calendar-based period.

The wrapper documentation explicitly distinguishes `Duration` from `Period`: Duration is fixed-length, whereas Period is date/calendar based. ([Matinzd][1])

---

# 5.31 `aggregateGroupByPeriod()`

Use this method for calendar-based buckets:

```text id="x7m4p1"
DAYS
WEEKS
MONTHS
YEARS
```

Example:

```ts id="n8c2v6"
import { aggregateGroupByPeriod } from 'react-native-health-connect';

export async function getDailySteps(
  startTime: string,
  endTime: string
) {
  return aggregateGroupByPeriod({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime,
      endTime,
    },

    timeRangeSlicer: {
      period: 'DAYS',
      length: 1,
    },
  });
}
```

The current wrapper API uses `period` and `length`, not:

```ts
days: 1
```

or:

```ts
duration: 1
```

as shown in the original chapter. ([Matinzd][1])

---

# 5.32 Weekly Aggregation

```ts id="v5k1q8"
export async function getWeeklySteps(
  startTime: string,
  endTime: string
) {
  return aggregateGroupByPeriod({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime,
      endTime,
    },

    timeRangeSlicer: {
      period: 'WEEKS',
      length: 1,
    },
  });
}
```

---

# 5.33 Monthly Aggregation

```ts id="m3x7c2"
export async function getMonthlySteps(
  startTime: string,
  endTime: string
) {
  return aggregateGroupByPeriod({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime,
      endTime,
    },

    timeRangeSlicer: {
      period: 'MONTHS',
      length: 1,
    },
  });
}
```

The native Android API similarly supports period-based aggregation using calendar periods. ([Android Developers][3])

---

# 5.34 Important Time Handling Rule

Do not blindly use UTC `Instant` semantics for calendar-period aggregation.

The native Android API specifically warns that period aggregation requires local/calendar time semantics and can throw an `IllegalStateException` if the request is incorrectly expressed using `Instant`. ([Android Developers][3])

The React Native wrapper has also had fixes specifically around using local-date-time-based filters for grouped period aggregation. ([GitHub][6])

Therefore, for production applications:

```text id="j6n2v8"
Fixed duration
      ↓
aggregateGroupByDuration()

Calendar day/week/month
      ↓
aggregateGroupByPeriod()
      ↓
Use appropriate local calendar boundaries
```

Do not assume that:

```text id="p4c8x1"
00:00 UTC → 00:00 UTC
```

is equivalent to:

```text id="r7m2v5"
00:00 local time → 00:00 local time
```

---

# 5.35 Data-Origin Filtering

Health Connect aggregation can filter by data origin.

For example, the native API supports:

```text id="c5x9m2"
dataOriginFilter
```

to aggregate data written by a specific application. ([Android Developers][3])

This is useful when your application needs:

```text id="n7q3v8"
All Health Connect data
        OR
Only Samsung Health
        OR
Only Google Fit
        OR
Only your application
```

However, be careful with Steps.

Starting with the June 2026 Health Connect update, on-device steps can use a device-specific Synthetic Package Name rather than the historical generic `"android"` source. ([Android Developers][2])

Therefore:

```ts id="x1m6k4"
dataOrigin: "android"
```

should **not** be hardcoded as the universal source for device-generated steps.

---

# 5.36 Health Connect Deduplication

One of the most important reasons to use aggregation is Health Connect's handling of duplicate Activity and Sleep data.

For example, imagine:

```text id="h8v2p5"
Google Fit
    ↓
5000 steps

Samsung Health
    ↓
5000 steps
```

Simply reading both raw datasets and doing:

```ts id="r3x7m1"
5000 + 5000
```

could incorrectly produce:

```text id="j4q8n2"
10000 steps
```

The Aggregate API applies Health Connect's priority/deduplication behavior for supported Activity and Sleep data. The current Android documentation states that only Activity and Sleep data types are deduplicated this way; other data types may combine data from multiple sources. ([Android Developers][3])

Therefore:

```text id="m9c2v6"
For cumulative Activity data:
        Prefer aggregate()

Instead of:
        readRecords()
        +
        manually sum()
```

---

# 5.37 Empty Aggregation Results

Never assume an aggregate always contains a value.

For example:

```ts id="q7x1n5"
const result = await aggregateRecord({
  recordType: 'Steps',
  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

There may be no data.

Therefore your application should safely handle:

```text id="c4m8v2"
undefined
null
0
```

depending on the metric and wrapper representation.

A safe application-level normalization might be:

```ts id="v1p6k9"
const steps = result.COUNT_TOTAL ?? 0;
```

---

# 5.38 Production Aggregation Service

Do not call aggregation directly from UI components.

Create a service:

```text id="x8q3m5"
src/
  health-connect/
    availability.ts
    permissions.ts
    records.ts
    aggregates.ts
    changes.ts
    normalize.ts
```

Example:

```ts id="n2v7c4"
import {
  aggregateRecord,
  aggregateGroupByDuration,
  aggregateGroupByPeriod,
} from 'react-native-health-connect';

export async function getStepsTotal(
  startTime: string,
  endTime: string
) {
  const result = await aggregateRecord({
    recordType: 'Steps',

    timeRangeFilter: {
      operator: 'between',
      startTime,
      endTime,
    },
  });

  return result.COUNT_TOTAL ?? 0;
}
```

Then your UI simply calls:

```ts id="p5x9m1"
const steps = await getStepsTotal(
  startOfDay,
  endOfDay
);
```

---

# 5.39 Building a Daily Health Dashboard

A production dashboard can combine separate aggregate calls:

```text id="v8m2q6"
                    Health Dashboard
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
      Steps             Calories           Distance
        │                  │                  │
   COUNT_TOTAL      ACTIVE_CALORIES     DISTANCE_TOTAL
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                     Dashboard UI
```

Example:

```ts id="k4x7n2"
export async function getDailyDashboard(
  startTime: string,
  endTime: string
) {
  const [
    steps,
    activeCalories,
    distance,
  ] = await Promise.all([
    aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime,
      },
    }),

    aggregateRecord({
      recordType: 'ActiveCaloriesBurned',
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime,
      },
    }),

    aggregateRecord({
      recordType: 'Distance',
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime,
      },
    }),
  ]);

  return {
    steps: steps.COUNT_TOTAL ?? 0,

    activeCalories:
      activeCalories.ACTIVE_CALORIES_TOTAL,

    distance:
      distance.DISTANCE_TOTAL,
  };
}
```

This is the correct architectural pattern when the wrapper exposes aggregation per record type.

---

# 5.40 Aggregation vs Raw Records

Use **aggregation** when you need:

```text id="j5m8c2"
Daily step total
Weekly step chart
Monthly distance
Total calories
Average heart rate
Maximum heart rate
Minimum heart rate
Total sleep duration
Total hydration
Average weight
```

Use **raw records** when you need:

```text id="q1v7n4"
Individual heart-rate samples
Individual step records
Sleep stages
Workout details
Exercise routes
Source-specific records
Record IDs
Client record IDs
Change synchronization
```

---

# 5.41 Aggregation Is Derived Data

Aggregated values should normally be treated as **derived data**, not as your primary source of truth.

Recommended architecture:

```text id="m8c3x7"
Health Connect
      │
      ├── Raw records
      │
      └── Aggregate API
             │
             ▼
       Application analytics
             │
             ▼
          UI / charts
```

Do not create fake Health Connect records from aggregate results.

For synchronization systems, raw records and change tokens remain the source of truth; aggregation should be recomputed when needed.

---

# 5.42 Common Mistakes

### ❌ Mistake 1

Using native metric syntax in the React Native wrapper:

```ts id="a4q8n2"
metrics: [
  'Steps.STEPS_TOTAL'
]
```

### ✅ Correct

```ts id="p7v3m9"
recordType: 'Steps'
```

---

### ❌ Mistake 2

Using:

```ts id="x2c6k1"
timeRangeSlicer: {
  hours: 1
}
```

### ✅ Correct

```ts id="n8m4q7"
timeRangeSlicer: {
  duration: 'HOURS',
  length: 1,
}
```

---

### ❌ Mistake 3

Using:

```ts id="c5v9x2"
timeRangeSlicer: {
  days: 1
}
```

### ✅ Correct

```ts id="m7q1k8"
timeRangeSlicer: {
  period: 'DAYS',
  length: 1,
}
```

---

### ❌ Mistake 4

Manually summing Steps from every raw source.

### ✅ Correct

Use Health Connect aggregation for cumulative Activity data.

---

### ❌ Mistake 5

Treating calendar days as fixed 24-hour periods.

### ✅ Correct

Use `aggregateGroupByPeriod()` for calendar-based grouping.

---

### ❌ Mistake 6

Hardcoding `"android"` as the current device step source.

### ✅ Correct

Treat `dataOrigin` as opaque and account for the June 2026 Synthetic Package Name change. ([Android Developers][2])

---

# 5.43 Final Mental Model

Remember these three APIs:

```text id="r6x2m9"
┌───────────────────────────────────────────────┐
│             aggregateRecord()                │
│                                               │
│ One record type + one time range             │
│                                               │
│ Example:                                      │
│ Steps → total steps                           │
└───────────────────────────────────────────────┘

                    ↓

┌───────────────────────────────────────────────┐
│       aggregateGroupByDuration()             │
│                                               │
│ Fixed-size buckets                            │
│                                               │
│ Example:                                      │
│ Steps → every 1 hour                          │
└───────────────────────────────────────────────┘

                    ↓

┌───────────────────────────────────────────────┐
│        aggregateGroupByPeriod()              │
│                                               │
│ Calendar-based buckets                        │
│                                               │
│ Example:                                      │
│ Steps → every calendar day                    │
└───────────────────────────────────────────────┘
```

### The production rule

```text id="w3n7c5"
Cumulative metric
       ↓
aggregateRecord()

Fixed interval analytics
       ↓
aggregateGroupByDuration()

Calendar analytics
       ↓
aggregateGroupByPeriod()

Individual samples/details
       ↓
readRecords()
```

This distinction is the foundation for building reliable Health Connect analytics in React Native.

### Bottom line

Your original Chapter 5 had the **right conceptual idea**, but the code was using the **native Android aggregation model rather than the current React Native wrapper model**.

The three corrections you should absolutely make are:

[1]: https://matinzd.github.io/react-native-health-connect/docs/api/methods/aggregateGroupByPeriod/ "aggregateGroupByPeriod | React Native Health Connect"
[2]: https://developer.android.com/health-and-fitness/health-connect/read-data "Read raw data | Android Developers"
[3]: https://developer.android.com/health-and-fitness/health-connect/aggregate-data "Read aggregated data | Android Developers"
[4]: https://matinzd.github.io/react-native-health-connect/docs/category/methods/ "Methods | React Native Health Connect"
[5]: https://matinzd.github.io/react-native-health-connect/docs/api/methods/aggregateGroupByDuration/ "aggregateGroupByDuration | React Native Health Connect"
[6]: https://github.com/matinzd/react-native-health-connect/commits "Commits | React Native Health Connect GitHub"
