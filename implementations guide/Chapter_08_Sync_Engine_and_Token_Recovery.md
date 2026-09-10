# Chapter 8: Sync Engine & Token Recovery

This chapter details the synchronization engine, token store, loop prevention, 30-day token expiration recovery, and foreground auto-sync.

---

## 8.1 `src/health-connect/sync/tokenStore.ts`

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

---

## 8.2 `src/health-connect/sync/changeProcessor.ts`

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

---

## 8.3 `src/health-connect/sync/recovery.ts`

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

---

## 8.4 `src/health-connect/sync/syncManager.ts`

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

---

## Detailed Code Explanation

1. **Independent Token Storage (`tokenStore.ts`)**: Maintains separate tokens for each data type so revoking permissions on one record type does not break others.
2. **Loop Prevention (`changeProcessor.ts`)**: Checks `record.metadata.dataOrigin` to filter out self-written records when requested.
3. **Token Expiration Recovery (`recovery.ts`)**: When a Changes token expires (30 days), rereads records from `lastSuccessfulSyncAt`, deduplicates them in the local database, and creates a fresh token.
4. **Atomic Token Advancement (`syncManager.ts`)**: Processes local DB changes *before* persisting `nextChangesToken` to ensure crashes do not cause skipped sync events.
