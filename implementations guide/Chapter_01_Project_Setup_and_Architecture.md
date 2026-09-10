# Chapter 1: Project Setup & Architecture

This chapter covers the foundational setup for building an Android Health Connect application with React Native, Expo, and TypeScript.

---

## 1.1 Project Structure Overview

```text
/home/aminul/development/RN_Health_Connect/
├── package.json
├── app.json
├── tsconfig.json
├── App.tsx
└── src/
    ├── health-connect/
    │   ├── client.ts              # SDK status check, initialization, & settings navigation
    │   ├── permissions.ts         # Comprehensive permission lists (Read/Write for 15+ record types) and checks
    │   ├── records.ts             # CRUD operations (insert, read single/bulk, update, delete)
    │   ├── changes.ts             # Health Connect Changes API client (getChanges Token & paginated retrieval)
    │   ├── aggregation.ts         # Single metrics & duration/period grouped aggregations
    │   └── sync/
    │       ├── tokenStore.ts      # Persistent storage for per-record-type Changes tokens
    │       ├── changeProcessor.ts # Upsert/delete change processing & mapping to local DB
    │       ├── recovery.ts        # 30-day token expiration handling & timestamp-based re-fetch recovery
    │       └── syncManager.ts     # Main sync manager & AppState foreground auto-sync listener
    │
    ├── database/
    │   ├── healthRecords.ts       # Local database storage for raw & synced Health Connect records
    │   └── syncState.ts           # Local database storage for sync state table (token, status, timestamp)
    │
    └── screens/
        └── HealthDashboard.tsx    # Rich UI dashboard showing aggregations, all category data, sync controls, & data entry
```

---

## 1.2 `package.json`

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

### Detailed Explanation
- `react-native-health-connect`: The native Android Health Connect SDK wrapper for React Native.
- `@react-native-async-storage/async-storage`: Cross-platform local persistence used to store synced health records, Health Connect UUID mappings, and sync token states.

---

## 1.3 `app.json`

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

### Detailed Explanation
- `"plugins": ["react-native-health-connect"]`: Configures Expo's prebuild engine to inject required Android Health Connect permission declarations into `AndroidManifest.xml` during `npx expo run:android` or prebuild steps.

---

## 1.4 `tsconfig.json`

**File Path:** [tsconfig.json](file:///home/aminul/development/RN_Health_Connect/tsconfig.json)

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

---

## 1.5 `App.tsx`

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
