

# Chapter 2 — SDK Status, Initialization & Permissions

## 2.1 Check Health Connect Availability

Before performing Health Connect operations, first determine whether Health Connect is available on the device.

With `react-native-health-connect`:

```typescript
import {
  getSdkStatus,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

export async function checkHealthConnectAvailability(): Promise<boolean> {
  try {
    const status = await getSdkStatus();

    switch (status) {
      case SdkAvailabilityStatus.SDK_AVAILABLE:
        console.log("Health Connect is available");
        return true;

      case SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:
        console.log(
          "Health Connect is unavailable or requires a provider update"
        );
        return false;

      case SdkAvailabilityStatus.SDK_UNAVAILABLE:
      default:
        console.log("Health Connect is unavailable");
        return false;
    }
  } catch (error) {
    console.error("Failed to check Health Connect availability:", error);
    return false;
  }
}
```

At the Android API level, `HealthConnectClient.getSdkStatus()` returns one of three statuses:

```text
SDK_UNAVAILABLE
SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
SDK_AVAILABLE
```

However, **do not document their numeric values as `0`, `1`, and `2`**. In the current Health Connect 1.1.0 API, the constants are:

| Constant                                   | Current value | Meaning                                     |
| ------------------------------------------ | ------------: | ------------------------------------------- |
| `SDK_UNAVAILABLE`                          |           `1` | Health Connect isn't available              |
| `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` |           `2` | Provider isn't installed or needs an update |
| `SDK_AVAILABLE`                            |           `3` | Health Connect APIs are available           |

These values are implementation constants; your application should normally compare against the enum/constants rather than hard-code numbers. ([Android Developers][1])

### Why check this first?

Because Health Connect may:

* Not be available on the device
* Not be installed on supported older Android versions
* Need a provider update
* Be unavailable because of the Android version/profile

Android's current documentation explicitly recommends checking `getSdkStatus()` before obtaining a client or issuing Health Connect operations. ([Android Developers][2])

---

# 2.2 SDK Availability State Machine

A production application should treat availability as a state rather than a simple boolean.

```text
                    App starts
                       │
                       ▼
              getSdkStatus()
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
     AVAILABLE    UPDATE_REQUIRED  UNAVAILABLE
          │            │             │
          ▼            ▼             ▼
      Continue      Guide user     Disable HC
          │         to update      features
          ▼
       Initialize
```

This is better than simply doing:

```typescript
if (!available) {
  // Health Connect doesn't work
}
```

because `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` is a different state from a device that genuinely cannot use Health Connect.

Android specifically documents that the update-required state can be handled by directing the user to the appropriate package installer/Play Store flow. ([Android Developers][2])

---

# 2.3 Initialize `react-native-health-connect`

The React Native wrapper exposes:

```typescript
initialize()
```

A typical application-level initialization function can therefore be:

```typescript
import { initialize } from "react-native-health-connect";

export async function initializeHealthConnect(): Promise<boolean> {
  try {
    const initialized = await initialize();

    console.log(
      "Health Connect initialized:",
      initialized
    );

    return initialized;
  } catch (error) {
    console.error(
      "Health Connect initialization failed:",
      error
    );

    return false;
  }
}
```

### Native Android vs React Native Wrapper Lifecycle

At the native Android level, the lifecycle is:
```text
getSdkStatus() → HealthConnectClient.getOrCreate() → permissions → read/write/aggregate
```

`HealthConnectClient` is the actual Android API entry point managing communication with Health Connect storage. ([Android Developers][3])

In React Native, `react-native-health-connect` exposes `initialize()` to register native bridge bindings. Recommended application lifecycle:

```text
getSdkStatus() → initialize() → getGrantedPermissions() → requestPermission() → Health operations
```

---

# 2.4 A Better Production Initialization Function

Instead of exposing initialization and availability as completely independent operations, combine them into a service.

