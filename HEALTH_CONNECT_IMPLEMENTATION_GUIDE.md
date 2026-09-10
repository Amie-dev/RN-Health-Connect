# Android Health Connect Implementation Guide (React Native & Expo)

This guide provides a comprehensive, chapter-wise implementation breakdown of the Android Health Connect React Native & Expo application. It includes the complete, unabridged source code for every file alongside detailed technical explanations of the underlying architecture, data models, synchronization patterns, and UI components.

---

## Table of Contents
- [Chapter 1: Architecture & Environment Setup](#chapter-1-architecture--environment-setup)
- [Chapter 2: SDK Availability & Initialization Client](#chapter-2-sdk-availability--initialization-client)
- [Chapter 3: Health Permissions Architecture](#chapter-3-health-permissions-architecture)
- [Chapter 4: CRUD Operations & Data Querying](#chapter-4-crud-operations--data-querying)
- [Chapter 5: Changes API & Incremental Sync Tokens](#chapter-5-changes-api--incremental-sync-tokens)
- [Chapter 6: Aggregations & Analytics Engine](#chapter-6-aggregations--analytics-engine)
- [Chapter 7: Local Database & Persistence Layer](#chapter-7-local-database--persistence-layer)
- [Chapter 8: Sync Engine, Token Store & Recovery](#chapter-8-sync-engine-token-store--recovery)
- [Chapter 9: Health Connect Dashboard UI](#chapter-9-health-connect-dashboard-ui)

---

## Chapter 1: Architecture & Environment Setup

### 1.1 Project Structure Overview
The application follows a clean layered service architecture:
- **`src/health-connect/`**: Native Health Connect wrapper interface, permission checks, records CRUD, aggregations, and synchronization engine.
- **`src/database/`**: Persistent local datastore mapping Health Connect UUIDs and maintaining sync cursor state.
- **`src/screens/`**: Interactive Health Connect Dashboard UI displaying metrics, local database explorer, live query view, sync status console, and data logger.

```text
src/
├── health-connect/
│   ├── client.ts              # SDK status, initialization, system settings
│   ├── permissions.ts         # Multi-category permissions & grant verification
│   ├── records.ts             # Health Connect CRUD & category helpers
│   ├── changes.ts             # Changes API token & paginated change fetcher
│   ├── aggregation.ts         # Metric aggregations (Steps, Calories, Heart Rate)
│   └── sync/
│       ├── tokenStore.ts      # Persistent Changes token manager per record type
│       ├── changeProcessor.ts # Local DB change applier & loop prevention
│       ├── recovery.ts        # 30-day token expiration recovery logic
│       └── syncManager.ts     # Main sync orchestrator & AppState auto-sync
│
├── database/
│   ├── healthRecords.ts       # Local health records store mapping HC UUIDs
│   └── syncState.ts           # Sync state tracking table
│
└── screens/
    └── HealthDashboard.tsx    # Complete React Native Expo UI screen
```

### 1.2 `package.json`
**File Path:** [package.json](file:///home/aminul/development/RN_Health_Connect/package.json)

```json
{
  "name": "rn-health-connect-app",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "^1.23.1",
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "react-native-health-connect": "^3.2.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~18.2.45",
    "typescript": "^5.1.3"
  },
  "private": true
}
```
**Explanation:**
- `react-native-health-connect`: Official React Native wrapper for Android Health Connect.
- `@react-native-async-storage/async-storage`: Cross-platform local persistence used to store synced Health Connect records and token state.

### 1.3 `app.json`
**File Path:** [app.json](file:///home/aminul/development/RN_Health_Connect/app.json)

```json
{
  "expo": {
    "name": "RN Health Connect",
    "slug": "rn-health-connect",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f172a"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f172a"
      },
      "package": "com.healthconnect.app"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "react-native-health-connect"
    ]
  }
}
```
**Explanation:**
- `"plugins": ["react-native-health-connect"]`: Configures Expo's prebuild system to inject the required Android Manifest permissions and intent filters into the native Android application bundle during `npx expo prebuild` or `npx expo run:android`.

### 1.4 `tsconfig.json`
**File Path:** [tsconfig.json](file:///home/aminul/development/RN_Health_Connect/tsconfig.json)

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```
**Explanation:**
- Extends standard `expo/tsconfig.base` to ensure full TypeScript type checking across React Native components and strict mode checking.

### 1.5 `App.tsx`
**File Path:** [App.tsx](file:///home/aminul/development/RN_Health_Connect/App.tsx)

```tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import HealthDashboard from './src/screens/HealthDashboard';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <HealthDashboard />
    </>
  );
}
```
**Explanation:**
- Main application entry component configuring a dark status bar theme and mounting the `HealthDashboard`.

---

## Chapter 2: SDK Availability & Initialization Client

**File Path:** [src/health-connect/client.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/client.ts)

```typescript
import {
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  openHealthConnectDataManagement,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

export interface HealthConnectClientInfo {
  status: number;
  initialized: boolean;
  message: string;
}

/**
 * Checks the Health Connect SDK availability on the Android device.
 */
export async function checkSdkAvailability(): Promise<number> {
  try {
    const status = await getSdkStatus();
    return status;
  } catch (error) {
    console.error('[HealthConnectClient] Failed to check SDK availability:', error);
    return SdkAvailabilityStatus.SDK_UNAVAILABLE;
  }
}

/**
 * Initializes the Health Connect SDK.
 * Must be called before reading or writing data.
 */
export async function initializeHealthConnect(): Promise<boolean> {
  try {
    const isInitialized = await initialize();
    console.log('[HealthConnectClient] SDK Initialized:', isInitialized);
    return isInitialized;
  } catch (error) {
    console.error('[HealthConnectClient] SDK Initialization error:', error);
    return false;
  }
}

/**
 * Convenience method to check status and initialize in one flow.
 */
export async function getClientState(): Promise<HealthConnectClientInfo> {
  const status = await checkSdkAvailability();

  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    let message = 'Health Connect SDK is unavailable on this device.';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      message = 'Health Connect app update is required on Google Play Store.';
    }
    return { status, initialized: false, message };
  }

  const initialized = await initializeHealthConnect();
  return {
    status,
    initialized,
    message: initialized ? 'Health Connect initialized successfully.' : 'Initialization failed.',
  };
}

/**
 * Navigates the user to Health Connect settings app.
 */
export async function openSettings(): Promise<void> {
  try {
    await openHealthConnectSettings();
  } catch (error) {
    console.error('[HealthConnectClient] Failed to open Health Connect settings:', error);
  }
}

/**
 * Navigates the user to Health Connect data management screen.
 */
export async function openDataManagement(providerPackageName?: string): Promise<void> {
  try {
    await openHealthConnectDataManagement(providerPackageName);
  } catch (error) {
    console.error('[HealthConnectClient] Failed to open data management screen:', error);
  }
}
```

### Detailed Code Explanation:
1. **SDK Availability Check (`checkSdkAvailability`)**:
   - Android 14+ includes Health Connect directly as part of the Android OS system. On Android 8–13, Health Connect requires an APK app installed from Google Play.
   - `getSdkStatus()` returns integer availability flags (`SDK_AVAILABLE`, `SDK_UNAVAILABLE`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`).
2. **Initialization (`initializeHealthConnect`)**:
   - Must be called before executing any data read or write operation. Connects the application client instance to the native Health Connect service binder.
3. **Unified Client State (`getClientState`)**:
   - Single initialization entry point used by components to verify system readiness and return user-friendly diagnostic error messages if an update is needed.
4. **Settings & Data Management Navigation (`openSettings`, `openDataManagement`)**:
   - Invokes system intent launchers to send users directly to native Android settings where they can review permissions or manage shared health data sources.

---

## Chapter 3: Health Permissions Architecture

**File Path:** [src/health-connect/permissions.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/permissions.ts)

```typescript
import {
  Permission,
  requestPermission,
  getGrantedPermissions,
  revokeAllPermissions,
} from 'react-native-health-connect';

export const APP_HEALTH_PERMISSIONS: Permission[] = [
  // Activity
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'write', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },

  // Body Measurements
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'write', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'BodyFat' },

  // Vitals
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'write', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'write', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BodyTemperature' },

  // Sleep
  { accessType: 'read', recordType: 'SleepSession' },

  // Nutrition & Hydration
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'Nutrition' },
];

export interface PermissionStatusResult {
  grantedPermissions: any[];
  hasAll: boolean;
  missingPermissions: Permission[];
}

/**
 * Requests the specified array of Health Connect permissions.
 */
export async function requestHealthPermissions(
  permissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<any[]> {
  try {
    const granted = await requestPermission(permissions);
    console.log('[Permissions] Requested and granted:', granted.length, 'permissions');
    return granted;
  } catch (error) {
    console.error('[Permissions] Error requesting permissions:', error);
    throw error;
  }
}

/**
 * Checks currently granted permissions against required permissions.
 */
export async function checkHealthPermissions(
  requiredPermissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<PermissionStatusResult> {
  try {
    const grantedPermissions = await getGrantedPermissions();

    const missingPermissions = requiredPermissions.filter(
      (required) =>
        !grantedPermissions.some(
          (granted: any) =>
            granted.recordType === required.recordType &&
            granted.accessType === required.accessType
        )
    );

    const hasAll = missingPermissions.length === 0;

    return {
      grantedPermissions,
      hasAll,
      missingPermissions,
    };
  } catch (error) {
    console.error('[Permissions] Error checking granted permissions:', error);
    return {
      grantedPermissions: [],
      hasAll: false,
      missingPermissions: requiredPermissions,
    };
  }
}

/**
 * Revokes all granted permissions for this application.
 */
export async function revokeAppPermissions(): Promise<void> {
  try {
    await revokeAllPermissions();
    console.log('[Permissions] All permissions revoked successfully.');
  } catch (error) {
    console.error('[Permissions] Failed to revoke permissions:', error);
  }
}
```

### Detailed Code Explanation:
1. **Explicit Permission Schema (`APP_HEALTH_PERMISSIONS`)**:
   - Defines read and write access for 15+ record types across Activity, Body, Vitals, Sleep, and Nutrition categories.
2. **Partial Grant Check (`checkHealthPermissions`)**:
   - **Crucial Rule**: Never assume `granted.length > 0` means all permissions were granted. Users can choose to grant access to Steps while denying access to Heart Rate.
   - `checkHealthPermissions()` iterates over `requiredPermissions` and verifies that every individual item exists in `grantedPermissions`.
3. **Revocation Support (`revokeAppPermissions`)**:
   - Allows users to clear all granted permissions from within the app context.

---

## Chapter 4: CRUD Operations & Data Querying

**File Path:** [src/health-connect/records.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/records.ts)

```typescript
import {
  insertRecords,
  readRecord,
  readRecords,
  deleteRecordsByUuids,
  deleteRecordsByTimeRange,
  RecordType,
  ReadRecordsOptions,
} from 'react-native-health-connect';

export type TimeRangeFilter =
  | { operator: 'between'; startTime: string; endTime: string }
  | { operator: 'after'; startTime: string }
  | { operator: 'before'; endTime: string };

export interface ReadRecordsFilterOptions {
  timeRangeFilter: TimeRangeFilter;
  dataOriginFilter?: string[];
  ascendingOrder?: boolean;
  pageSize?: number;
  pageToken?: string;
}

export interface ReadRecordsResponse<T = any> {
  records: T[];
  pageToken?: string;
}

/**
 * Inserts one or more health records into Health Connect.
 * Returns array of created Health Connect record IDs.
 */
export async function insertHealthRecords(records: any[]): Promise<string[]> {
  try {
    const recordIds = await insertRecords(records);
    console.log('[Records] Inserted record IDs:', recordIds);
    return recordIds;
  } catch (error) {
    console.error('[Records] Insert failed:', error);
    throw error;
  }
}

/**
 * Reads a single health record by record type and Health Connect record ID.
 */
export async function readHealthRecord<T = any>(
  recordType: RecordType,
  recordId: string
): Promise<T> {
  try {
    const record = await readRecord(recordType, recordId);
    return record as unknown as T;
  } catch (error) {
    console.error(`[Records] Read single record failed for ${recordType} (${recordId}):`, error);
    throw error;
  }
}

/**
 * Reads multiple records of a specified record type with filters.
 */
export async function queryHealthRecords<T = any>(
  recordType: RecordType,
  options: ReadRecordsFilterOptions
): Promise<ReadRecordsResponse<T>> {
  try {
    const readOptions: ReadRecordsOptions = {
      timeRangeFilter: options.timeRangeFilter as any,
      dataOriginFilter: options.dataOriginFilter,
      ascendingOrder: options.ascendingOrder ?? false,
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
    };
    const response = await readRecords(recordType, readOptions);
    return response as unknown as ReadRecordsResponse<T>;
  } catch (error) {
    console.error(`[Records] Query records failed for ${recordType}:`, error);
    return { records: [] };
  }
}

/**
 * Deletes specific Health Connect records by their IDs.
 */
export async function deleteHealthRecordsByIds(
  recordType: RecordType,
  recordIds: string[],
  clientRecordIds: string[] = []
): Promise<void> {
  try {
    await deleteRecordsByUuids(recordType, recordIds, clientRecordIds);
    console.log(`[Records] Deleted ${recordIds.length} records for ${recordType}`);
  } catch (error) {
    console.error(`[Records] Delete by IDs failed for ${recordType}:`, error);
    throw error;
  }
}

/**
 * Deletes records of a specified type within a given time range.
 */
export async function deleteHealthRecordsByTimeRange(
  recordType: RecordType,
  timeRangeFilter: TimeRangeFilter
): Promise<void> {
  try {
    await deleteRecordsByTimeRange(recordType, timeRangeFilter as any);
    console.log(`[Records] Deleted records by time range for ${recordType}`);
  } catch (error) {
    console.error(`[Records] Delete by time range failed for ${recordType}:`, error);
    throw error;
  }
}

// ----------------------------------------------------
// Category-specific convenience helper write methods
// ----------------------------------------------------

export async function logStepsRecord(count: number, startTime: string, endTime: string): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Steps',
      count,
      startTime,
      endTime,
    },
  ]);
}

export async function logWeightRecord(weightInKg: number, time: string = new Date().toISOString()): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Weight',
      weight: {
        value: weightInKg,
        unit: 'kilograms',
      },
      time,
    },
  ]);
}

export async function logHeartRateRecord(bpm: number, time: string = new Date().toISOString()): Promise<string[]> {
  const dateObj = new Date(time);
  const startTime = dateObj.toISOString();
  const endTime = new Date(dateObj.getTime() + 1000).toISOString();

  return insertHealthRecords([
    {
      recordType: 'HeartRate',
      samples: [
        {
          beatsPerMinute: bpm,
          time: startTime,
        },
      ],
      startTime,
      endTime,
    },
  ]);
}

export async function logBloodPressureRecord(
  systolicMmHg: number,
  diastolicMmHg: number,
  time: string = new Date().toISOString()
): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'BloodPressure',
      systolic: {
        value: systolicMmHg,
        unit: 'millimetersOfMercury',
      },
      diastolic: {
        value: diastolicMmHg,
        unit: 'millimetersOfMercury',
      },
      time,
    },
  ]);
}

export async function logHydrationRecord(liters: number, startTime: string, endTime: string): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Hydration',
      volume: {
        value: liters,
        unit: 'liters',
      },
      startTime,
      endTime,
    },
  ]);
}
```

### Detailed Code Explanation:
1. **Generic CRUD Layer**:
   - `insertHealthRecords`: Accepts array payloads for single or multi-record type inserts and returns generated Health Connect UUIDs.
   - `queryHealthRecords`: Supports filtering by `timeRangeFilter` (between, after, before), `dataOriginFilter` (filtering specific apps), `ascendingOrder`, pagination with `pageSize` and `pageToken`.
   - `deleteHealthRecordsByIds`: Deletes records via `deleteRecordsByUuids`.
2. **Category Helper Writers**:
   - `logStepsRecord`: Writes step counts with explicit start and end ISO time boundaries.
   - `logWeightRecord`: Writes weight records in normalized `kilograms`.
   - `logHeartRateRecord`: Structures sample series data (`beatsPerMinute`, `time`).
   - `logBloodPressureRecord`: Formats dual values (systolic and diastolic in `millimetersOfMercury`).
   - `logHydrationRecord`: Logs fluid volumes in `liters`.

---

## Chapter 5: Changes API & Incremental Sync Tokens

**File Path:** [src/health-connect/changes.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/changes.ts)

```typescript
import {
  getChanges,
  RecordType,
  GetChangesResults,
} from 'react-native-health-connect';

export interface ChangesResponse {
  changes: Array<
    | {
        type: 'upsert';
        record: {
          recordType: string;
          metadata?: {
            id?: string;
            dataOrigin?: string;
            lastModifiedTime?: string;
            clientRecordId?: string;
          };
          [key: string]: any;
        };
      }
    | {
        type: 'delete';
        recordId: string;
      }
  >;
  nextChangesToken: string;
  hasMore: boolean;
  changesTokenExpired: boolean;
}

/**
 * Requests a new Changes Token for a specific record type or list of record types.
 */
export async function fetchChangesToken(
  recordTypes: RecordType[],
  dataOriginFilter?: string[]
): Promise<string> {
  try {
    const res: GetChangesResults = await getChanges({
      recordTypes,
      dataOriginFilter,
    });
    console.log(`[Changes] Created Changes Token for [${recordTypes.join(', ')}]`);
    return res.nextChangesToken;
  } catch (error) {
    console.error(`[Changes] Failed to get Changes Token for [${recordTypes.join(', ')}]:`, error);
    throw error;
  }
}

/**
 * Retrieves changes using an existing Changes Token.
 */
export async function fetchChanges(changesToken: string): Promise<ChangesResponse> {
  try {
    const res: GetChangesResults = await getChanges({ changesToken });

    const changes: ChangesResponse['changes'] = [];

    if (res.upsertionChanges) {
      for (const item of res.upsertionChanges) {
        changes.push({
          type: 'upsert',
          record: item.record as any,
        });
      }
    }

    if (res.deletionChanges) {
      for (const item of res.deletionChanges) {
        changes.push({
          type: 'delete',
          recordId: item.recordId,
        });
      }
    }

    return {
      changes,
      nextChangesToken: res.nextChangesToken,
      hasMore: res.hasMore,
      changesTokenExpired: res.changesTokenExpired,
    };
  } catch (error) {
    console.error('[Changes] Failed to fetch changes using token:', error);
    throw error;
  }
}

/**
 * Helper to retrieve ALL accumulated changes by iteratively fetching while hasMore is true.
 */
export async function fetchAllAccumulatedChanges(initialToken: string): Promise<{
  allChanges: ChangesResponse['changes'];
  finalToken: string;
  tokenExpired: boolean;
}> {
  let currentToken = initialToken;
  const allChanges: ChangesResponse['changes'] = [];

  while (true) {
    const res = await fetchChanges(currentToken);

    if (res.changesTokenExpired) {
      return {
        allChanges: [],
        finalToken: currentToken,
        tokenExpired: true,
      };
    }

    if (res.changes && res.changes.length > 0) {
      allChanges.push(...res.changes);
    }

    currentToken = res.nextChangesToken;

    if (!res.hasMore) {
      break;
    }
  }

  return {
    allChanges,
    finalToken: currentToken,
    tokenExpired: false,
  };
}
```

### Detailed Code Explanation:
1. **Token Request vs Changes Request**:
   - Calling `getChanges({ recordTypes })` without a `changesToken` requests an initial token representing the current sync point.
   - Calling `getChanges({ changesToken })` passes an existing token to fetch incremental updates.
2. **Normalized Changes Array**:
   - Maps native `upsertionChanges` and `deletionChanges` into a unified discriminated union structure (`type: 'upsert'` or `'delete'`).
3. **Paginated Loop (`fetchAllAccumulatedChanges`)**:
   - **Crucial Rule**: One `getChanges()` response may not return the entire backlog of updates. The function loops while `res.hasMore` is `true`, updating `currentToken` with `nextChangesToken` on each step.

---

## Chapter 6: Aggregations & Analytics Engine

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

### Detailed Code Explanation:
1. **`aggregateRecord` API Contract**:
   - Evaluates metrics per `recordType`. `Steps` yields `COUNT_TOTAL`, `ActiveCaloriesBurned` yields `ACTIVE_CALORIES_TOTAL`, `Distance` yields normalized object `DISTANCE_TOTAL.inKilometers`, and `HeartRate` yields `BPM_AVG`, `BPM_MIN`, `BPM_MAX`.
2. **Local Day Time Boundaries (`getTodayHealthSummary`)**:
   - Sets start of day to `00:00:00.000` local device time to respect local calendar semantics. Uses `Promise.all` to query aggregations concurrently.

---

## Chapter 7: Local Database & Persistence Layer

### 7.1 `src/database/healthRecords.ts`
**File Path:** [src/database/healthRecords.ts](file:///home/aminul/development/RN_Health_Connect/src/database/healthRecords.ts)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocalHealthRecord {
  localId: string;
  healthConnectId: string;
  recordType: string;
  dataOrigin?: string;
  startTime?: string;
  endTime?: string;
  time?: string;
  lastModifiedTime?: string;
  payload: any;
  createdAt: string;
  updatedAt: string;
}

const HEALTH_RECORDS_STORAGE_KEY = '@health_connect_records_db';

/**
 * Retrieves all stored local health records.
 */
export async function getAllLocalHealthRecords(): Promise<LocalHealthRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('[HealthRecordsDB] Failed to read health records DB:', error);
    return [];
  }
}

/**
 * Upserts a health record in the local database based on Health Connect ID.
 */
export async function upsertLocalHealthRecord(
  healthConnectId: string,
  recordType: string,
  payload: any
): Promise<LocalHealthRecord> {
  const records = await getAllLocalHealthRecords();
  const existingIndex = records.findIndex((r) => r.healthConnectId === healthConnectId);

  const now = new Date().toISOString();
  const startTime = payload.startTime || payload.time;
  const endTime = payload.endTime || payload.time;
  const dataOrigin = payload.metadata?.dataOrigin;
  const lastModifiedTime = payload.metadata?.lastModifiedTime || now;

  let updatedRecord: LocalHealthRecord;

  if (existingIndex >= 0) {
    updatedRecord = {
      ...records[existingIndex],
      recordType,
      dataOrigin: dataOrigin || records[existingIndex].dataOrigin,
      startTime: startTime || records[existingIndex].startTime,
      endTime: endTime || records[existingIndex].endTime,
      time: payload.time || records[existingIndex].time,
      lastModifiedTime,
      payload,
      updatedAt: now,
    };
    records[existingIndex] = updatedRecord;
  } else {
    updatedRecord = {
      localId: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      healthConnectId,
      recordType,
      dataOrigin,
      startTime,
      endTime,
      time: payload.time,
      lastModifiedTime,
      payload,
      createdAt: now,
      updatedAt: now,
    };
    records.unshift(updatedRecord);
  }

  try {
    await AsyncStorage.setItem(HEALTH_RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('[HealthRecordsDB] Failed to save updated record:', error);
  }

  return updatedRecord;
}

/**
 * Deletes a local health record by Health Connect ID.
 */
export async function deleteLocalHealthRecordByHCId(healthConnectId: string): Promise<boolean> {
  const records = await getAllLocalHealthRecords();
  const filtered = records.filter((r) => r.healthConnectId !== healthConnectId);
  const deleted = records.length !== filtered.length;

  if (deleted) {
    try {
      await AsyncStorage.setItem(HEALTH_RECORDS_STORAGE_KEY, JSON.stringify(filtered));
      console.log(`[HealthRecordsDB] Deleted local record with Health Connect ID ${healthConnectId}`);
    } catch (error) {
      console.error('[HealthRecordsDB] Failed to delete record:', error);
    }
  }

  return deleted;
}

/**
 * Retrieves records of a specific recordType.
 */
export async function getLocalHealthRecordsByType(recordType: string): Promise<LocalHealthRecord[]> {
  const records = await getAllLocalHealthRecords();
  return records.filter((r) => r.recordType === recordType);
}

/**
 * Clears all stored local health records.
 */
export async function clearAllLocalHealthRecords(): Promise<void> {
  await AsyncStorage.removeItem(HEALTH_RECORDS_STORAGE_KEY);
}
```

#### Detailed Code Explanation:
- **Deletion Identifier Mapping (`healthConnectId`)**:
  - **Crucial Rule**: When Health Connect emits a deletion change event, it only provides `recordId` (the Health Connect UUID), omitting the record type for privacy reasons.
  - `healthRecords.ts` maps `healthConnectId` to local records so `deleteLocalHealthRecordByHCId` can look up and delete records by HC ID regardless of record type.

---

### 7.2 `src/database/syncState.ts`
**File Path:** [src/database/syncState.ts](file:///home/aminul/development/RN_Health_Connect/src/database/syncState.ts)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'token_expired';

export interface HealthConnectSyncState {
  recordType: string;
  changesToken: string | null;
  lastSuccessfulSyncAt: string | null;
  status: SyncStatus;
  updatedAt: string;
  errorMessage?: string;
}

const SYNC_STATE_STORAGE_KEY = '@health_connect_sync_state';

/**
 * Retrieves all stored sync states mapped by recordType.
 */
export async function getAllSyncStates(): Promise<Record<string, HealthConnectSyncState>> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('[SyncStateDB] Failed to read sync state DB:', error);
    return {};
  }
}

/**
 * Retrieves sync state for a specific record type.
 */
export async function getSyncState(recordType: string): Promise<HealthConnectSyncState | null> {
  const allStates = await getAllSyncStates();
  return allStates[recordType] || null;
}

/**
 * Updates or creates the sync state for a specific record type.
 */
export async function updateSyncState(
  recordType: string,
  partialState: Partial<HealthConnectSyncState>
): Promise<HealthConnectSyncState> {
  const allStates = await getAllSyncStates();
  const existing = allStates[recordType] || {
    recordType,
    changesToken: null,
    lastSuccessfulSyncAt: null,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  };

  const updated: HealthConnectSyncState = {
    ...existing,
    ...partialState,
    recordType,
    updatedAt: new Date().toISOString(),
  };

  allStates[recordType] = updated;
  try {
    await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(allStates));
  } catch (error) {
    console.error(`[SyncStateDB] Failed to save sync state for ${recordType}:`, error);
  }

  return updated;
}

/**
 * Resets sync state for a given record type or all types.
 */
export async function resetSyncState(recordType?: string): Promise<void> {
  if (!recordType) {
    await AsyncStorage.removeItem(SYNC_STATE_STORAGE_KEY);
    return;
  }
  const allStates = await getAllSyncStates();
  delete allStates[recordType];
  await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(allStates));
}
```

#### Detailed Code Explanation:
- **Dual Tracking (`changesToken` & `lastSuccessfulSyncAt`)**:
  - Stores `changesToken` for incremental changes while maintaining `lastSuccessfulSyncAt` timestamp for 30-day token expiration recovery.

---

## Chapter 8: Sync Engine, Token Store & Recovery

### 8.1 `src/health-connect/sync/tokenStore.ts`
**File Path:** [src/health-connect/sync/tokenStore.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/sync/tokenStore.ts)

```typescript
import { getSyncState, updateSyncState } from '../../database/syncState';

/**
 * Interface to store and retrieve Changes tokens per record type.
 */
export class TokenStore {
  /**
   * Gets stored Changes token for a specific record type.
   */
  static async getToken(recordType: string): Promise<string | null> {
    const state = await getSyncState(recordType);
    return state?.changesToken || null;
  }

  /**
   * Saves updated Changes token for a specific record type.
   */
  static async saveToken(recordType: string, changesToken: string): Promise<void> {
    await updateSyncState(recordType, {
      changesToken,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Clears the Changes token for a record type (e.g. when expired or resetting).
   */
  static async clearToken(recordType: string): Promise<void> {
    await updateSyncState(recordType, {
      changesToken: null,
      status: 'token_expired',
      updatedAt: new Date().toISOString(),
    });
  }
}
```

### 8.2 `src/health-connect/sync/changeProcessor.ts`
**File Path:** [src/health-connect/sync/changeProcessor.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/sync/changeProcessor.ts)

```typescript
import { ChangesResponse } from '../changes';
import {
  upsertLocalHealthRecord,
  deleteLocalHealthRecordByHCId,
} from '../../database/healthRecords';

export interface ProcessChangesResult {
  upsertedCount: number;
  deletedCount: number;
  ignoredSelfWritesCount: number;
}

export class ChangeProcessor {
  /**
   * Processes a list of changes (upserts & deletes) returned by getChanges.
   * If ignoreOwnPackageName is provided, ignores upsert changes created by own app.
   */
  static async processChanges(
    changes: ChangesResponse['changes'],
    ignoreOwnPackageName?: string
  ): Promise<ProcessChangesResult> {
    let upsertedCount = 0;
    let deletedCount = 0;
    let ignoredSelfWritesCount = 0;

    for (const change of changes) {
      if (change.type === 'upsert') {
        const record = change.record;
        const healthConnectId = record.metadata?.id;

        if (!healthConnectId) {
          console.warn('[ChangeProcessor] Received upsert change without metadata.id:', record);
          continue;
        }

        // Loop prevention rule: ignore self-written records if requested
        if (
          ignoreOwnPackageName &&
          record.metadata?.dataOrigin === ignoreOwnPackageName
        ) {
          ignoredSelfWritesCount++;
          continue;
        }

        await upsertLocalHealthRecord(healthConnectId, record.recordType, record);
        upsertedCount++;
      } else if (change.type === 'delete') {
        const healthConnectId = change.recordId;
        if (healthConnectId) {
          const deleted = await deleteLocalHealthRecordByHCId(healthConnectId);
          if (deleted) {
            deletedCount++;
          }
        }
      }
    }

    return {
      upsertedCount,
      deletedCount,
      ignoredSelfWritesCount,
    };
  }
}
```

### 8.3 `src/health-connect/sync/recovery.ts`
**File Path:** [src/health-connect/sync/recovery.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/sync/recovery.ts)

```typescript
import { RecordType } from 'react-native-health-connect';
import { queryHealthRecords, TimeRangeFilter } from '../records';
import { fetchChangesToken } from '../changes';
import { upsertLocalHealthRecord } from '../../database/healthRecords';
import { getSyncState, updateSyncState } from '../../database/syncState';

export class SyncRecovery {
  /**
   * Recovers from token expiration by querying records since last sync time,
   * updating local database, requesting a new Changes token, and resetting sync state.
   */
  static async recoverFromExpiredToken(recordType: RecordType): Promise<string> {
    console.log(`[SyncRecovery] Starting recovery for expired token on ${recordType}...`);

    const currentState = await getSyncState(recordType);

    // Determine recovery start timestamp (last sync or fallback 30 days ago)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startTime = currentState?.lastSuccessfulSyncAt || thirtyDaysAgo;
    const endTime = new Date().toISOString();

    const timeRangeFilter: TimeRangeFilter = {
      operator: 'between',
      startTime,
      endTime,
    };

    // 1. Read existing Health Connect records in range
    const response = await queryHealthRecords(recordType, {
      timeRangeFilter,
      pageSize: 1000,
    });

    console.log(
      `[SyncRecovery] Fetched ${response.records.length} records during recovery for ${recordType}`
    );

    // 2. Upsert into local database
    for (const record of response.records) {
      const hcId = record.metadata?.id;
      if (hcId) {
        await upsertLocalHealthRecord(hcId, recordType, record);
      }
    }

    // 3. Request new Changes token
    const newToken = await fetchChangesToken([recordType]);

    // 4. Update sync state
    await updateSyncState(recordType, {
      changesToken: newToken,
      status: 'idle',
      lastSuccessfulSyncAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`[SyncRecovery] Recovery complete for ${recordType}. New token generated.`);
    return newToken;
  }
}
```

### 8.4 `src/health-connect/sync/syncManager.ts`
**File Path:** [src/health-connect/sync/syncManager.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/sync/syncManager.ts)

```typescript
import { AppState, AppStateStatus } from 'react-native';
import { RecordType } from 'react-native-health-connect';
import { fetchChangesToken, fetchChanges } from '../changes';
import { ChangeProcessor } from './changeProcessor';
import { SyncRecovery } from './recovery';
import { TokenStore } from './tokenStore';
import { updateSyncState } from '../../database/syncState';

export const DEFAULT_SYNC_RECORD_TYPES: RecordType[] = [
  'Steps',
  'ActiveCaloriesBurned',
  'Weight',
  'HeartRate',
  'BloodPressure',
  'Hydration',
  'SleepSession',
];

export interface SyncResult {
  recordType: string;
  success: boolean;
  upsertedCount: number;
  deletedCount: number;
  tokenExpired: boolean;
  error?: string;
}

export class SyncManager {
  private static isSyncing = false;

  /**
   * Synchronizes incremental changes for a single record type.
   */
  static async syncRecordType(recordType: RecordType): Promise<SyncResult> {
    try {
      await updateSyncState(recordType, { status: 'syncing' });

      let token = await TokenStore.getToken(recordType);

      // If no token exists, initialize by requesting a fresh token
      if (!token) {
        console.log(`[SyncManager] Initializing new token for ${recordType}`);
        token = await fetchChangesToken([recordType]);
        await updateSyncState(recordType, {
          changesToken: token,
          lastSuccessfulSyncAt: new Date().toISOString(),
          status: 'idle',
        });
        return {
          recordType,
          success: true,
          upsertedCount: 0,
          deletedCount: 0,
          tokenExpired: false,
        };
      }

      let currentToken = token;
      let totalUpserts = 0;
      let totalDeletes = 0;

      // Loop while hasMore is true
      while (true) {
        const response = await fetchChanges(currentToken);

        if (response.changesTokenExpired) {
          console.warn(`[SyncManager] Token expired for ${recordType}. Initiating recovery...`);
          await updateSyncState(recordType, { status: 'token_expired' });
          await SyncRecovery.recoverFromExpiredToken(recordType);
          return {
            recordType,
            success: true,
            upsertedCount: 0,
            deletedCount: 0,
            tokenExpired: true,
          };
        }

        // Process changes locally FIRST before advancing token
        const processed = await ChangeProcessor.processChanges(response.changes);
        totalUpserts += processed.upsertedCount;
        totalDeletes += processed.deletedCount;

        // Advance token only AFTER successful processing
        currentToken = response.nextChangesToken;

        if (!response.hasMore) {
          break;
        }
      }

      // Persist final token and update last successful sync time
      const now = new Date().toISOString();
      await updateSyncState(recordType, {
        changesToken: currentToken,
        lastSuccessfulSyncAt: now,
        status: 'idle',
        updatedAt: now,
      });

      return {
        recordType,
        success: true,
        upsertedCount: totalUpserts,
        deletedCount: totalDeletes,
        tokenExpired: false,
      };
    } catch (error: any) {
      console.error(`[SyncManager] Error syncing ${recordType}:`, error);
      await updateSyncState(recordType, {
        status: 'error',
        errorMessage: error?.message || String(error),
      });
      return {
        recordType,
        success: false,
        upsertedCount: 0,
        deletedCount: 0,
        tokenExpired: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Synchronizes all specified record types in parallel or sequence.
   */
  static async syncAll(recordTypes: RecordType[] = DEFAULT_SYNC_RECORD_TYPES): Promise<SyncResult[]> {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress, skipping...');
      return [];
    }

    this.isSyncing = true;
    const results: SyncResult[] = [];

    try {
      for (const type of recordTypes) {
        const res = await this.syncRecordType(type);
        results.push(res);
      }
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  /**
   * Sets up AppState listener to automatically trigger foreground synchronization
   * whenever the app returns from background to active state.
   */
  static setupForegroundAutoSync(
    recordTypes: RecordType[] = DEFAULT_SYNC_RECORD_TYPES,
    onSyncComplete?: (results: SyncResult[]) => void
  ): () => void {
    let currentState = AppState.currentState;

    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (
        currentState.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        console.log('[SyncManager] App became active. Running foreground sync...');
        const results = await SyncManager.syncAll(recordTypes);
        if (onSyncComplete) onSyncComplete(results);
      }
      currentState = nextState;
    });

    return () => {
      subscription.remove();
    };
  }
}
```

### Detailed Code Explanation:
1. **Independent Token Isolation (`tokenStore.ts`)**:
   - Maintains a distinct Changes token for each record type. If permission for `HeartRate` is revoked by the user, synchronization for `Steps` continues unaffected.
2. **Loop Prevention (`changeProcessor.ts`)**:
   - Inspects `metadata.dataOrigin` to filter out records written by the calling app package name when sync loops must be avoided.
3. **30-Day Token Expiration Recovery (`recovery.ts`)**:
   - Health Connect Changes tokens expire after 30 days. When `changesTokenExpired` is `true`, `recoverFromExpiredToken` queries Health Connect records created since `lastSuccessfulSyncAt`, deduplicates records in the local database, and creates a fresh token.
4. **Atomic Token Advancement (`syncManager.ts`)**:
   - **Crucial Rule**: Never save `nextChangesToken` before `processChanges` succeeds. If a crash occurs during local DB write, saving the token early skips changes. `syncManager` processes changes first and persists the token only after successful application.

---

## Chapter 9: Health Connect Dashboard UI

**File Path:** [src/screens/HealthDashboard.tsx](file:///home/aminul/development/RN_Health_Connect/src/screens/HealthDashboard.tsx)

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SdkAvailabilityStatus, RecordType } from 'react-native-health-connect';

// Health Connect Services
import { getClientState, openSettings, openDataManagement } from '../health-connect/client';
import {
  requestHealthPermissions,
  checkHealthPermissions,
  PermissionStatusResult,
} from '../health-connect/permissions';
import {
  queryHealthRecords,
  logStepsRecord,
  logWeightRecord,
  logHeartRateRecord,
  logBloodPressureRecord,
  logHydrationRecord,
} from '../health-connect/records';
import { getTodayHealthSummary } from '../health-connect/aggregation';
import { SyncManager, DEFAULT_SYNC_RECORD_TYPES, SyncResult } from '../health-connect/sync/syncManager';
import { SyncRecovery } from '../health-connect/sync/recovery';

// Database
import {
  getAllLocalHealthRecords,
  clearAllLocalHealthRecords,
  LocalHealthRecord,
} from '../database/healthRecords';
import { getAllSyncStates, HealthConnectSyncState, resetSyncState } from '../database/syncState';

type TabType = 'explorer' | 'live' | 'sync_console';
type CategoryFilter = 'ALL' | 'Activity' | 'Body' | 'Vitals' | 'Sleep' | 'Nutrition';

export default function HealthDashboard() {
  // SDK & Permission state
  const [sdkStatus, setSdkStatus] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [permissionInfo, setPermissionInfo] = useState<PermissionStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today Summary Metrics
  const [todaySummary, setTodaySummary] = useState({
    steps: 0,
    activeCalories: 0,
    distanceKm: 0,
    avgHeartRate: null as number | null,
    latestWeightKg: null as number | null,
  });

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  // Local DB & Sync Console data
  const [localRecords, setLocalRecords] = useState<LocalHealthRecord[]>([]);
  const [liveHCRecords, setLiveHCRecords] = useState<any[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, HealthConnectSyncState>>({});

  // Data Entry Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logType, setLogType] = useState<'Steps' | 'Weight' | 'HeartRate' | 'BloodPressure' | 'Hydration'>('Steps');
  const [inputVal1, setInputVal1] = useState('');
  const [inputVal2, setInputVal2] = useState('');

  /**
   * Initializes SDK & checks permissions
   */
  const initApp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getClientState();
      setSdkStatus(client.status);
      setInitialized(client.initialized);

      if (client.status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        setError(client.message);
        setLoading(false);
        return;
      }

      const permStatus = await checkHealthPermissions();
      setPermissionInfo(permStatus);

      if (permStatus.grantedPermissions.length > 0) {
        await refreshAllData();
      }
    } catch (err: any) {
      console.error('[Dashboard] Init error:', err);
      setError(err?.message || 'Failed to initialize Health Connect dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refreshes summary metrics, local DB records, and sync console states
   */
  const refreshAllData = useCallback(async () => {
    try {
      // 1. Fetch Today Summary Aggregations
      const summary = await getTodayHealthSummary();

      // Fetch latest weight from past 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const weightRes = await queryHealthRecords('Weight', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo,
          endTime: new Date().toISOString(),
        },
        pageSize: 1,
        ascendingOrder: false,
      });
      const latestWeight = weightRes.records[0]?.weight?.inKilograms ?? null;

      setTodaySummary({
        ...summary,
        latestWeightKg: latestWeight,
      });

      // 2. Load Local Database Records
      const dbRecords = await getAllLocalHealthRecords();
      setLocalRecords(dbRecords);

      // 3. Load Sync Console States
      const states = await getAllSyncStates();
      setSyncStates(states);

      // 4. Fetch Live Records sample if on live tab
      const liveRes = await queryHealthRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo,
          endTime: new Date().toISOString(),
        },
        pageSize: 20,
      });
      setLiveHCRecords(liveRes.records);
    } catch (err: any) {
      console.error('[Dashboard] Refresh error:', err);
    }
  }, []);

  /**
   * Trigger Manual Permission Request
   */
  const handleRequestPermissions = async () => {
    setLoading(true);
    try {
      await requestHealthPermissions();
      const permStatus = await checkHealthPermissions();
      setPermissionInfo(permStatus);
      if (permStatus.grantedPermissions.length > 0) {
        await refreshAllData();
      }
    } catch (err: any) {
      Alert.alert('Permission Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Trigger Incremental Sync via SyncManager
   */
  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const results: SyncResult[] = await SyncManager.syncAll(DEFAULT_SYNC_RECORD_TYPES);
      const totalUpserts = results.reduce((acc, r) => acc + r.upsertedCount, 0);
      const totalDeletes = results.reduce((acc, r) => acc + r.deletedCount, 0);

      await refreshAllData();
      Alert.alert(
        'Sync Complete',
        `Processed ${results.length} record types.\nUpserts: ${totalUpserts} | Deletes: ${totalDeletes}`
      );
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || String(err));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Test 30-day Token Expiration Recovery
   */
  const handleTestTokenRecovery = async (recordType: RecordType = 'Steps') => {
    setLoading(true);
    try {
      await SyncRecovery.recoverFromExpiredToken(recordType);
      await refreshAllData();
      Alert.alert('Recovery Complete', `Simulated 30-day recovery sync successfully executed for ${recordType}.`);
    } catch (err: any) {
      Alert.alert('Recovery Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Log New Health Data into Health Connect
   */
  const handleSaveNewData = async () => {
    const val1 = parseFloat(inputVal1);
    const val2 = parseFloat(inputVal2);

    if (isNaN(val1) || val1 <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid numeric value.');
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

      if (logType === 'Steps') {
        await logStepsRecord(Math.round(val1), oneHourAgo, now);
      } else if (logType === 'Weight') {
        await logWeightRecord(val1, now);
      } else if (logType === 'HeartRate') {
        await logHeartRateRecord(Math.round(val1), now);
      } else if (logType === 'BloodPressure') {
        if (isNaN(val2) || val2 <= 0) {
          Alert.alert('Validation Error', 'Please enter valid Diastolic pressure.');
          setLoading(false);
          return;
        }
        await logBloodPressureRecord(Math.round(val1), Math.round(val2), now);
      } else if (logType === 'Hydration') {
        await logHydrationRecord(val1, oneHourAgo, now);
      }

      setIsModalOpen(false);
      setInputVal1('');
      setInputVal2('');
      Alert.alert('Success', `${logType} record saved to Health Connect!`);

      // Sync changes into local database immediately
      await SyncManager.syncRecordType(logType);
      await refreshAllData();
    } catch (err: any) {
      Alert.alert('Insert Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearLocalDB = async () => {
    Alert.alert('Clear Local Database', 'Are you sure you want to clear all synced local records?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllLocalHealthRecords();
          await resetSyncState();
          await refreshAllData();
        },
      },
    ]);
  };

  // Register foreground lifecycle auto-sync on mount
  useEffect(() => {
    initApp();
    const unsubscribe = SyncManager.setupForegroundAutoSync(DEFAULT_SYNC_RECORD_TYPES, () => {
      refreshAllData();
    });
    return () => unsubscribe();
  }, [initApp, refreshAllData]);

  // Filter records by category
  const filteredLocalRecords = localRecords.filter((rec: LocalHealthRecord) => {
    if (categoryFilter === 'ALL') return true;
    if (categoryFilter === 'Activity')
      return ['Steps', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'Distance', 'ExerciseSession'].includes(
        rec.recordType
      );
    if (categoryFilter === 'Body') return ['Weight', 'Height', 'BodyFat', 'Bmi'].includes(rec.recordType);
    if (categoryFilter === 'Vitals')
      return [
        'HeartRate',
        'BloodPressure',
        'BloodGlucose',
        'OxygenSaturation',
        'BodyTemperature',
      ].includes(rec.recordType);
    if (categoryFilter === 'Sleep') return ['SleepSession'].includes(rec.recordType);
    if (categoryFilter === 'Nutrition') return ['Hydration', 'Nutrition'].includes(rec.recordType);
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.appTitle}>Health Connect</Text>
            <View style={styles.badgeGroup}>
              <View
                style={[
                  styles.statusBadge,
                  sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE ? styles.badgeGreen : styles.badgeRed,
                ]}
              >
                <Text style={styles.badgeText}>
                  {sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE ? 'SDK ONLINE' : 'SDK OFFLINE'}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.subtitle}>Android Health Connect Sync & Data Hub</Text>
        </View>

        {/* Status Card */}
        <View style={styles.glassCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Initialization:</Text>
            <Text style={[styles.statusValue, initialized ? styles.textGreen : styles.textRed]}>
              {initialized ? 'INITIALIZED' : 'NOT INITIALIZED'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Permissions:</Text>
            <Text
              style={[
                styles.statusValue,
                permissionInfo?.hasAll ? styles.textGreen : styles.textYellow,
              ]}
            >
              {permissionInfo?.hasAll
                ? 'ALL GRANTED'
                : `${permissionInfo?.grantedPermissions.length || 0} GRANTED`}
            </Text>
          </View>

          <View style={styles.settingsRow}>
            <TouchableOpacity style={styles.textButton} onPress={openSettings}>
              <Text style={styles.textButtonText}>System Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => openDataManagement()}>
              <Text style={styles.textButtonText}>Manage Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error Notification */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Today Summary Metrics Grid */}
        <Text style={styles.sectionHeader}>Today's Aggregated Metrics</Text>
        <View style={styles.metricsGrid}>
          {/* Steps */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>STEPS</Text>
            <Text style={styles.metricValue}>{todaySummary.steps.toLocaleString()}</Text>
            <Text style={styles.metricSub}>Total Count</Text>
          </View>

          {/* Active Calories */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>CALORIES</Text>
            <Text style={styles.metricValue}>{Math.round(todaySummary.activeCalories)}</Text>
            <Text style={styles.metricSub}>Active kcal</Text>
          </View>

          {/* Weight */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>WEIGHT</Text>
            <Text style={styles.metricValue}>
              {todaySummary.latestWeightKg ? `${todaySummary.latestWeightKg.toFixed(1)}` : '--'}
            </Text>
            <Text style={styles.metricSub}>Kilograms (kg)</Text>
          </View>

          {/* Heart Rate */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>HEART RATE</Text>
            <Text style={styles.metricValue}>
              {todaySummary.avgHeartRate ? `${Math.round(todaySummary.avgHeartRate)}` : '--'}
            </Text>
            <Text style={styles.metricSub}>Avg BPM</Text>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionRow}>
          {!permissionInfo?.hasAll && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.btnFlex]}
              onPress={handleRequestPermissions}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Grant Permissions</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.accentButton, styles.btnFlex]}
            onPress={handleRunSync}
            disabled={syncing || loading}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sync Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, styles.btnFlex]}
            onPress={() => setIsModalOpen(true)}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>+ Log Data</Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Navigation Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'explorer' && styles.tabActive]}
            onPress={() => setActiveTab('explorer')}
          >
            <Text style={[styles.tabText, activeTab === 'explorer' && styles.tabTextActive]}>
              Synced DB ({localRecords.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'live' && styles.tabActive]}
            onPress={() => setActiveTab('live')}
          >
            <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
              Live HC API
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'sync_console' && styles.tabActive]}
            onPress={() => setActiveTab('sync_console')}
          >
            <Text style={[styles.tabText, activeTab === 'sync_console' && styles.tabTextActive]}>
              Sync Console
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: Synced DB Explorer */}
        {activeTab === 'explorer' && (
          <View style={styles.tabContent}>
            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
              {(['ALL', 'Activity', 'Body', 'Vitals', 'Sleep', 'Nutrition'] as CategoryFilter[]).map(
                (cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, categoryFilter === cat && styles.chipActive]}
                    onPress={() => setCategoryFilter(cat)}
                  >
                    <Text style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>

            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>
                Local Synced Records ({filteredLocalRecords.length})
              </Text>
              <TouchableOpacity onPress={handleClearLocalDB}>
                <Text style={styles.dangerText}>Clear Local DB</Text>
              </TouchableOpacity>
            </View>

            {filteredLocalRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No local records found for this category.</Text>
                <Text style={styles.emptySubText}>
                  Tap "Sync Changes" above to fetch latest records from Health Connect into local database.
                </Text>
              </View>
            ) : (
              filteredLocalRecords.map((item: LocalHealthRecord) => {
                const isExpanded = expandedRecordId === item.localId;
                return (
                  <TouchableOpacity
                    key={item.localId}
                    style={styles.recordCard}
                    onPress={() => setExpandedRecordId(isExpanded ? null : item.localId)}
                  >
                    <View style={styles.recordHeader}>
                      <View style={styles.recordTag}>
                        <Text style={styles.recordTagText}>{item.recordType}</Text>
                      </View>
                      <Text style={styles.recordTime}>
                        {new Date(item.startTime || item.time || item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    <Text style={styles.recordHcId} numberOfLines={1}>
                      HC ID: {item.healthConnectId}
                    </Text>
                    {item.dataOrigin && (
                      <Text style={styles.recordOrigin}>Origin: {item.dataOrigin}</Text>
                    )}

                    {/* Quick Payload View */}
                    <Text style={styles.payloadSummary}>
                      {item.recordType === 'Steps' && `Count: ${item.payload.count}`}
                      {item.recordType === 'Weight' && `Weight: ${item.payload.weight?.inKilograms} kg`}
                      {item.recordType === 'HeartRate' &&
                        `BPM: ${item.payload.samples?.[0]?.beatsPerMinute ?? '--'}`}
                      {item.recordType === 'BloodPressure' &&
                        `Systolic: ${item.payload.systolic?.inMillimetersOfMercury} / Diastolic: ${item.payload.diastolic?.inMillimetersOfMercury}`}
                      {item.recordType === 'Hydration' &&
                        `Volume: ${item.payload.volume?.inLiters} Liters`}
                    </Text>

                    {isExpanded && (
                      <View style={styles.jsonBox}>
                        <Text style={styles.jsonText}>{JSON.stringify(item.payload, null, 2)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: Direct Live HC Query */}
        {activeTab === 'live' && (
          <View style={styles.tabContent}>
            <Text style={styles.explorerTitle}>Direct Read sample (Steps - Last 30 Days)</Text>
            {liveHCRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No live records retrieved directly from HC.</Text>
              </View>
            ) : (
              liveHCRecords.map((rec: any, idx: number) => (
                <View key={rec.metadata?.id || idx} style={styles.recordCard}>
                  <Text style={styles.recordTagText}>Live Steps Record</Text>
                  <Text style={styles.recordTime}>
                    {new Date(rec.startTime).toLocaleString()} - {new Date(rec.endTime).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.payloadSummary}>Step Count: {rec.count}</Text>
                  <Text style={styles.recordHcId}>ID: {rec.metadata?.id}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: Sync Console */}
        {activeTab === 'sync_console' && (
          <View style={styles.tabContent}>
            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>Sync State Engine Console</Text>
              <TouchableOpacity onPress={() => handleTestTokenRecovery('Steps')}>
                <Text style={styles.actionLinkText}>Test Token Expiration Recovery</Text>
              </TouchableOpacity>
            </View>

            {DEFAULT_SYNC_RECORD_TYPES.map((type) => {
              const state = syncStates[type];
              return (
                <View key={type} style={styles.syncStateCard}>
                  <View style={styles.syncCardHeader}>
                    <Text style={styles.syncRecordType}>{type}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        state?.status === 'idle'
                          ? styles.badgeGreen
                          : state?.status === 'syncing'
                          ? styles.badgeBlue
                          : styles.badgeRed,
                      ]}
                    >
                      <Text style={styles.statusPillText}>{state?.status || 'UNINITIALIZED'}</Text>
                    </View>
                  </View>

                  <Text style={styles.syncMetaText}>
                    Token:{' '}
                    {state?.changesToken
                      ? `${state.changesToken.substring(0, 24)}...`
                      : 'None (Needs Initial Sync)'}
                  </Text>

                  <Text style={styles.syncMetaText}>
                    Last Sync:{' '}
                    {state?.lastSuccessfulSyncAt
                      ? new Date(state.lastSuccessfulSyncAt).toLocaleString()
                      : 'Never'}
                  </Text>

                  <View style={styles.syncActionRow}>
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => SyncManager.syncRecordType(type).then(refreshAllData)}
                    >
                      <Text style={styles.smallButtonText}>Sync Type</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.smallOutlineButton}
                      onPress={() => resetSyncState(type).then(refreshAllData)}
                    >
                      <Text style={styles.smallOutlineText}>Reset State</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Footer padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Log Data Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Health Record</Text>

            {/* Select Record Type */}
            <ScrollView horizontal style={{ marginBottom: 16 }}>
              {(['Steps', 'Weight', 'HeartRate', 'BloodPressure', 'Hydration'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, logType === t && styles.chipActive]}
                  onPress={() => setLogType(t)}
                >
                  <Text style={[styles.chipText, logType === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Inputs */}
            {logType === 'Steps' && (
              <View>
                <Text style={styles.inputLabel}>Step Count</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 5000"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'Weight' && (
              <View>
                <Text style={styles.inputLabel}>Weight (in Kilograms)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 72.5"
                  placeholderTextColor="#64748b"
                  keyboardType="decimal-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'HeartRate' && (
              <View>
                <Text style={styles.inputLabel}>Beats Per Minute (BPM)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 75"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'BloodPressure' && (
              <View>
                <Text style={styles.inputLabel}>Systolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 120"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
                <Text style={[styles.inputLabel, { marginTop: 8 }]}>Diastolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 80"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal2}
                  onChangeText={setInputVal2}
                />
              </View>
            )}

            {logType === 'Hydration' && (
              <View>
                <Text style={styles.inputLabel}>Water Volume (Liters)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 0.5"
                  placeholderTextColor="#64748b"
                  keyboardType="decimal-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {/* Modal Buttons */}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.btnFlex]}
                onPress={() => setIsModalOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.btnFlex]}
                onPress={handleSaveNewData}
                disabled={loading}
              >
                <Text style={styles.buttonText}>Save Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  container: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  badgeGroup: {
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  badgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  badgeBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  glassCard: {
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  textGreen: {
    color: '#4ade80',
  },
  textRed: {
    color: '#f87171',
  },
  textYellow: {
    color: '#facc15',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  textButton: {
    paddingVertical: 4,
  },
  textButtonText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  metricTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
  },
  metricSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  btnFlex: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentButton: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#1e293b',
  },
  tabText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  tabContent: {
    marginTop: 4,
  },
  filterBar: {
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#0284c7',
  },
  chipText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  explorerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  explorerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  dangerText: {
    fontSize: 12,
    color: '#f87171',
    fontWeight: '600',
  },
  actionLinkText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptySubText: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  recordCard: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recordTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordTagText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  recordTime: {
    fontSize: 11,
    color: '#64748b',
  },
  recordHcId: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  recordOrigin: {
    fontSize: 10,
    color: '#475569',
  },
  payloadSummary: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '600',
    marginTop: 4,
  },
  jsonBox: {
    backgroundColor: '#090d16',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  jsonText: {
    fontSize: 10,
    color: '#a7f3d0',
    fontFamily: 'monospace',
  },
  syncStateCard: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  syncCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  syncRecordType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  syncMetaText: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  syncActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  smallOutlineButton: {
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallOutlineText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131b2e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#090d16',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
});
```

### Detailed Code Explanation:
1. **Interactive Header & Glassmorphic Status Card**:
   - Displays real-time SDK availability (`SDK_AVAILABLE`), initialization state (`INITIALIZED`), and permission verification state (`ALL GRANTED` vs count).
   - Provides direct action links to launch native Android settings or data management intents.
2. **Aggregated Today Metrics Grid**:
   - Displays real-time calculations for Steps count, Active Calories, Latest Weight (kg), and Average Heart Rate (BPM) computed from native Health Connect aggregations.
3. **Multi-Tab Architecture**:
   - **Tab 1: Synced DB Explorer**: Filters local database records by category pills (Activity, Body, Vitals, Sleep, Nutrition) with expandable JSON payload view.
   - **Tab 2: Live HC API**: Direct call to Health Connect `readRecords` for raw Health Connect inspection.
   - **Tab 3: Sync Console**: Visual control panel listing per-record type `changesToken` cursors, `lastSuccessfulSyncAt` timestamps, status pills, manual sync triggers, and a 30-day token expiration recovery test button.
4. **Data Entry Modal**:
   - Interactive modal form allowing users to write new Steps, Weight, Heart Rate, Blood Pressure, or Hydration records directly to Health Connect, automatically triggering local database sync upon save.
