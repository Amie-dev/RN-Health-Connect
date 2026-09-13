# RN Health Connect

A React Native (Expo) application that integrates with Android's **Health Connect** platform to read, write, and sync health & fitness data. Built with TypeScript and designed with a dark-themed dashboard UI.

## Features

- **Health Connect Integration** — Full read/write access to Android Health Connect APIs
- **Multi-Record Type Support** — Steps, Weight, Heart Rate, Blood Pressure, Hydration, Calories, Distance, Exercise, Sleep, Blood Glucose, Oxygen Saturation, Body Temperature, Body Fat, Height, and Nutrition
- **Live Dashboard** — Browse and visualize live health data across categories (Activity, Body, Vitals, Sleep, Nutrition)
- **Manual Data Entry** — Log health records (steps, weight, heart rate, blood pressure, hydration) directly from the app
- **Background Sync Engine** — Incremental sync with change tracking, token-based pagination, and recovery mechanisms
- **Local Database** — Caches health records locally using AsyncStorage for offline access
- **Permission Management** — Request, check, and revoke Health Connect permissions with granular control
- **Aggregation & Metrics** — Daily summaries including total steps, calories, latest weight, and average heart rate
- **Sync Console** — Visual interface to monitor and control the sync process with detailed logging

## Screens & Architecture

### Dashboard (`src/screens/HealthDashboard.tsx`)

The main screen with three tabs:

- **Explorer** — Browse all local health records with category filters, search, and live Health Connect data
- **Live** — Read real-time data from Health Connect with 30-day window and record-type selection
- **Sync Console** — Manage sync operations, view sync states, reset data, and monitor sync logs

### Health Connect Layer (`src/health-connect/`)

| File | Purpose |
|------|---------|
| `client.ts` | SDK initialization, availability checks, and settings navigation |
| `permissions.ts` | Request, check, and revoke Health Connect permissions |
| `records.ts` | Read, write, and delete health records with convenience methods |
| `changes.ts` | Track data changes for incremental sync |
| `aggregation.ts` | Aggregate health data into daily summaries |

### Sync Engine (`src/health-connect/sync/`)

| File | Purpose |
|------|---------|
| `syncManager.ts` | Orchestrates sync operations across record types |
| `changeProcessor.ts` | Processes change tokens and fetches updates |
| `tokenStore.ts` | Manages sync tokens for pagination |
| `recovery.ts` | Handles sync failure recovery |

### Database (`src/database/`)

| File | Purpose |
|------|---------|
| `healthRecords.ts` | Local storage and retrieval of health records |
| `syncState.ts` | Persists sync state and tokens |

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
- On first launch, the app will request Health Connect permissions
- Health Connect must be installed from the Google Play Store (or via system update on Android 14+)
- The sync engine uses change tokens for efficient incremental data fetching
- All locally cached data is stored in AsyncStorage and can be cleared from the Sync Console

## License

Private project — All rights reserved.

