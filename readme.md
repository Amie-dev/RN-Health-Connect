# RN Health Connect

A React Native (Expo) application that integrates with Android's **Health Connect** platform to read, write, and sync health & fitness data. Built with TypeScript and designed with a dark-themed dashboard UI.

**[📱 Download Latest Android APK](https://expo.dev/accounts/amie.code/projects/rn-health-connect/builds/7e709d57-868e-426b-857e-b72edc605ebe)**

## Features

- **Health Connect Integration** — Full read/write access to Android Health Connect APIs
- **Multi-Record Type Support** — Steps, Weight, Heart Rate, Blood Pressure, Hydration, Calories, Distance, Exercise, Sleep, Blood Glucose, Oxygen Saturation, Body Temperature, Body Fat, Height, and Nutrition
- **Live Dashboard** — Browse and visualize live health data across categories (Activity, Body, Vitals, Sleep, Nutrition) with Today / 7-day / 30-day ranges
- **Manual Data Entry** — Log health records (steps, weight, heart rate, blood pressure, hydration) with validated, idempotent writes
- **Foreground Sync Engine** — Incremental sync with change tracking, token-based pagination, automatic recovery from expired tokens, and a debounced foreground auto-sync
- **Local Database** — Caches health records locally using AsyncStorage (batched writes, in-memory mirror, size-capped) for offline access
- **Permission Management** — Request, check, and revoke Health Connect permissions with live coverage reporting
- **Aggregation & Metrics** — Range summaries covering steps, active calories, distance, average heart rate, sleep, hydration, and latest weight, each with a raw-record fallback
- **Sync Console** — Per-record-type cursors, statuses and contextual actions with a run summary

## Screens & Architecture

### Dashboard (`src/screens/HealthDashboard.tsx`)

A thin composition shell (~350 lines) around hooks and memoized panels. Three tabs:

- **Records** — search + category-filtered list of every locally cached record, with expandable raw payloads
- **Live** — direct read from Health Connect per record type (last 30 days), independent of the local cache
- **Sync** — per-type cursors and statuses, single-type sync, token recovery, state reset

Shared panels live in `src/components/` (`DashboardHeader`, `TabBar`, `MetricsPanel`,
`PermissionPanel`, `ExplorerPanel`, `RecordRow`, `LivePanel`, `SyncConsole`, `LogDataModal`)
with reusable primitives in `src/components/ui.tsx` (banners, chips, pills, animations).

### Behaviour hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useHealthConnect` | SDK availability, single-flight initialization, permission lifecycle |
| `useHealthSummary` | Range metrics (today / 7 / 30 days) with stale-response guarding |
| `useLocalRecords` | Local mirror reads, stats and cache clearing |
| `useLiveRecords` | Direct Health Connect reads per record type (request-id guarded) |
| `useSyncEngine` | Sync runs, progress, per-type actions, run summary |

### Health Connect Layer (`src/health-connect/`)

| File | Purpose |
|------|---------|
| `client.ts` | SDK availability, one-time initialization, settings navigation |
| `permissions.ts` | Declared permission list, cached grant checks, request/revoke |
| `records.ts` | Paginated reads (follows `pageToken`), typed inserts with `clientRecordId`, deletes |
| `changes.ts` | Changes-token creation, bounded `getChanges` pagination |
| `aggregation.ts` | Metric aggregations (with raw-record fallbacks) and range summaries |

### Sync Engine (`src/health-connect/sync/`)

| File | Purpose |
|------|---------|
| `syncManager.ts` | Per-type + full-run orchestration, concurrency guards, foreground auto-sync |
| `changeProcessor.ts` | Deduplicates a page of changes into batched upserts/deletes |
| `tokenStore.ts` | Changes-token persistence per record type |
| `recovery.ts` | Re-reads the window since the last successful sync after token expiry |

### Database (`src/database/`)

| File | Purpose |
|------|---------|
| `healthRecords.ts` | In-memory mirror + serialized batch writes over AsyncStorage, size-capped |
| `syncState.ts` | Per-type sync cursors and statuses |

Supporting modules: `src/config.ts` (record-type lists, page/limit constants, package name),
`src/theme.ts` (design tokens + record catalogue), `src/utils/format.ts` (payload formatters).

### Correctness details

- **Metric keys verified against the native module** — Steps `COUNT_TOTAL`, Active calories
  `ACTIVE_CALORIES_TOTAL`, Total calories `ENERGY_TOTAL`, Distance `DISTANCE`, Heart rate
  `BPM_AVG`, Hydration `VOLUME_TOTAL`, Sleep `SLEEP_DURATION_TOTAL`.
- **Cursor safety** — the changes token only advances after its changes were written; failures
  keep the old cursor so the window is retried.
- **Idempotent logging** — manual entries carry a `clientRecordId`, so a double tap overwrites
  instead of duplicating.
- **Batched storage** — one read + one `setItem` per sync batch instead of one write per record.
- **Cache cap** — the local mirror keeps the newest `MAX_LOCAL_RECORDS` (1500) records; Health
  Connect remains the source of truth.

## Data Categories

### Activity
- Steps (read/write)
- Active Calories Burned (read)
- Total Calories Burned (read)
- Distance (read)
- Exercise Session (read)

### Body Measurements
- Weight (read/write)
- Height (read)
- Body Fat (read)

### Vitals
- Heart Rate (read/write)
- Blood Pressure (read/write)
- Blood Glucose (read)
- Oxygen Saturation (read)
- Body Temperature (read)

### Sleep
- Sleep Session (read)

### Nutrition & Hydration
- Hydration (read/write)
- Nutrition (read)

## Tech Stack

- **React Native** 0.86.3 with **React** 19.2.3
- **Expo** SDK 57
- **TypeScript** 6.0 (strict mode)
- **react-native-health-connect** 4.x — Health Connect native module
- **@react-native-async-storage/async-storage** 2.2.0 — Local persistence
- **react-native-safe-area-context** — Safe area handling
- **EAS Build** — Cloud build service

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- Android device or emulator with **Health Connect** app installed
- Health Connect requires Android API 26+ (Android 8.0+)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

### Running on Device

```bash
# Run on Android device/emulator
npm run android
```

### Building for Production

```bash
# Preview build (internal distribution)
eas build --profile preview

# Production build (auto-incremented version)
eas build --profile production
```

## Configuration

### `app.json`

The Expo configuration includes:
- Health Connect permissions declared for all supported record types
- `expo-build-properties` plugin configured with `minSdkVersion: 26`
- `react-native-health-connect` plugin enabled
- Dark UI style with custom splash screen

### EAS Project

- **Project ID:** `70b6ff82-1951-46ef-8aca-4497f92723a0`
- **Package:** `com.healthconnect.app`
- **Bundle ID (iOS):** `com.healthconnect.app`

## Android Permissions

The following Health Connect permissions are requested:

| Permission | Type |
|------------|------|
| `READ_STEPS` / `WRITE_STEPS` | Steps |
| `READ_ACTIVE_CALORIES_BURNED` | Active Calories |
| `READ_TOTAL_CALORIES_BURNED` | Total Calories |
| `READ_DISTANCE` | Distance |
| `READ_EXERCISE` | Exercise |
| `READ_WEIGHT` / `WRITE_WEIGHT` | Weight |
| `READ_HEIGHT` | Height |
| `READ_BODY_FAT` | Body Fat |
| `READ_HEART_RATE` / `WRITE_HEART_RATE` | Heart Rate |
| `READ_BLOOD_PRESSURE` / `WRITE_BLOOD_PRESSURE` | Blood Pressure |
| `READ_BLOOD_GLUCOSE` | Blood Glucose |
| `READ_OXYGEN_SATURATION` | SpO2 |
| `READ_BODY_TEMPERATURE` | Temperature |
| `READ_SLEEP` | Sleep |
| `READ_HYDRATION` / `WRITE_HYDRATION` | Hydration |
| `READ_NUTRITION` | Nutrition |

## Development Notes

- The app requires a **physical Android device** or **emulator with Google Play Services** and the **Health Connect** app installed
- On first launch, the app requests Health Connect permissions; the dashboard degrades gracefully per missing permission
- Health Connect must be installed from the Google Play Store (or via system update on Android 14+)
- The sync engine uses change tokens for efficient incremental fetching and re-reads the last window when a token expires
- All locally cached data is stored in AsyncStorage and can be cleared from the Records tab
- Revoking permissions only takes effect after an app restart (Health Connect platform limitation)

## Scripts

```bash
npm start        # Metro dev server
npm run android  # Native debug build on a device/emulator
npm run ios      # Native debug build (iOS — Health Connect is Android-only)
npm run typecheck
```

## License

Private project — All rights reserved.

