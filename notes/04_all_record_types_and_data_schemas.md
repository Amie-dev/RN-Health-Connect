# Chapter 4 — Complete Health Connect Record Types & Return Data Schemas

This chapter is a reference for Health Connect record types when using **React Native with `react-native-health-connect`**.

> **Important:** Health Connect has two different representations of a record:
>
> 1. **Write representation** — the object passed to `insertRecords()`.
> 2. **Read representation** — the object returned by `readRecord()`, `readRecords()`, and change upsert results.
>
> These representations are **not always identical**.
>
> In particular, unit-bearing values returned by the React Native wrapper are normalized into `in...` fields such as `inKilograms`, `inKilocalories`, `inMeters`, etc., rather than always returning `{ value, unit }`.

The Android Health Connect data-type reference currently contains the complete supported health and fitness data-type list, including Activity, Body Measurement, Cycle Tracking, Nutrition, Sleep, Vitals and Wellness categories. ([Android Developers][6])

---

## 4.1 Record Classification

Health Connect records are primarily divided into three temporal structures.

| Type              | Description                                | Examples                            |
| ----------------- | ------------------------------------------ | ----------------------------------- |
| **Instantaneous** | One measurement at a specific time         | Weight, BloodPressure, BloodGlucose |
| **Interval**      | Data covering a start/end period           | Steps, Distance, ExerciseSession    |
| **Series**        | Multiple samples inside a start/end period | HeartRate, Speed, Power             |

The official Health Connect data-type reference uses these three classifications. ([Android Developers][6])

---

# 4.2 Common Metadata

A Health Connect record returned by the React Native wrapper normally contains metadata similar to:

```ts
type RecordMetadata = {
  id: string;
  lastModifiedTime: string;
  clientRecordId: string | null;
  clientRecordVersion: number;
  dataOrigin: string;
  recordingMethod?: number;
  device?: number;
};
```

The exact TypeScript type should come from the installed `react-native-health-connect` version rather than being manually duplicated.

### Important metadata fields

| Field                 | Meaning                                       |
| --------------------- | --------------------------------------------- |
| `id`                  | Health Connect generated record ID            |
| `clientRecordId`      | ID supplied by your application               |
| `clientRecordVersion` | Application-side record version               |
| `lastModifiedTime`    | Last modification time                        |
| `dataOrigin`          | Package/application that contributed the data |
| `recordingMethod`     | How the data was recorded                     |
| `device`              | Device metadata represented by the wrapper    |

Health Connect automatically assigns fields such as `id`, `lastModifiedTime`, and `dataOrigin` when records are written. Application-controlled synchronization fields include `clientRecordId` and `clientRecordVersion`. ([Android Developers][5])

### Do not manually generate these fields

When creating a record, do **not** treat these as application-generated identifiers:

```ts
metadata: {
  id: "...",
  lastModifiedTime: "...",
  dataOrigin: "..."
}
```

Those values are managed by Health Connect.

Instead, application code normally supplies metadata such as:

```ts
metadata: {
  clientRecordId: "my-app-record-123",
  clientRecordVersion: 1,
  recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
  device: {
    manufacturer: "Google",
    model: "Pixel",
    type: DeviceType.TYPE_PHONE,
  },
}
```

The current Health Connect API requires recording-method metadata when creating records. ([Android Developers][8])

---

# 4.3 Activity Records

## 4.3.1 Steps

**Record type:** Interval

### Write

```ts
{
  recordType: "Steps",
  count: 1540,
  startTime: "2026-09-09T08:00:00.000Z",
  endTime: "2026-09-09T08:30:00.000Z"
}
```

### Important fields

```ts
type StepsRecord = {
  recordType: "Steps";
  count: number;
  startTime: string;
  endTime: string;
  startZoneOffset?: string | null;
  endZoneOffset?: string | null;
  metadata?: RecordMetadata;
};
```

### Read result

Conceptually:

```ts
{
  recordType: "Steps",
  count: 1540,
  startTime: "...",
  endTime: "...",
  metadata: {
    id: "...",
    lastModifiedTime: "...",
    clientRecordId: null,
    clientRecordVersion: 0,
    dataOrigin: "...",
    recordingMethod: 2
  }
}
```

The current Android API identifies `StepsRecord` as an interval record with mandatory `count`, `startTime`, `endTime`, and `metadata`. ([Android Developers][6])