```typescript
import {
  getSdkStatus,
  initialize,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

export type HealthConnectStatus =
  | "available"
  | "update_required"
  | "unavailable"
  | "error";

export async function setupHealthConnect(): Promise<HealthConnectStatus> {
  try {
    const sdkStatus = await getSdkStatus();

    if (
      sdkStatus ===
      SdkAvailabilityStatus.SDK_UNAVAILABLE
    ) {
      return "unavailable";
    }

    if (
      sdkStatus ===
      SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
    ) {
      return "update_required";
    }

    const initialized = await initialize();

    if (!initialized) {
      return "error";
    }

    return "available";
  } catch (error) {
    console.error(
      "Health Connect setup failed:",
      error
    );

    return "error";
  }
}
```

Then your UI can do:

```typescript
const status = await setupHealthConnect();

switch (status) {
  case "available":
    // Continue
    break;

  case "update_required":
    // Show update/install UI
    break;

  case "unavailable":
    // Hide Health Connect features
    break;

  case "error":
    // Show retry/error UI
    break;
}
```

This is much more useful in a real application.

---

# 2.5 Opening Health Connect Settings

If the React Native library version you're using exposes these APIs, you can open Health Connect settings:

```typescript
import {
  openHealthConnectSettings,
  openHealthConnectDataManagement,
} from "react-native-health-connect";
```

General settings:

```typescript
await openHealthConnectSettings();
```

Data-management settings:

```typescript
await openHealthConnectDataManagement();
```

A useful UI might therefore have:

```text
Health Connect
────────────────────────

Status: Connected

Permissions
   View permissions →

Health Data
   Manage data →

Health Connect Settings
   Open settings →
```

### Important

Opening settings is **not a replacement for requesting permissions**.

Your application should normally request permissions through the Health Connect permission flow and only send the user to settings when appropriate.

---

# 2.6 Define Required Permissions

Health Connect permissions are defined by:

```typescript
{
  accessType: "read" | "write",
  recordType: RecordType
}
```

For example:

```typescript
import type { Permission } from "react-native-health-connect";

const requiredPermissions: Permission[] = [
  {
    accessType: "read",
    recordType: "Steps",
  },
  {
    accessType: "write",
    recordType: "Steps",
  },
  {
    accessType: "read",
    recordType: "HeartRate",
  },
  {
    accessType: "read",
    recordType: "Weight",
  },
  {
    accessType: "write",
    recordType: "Weight",
  },
  {
    accessType: "read",
    recordType: "SleepSession",
  },
];
```

At the Android level, each requested permission must first be declared in the manifest, and those declarations should correspond to the access your application actually needs. ([Android Developers][4])

---

# 2.7 Request Permissions

Using the React Native wrapper:

```typescript
import {
  requestPermission,
} from "react-native-health-connect";

export async function requestHealthPermissions() {
  try {
    const grantedPermissions =
      await requestPermission(
        requiredPermissions
      );

    console.log(
      "Granted permissions:",
      grantedPermissions
    );

    return grantedPermissions;
  } catch (error) {
    console.error(
      "Permission request failed:",
      error
    );

    return [];
  }
}
```

The important concept is:

```text
Permission
   │
   ├── accessType
   │      ├── read
   │      └── write
   │
   └── recordType
          ├── Steps
          ├── HeartRate
          ├── Weight
          ├── SleepSession
          └── ...
```

Android's current documentation confirms that users can grant or deny these permissions and can revoke them later. Your application therefore needs to check permissions rather than assuming they remain granted forever. ([Android Developers][4])

---

# 2.8 Don't Assume All Requested Permissions Were Granted

This is an important production improvement.

Don't do:

```typescript
await requestPermission(requiredPermissions);

fetchHealthData();
```

Instead:

```typescript
const granted =
  await requestPermission(requiredPermissions);

const hasAllPermissions =
  requiredPermissions.every((required) =>
    granted.some(
      (permission) =>
        permission.accessType ===
          required.accessType &&
        permission.recordType ===
          required.recordType
    )
  );

if (!hasAllPermissions) {
  console.log(
    "Some required permissions were not granted"
  );

  return;
}

await fetchHealthData();
```

