# Chapter 3 — CRUD Operations & Data Querying

## 3.1 Insert Records

`insertRecords()` writes one or more records to Health Connect.

For example, inserting step records:

```typescript
import { insertRecords } from "react-native-health-connect";

export async function logSteps() {
  try {
    const recordIds = await insertRecords([
      {
        recordType: "Steps",
        count: 2500,
        startTime: "2026-09-09T08:00:00.000Z",
        endTime: "2026-09-09T08:45:00.000Z",
      },
      {
        recordType: "Steps",
        count: 1200,
        startTime: "2026-09-09T10:00:00.000Z",
        endTime: "2026-09-09T10:20:00.000Z",
      },
    ]);

    console.log("Inserted record IDs:", recordIds);

    return recordIds;
  } catch (error) {
    console.error("Failed to insert steps:", error);
    throw error;
  }
}
```

The returned IDs are Health Connect record identifiers.

### Important

The IDs returned by Health Connect are **not predictable**.

So this:

```text
00000000-0000-0000-0000-000000000001
```

should only be used as an illustrative example in documentation.

Do not build application logic around a particular UUID format or value.

---

# 3.2 Inserting Multiple Records (Single Record Type Rule)

`insertRecords()` accepts an array of records to insert in a single batch call. However, **all records in the array must be of the SAME record type**.

If you pass records with different `recordType` values in the same array, `react-native-health-connect` will throw a `HealthConnectError`: `"All records must have the same type"`.

### Batch inserting records of the same type:

```typescript
const ids = await insertRecords([
  {
    recordType: "Steps",
    count: 3000,
    startTime: "2026-09-09T08:00:00.000Z",
    endTime: "2026-09-09T09:00:00.000Z",
  },
  {
    recordType: "Steps",
    count: 1500,
    startTime: "2026-09-09T10:00:00.000Z",
    endTime: "2026-09-09T10:30:00.000Z",
  },
]);
```

### Inserting multiple different record types:

If you need to log different record types (e.g. `Steps` and `Weight`), issue separate `insertRecords()` calls:

```typescript
const stepIds = await insertRecords([
  {
    recordType: "Steps",
    count: 3000,
    startTime: "2026-09-09T08:00:00.000Z",
    endTime: "2026-09-09T09:00:00.000Z",
  },
]);

const weightIds = await insertRecords([
  {
    recordType: "Weight",
    weight: {
      value: 75.5,
      unit: "kilograms",
    },
    time: "2026-09-09T09:05:00.000Z",
  },
]);
```

---

# 3.3 Read a Single Record

To retrieve a specific record:

```typescript
import { readRecord } from "react-native-health-connect";

export async function getStepRecordById(
  recordId: string
) {
  try {
    const record = await readRecord(
      "Steps",
      recordId
    );

    return record;
  } catch (error) {
    console.error(
      "Failed to read step record:",
      error
    );

    throw error;
  }
}
```

Usage:

```typescript
const record =
  await getStepRecordById(recordId);

console.log(record);
```

Conceptually:

```text
Health Connect
      │
      │ recordType + recordId
      ▼
┌────────────────────┐
│ Specific HC record │
└────────────────────┘
```

### Permission requirement

Reading a record requires the appropriate **read permission** for that record type.

For example:

```text
Steps
   ↓
READ_STEPS
```

---

# 3.4 Read Records by Time Range

For historical data, use `readRecords()`.

A typical query looks like:

```typescript
import { readRecords } from "react-native-health-connect";

export async function fetchTodaySteps() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const end = new Date();

  try {
    const response = await readRecords(
      "Steps",
      {
        timeRangeFilter: {
          operator: "between",
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
      }
    );

    console.log(
      "Step records:",
      response.records
    );

    return response;
  } catch (error) {
    console.error(
      "Failed to read steps:",
      error
    );

    throw error;
  }
}
```

The key point is that the time range is represented using timestamps.

---

# 3.5 Time Range Operators

The common time-range concepts are:

### Between

```typescript
{
  operator: "between",
  startTime: startTime,
  endTime: endTime
}
```

Meaning:

```text
startTime ─────────────── endTime
             ↓
          records
```

### After

```typescript
{
  operator: "after",
  startTime: startTime
}
```

Meaning:

```text
startTime ───────────────────────>
             records
```

### Before

```typescript
{
  operator: "before",
  endTime: endTime
}
```

Meaning:

```text
<────────────────────── endTime
          records
```

---

# 3.6 Time Zones — Very Important

Avoid blindly constructing timestamps using local strings.

For example, this is ambiguous:

```typescript
"2026-09-09 08:00:00"
```

Prefer ISO timestamps:

```typescript
"2026-09-09T08:00:00+05:30"
```

or:

```typescript
new Date().toISOString()
```

Health Connect records also carry zone-offset information where applicable.

For an Indian user, for example:

```text
Local time:
2026-09-09 08:00
       ↓
IST
       ↓
UTC:
2026-09-09 02:30Z
```

This matters enormously when building:

