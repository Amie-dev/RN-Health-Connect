Yes. **Chapter 7 needs a substantial correction** before you include it in the master guide.

The UI idea is fine, but the current code still contains the same aggregation API mismatch from the original Chapter 5, plus a few permission and data-schema problems. I checked the current Android Health Connect documentation and the current `react-native-health-connect` Expo integration. As of September 2026, the Android sync/read documentation was updated September 8, 2026, and the wrapper's v4 line includes its Expo config plugin. ([Android Developers][1])

### Most important fixes

| Your code                                 | Correct approach                                                     |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `aggregateRecord({ metrics: [...] })`     | `aggregateRecord({ recordType, timeRangeFilter })`                   |
| `STEPS_TOTAL`                             | `COUNT_TOTAL`                                                        |
| `ACTIVE_CALORIES_TOTAL?.value`            | Numeric aggregate result                                             |
| `latestWeight.value`                      | Read result uses normalized unit fields such as `weight.inKilograms` |
| `permissionsGranted = granted.length > 0` | Check **all required permissions**                                   |
| Only checks Steps + Weight                | Also check ActiveCaloriesBurned if dashboard uses it                 |
| Expo Go implied                           | Must use an Android development/native build, not Expo Go            |
| No Android project setup                  | Need current Expo plugin + `prebuild`/development build              |
| Weight permission + write                 | Correct concept                                                      |
| Current-day aggregation only              | Good, but local/calendar-day semantics should be preserved           |

The official Health Connect docs also confirm that background reads require an additional permission and that foreground sync should be checked when the app becomes active because Health Connect does not notify your app of new data automatically. ([Android Developers][1])

Below is the version I recommend putting into your guide.

# Chapter 7: Full Working React Native Expo Example App

This chapter builds a complete **React Native + Expo + TypeScript + Health Connect** example.

The application demonstrates:

* Health Connect availability detection
* SDK initialization
* Runtime permission requests
* Checking already-granted permissions
* Reading today's steps
* Reading today's active calories
* Reading the latest weight
* Writing a new weight record
* Refreshing Health Connect data
* Handling loading and error states
* Expo native-build configuration

> **Important:** `react-native-health-connect` is an Android native library. It does not run inside Expo Go. With the current v4 integration, the package itself provides the Expo config plugin; the old standalone `expo-health-connect` package is deprecated. ([GitHub][2])

---

# 7.1 Architecture

The example follows this flow:

```text
┌──────────────────────────────┐
│       React Native UI        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ HealthConnectService         │
│                              │
│ initialize()                 │
│ requestPermission()          │
│ getGrantedPermissions()      │
│ aggregateRecord()            │
│ readRecords()                │
│ insertRecords()              │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Android Health Connect  │
└──────────────────────────────┘
```

For a larger production application, the Health Connect calls should eventually be moved out of the screen into a dedicated service layer.

---

# 7.2 Expo Installation

Install the Health Connect library:

```bash
npm install react-native-health-connect
```

The current v4 package contains the Expo integration/config plugin. You should **not** install the deprecated standalone `expo-health-connect` package alongside it. ([GitHub][2])

Add the plugin:

```json
{
  "expo": {
    "plugins": [
      "react-native-health-connect"
    ]
  }
}
```

Then regenerate the Android native project:

```bash
npx expo prebuild --clean --platform android
```

Build a development version:

```bash
npx expo run:android
```

Alternatively, use an EAS development build.

### Important

This will not work:

```bash
npx expo start
```

inside **Expo Go**.

The application requires native Android Health Connect integration.

The current library's own Expo documentation confirms that its v4 integration is provided through the package's config plugin. ([GitHub][2])

---

# 7.3 Android Requirements

Health Connect is Android-only.

Your application should target a currently supported Android SDK and use the AndroidX Health Connect client through the React Native wrapper.

Health Connect supports Android 8/API 26+ for the underlying SDK, while the Health Connect application/platform availability differs by Android version.

For current Android releases:

```text
Android 14+
    ↓
Health Connect is part of the Android system

Older supported Android versions
    ↓
Health Connect provider/application
```

The exact availability should still be checked at runtime.

---

# 7.4 Required Permissions

For this example we need:

### Read

```text
Steps
ActiveCaloriesBurned
Weight
```

### Write

```text
Weight
```