Even better, we'll centralize this logic in a permission service.

---

# 2.9 Check Existing Permissions

You should check existing permissions before requesting them again.

```typescript
import {
  getGrantedPermissions,
} from "react-native-health-connect";

export async function getHealthPermissions() {
  try {
    const permissions =
      await getGrantedPermissions();

    console.log(
      "Currently granted:",
      permissions
    );

    return permissions;
  } catch (error) {
    console.error(
      "Failed to read granted permissions:",
      error
    );

    return [];
  }
}
```

Then:

```typescript
const granted =
  await getHealthPermissions();
```

You can determine whether the application has everything it needs.

---

# 2.10 Permission Checking Function

Create a reusable helper:

```typescript
import type { Permission } from "react-native-health-connect";

export function hasPermission(
  granted: Permission[],
  required: Permission
): boolean {
  return granted.some(
    (permission) =>
      permission.accessType ===
        required.accessType &&
      permission.recordType ===
        required.recordType
  );
}
```

Then:

```typescript
const granted =
  await getGrantedPermissions();

const canReadSteps = hasPermission(
  granted,
  {
    accessType: "read",
    recordType: "Steps",
  }
);
```

Result:

```typescript
if (canReadSteps) {
  console.log("Can read steps");
} else {
  console.log("Cannot read steps");
}
```

---

# 2.11 Revoke Permissions

If the wrapper version you're using exposes:

```typescript
revokeAllPermissions()
```

you can use:

```typescript
import {
  revokeAllPermissions,
} from "react-native-health-connect";

export async function revokeHealthPermissions() {
  try {
    await revokeAllPermissions();

    console.log(
      "Health Connect permissions revoked"
    );
  } catch (error) {
    console.error(
      "Failed to revoke permissions:",
      error
    );
  }
}
```

This is useful for:

* Account logout
* Disconnecting Health Connect
* Testing
* Resetting onboarding

### Production consideration

Don't automatically revoke Health Connect permissions just because a user logs out unless that is actually your intended privacy behavior.

Often a better model is:

```text
Logout
   ↓
Remove app account session
   ↓
Keep Health Connect authorization
```

and provide an explicit:

```text
Disconnect Health Connect
```

action when the user wants to remove access.

---

# 2.12 Complete Permission Service

At this point, we can combine the pieces:

```typescript
import {
  getSdkStatus,
  initialize,
  requestPermission,
  getGrantedPermissions,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

import type {
  Permission,
} from "react-native-health-connect";

const REQUIRED_PERMISSIONS: Permission[] = [
  {
    accessType: "read",
    recordType: "Steps",
  },
  {
    accessType: "read",
    recordType: "HeartRate",
  },
  {
    accessType: "read",
    recordType: "Weight",
  },
];

export async function setupHealthConnect() {
  // 1. Check availability
  const status = await getSdkStatus();

  if (
    status ===
    SdkAvailabilityStatus.SDK_UNAVAILABLE
  ) {
    return {
      available: false,
      reason: "unavailable" as const,
    };
  }

  if (
    status ===
    SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
  ) {
    return {
      available: false,
      reason: "update_required" as const,
    };
  }

  // 2. Initialize wrapper
  const initialized = await initialize();

  if (!initialized) {
    return {
      available: false,
      reason: "initialization_failed" as const,
    };
  }

  // 3. Check existing permissions
  const granted =
    await getGrantedPermissions();

  // 4. Determine missing permissions
  const missing =
    REQUIRED_PERMISSIONS.filter(
      (required) =>
        !granted.some(
          (permission) =>
            permission.accessType ===
              required.accessType &&
            permission.recordType ===
              required.recordType
        )
    );

  return {
    available: true,
    granted,
    missing,
  };
}
```

Then:

```typescript
const result =
  await setupHealthConnect();

if (!result.available) {
  console.log(
    "Health Connect unavailable:",
    result.reason
  );

  return;
}

if (result.missing.length > 0) {
  console.log(
    "Missing permissions:",
    result.missing
  );

  await requestPermission(
    result.missing
  );
}
```

This is a much better foundation than putting all Health Connect calls directly inside React components.

---

# 2.13 Production Permission Lifecycle

The recommended lifecycle is:

```text
                    ┌─────────────────┐
                    │   App Launch    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  getSdkStatus   │
                    └────────┬────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
        AVAILABLE      UPDATE_REQUIRED    UNAVAILABLE
             │               │                │
             ▼               ▼                ▼
        initialize      Show update       Disable HC
             │
             ▼
   ┌──────────────────────┐
   │ getGrantedPermissions │
   └──────────┬───────────┘
              │
              ▼
      All required granted?
          │           │
         YES          NO
          │           │
          ▼           ▼
       Continue   requestPermission()
          │           │
          │           ▼
          │      User decision
          │       │        │
          │      YES       NO
          │       │        │
          └───────┘        ▼
                         Limited
                         access
```

The **limited-access case is important**. Your application should not assume that denying one permission means Health Connect is completely unusable.

For example:

```text
Steps        ✅ Read
Heart Rate   ❌ Read
Weight       ✅ Read
```

Your app can still provide the steps and weight features while disabling the heart-rate feature.

---

# 2.14 The Most Important Production Rule

**Check permissions immediately before the operation that requires them.**

Don't rely solely on the permission state captured during app startup.

Users can revoke permissions outside your application. Google's current documentation explicitly states that users can grant or revoke permissions at any time and applications should handle lost permissions. ([Android Developers][4])

Therefore:

```typescript
// ❌ Don't rely only on startup state

const permissions = await getGrantedPermissions();

// ... user leaves app ...

await readHeartRate();
```

Prefer:

```typescript
// ✅ Check before sensitive operation

const permissions =
  await getGrantedPermissions();

if (
  !hasPermission(permissions, {
    accessType: "read",
    recordType: "HeartRate",
  })
) {
  throw new Error(
    "Heart rate permission is required"
  );
}

await readHeartRate();
```

This becomes especially important for background synchronization.

---

## 2.15 Final Architecture for Chapter 2

I recommend your project eventually look like:

```text
src/
└── health-connect/
    │
    ├── availability.ts
    │
    ├── initialization.ts
    │
    ├── permissions.ts
    │
    ├── records.ts
    │
    ├── aggregates.ts
    │
    └── sync.ts
```

With responsibilities:

```text
availability.ts
    ↓
getSdkStatus()

initialization.ts
    ↓
initialize()

permissions.ts
    ↓
requestPermission()
getGrantedPermissions()
revokeAllPermissions()

records.ts
    ↓
insertRecords()
readRecord()
readRecords()
updateRecords()
deleteRecords()

aggregates.ts
    ↓
aggregate()

sync.ts
    ↓
Changes API
Background synchronization
```

That architecture will make **Chapter 3 (CRUD)** much cleaner.

### API Versioning Note

AndroidX Health Connect release line is **1.1.0 (stable)**, with `1.2.0-alpha` releases available. ([Android Developers][5]) Distinguish between the native **AndroidX Health Connect API** and the **`react-native-health-connect` wrapper API** methods.

[1]: https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectClient "HealthConnectClient API reference | Android Developers"
[2]: https://developer.android.com/health-and-fitness/health-connect/features/training-plans "Training plans | Android Developers"
[3]: https://developer.android.com/health-and-fitness/health-connect/get-started "Get started with Health Connect | Android Developers"
[4]: https://developer.android.com/health-and-fitness/health-connect/write-data "Write data | Android Developers"
[5]: https://developer.android.com/jetpack/androidx/releases/health-connect "Health Connect Release Notes | Android Developers"