* Daily dashboards
* Sleep reports
* Weekly analytics
* Workout timelines
* Synchronization systems

A production application should define clearly whether its business logic operates in:

```text
UTC
```

or:

```text
User/device local timezone
```

and convert consistently.

---

# 3.7 Read Response

A response contains the records returned by Health Connect.

Conceptually:

```typescript
{
  records: [...]
}
```

Depending on the library/API version and query, pagination information may also be present.

A record can contain information such as:

```typescript
{
  recordType: "Steps",

  count: 2500,

  startTime: "...",

  endTime: "...",

  startZoneOffset: "...",

  endZoneOffset: "...",

  metadata: {
    id: "...",
    clientRecordId: "...",
    clientRecordVersion: 0,
    lastModifiedTime: "...",
    dataOrigin: {
      packageName: "..."
    },
    recordingMethod: 1
  }
}
```

### Important correction to your original schema

Don't document:

```json
"dataOrigin": "com.mycompany.myhealthapp"
```

as a universal current schema.

The Android Health Connect model represents data origin as an object containing source information, such as the originating package name. The exact React Native wrapper representation should be checked against the version you're using.

Likewise, don't assume every record has exactly the same metadata/device fields. Metadata differs depending on record/API representation.

---

# 3.8 Reading Large Datasets

For a small query:

```text
Today
   ↓
Maybe dozens/hundreds of records
   ↓
One request may be sufficient
```

For a long historical query:

```text
1 year
   ↓
Potentially thousands/millions of samples
   ↓
Pagination
```

Your application should therefore process pages rather than assuming all records arrive in one response.

A generic pattern is:

```typescript
export async function fetchAllRecords(
  startTime: string,
  endTime: string
) {
  const allRecords: any[] = [];

  let pageToken:
    | string
    | undefined;

  do {
    const response =
      await readRecords("HeartRate", {
        timeRangeFilter: {
          operator: "between",
          startTime,
          endTime,
        },

        pageSize: 100,

        ...(pageToken
          ? { pageToken }
          : {}),
      });

    allRecords.push(
      ...response.records
    );

    pageToken =
      response.pageToken;
  } while (pageToken);

  return allRecords;
}
```

### Production improvement

Don't blindly accumulate an enormous dataset in memory:

```typescript
const allRecords = [];
```

for very large ranges.

For production synchronization, prefer:

```text
Health Connect
      ↓
Page 1
      ↓
Persist/process
      ↓
Page 2
      ↓
Persist/process
      ↓
Page 3
      ↓
...
```

rather than:

```text
Health Connect
      ↓
Load entire year into RAM
      ↓
Process everything
```

This becomes particularly important in **Chapter 6**, where we'll build synchronization.

---

# 3.9 Data Origin Filtering

Health Connect can contain data from multiple applications.

For example:

```text
Google/Samsung/Fitbit/Strava/etc.
             │
             ▼
       Health Connect
             │
      ┌──────┼──────┐
      ▼      ▼      ▼
     App A  App B   App C
```

Sometimes you only want records from a particular source.

Conceptually:

```typescript
dataOriginFilter: [
  // specific source(s)
]
```

But **don't hard-code a package-name example as if it were universally valid**.

The correct source identifier should come from the actual `dataOrigin` returned by Health Connect.

This is particularly important with newer Health Connect attribution behavior, including the 2026 changes around on-device steps.

---

# 3.10 Don't Hard-Code Step Data Origins

This is especially important for modern Health Connect applications.

Avoid logic such as:

```typescript
if (
  record.metadata.dataOrigin.packageName ===
  "android"
) {
  // on-device steps
}
```

Do not assume `"android"` is the current source identifier for on-device steps.

Health Connect introduced device-specific **Synthetic Package Names (SPNs)** for current on-device step attribution in the June 2026 update.

Therefore:

```text
❌ Hard-code "android"

✅ Discover/use the actual data origin
```

If your application needs to identify current device data specifically, use the appropriate Health Connect API rather than assuming a fixed package name.

---

# 3.11 Updating Records (Upserting via `insertRecords`)

In `react-native-health-connect`, there is **no separate `updateRecords()` function**. Updates are performed by calling `insertRecords()` with record objects that include their existing `metadata.id` or `metadata.clientRecordId`.

When Health Connect receives an insert call with an existing record ID, it performs an **upsert** (update if exists, insert if new).

For example:

```typescript
import { insertRecords } from "react-native-health-connect";

export async function updateWeightRecord(recordId: string) {
  try {
    await insertRecords([
      {
        recordType: "Weight",
        weight: {
          value: 75.5,
          unit: "kilograms",
        },
        time: "2026-09-09T07:30:00.000Z",
        metadata: {
          id: recordId,
        },
      },
    ]);

    console.log("Weight updated successfully via insertRecords");
  } catch (error) {
    console.error("Failed to update weight:", error);
    throw error;
  }
}
```

### Important distinction

There are two different identifiers you may encounter:

```text
metadata.id
```

and:

```text
metadata.clientRecordId
```

They serve different purposes.

### Health Connect record ID

