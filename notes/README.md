# Android Health Connect with React Native & Expo — Master Guide

Welcome to the comprehensive, chapter-wise documentation and guide for integrating **Android Health Connect** in React Native applications (both Expo and React Native CLI) using [`react-native-health-connect`](https://github.com/matinzd/react-native-health-connect).

This guide covers everything from environment setup, permission lifecycle, CRUD operations, aggregation pipelines, sync APIs, to **detailed return data schemas for all 30+ record types supported by Health Connect**.

---

## 📚 Chapters Index

1. [Chapter 1: Introduction & Environment Setup](./01_introduction_and_setup.md)
   - What is Android Health Connect?
   - Architecture & Android OS version support (Android 14+ vs Android 8–13)
   - Expo Setup (`app.json` config plugin) & React Native CLI Setup
   - Android Manifest permissions & rationale strings

2. [Chapter 2: SDK Status, Initialization & Permissions](./02_permissions_and_sdk_status.md)
   - Checking Health Connect SDK availability (`getSdkStatus`)
   - Initializing the SDK (`initialize`)
   - Requesting Read & Write permissions (`requestPermission`)
   - Checking granted permissions & revoking permissions
   - Navigating users to Health Connect system settings

3. [Chapter 3: CRUD Operations & Data Querying](./03_crud_operations.md)
   - Inserting records (`insertRecords`)
   - Reading single record by ID (`readRecord`)
   - Reading bulk records with time range filters & pagination (`readRecords`)
   - Updating existing records via upsert (`insertRecords`)
   - Deleting records by UUIDs or time range (`deleteRecordsByUuids`, `deleteRecordsByTimeRange`)

4. [Chapter 4: Complete Record Types & Return Data Schemas](./04_all_record_types_and_data_schemas.md)
   - Record Metadata structure (`id`, `clientRecordId`, `dataOrigin`, `recordingMethod`, `device`, `lastModifiedTime`)
   - **Activity Category**: Active Calories, Distance, Elevation, Exercise Sessions, Steps, Speed, Power, Swimming, etc.
   - **Body Measurement Category**: Body Fat, BMI, Weight, Height, Bone Mass, Waist/Hip Circumference, etc.
   - **Cycle Tracking Category**: Menstruation, Cervical Mucus, Ovulation Test, Sexual Activity, etc.
   - **Nutrition Category**: Hydration, Detailed Nutrition (Carbs, Protein, Fat, Vitamins, Minerals).
   - **Sleep Category**: Sleep Session & Sleep Stages (Light, Deep, REM, Awake).
   - **Vitals Category**: Heart Rate, Blood Pressure, Blood Glucose, Oxygen Saturation, Body Temperature, HRV, etc.
   - Complete JSON input/output payloads for every record type.

5. [Chapter 5: Aggregations & Analytics](./05_aggregations_and_analytics.md)
   - Computing single metrics (Total Steps, Average Heart Rate, Total Calories, etc.)
   - Aggregating data grouped by duration (Hourly, Daily buckets)
   - Aggregating data grouped by period (Days, Weeks, Months)
   - Filtering aggregations by Data Origins (specific apps)

6. [Chapter 6: Changes API & Data Synchronization](./06_changes_api_and_background.md)
   - Synchronizing external databases with Health Connect
   - Requesting and managing Changes Tokens (`getChanges`)
   - Reading changes (`getChanges` - inserted & deleted record IDs)
   - Handling background read permissions and restrictions

7. [Chapter 7: Full Working React Native Expo Example App](./07_complete_working_expo_example.md)
   - Complete, copy-paste ready React Native Expo app code
   - Handling UI flow for initialization, permission prompts, fetching step counts, writing weight, and listing vitals

---

## 🔗 Useful Links & Documentation
- [react-native-health-connect GitHub](https://github.com/matinzd/react-native-health-connect)
- [Official Library Docs](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
- [Android Health Connect Developer Docs](https://developer.android.com/health-and-fitness/health-connect)