We do not need write access to steps because this example does not create step records.

Therefore:

```typescript
const HEALTH_PERMISSIONS: Permission[] = [
  {
    accessType: 'read',
    recordType: 'Steps',
  },
  {
    accessType: 'read',
    recordType: 'ActiveCaloriesBurned',
  },
  {
    accessType: 'read',
    recordType: 'Weight',
  },
  {
    accessType: 'write',
    recordType: 'Weight',
  },
];
```

A good production application should request only the permissions required for its actual functionality.

---

# 7.5 Complete App.tsx

```tsx
import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  Permission,
} from 'react-native-health-connect';

const HEALTH_PERMISSIONS: Permission[] = [
  {
    accessType: 'read',
    recordType: 'Steps',
  },
  {
    accessType: 'read',
    recordType: 'ActiveCaloriesBurned',
  },
  {
    accessType: 'read',
    recordType: 'Weight',
  },
  {
    accessType: 'write',
    recordType: 'Weight',
  },
];

type DashboardState = {
  steps: number;
  activeCalories: number;
  latestWeightKg: number | null;
};

export default function App() {
  const [sdkStatus, setSdkStatus] =
    useState<SdkAvailabilityStatus | null>(null);

  const [initialized, setInitialized] =
    useState(false);

  const [permissionsGranted, setPermissionsGranted] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [weightInput, setWeightInput] =
    useState('');

  const [dashboard, setDashboard] =
    useState<DashboardState>({
      steps: 0,
      activeCalories: 0,
      latestWeightKg: null,
    });

  const [error, setError] =
    useState<string | null>(null);

  /**
   * Check whether every permission required
   * by this example has been granted.
   */
  const checkPermissions = useCallback(
    async (): Promise<boolean> => {
      const granted = await getGrantedPermissions();

      const hasPermission = (permission: Permission) =>
        granted.some(
          item =>
            item.recordType === permission.recordType &&
            item.accessType === permission.accessType
        );

      const allGranted = HEALTH_PERMISSIONS.every(
        hasPermission
      );

      setPermissionsGranted(allGranted);

      return allGranted;
    },
    []
  );

  /**
   * Read today's Health Connect data.
   */
  const fetchDashboardData = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const now = new Date();

        /*
         * Important:
         *
         * We use the device's local calendar day here.
         *
         * Health Connect aggregation is sensitive to
         * calendar/local-time semantics.
         */
        const startOfDay = new Date();

        startOfDay.setHours(0, 0, 0, 0);

        /**
         * Steps
         *
         * The React Native wrapper's aggregateRecord()
         * works with ONE recordType per call.
         */
        const stepsResult = await aggregateRecord({
          recordType: 'Steps',

          timeRangeFilter: {
            operator: 'between',
            startTime: startOfDay.toISOString(),
            endTime: now.toISOString(),
          },
        });

        /**
         * Active calories
         */
        const caloriesResult =
          await aggregateRecord({
            recordType: 'ActiveCaloriesBurned',

            timeRangeFilter: {
              operator: 'between',
              startTime: startOfDay.toISOString(),
              endTime: now.toISOString(),
            },
          });

        /**
         * Latest weight from the previous 30 days.
         */
        const weightResult =
          await readRecords('Weight', {
            timeRangeFilter: {
              operator: 'between',

              startTime: new Date(
                Date.now() -
                  30 * 24 * 60 * 60 * 1000
              ).toISOString(),

              endTime: now.toISOString(),
            },

            ascendingOrder: false,

            pageSize: 1,
          });

        const latestWeight =
          weightResult.records[0];

        setDashboard({
          steps:
            stepsResult.COUNT_TOTAL ?? 0,

          activeCalories:
            caloriesResult.ACTIVE_CALORIES_TOTAL ?? 0,

          /*
           * Health Connect read results are normalized.
           * For Weight, the current wrapper exposes
           * the value through inKilograms.
           */
          latestWeightKg:
            latestWeight?.weight?.inKilograms ??
            null,
        });
      } catch (err) {
        console.error(
          'Failed to fetch Health Connect data:',
          err
        );

        setError(
          'Unable to read Health Connect data.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Complete Health Connect initialization.
   */
  const setupHealthConnect = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        /**
         * 1. Check SDK availability.
         */
        const status = await getSdkStatus();

        setSdkStatus(status);

        if (
          status !==
          SdkAvailabilityStatus.SDK_AVAILABLE
        ) {
          setError(
            'Health Connect is not available on this device.'
          );

          return;
        }

        /**
         * 2. Initialize the library.
         */
        const initializedResult =
          await initialize();

        setInitialized(initializedResult);

        if (!initializedResult) {
          setError(
            'Health Connect initialization failed.'
          );

          return;
        }

        /**
         * 3. Check current permissions.
         */
        const hasPermissions =
          await checkPermissions();

        /**
         * 4. Load data if permissions already exist.
         */
        if (hasPermissions) {
          await fetchDashboardData();
        }
      } catch (err) {
        console.error(
          'Health Connect setup error:',
          err
        );

        setError(
          'Failed to initialize Health Connect.'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      checkPermissions,
      fetchDashboardData,
    ]
  );

  /**
   * Request Health Connect permissions.
   */
  const handleRequestPermissions =
    async () => {
      setLoading(true);
      setError(null);

      try {
        const result =
          await requestPermission(
            HEALTH_PERMISSIONS
          );

        console.log(
          'Granted permissions:',
          result
        );

        /**
         * Never use:
         *
         * result.length > 0
         *
         * because partial permission grants
         * are possible.
         */
        const allGranted =
          await checkPermissions();

        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'Please grant all permissions required by this example.'
          );

          return;
        }

        await fetchDashboardData();
      } catch (err) {
        console.error(
          'Permission request failed:',
          err
        );

        Alert.alert(
          'Permission Error',
          String(err)
        );
      } finally {
        setLoading(false);
      }
    };

  /**
   * Insert a WeightRecord into Health Connect.
   */
  const handleAddWeight = async () => {
    const weight =
      Number.parseFloat(weightInput);

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      Alert.alert(
        'Invalid Weight',
        'Enter a valid weight in kilograms.'
      );

      return;
    }

    setLoading(true);
    setError(null);

    try {
      await insertRecords([
        {
          recordType: 'Weight',

          weight: {
            value: weight,
            unit: 'kilograms',
          },

          time: new Date().toISOString(),
        },
      ]);

      setWeightInput('');

      Alert.alert(
        'Success',
        'Weight saved to Health Connect.'
      );

      await fetchDashboardData();
    } catch (err) {
      console.error(
        'Failed to insert weight:',
        err
      );

      Alert.alert(
        'Save Failed',
        String(err)
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Run setup when the component mounts.
   */
  useEffect(() => {
    setupHealthConnect();
  }, [setupHealthConnect]);

  const sdkAvailable =
    sdkStatus ===
    SdkAvailabilityStatus.SDK_AVAILABLE;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <Text style={styles.header}>
          Health Connect Dashboard
        </Text>

        {/* Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>
            SDK Status:{' '}
            <Text style={styles.bold}>
              {sdkAvailable
                ? 'AVAILABLE'
                : 'UNAVAILABLE'}
            </Text>
          </Text>

          <Text style={styles.statusText}>
            Initialized:{' '}
            <Text style={styles.bold}>
              {initialized ? 'YES' : 'NO'}
            </Text>
          </Text>

          <Text style={styles.statusText}>
            Permissions:{' '}
            <Text style={styles.bold}>
              {permissionsGranted
                ? 'GRANTED'
                : 'NOT GRANTED'}
            </Text>
          </Text>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <ActivityIndicator
            size="large"
            style={styles.loader}
          />
        )}

        {/* Permission button */}
        {!permissionsGranted && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={
              handleRequestPermissions
            }
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              Request Permissions
            </Text>
          </TouchableOpacity>
        )}

        {/* Dashboard */}
        {permissionsGranted && (
          <>
            <TouchableOpacity
              style={
                styles.secondaryButton
              }
              onPress={
                fetchDashboardData
              }
              disabled={loading}
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Refresh Data
              </Text>
            </TouchableOpacity>

            <View style={styles.grid}>
              {/* Steps */}
              <View style={styles.metricCard}>
                <Text
                  style={styles.metricLabel}
                >
                  Today's Steps
                </Text>

                <Text
                  style={styles.metricValue}
                >
                  {dashboard.steps.toLocaleString()}
                </Text>
              </View>

              {/* Calories */}
              <View style={styles.metricCard}>
                <Text
                  style={styles.metricLabel}
                >
                  Active Calories
                </Text>

                <Text
                  style={styles.metricValue}
                >
                  {Math.round(
                    dashboard.activeCalories
                  )}{' '}
                  kcal
                </Text>
              </View>

              {/* Weight */}
              <View style={styles.metricCard}>
                <Text
                  style={styles.metricLabel}
                >
                  Latest Weight
                </Text>

                <Text
                  style={styles.metricValue}
                >
                  {dashboard.latestWeightKg !==
                  null
                    ? `${dashboard.latestWeightKg.toFixed(
                        1
                      )} kg`
                    : 'N/A'}
                </Text>
              </View>
            </View>

            {/* Weight input */}
            <View style={styles.inputCard}>
              <Text style={styles.cardTitle}>
                Log Weight
              </Text>

              <Text
                style={styles.inputLabel}
              >
                Weight in kilograms
              </Text>

              <View style={styles.row}>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 74.5"
                  keyboardType="decimal-pad"
                  value={weightInput}
                  onChangeText={
                    setWeightInput
                  }
                />

                <TouchableOpacity
                  style={
                    styles.saveButton
                  }
                  onPress={
                    handleAddWeight
                  }
                  disabled={loading}
                >
                  <Text
                    style={
                      styles.saveButtonText
                    }
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  container: {
    padding: 20,
    paddingTop: 32,
    paddingBottom: 40,
    flexGrow: 1,
  },

  header: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
  },

  statusCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,

    elevation: 2,
  },

  statusText: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 6,
  },

  bold: {
    fontWeight: '700',
    color: '#1A1A1A',
  },

  errorCard: {
    backgroundColor: '#FDECEC',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },

  errorText: {
    color: '#B42318',
    fontSize: 14,
  },

  loader: {
    marginVertical: 15,
  },

  primaryButton: {
    backgroundColor: '#0066CC',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  secondaryButton: {
    backgroundColor: '#E6F0FA',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },

  secondaryButtonText: {
    color: '#0066CC',
    fontWeight: '700',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  metricCard: {
    backgroundColor: '#FFFFFF',
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,

    elevation: 2,
  },

  metricLabel: {
    fontSize: 12,
    color: '#888888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0066CC',
  },

  inputCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,

    elevation: 2,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },

  inputLabel: {
    fontSize: 13,
    color: '#777777',
    marginBottom: 12,
  },

  row: {
    flexDirection: 'row',
  },

  textInput: {
    flex: 1,

    borderWidth: 1,
    borderColor: '#CCCCCC',

    borderRadius: 8,

    paddingHorizontal: 12,
    paddingVertical: 10,

    marginRight: 10,

    fontSize: 16,
  },

  saveButton: {
    backgroundColor: '#0066CC',

    paddingHorizontal: 22,

    justifyContent: 'center',

    borderRadius: 8,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
```

