# Chapter 7: Local Database & Persistence Layer

This chapter details the local database architecture used to store Health Connect records, map Health Connect UUIDs for deletion changes, and maintain sync cursors.

---

## 7.1 `src/database/healthRecords.ts`

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

### Detailed Explanation:
- **Health Connect Deletion Mapping**: Health Connect deletion events do not return the record type for privacy reasons. Storing `healthConnectId` ensures that `deleteLocalHealthRecordByHCId` successfully removes the deleted record from the local database.

---

## 7.2 `src/database/syncState.ts`

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

### Detailed Explanation:
- Maintains per-record-type `changesToken`, `lastSuccessfulSyncAt` timestamp, and `status` (`idle`, `syncing`, `error`, `token_expired`).