### Important 2026 note

Do **not** assume that on-device steps always have:

```ts
dataOrigin: "android"
```

Health Connect's newer on-device step attribution uses device-specific Synthetic Package Names for current data. Therefore, applications should treat `dataOrigin` as an opaque source identifier rather than hardcoding `"android"`.

---

## 4.3.2 Active Calories Burned

```ts
{
  recordType: "ActiveCaloriesBurned",
  energy: {
    unit: "kilocalories",
    value: 320.5
  },
  startTime: "...",
  endTime: "..."
}
```

The write representation uses:

```ts
energy: {
  unit: "kilocalories",
  value: 320.5
}
```

But a wrapper read result can expose normalized values such as:

```ts
energy: {
  inCalories: ...,
  inJoules: ...,
  inKilojoules: ...,
  inKilocalories: ...
}
```

This distinction is demonstrated by the current wrapper documentation. ([Matinzd][7])

---

## 4.3.3 Total Calories Burned

```ts
{
  recordType: "TotalCaloriesBurned",
  energy: {
    unit: "kilocalories",
    value: 2150
  },
  startTime: "...",
  endTime: "..."
}
```

Returned unit data should be treated as the wrapper's result representation rather than assumed to remain `{ value, unit }`.

---

## 4.3.4 Distance

```ts
{
  recordType: "Distance",
  distance: {
    unit: "meters",
    value: 5250
  },
  startTime: "...",
  endTime: "..."
}
```

Health Connect classifies Distance as an interval record with a Length unit. ([Android Developers][6])

---

## 4.3.5 Elevation Gained