```text
metadata.id
```

is assigned by Health Connect.

### Client record ID

```text
metadata.clientRecordId
```

is an identifier supplied by the application when using the client-record identity mechanism.

Do **not** treat these two IDs as interchangeable.

---

# 3.12 Why `clientRecordId` Matters

Suppose your application uploads a weight measurement:

```text
Your application
      │
      │ clientRecordId = "weight-2026-09-09-0730"
      ▼
Health Connect
      │
      ▼
metadata.id = generated HC ID
```

Your application can use its own client identifier to maintain idempotency and identify its records.

This becomes useful when implementing:

```text
Mobile app
    ↓
Backend
    ↓
Sync engine
    ↓
Health Connect
```

We'll use this concept later in the synchronization chapter.

---

# 3.13 Deleting Records by UUIDs (`deleteRecordsByUuids`)

You can delete specific records when you know their Health Connect UUIDs or client record IDs using `deleteRecordsByUuids()`.

For example:

```typescript
import { deleteRecordsByUuids } from "react-native-health-connect";

export async function removeStepRecords(
  recordIds: string[],
  clientRecordIds: string[] = []
) {
  try {
    await deleteRecordsByUuids(
      "Steps",
      recordIds,
      clientRecordIds
    );

    console.log("Records deleted successfully");
  } catch (error) {
    console.error("Failed to delete records:", error);
    throw error;
  }
}
```

The parameters for `deleteRecordsByUuids` are:
1. `recordType`: e.g. `"Steps"`
2. `recordIdsList`: Array of Health Connect UUID strings (`string[]`)
3. `clientRecordIdsList`: Array of application client record ID strings (`string[]`)

The record type is important: `"Steps"` must correspond to the IDs being deleted. Don't mix unrelated record types into a deletion operation.

---

# 3.14 Delete Records by Time Range

You can also delete records matching a time range:

```typescript
import {
  deleteRecordsByTimeRange,
} from "react-native-health-connect";

export async function deleteStepsInRange(
  startTime: string,
  endTime: string
) {
  try {
    await deleteRecordsByTimeRange(
      "Steps",
      {
        operator: "between",

        startTime,
        endTime,
      }
    );

    console.log(
      "Step records deleted."
    );
  } catch (error) {
    console.error(
      "Failed to delete steps:",
      error
    );

    throw error;
  }
}
```

### ⚠️ Be extremely careful

This:

```typescript
deleteRecordsByTimeRange(...)
```

is destructive.

For example:

```text
09:00 ─────────────────── 12:00
          DELETE
```

can remove matching records from Health Connect.

Therefore, don't expose a destructive operation directly from a casual UI button without confirmation.

Prefer:

```text
Delete health data?
        │
        ▼
Are you sure?
        │
    ┌───┴───┐
    ▼       ▼
   Yes      No
    │       │
 DELETE    Cancel
```

---

# 3.15 CRUD Summary

At this point your Health Connect CRUD layer looks like:

```text
                    Health Connect
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
     CREATE/UPDATE      READ            DELETE
          │               │               │
          ▼               ▼               ▼
  insertRecords()    readRecord()   deleteRecordsByUuids()
  (upserts with ID)  readRecords()  deleteRecordsByTimeRange()
```

---

# 3.16 Recommended Service Layer

Don't put all of this directly inside React components.

Instead:

```text
src/
└── health-connect/
    │
    ├── client.ts
    ├── permissions.ts
    ├── records.ts
    └── aggregates.ts
```

For example:

```typescript
// records.ts

export async function getSteps(
  startTime: string,
  endTime: string
) {
  return readRecords("Steps", {
    timeRangeFilter: {
      operator: "between",
      startTime,
      endTime,
    },
  });
}
```

Then the component simply does:

```typescript
const result =
  await getSteps(start, end);
```

instead of knowing about Health Connect's native API details.

---

# 3.17 Production CRUD Flow

The complete pattern should be:

```text
                 User action
                     │
                     ▼
            Health service layer
                     │
                     ▼
             Check permission
                     │
            ┌────────┴────────┐
            │                 │
          Granted           Missing
            │                 │
            ▼                 ▼
       Health Connect    Request permission
            │
            ▼
       CRUD operation
            │
            ▼
       Handle response
            │
            ▼
       Update application UI
```

## 3.18 Production Best Practices Summary

| Practice | Description |
| :--- | :--- |
| **Record IDs** | Treat Health Connect record IDs as illustrative UUIDs generated at runtime. |
| **Data Origins** | Discover dynamic `dataOrigin` values rather than hardcoding package names. |
| **ID Distinction** | Maintain a strict distinction between Health Connect `id` and client `clientRecordId`. |
| **Pagination** | Process pages incrementally for historical queries rather than loading all records into RAM. |
| **Timezones** | Use ISO 8601 timestamps and handle user local zone offsets consistently. |
| **Destructive Deletion** | Protect `deleteRecordsByTimeRange()` calls with confirmation UI. |
| **Architecture** | Isolate Health Connect operations behind a dedicated service/repository layer. |
