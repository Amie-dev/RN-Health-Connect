# Chapter 1 — Introduction & Environment Setup

## 1.1 What is Android Health Connect?

**Android Health Connect** is an on-device platform for storing and sharing users' health and fitness data between compatible applications.

Instead of every application maintaining completely separate health-data integrations, Health Connect provides a standardized data model and permission system.

For example:
* A fitness app can write step data.
* A sleep app can write sleep sessions.
* A nutrition app can write nutrition data.
* Your application can request permission to read the specific health data it needs.

Health Connect keeps the user's data under the user's control through Android's permission and privacy system. On Android 14 and higher, Health Connect is integrated into the Android framework and is updated through Google Play system updates. On Android 13 and lower, the Health Connect application must be installed separately. ([Android Developers](https://developer.android.com/about/versions/14/features))

### Important characteristics

| Feature | Description |
| :--- | :--- |
| **On-device storage** | Health data is managed on the user's device |
| **Granular permissions** | Apps request access to specific health-data types |
| **Standardized records** | Different apps use common Health Connect record types |
| **Read/Write control** | Users can independently control access |
| **Centralized privacy controls** | Users manage connected apps through Health Connect |

> **Important:** Health Connect should not be thought of as a cloud database or backend service. Your application communicates with the Health Connect datastore on the Android device.

---

## 1.2 Android OS Architecture & Support

| Android Version | Health Connect availability | Notes |
| :--- | :--- | :--- |
| **Android 14+ (API 34+)** | Built into Android framework | No separate Health Connect APK required |
| **Android 13 and below** | Separate Health Connect app | User must have Health Connect installed |
| **Android 8.0 (API 26)** | SDK technically supports it | Health Connect app itself requires Android 9+ |
| **Below Android 8** | Unsupported | Health Connect SDK does not support it |

Google's documentation states that the Health Connect SDK supports **Android 8 / API 26+**, while the standalone Health Connect application for pre-Android 14 devices requires **Android 9 / API 28+**. ([Android Developers](https://developer.android.com/health-and-fitness/health-connect/get-started))

### Practical recommendation

For a modern React Native application, target:
```text
Android 9+  → Recommended minimum
Android 14+ → Best/native Health Connect experience
```

---

## 1.3 Install `react-native-health-connect`

Install the React Native wrapper:

```bash
# npm
npm install react-native-health-connect

# yarn
yarn add react-native-health-connect

# pnpm
pnpm add react-native-health-connect
```

This is a **native Android library**. Therefore, a standard **Expo Go** client is not sufficient. You must use an Expo project capable of including native Android code via **Development Builds / Prebuild**.

```text
Expo
   ↓
Development Build / Prebuild
   ↓
Android native project
   ↓
Health Connect native SDK
```

---

## 1.4 Expo Integration & Permission Setup (`app.json`)

For an Expo managed/prebuild project, permissions and plugins are configured inside `app.json`:

```json
{
  "expo": {
    "name": "MyHealthApp",
    "slug": "my-health-app",
    "version": "1.0.0",
    "platforms": ["android"],
    "plugins": [
      "react-native-health-connect",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 26
          }
        }
      ]
    ],
    "android": {
      "package": "com.mycompany.myhealthapp",
      "permissions": [
        "android.permission.health.READ_STEPS",
        "android.permission.health.WRITE_STEPS",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.WRITE_HEART_RATE",
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.WRITE_WEIGHT",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
        "android.permission.health.READ_SLEEP"
      ]
    }
  }
}
```

### Key Expo Configuration Details:

1. **`plugins`**:
   - `"react-native-health-connect"`: Auto-injects required rationale intent filters into `MainActivity` (Android 13 & below) and generates the `ViewPermissionUsageActivity` alias (Android 14+).
   - `"expo-build-properties"`: Ensures `minSdkVersion` is set to **26** (Android 8.0+), which is required by Health Connect.

2. **`android.permissions`**:
   - Explicitly list the Health Connect permission strings (`android.permission.health.*`) required by your application.
   - When running `npx expo prebuild`, Expo automatically injects these permissions into `android/app/src/main/AndroidManifest.xml`.

Then generate the native Android project and build:

```bash
# Generate native Android code from app.json configuration
npx expo prebuild

# Build and run on Android emulator or connected device
npx expo run:android

# Or generate a development build via EAS
eas build --profile development --platform android
```

> **Important:** Whenever native permissions or plugin configurations in `app.json` change, you must re-run `npx expo prebuild` to regenerate the Android configuration.

---

## 1.5 Handling Runtime Permissions in Expo / React Native

Declaring permissions in `app.json` allows Android to register them, but you must also request **runtime permission** from the user in your React Native code.

### Runtime Permission Flow:

```typescript
import {
  requestPermission,
  getGrantedPermissions,
  Permission,
} from "react-native-health-connect";

// 1. Define the permissions your app needs
const REQUIRED_PERMISSIONS: Permission[] = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "write", recordType: "Steps" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "Weight" },
  { accessType: "write", recordType: "Weight" },
];

// 2. Function to request missing permissions
export async function handleHealthPermissions(): Promise<boolean> {
  try {
    // Check currently granted permissions
    const grantedPermissions = await getGrantedPermissions();

    // Determine if all required permissions are already granted
    const hasAllPermissions = REQUIRED_PERMISSIONS.every((req) =>
      grantedPermissions.some(
        (g) => g.recordType === req.recordType && g.accessType === req.accessType
      )
    );

    if (hasAllPermissions) {
      console.log("All required permissions already granted.");
      return true;
    }

    // Request missing permissions from user
    const newlyGranted = await requestPermission(REQUIRED_PERMISSIONS);
    console.log("Granted permissions after request:", newlyGranted);

    return newlyGranted.length > 0;
  } catch (error) {
    console.error("Error handling Health Connect permissions:", error);
    return false;
  }
}
```

---

## 1.6 Privacy Policy & Permission Rationale

Google recommends separating permission rationale logic into a dedicated activity rather than placing all intent filters directly on `MainActivity`.

### For Android 13 and lower:

```xml
<activity
    android:name=".PermissionsRationaleActivity"
    android:exported="true">

    <intent-filter>
        <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
    </intent-filter>

</activity>
```

### For Android 14+:

```xml
<activity-alias
    android:name="ViewPermissionUsageActivity"
    android:exported="true"
    android:targetActivity=".PermissionsRationaleActivity"
    android:permission="android.permission.START_VIEW_PERMISSION_USAGE">

    <intent-filter>
        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
        <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
    </intent-filter>

</activity-alias>
```

### Rationale Flow

```text
Health Connect Settings
      │
      │ User taps privacy policy
      ▼
PermissionsRationaleActivity
      │
      ▼
Displays Privacy Policy & Data-Use Explanation
```

The rationale activity must explain:
* What health data your application accesses
* Why the application needs it
* How the data is processed and stored
* Whether/how data leaves the device

---

## 1.7 Recommended `AndroidManifest.xml` Structure

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Health Connect Permissions -->
    <uses-permission android:name="android.permission.health.READ_STEPS" />
    <uses-permission android:name="android.permission.health.WRITE_STEPS" />
    <uses-permission android:name="android.permission.health.READ_HEART_RATE" />
    <uses-permission android:name="android.permission.health.READ_WEIGHT" />

    <application ...>

        <!-- Main Application Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Health Connect Privacy Rationale Activity (Android 13 & below) -->
        <activity
            android:name=".PermissionsRationaleActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
        </activity>

        <!-- Health Connect Rationale Alias (Android 14+) -->
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".PermissionsRationaleActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>

    </application>

</manifest>
```

---

## 1.8 Directing Users to Health Connect (Android 13 & Lower)

For Android 13 and lower, Health Connect is not built into the OS framework and must be installed from the Google Play Store.

```typescript
import { Linking } from "react-native";

export async function openHealthConnectStore() {
  const marketUrl = "market://details?id=com.google.android.apps.healthdata";
  const webUrl = "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";

  try {
    const supported = await Linking.canOpenURL(marketUrl);
    await Linking.openURL(supported ? marketUrl : webUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}
```

---

## 1.9 Data Attribution & Synthetic Package Names (SPNs)

Starting with the **June 2026 Health Connect update**, on-device step counts are attributed using a **device-specific Synthetic Package Name (SPN)** rather than the historical generic `"android"` package name. ([Android Developers](https://developer.android.com/health-and-fitness/health-connect/read-data))

Avoid hardcoding checks such as:
```typescript
// ❌ DO NOT HARDCODE
dataOrigin.packageName === "android"
```

Instead, treat `dataOrigin` as an opaque identifier, or use `getCurrentDeviceDataSource()` when querying device-specific data sources.

---

## 1.10 Recommended Project Architecture

```text
my-health-app/
│
├── app/
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── PermissionsScreen.tsx
│   │   └── HealthDataScreen.tsx
│   └── navigation/
│
├── src/
│   ├── health-connect/
│   │   ├── client.ts
│   │   ├── permissions.ts
│   │   ├── records.ts
│   │   ├── aggregates.ts
│   │   └── sync.ts
│   ├── services/
│   │   └── health.service.ts
│   └── types/
│       └── health.ts
│
├── android/
├── app.json
├── package.json
└── tsconfig.json
```

---

## 1.11 Key Architecture Summary

| Requirement | Implementation Strategy |
| :--- | :--- |
| **OS Compatibility** | Android 9+ minimum recommended; native OS integration on Android 14+. |
| **Rationale Handling** | Dedicated `PermissionsRationaleActivity` with `ViewPermissionUsageActivity` alias. |
| **Expo Workflow** | Use Expo Config Plugins + Development Builds (`npx expo prebuild`). |
| **Step Attribution** | Treat `dataOrigin` as opaque due to Synthetic Package Names (SPNs). |
| **Permissions Scope** | Request only the health types your application explicitly consumes. |