```ts
{
  recordType: "ElevationGained",
  elevation: {
    unit: "meters",
    value: 150.2
  },
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.6 Floors Climbed

```ts
{
  recordType: "FloorsClimbed",
  floors: 12,
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.7 Exercise Session

```ts
{
  recordType: "ExerciseSession",
  exerciseType: /* use the appropriate enum constant */,
  startTime: "...",
  endTime: "...",
  title: "Morning Run",
  notes: "Good pace",
  laps: [],
  segments: []
}
```

The native API defines `ExerciseSessionRecord` as an interval record with:

```text
exerciseType
startTime
endTime
laps
segments
metadata
```

and supports a large set of exercise types. ([Android Developers][6])

### Do not hardcode exercise numbers

Avoid documentation such as:

```ts
exerciseType: 56
```

as your primary API.

Prefer the library/native constants:

```ts
exerciseType: ExerciseType.RUNNING
```

or the equivalent constant exposed by the installed wrapper version.

The exact numeric values are implementation constants and are much less maintainable than the named constants.

---

## 4.3.8 Power

Power is a **series** record.

```ts
{
  recordType: "Power",
  samples: [
    {
      time: "...",
      power: {
        unit: "watts",
        value: 210
      }
    }
  ],
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.9 Speed

```ts
{
  recordType: "Speed",
  samples: [
    {
      time: "...",
      speed: {
        unit: "metersPerSecond",
        value: 3.5
      }
    }
  ],
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.10 Steps Cadence

```ts
{
  recordType: "StepsCadence",
  samples: [
    {
      time: "...",
      rate: 100
    }
  ],
  startTime: "...",
  endTime: "..."
}
```

This is a **series** record.

---

## 4.3.11 Cycling Pedaling Cadence

```ts
{
  recordType: "CyclingPedalingCadence",
  samples: [
    {
      time: "...",
      revolutionsPerMinute: 85
    }
  ],
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.12 Wheelchair Pushes

```ts
{
  recordType: "WheelchairPushes",
  count: 500,
  startTime: "...",
  endTime: "..."
}
```

---

## 4.3.13 Activity Intensity

Current Health Connect also includes:

```text
ActivityIntensityRecord
```

with:

```ts
{
  activityIntensityType: ...,
  startTime: "...",
  endTime: "..."
}
```

It supports aggregate calculations such as duration and intensity minutes. ([Android Developers][6])

---

## 4.3.14 Planned Exercise Session

Current Health Connect also supports:

```text
PlannedExerciseSessionRecord
```

This is associated with the Training Plans API and requires the corresponding feature/permissions. ([Android Developers][6])

Its structure includes fields such as:

```ts
{
  exerciseType: ...,
  block: ...,
  hasExplicitTime: true,
  startTime: "...",
  endTime: "..."
}
```

This record should not be confused with an actual completed `ExerciseSession`.

---

# 4.4 Body Measurement Records

## 4.4.1 Weight

### Write

```ts
{
  recordType: "Weight",
  weight: {
    unit: "kilograms",
    value: 74.2
  },
  time: "2026-09-09T07:00:00.000Z"
}
```

### Read result

Do not assume:

```ts
weight: {
  value: 74.2,
  unit: "kilograms"
}
```

The wrapper's result representation uses normalized values, for example:

```ts
weight: {
  inGrams: 74200,
  inKilograms: 74.2,
  inMilligrams: 74200000,
  inMicrograms: 74200000000,
  inOunces: ...,
  inPounds: ...
}
```

A current wrapper issue documents this runtime result behavior explicitly. ([GitHub][3])

---

## 4.4.2 Height

### Write

```ts
{
  recordType: "Height",
  height: {
    unit: "meters",
    value: 1.78
  },
  time: "2026-09-09T07:00:00.000Z"
}
```

The native Health Connect type is an instantaneous `HeightRecord`. ([Android Developers][6])

---

## 4.4.3 Body Fat

```ts
{
  recordType: "BodyFat",
  percentage: {
    unit: "percent",
    value: 18.5
  },
  time: "..."
}
```

---

## 4.4.4 Body Mass Index

```ts
{
  recordType: "BodyMassIndex",
  time: "...",
  result: 23.4
}
```

Use the exact wrapper TypeScript definition for the installed version when implementing this record.

---

## 4.4.5 Bone Mass

```ts
{
  recordType: "BoneMass",
  mass: {
    unit: "kilograms",
    value: 3.2
  },
  time: "..."
}
```

---

## 4.4.6 Lean Body Mass

```ts
{
  recordType: "LeanBodyMass",
  mass: {
    unit: "kilograms",
    value: 60.5
  },
  time: "..."
}
```

---

## 4.4.7 Body Water Mass

```ts
{
  recordType: "BodyWaterMass",
  mass: {
    unit: "kilograms",
    value: 45
  },
  time: "..."
}
```

---

## 4.4.8 Basal Metabolic Rate

This record was missing from the original chapter.

```text
BasalMetabolicRateRecord
```

It is an instantaneous body-measurement record with:

```ts
{
  basalMetabolicRate: ...,
  time: "...",
  metadata: ...
}
```

Health Connect also supports aggregation for basal metabolic rate. ([Android Developers][6])

---

# 4.5 Vitals Records

## 4.5.1 Heart Rate

Heart rate is a **series** record.

```ts
{
  recordType: "HeartRate",
  samples: [
    {
      time: "2026-09-09T08:00:00.000Z",
      beatsPerMinute: 72
    },
    {
      time: "2026-09-09T08:01:00.000Z",
      beatsPerMinute: 75
    }
  ],
  startTime: "...",
  endTime: "..."
}
```

The official API identifies `HeartRateRecord` as a Series type. ([Android Developers][6])

---

## 4.5.2 Resting Heart Rate

```ts
{
  recordType: "RestingHeartRate",
  beatsPerMinute: 62,
  time: "2026-09-09T06:30:00.000Z"
}
```

---

## 4.5.3 Blood Pressure

```ts
{
  recordType: "BloodPressure",
  systolic: {
    unit: "millimetersOfMercury",
    value: 120
  },
  diastolic: {
    unit: "millimetersOfMercury",
    value: 80
  },
  bodyPosition: ...,
  measurementLocation: ...,
  time: "..."
}
```

The mandatory native fields are:

```text
systolic
diastolic
bodyPosition
measurementLocation
time
metadata
```

([Android Developers][6])

---

## 4.5.4 Blood Glucose

The original example is incomplete.

Current Health Connect requires:

```text
level
specimenSource
mealType
relationToMeal
time
metadata
```

Therefore:

```ts
{
  recordType: "BloodGlucose",

  level: {
    unit: "milligramsPerDeciliter",
    value: 95
  },

  specimenSource: ...,
  mealType: ...,
  relationToMeal: ...,

  time: "2026-09-09T07:00:00.000Z"
}
```

`specimenSource` should not be omitted from a production schema. ([Android Developers][6])

---

## 4.5.5 Oxygen Saturation

```ts
{
  recordType: "OxygenSaturation",
  percentage: {
    unit: "percent",
    value: 98.5
  },
  time: "..."
}
```

---

## 4.5.6 Body Temperature

```ts
{
  recordType: "BodyTemperature",
  temperature: {
    unit: "celsius",
    value: 36.6
  },
  measurementLocation: ...,
  time: "..."
}
```

---

## 4.5.7 Basal Body Temperature

```ts
{
  recordType: "BasalBodyTemperature",
  temperature: {
    unit: "celsius",
    value: 36.4
  },
  measurementLocation: ...,
  time: "..."
}
```

---

## 4.5.8 Respiratory Rate

```ts
{
  recordType: "RespiratoryRate",
  rate: 16,
  time: "..."
}
```

The official API defines respiratory rate as an instantaneous record. ([Android Developers][6])

---

## 4.5.9 Heart Rate Variability RMSSD

```ts
{
  recordType: "HeartRateVariabilityRmssd",
  heartRateVariabilityMillis: 42.5,
  time: "..."
}
```

---

## 4.5.10 Skin Temperature

This is another record missing from the original chapter.

```text
SkinTemperatureRecord
```

It is a **series** record and includes:

```text
deltas
startTime
endTime
measurementLocation
metadata
```

It is associated with the `FEATURE_SKIN_TEMPERATURE` feature flag. ([Android Developers][6])

---

## 4.5.11 VO2 Max

Current Health Connect also supports:

```text
Vo2MaxRecord
```

with fields including:

```ts
{
  recordType: "Vo2Max",
  vo2MillilitersPerMinuteKilogram: ...,
  measurementMethod: ...,
  time: "..."
}
```

([Android Developers][6])

---

# 4.6 Sleep

## Sleep Session

```ts
{
  recordType: "SleepSession",

  startTime: "...",
  endTime: "...",

  stages: [
    {
      startTime: "...",
      endTime: "...",
      stage: ...
    }
  ]
}
```

Optional fields such as title/notes may also be present depending on the wrapper/API version.

### Sleep stages

Use the wrapper's exported sleep-stage constants rather than hardcoding numeric values:

```ts
SleepStage.AWAKE
SleepStage.SLEEPING
SleepStage.OUT_OF_BED
SleepStage.LIGHT
SleepStage.DEEP
SleepStage.REM
SleepStage.UNKNOWN
```

Health Connect incorporated sleep stages into `SleepSessionRecord`; the older standalone `SleepStageRecord` was removed. ([Android Developers][4])

---

# 4.7 Nutrition

## 4.7.1 Hydration

```ts
{
  recordType: "Hydration",
  volume: {
    unit: "milliliters",
    value: 500
  },
  startTime: "...",
  endTime: "..."
}
```

Health Connect classifies Hydration as an interval record with a Volume value. ([Android Developers][6])

---

## 4.7.2 Nutrition

Nutrition is one of the most extensive Health Connect records.

Example write payload:

```ts
{
  recordType: "Nutrition",

  name: "Oatmeal with Banana",

  mealType: ...,

  energy: {
    unit: "kilocalories",
    value: 350
  },

  totalProtein: {
    unit: "grams",
    value: 12
  },

  totalCarbohydrate: {
    unit: "grams",
    value: 55
  },

  dietaryFiber: {
    unit: "grams",
    value: 8
  },

  totalFat: {
    unit: "grams",
    value: 7
  },

  sodium: {
    unit: "grams",
    value: 0.15
  },

  potassium: {
    unit: "grams",
    value: 0.4
  },

  startTime: "...",
  endTime: "..."
}
```

Nutrition contains many optional nutrient fields, including carbohydrates, fats, protein, sodium, potassium, vitamins and minerals. ([Android Developers][6])

### Important

Do not describe Nutrition as having only the handful of fields shown above.

The complete Nutrition model contains many optional fields and is better documented as a dedicated schema table rather than one short JSON example.

---

# 4.8 Cycle Tracking

## 4.8.1 Menstruation Flow

```ts
{
  recordType: "MenstruationFlow",
  flow: ...,
  time: "..."
}
```

---

## 4.8.2 Menstruation Period

```ts
{
  recordType: "MenstruationPeriod",
  startTime: "...",
  endTime: "..."
}
```

Health Connect treats these differently:

* `MenstruationFlowRecord` → instantaneous
* `MenstruationPeriodRecord` → interval

([Android Developers][6])

---

## 4.8.3 Cervical Mucus

The original chapter's structure is incorrect.

Current Health Connect requires:

```text
appearance
sensation
time
metadata
```

not:

```text
texture
```

Example:

```ts
{
  recordType: "CervicalMucus",
  appearance: ...,
  sensation: ...,
  time: "..."
}
```

([Android Developers][6])

---

## 4.8.4 Ovulation Test

```ts
{
  recordType: "OvulationTest",
  result: ...,
  time: "..."
}
```

---

## 4.8.5 Sexual Activity

```ts
{
  recordType: "SexualActivity",
  protectionUsed: ...,
  time: "..."
}
```

This is an instantaneous record. ([Android Developers][6])

---

## 4.8.6 Intermenstrual Bleeding

The original chapter is missing:

```text
IntermenstrualBleedingRecord
```

Its required fields are:

```text
time
metadata
```

([Android Developers][6])

---

# 4.9 Wellness

## Mindfulness Session

Current Health Connect 1.1.0 includes:

```text
MindfulnessSessionRecord
```

The current React Native Health Connect `4.1.0` release added support for this record and moved its Android dependency to Health Connect 1.1.0 stable. ([GitHub][9])

Example:

```ts
{
  recordType: "MindfulnessSession",

  startTime: "2026-09-09T10:00:00.000Z",

  endTime: "2026-09-09T10:20:00.000Z",

  mindfulnessSessionType: MindfulnessSessionType.MEDITATION,

  title: "Morning Meditation"
}
```

Supported session types include:

```text
UNKNOWN
MEDITATION
BREATHING
MUSIC
MOVEMENT
UNGUIDED
```

([Android Developers][6])

Because this API remains relatively new/experimental upstream, production applications should verify feature availability before depending on it. ([GitHub][9])

---

# 4.10 Record Types That Must NOT Be Added

Several old tutorials contain record types that are no longer supported.

Do **not** document these as current Health Connect record types:

```text
SwimmingStrokesRecord
ExerciseEventRecord
ExerciseLapRecord
ExerciseRepetitionRecord
HipCircumferenceRecord
WaistCircumferenceRecord
SleepStageRecord
```

For example, `SwimmingStrokesRecord` was removed from Health Connect's supported record types in SDK 1.0.0-alpha10, and Hip/Waist circumference records were removed earlier. ([Android Developers][4])

---

# 4.11 Write Schema vs Read Schema

This is one of the most important concepts in the entire chapter.

### Write

The React Native wrapper may accept:

```ts
{
  recordType: "Weight",

  weight: {
    value: 74.2,
    unit: "kilograms"
  },

  time: "2026-09-09T07:00:00.000Z"
}
```

### Read

The result can be:

```ts
{
  recordType: "Weight",

  weight: {
    inGrams: 74200,
    inKilograms: 74.2,
    inMilligrams: 74200000,
    inMicrograms: 74200000000,
    inOunces: ...,
    inPounds: ...
  },

  time: "2026-09-09T07:00:00.000Z",

  metadata: {
    id: "...",
    ...
  }
}
```

Therefore:

> **Never create one TypeScript interface and assume it describes both the write payload and the read result.**

The wrapper documentation demonstrates this difference for energy values, and current issue reports also document it for mass/weight results. ([Matinzd][2])

---

# 4.12 Recommended TypeScript Architecture

Instead of defining one giant manual interface:

```ts
interface HealthConnectRecord {
  // everything
}
```

use the library's supplied types:

```ts
import type {
  HealthConnectRecord,
  HealthConnectRecordResult,
} from "react-native-health-connect";
```

Then build application-level normalized models separately.

For example:

```ts
type WeightSample = {
  id: string;
  timestamp: string;
  kilograms: number;
  source: string;
};
```

Normalize Health Connect data into this internal representation:

```ts
function normalizeWeight(record: any): WeightSample {
  return {
    id: record.metadata.id,
    timestamp: record.time,
    kilograms: record.weight.inKilograms,
    source: record.metadata.dataOrigin,
  };
}
```

This gives the application a stable domain model even if the Health Connect wrapper changes its result representation.

---

# 4.13 Current Record Coverage Checklist

For a current Health Connect integration, your Chapter 4 should cover at least these groups:

### Activity

```text
ActiveCaloriesBurned
ActivityIntensity
Distance
ElevationGained
ExerciseSession
FloorsClimbed
PlannedExerciseSession
Power
Speed
Steps
StepsCadence
TotalCaloriesBurned
Vo2Max
WheelchairPushes
CyclingPedalingCadence
```

### Body Measurement

```text
BasalMetabolicRate
BodyFat
BodyMassIndex
BodyWaterMass
BoneMass
Height
LeanBodyMass
Weight
```

### Cycle Tracking

```text
BasalBodyTemperature
CervicalMucus
IntermenstrualBleeding
MenstruationFlow
MenstruationPeriod
OvulationTest
SexualActivity
```

### Nutrition

```text
Hydration
Nutrition
```

### Sleep

```text
SleepSession
```

### Vitals

```text
BloodGlucose
BloodPressure
BodyTemperature
HeartRate
HeartRateVariabilityRmssd
OxygenSaturation
RespiratoryRate
RestingHeartRate
SkinTemperature
```

### Wellness

```text
MindfulnessSession
```

The official Android data-type table should remain the final authority because Health Connect adds/changes data types and feature-gated APIs over time. ([Android Developers][6])

---

# 4.14 Production Rules

### Rule 1 — Use wrapper types

Do not manually recreate every library type unless your application needs a domain-specific model.

### Rule 2 — Separate write and read models

```text
HealthConnectWriteRecord
          ↓
       Health Connect
          ↓
HealthConnectRecordResult
          ↓
     Normalization
          ↓
 Application Domain Model
```

### Rule 3 — Never hardcode enum numbers

Prefer:

```ts
ExerciseType.RUNNING
```

over:

```ts
56
```

### Rule 4 — Treat `dataOrigin` as opaque

Do not assume a particular package name for on-device or third-party data.

### Rule 5 — Check feature availability

Feature-gated types such as:

```text
MindfulnessSession
SkinTemperature
PlannedExerciseSession
```

should not automatically be assumed to exist on every device/provider.

### Rule 6 — Request only required permissions

Every data type has separate read/write permissions, and Health Connect requires applications to declare the permissions they use. ([Android Developers][6])

### Rule 7 — Do not blindly persist raw Health Connect objects

For production applications, normalize them into your own database schema.

### Rule 8 — Expect permission revocation

Users can revoke Health Connect permissions at any time, so every operation should be prepared for missing access. ([Android Developers][5])

---

# 4.15 Final Architecture

A production application should therefore use:

```text
React Native UI
       │
       ▼
Health Connect Service
       │
       ├── permissions.ts
       ├── records.ts
       ├── aggregates.ts
       ├── changes.ts
       └── normalize.ts
       │
       ▼
react-native-health-connect
       │
       ▼
Android Health Connect
       │
       ▼
Health Connect Records
```

The key design principle is:

```text
Health Connect schema
        ≠
React Native write schema
        ≠
React Native read-result schema
        ≠
Application database schema
```

Keeping those layers separate makes the integration substantially easier to maintain as Health Connect evolves.

[1]: https://developer.android.com/jetpack/androidx/releases/health-connect "Health Connect Release Notes | Android Developers"
[2]: https://matinzd.github.io/react-native-health-connect/docs/api/methods/readRecords/ "readRecords | React Native Health Connect"
[3]: https://github.com/matinzd/react-native-health-connect/issues/246 "MassResult Issue | React Native Health Connect GitHub"
[4]: https://developer.android.com/jetpack/androidx/releases/health-connect "Health Connect Releases | Android Developers"
[5]: https://developer.android.com/health-and-fitness/health-connect/write-data "Write data | Android Developers"
[6]: https://developer.android.com/health-and-fitness/health-connect/data-types "Health Connect Data Types | Android Developers"
[7]: https://matinzd.github.io/react-native-health-connect/docs/api/methods/insertRecords/ "insertRecords | React Native Health Connect"
[8]: https://developer.android.com/health-and-fitness/health-connect/metadata "Metadata Requirements | Android Developers"
[9]: https://github.com/matinzd/react-native-health-connect/releases "Releases | React Native Health Connect GitHub"