---

# 7.6 Why `aggregateRecord()` Is Called Twice

The original implementation attempted:

```typescript
aggregateRecord({
  metrics: [
    'Steps.STEPS_TOTAL',
    'ActiveCaloriesBurned.ENERGY_TOTAL',
  ],
});
```

That is **not the current `react-native-health-connect` wrapper API**.

The wrapper's aggregation interface uses a single `recordType`:

```typescript
await aggregateRecord({
  recordType: 'Steps',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

Then active calories are queried separately:

```typescript
await aggregateRecord({
  recordType: 'ActiveCaloriesBurned',

  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

This distinction is important because the wrapper API is not a direct one-to-one representation of every native Kotlin API shape.

---

# 7.7 Steps Result

For:

```typescript
recordType: 'Steps'
```

the aggregate metric is:

```typescript
COUNT_TOTAL
```

Therefore:

```typescript
const steps =
  stepsResult.COUNT_TOTAL ?? 0;
```

not:

```typescript
stepsResult.STEPS_TOTAL
```

Health Connect's current aggregate metric for `StepsRecord` is `COUNT_TOTAL`.

Aggregation is also preferable for cumulative data such as steps because Health Connect can account for duplicate step data according to its aggregation behavior. ([Android Developers][1])

---

# 7.8 Active Calories Result

For:

```typescript
recordType: 'ActiveCaloriesBurned'
```

the aggregate metric is:

```typescript
ACTIVE_CALORIES_TOTAL
```

Therefore:

```typescript
const calories =
  caloriesResult.ACTIVE_CALORIES_TOTAL ?? 0;
```

Do not assume the result is:

```typescript
{
  value: 500,
  unit: 'kilocalories'
}
```

The wrapper normalizes returned quantities into convenient unit-specific fields.

---

# 7.9 Reading Weight

The original code used:

```typescript
const latestWeight =
  weightResult.records[0].weight;

setRecentWeight(
  `${latestWeight.value} ${latestWeight.unit}`
);
```

That is incorrect for the wrapper's read-result representation.

Write payload:

```typescript
weight: {
  value: 74.5,
  unit: 'kilograms'
}
```

Read result:

```typescript
weight: {
  inKilograms: 74.5,
  ...
}
```

Therefore:

```typescript
const latestWeight =
  weightResult.records[0];

const kilograms =
  latestWeight.weight.inKilograms;
```

This illustrates an important Health Connect rule:

```text
Write representation
        ↓
{ value, unit }

Read representation
        ↓
normalized unit fields
```

---

# 7.10 Permission Checking Must Be Exact

This is unsafe:

```typescript
setPermissionsGranted(
  granted.length > 0
);
```

Imagine the user grants only:

```text
Steps READ
```

while denying:

```text
ActiveCaloriesBurned READ
Weight READ
Weight WRITE
```

`granted.length` is still greater than zero.

The UI would therefore incorrectly display:

```text
Permissions: GRANTED
```

and attempt operations that the application cannot perform.

Instead:

```typescript
const allGranted =
  HEALTH_PERMISSIONS.every(
    permission =>
      granted.some(
        grantedPermission =>
          grantedPermission.recordType ===
            permission.recordType &&
          grantedPermission.accessType ===
            permission.accessType
      )
  );
```

This is much safer.

---

# 7.11 Partial Permission Grants

Health Connect permissions should be treated individually.

For example:

```text
Steps READ              ✅
Calories READ           ❌
Weight READ             ✅
Weight WRITE            ❌
```

The application should not assume:

```text
some permissions = all permissions
```

Instead, the UI can either:

1. Disable unavailable features, or
2. Ask the user to grant the missing permissions.

For a production application, option 1 often provides a better user experience.

---

# 7.12 Initialization Flow

The recommended application flow is:

```text
App starts
   │
   ▼
getSdkStatus()
   │
   ├── unavailable → show setup message
   │
   ▼
initialize()
   │
   ▼
getGrantedPermissions()
   │
   ├── incomplete → request permissions
   │
   ▼
Read / aggregate data
```

This should happen before attempting Health Connect queries.

---

# 7.13 Writing a Weight Record

The write operation uses:

```typescript
await insertRecords([
  {
    recordType: 'Weight',

    weight: {
      value: 74.5,
      unit: 'kilograms',
    },

    time: new Date().toISOString(),
  },
]);
```

The wrapper returns the IDs of inserted records.

Conceptually:

```typescript
const ids = await insertRecords([...]);

console.log(ids);
```

These IDs are important when building synchronization systems.

---

# 7.14 Important: Don't Add Fake Metadata

A common mistake is manually supplying:

```typescript
metadata: {
  id: '...',
  dataOrigin: '...',
  lastModifiedTime: '...',
}
```

when inserting records.

Health Connect owns fields such as:

```text
id
dataOrigin
lastModifiedTime
```

These should not be treated as application-controlled identifiers.

If your application needs its own identifier, maintain it separately:

```text
Application DB
----------------------------
localId
healthConnectRecordId
```

rather than attempting to control Health Connect's generated ID.

---

# 7.15 Refreshing Data

The refresh button simply executes:

```typescript
await fetchDashboardData();
```

This is intentionally simple.

In a production application, however, the refresh operation should eventually become part of the synchronization service discussed in Chapter 6:

```text
Refresh
   ↓
Changes API
   ↓
Local database
   ↓
UI reads local database
```

rather than:

```text
Refresh
   ↓
Directly query every Health Connect dataset
   ↓
Render result
```

For small applications, direct reads are acceptable.

For larger applications, local synchronization is much more scalable.

---

# 7.16 Foreground Synchronization

Health Connect does not notify your application every time another application writes new health data.

The current official guidance recommends checking for changes when the application becomes active and periodically while the application is in the foreground. ([Android Developers][1])

React Native can detect foreground transitions:

```typescript
import {
  AppState,
} from 'react-native';

AppState.addEventListener(
  'change',
  async state => {
    if (state === 'active') {
      await syncHealthConnect();
    }
  }
);
```

For a production app, avoid putting the entire synchronization implementation directly inside the listener.

Instead:

```typescript
if (state === 'active') {
  await healthConnectSyncManager.sync();
}
```

---

# 7.17 Background Reading

If the application genuinely needs to read Health Connect while it is in the background, Android provides:

```xml
<uses-permission
    android:name="android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND" />
```

Background access is an additional permission and should only be requested when necessary. The current Android documentation provides a WorkManager-based background read example. ([Android Developers][3])

A production architecture is therefore:

```text
Foreground
    ↓
AppState → sync()

Background requirement
    ↓
Background Read permission
    ↓
Android scheduling / WorkManager
    ↓
Health Connect
```

Do not assume that React Native JavaScript will continuously execute in the background merely because the application has Health Connect permissions.

---

# 7.18 Expo + Native Build Reminder

For this project:

```text
Expo Go
   ❌
```

Use:

```text
Expo
 ↓
react-native-health-connect
 ↓
Expo config plugin
 ↓
prebuild
 ↓
Android native project
 ↓
Development build / EAS build
```

The current library's v4 Expo integration includes the config plugin directly, and the older `expo-health-connect` package is deprecated. ([GitHub][2])

---

# 7.19 Production Project Structure

The single-file example is useful for learning.

A production project should be separated:

```text
src/
├── health-connect/
│   ├── permissions.ts
│   ├── client.ts
│   ├── records.ts
│   ├── aggregation.ts
│   └── sync/
│       ├── syncManager.ts
│       ├── tokenStore.ts
│       └── changeProcessor.ts
│
├── database/
│   ├── healthRecords.ts
│   └── syncState.ts
│
├── screens/
│   └── HealthDashboardScreen.tsx
│
├── components/
│   ├── MetricCard.tsx
│   └── StatusCard.tsx
│
└── App.tsx
```

The UI should not know how Health Connect works internally.

Instead:

```text
HealthDashboardScreen
        ↓
HealthConnectService
        ↓
Health Connect
```

---

# 7.20 Recommended Production Data Flow

For a simple learning application:

```text
Health Connect
      ↓
React Native
      ↓
UI
```

For a production application:

```text
                 Health Connect
                       │
                       ▼
              Changes / Read API
                       │
                       ▼
            HealthConnectSyncService
                       │
                       ▼
                Local Database
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
            UI              Backend Queue
                                 │
                                 ▼
                             Backend API
```

The second architecture is preferable when the application needs:

* Offline support
* Historical analytics
* Backend synchronization
* Reliable incremental sync
* Retry handling
* Deduplication
* Auditability

---

# 7.21 Common Mistakes

## Mistake 1 — Using Expo Go

```text
Expo Go
   ↓
react-native-health-connect
```

This does not provide the required native module.

Use a development/native build instead. ([GitHub][2])

---

## Mistake 2 — Using the old aggregation API

Incorrect:

```typescript
aggregateRecord({
  metrics: [
    'Steps.STEPS_TOTAL',
  ],
});
```

Correct:

```typescript
aggregateRecord({
  recordType: 'Steps',
  timeRangeFilter: {
    operator: 'between',
    startTime,
    endTime,
  },
});
```

---

## Mistake 3 — Using `STEPS_TOTAL`

Incorrect:

```typescript
result.STEPS_TOTAL
```

Correct:

```typescript
result.COUNT_TOTAL
```

---

## Mistake 4 — Assuming `granted.length > 0` means success

Incorrect:

```typescript
if (granted.length > 0) {
  // Everything is available
}
```

Correct:

```typescript
const allGranted =
  requiredPermissions.every(
    permission =>
      granted.some(
        grantedPermission =>
          grantedPermission.recordType ===
            permission.recordType &&
          grantedPermission.accessType ===
            permission.accessType
      )
  );
```

---

## Mistake 5 — Assuming read and write schemas are identical

Write:

```typescript
weight: {
  value: 74.5,
  unit: 'kilograms',
}
```

Read:

```typescript
weight.inKilograms
```

Keep this distinction throughout the application.

---

## Mistake 6 — Reading every raw step record to calculate today's total

For cumulative data such as steps:

```text
readRecords()
     ↓
manually sum everything
```

is generally less desirable than:

```text
aggregateRecord()
     ↓
COUNT_TOTAL
```

because Health Connect's aggregation API is designed for cumulative totals and can account for duplicate activity data according to its aggregation rules. ([Android Developers][1])

---

# 7.22 Final Learning Flow

At this point the complete Health Connect learning path is:

```text
Chapter 1
Introduction + Expo Setup
        ↓
Chapter 2
SDK + Initialization + Permissions
        ↓
Chapter 3
CRUD + Reading/Writing Records
        ↓
Chapter 4
Record Types + Schemas
        ↓
Chapter 5
Aggregation + Analytics
        ↓
Chapter 6
Changes API + Synchronization
        ↓
Chapter 7
Complete Expo Application
```

The final application demonstrates the complete basic lifecycle:

```text
Check availability
        ↓
Initialize
        ↓
Check permissions
        ↓
Request missing permissions
        ↓
Aggregate Steps
        ↓
Aggregate Active Calories
        ↓
Read Weight
        ↓
Write Weight
        ↓
Refresh
```

For a production application, Chapter 7 should then be extended with:

```text
Changes API
     +
Local database
     +
Sync tokens
     +
Token expiration recovery
     +
Background synchronization
     +
Backend synchronization
```

That architecture builds directly on Chapter 6.

---

# 7.23 Chapter Summary

The most important lessons from this example are:

1. **Health Connect is an Android native integration**, so Expo Go is not sufficient.
2. **Use the current `react-native-health-connect` Expo plugin** rather than the deprecated standalone `expo-health-connect` package. ([GitHub][2])
3. Check SDK availability before initialization.
4. Check **every required permission**, not merely whether at least one permission was granted.
5. Use `aggregateRecord()` with a `recordType` and `timeRangeFilter`.
6. Steps aggregate through `COUNT_TOTAL`.
7. Active calories aggregate through `ACTIVE_CALORIES_TOTAL`.
8. Health Connect write and read schemas can differ.
9. Use `metadata.id` to identify Health Connect records.
10. Use the Changes API for reliable incremental synchronization.
11. Use foreground lifecycle events to refresh/synchronize because Health Connect does not notify applications whenever new data arrives. ([Android Developers][1])
12. Use the additional background-read permission only when background access is genuinely required. ([Android Developers][3])

The single-file application is suitable for learning and testing. A production application should move Health Connect operations into a service/repository layer and use the Changes API plus a local database as the synchronization backbone.

### One more important correction to your original chapter

Your original code had this:

```typescript
const hasSteps = ...
const hasWeight = ...

if (hasSteps && hasWeight) {
  await fetchDashboardData();
}
```

but `fetchDashboardData()` also reads **ActiveCaloriesBurned**. So even that initial permission check was incomplete.

The corrected implementation checks all four required permissions:

```text
Steps                  READ
ActiveCaloriesBurned   READ
Weight                 READ
Weight                 WRITE
```

That makes the example internally consistent.

Also, the current Android documentation explicitly recommends handling interruptions during reads/synchronization and continuing the next time the app is opened; it also confirms that `getChanges()` can return only part of the available changes and must be paged with `nextChangesToken`. ([Android Developers][1])

So with Chapters **1–7**, your guide now has a much stronger progression: **setup → permissions → CRUD → schemas → aggregation → incremental sync → complete Expo app**.

[1]: https://developer.android.com/health-and-fitness/health-connect/sync-data?utm_source=chatgpt.com "Synchronize data  |  Android health & fitness  |  Android Developers"
[2]: https://github.com/matinzd/react-native-health-connect/blob/main/.claude/docs/expo-and-linking.md?utm_source=chatgpt.com "react-native-health-connect/.claude/docs/expo-and-linking.md at main · matinzd/react-native-health-connect · GitHub"
[3]: https://developer.android.com/health-and-fitness/health-connect/read-data?authuser=0&utm_source=chatgpt.com "Read raw data  |  Android health & fitness  |  Android Developers"
