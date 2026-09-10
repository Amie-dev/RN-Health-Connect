import { AppState, AppStateStatus } from 'react-native';
import { RecordType, getGrantedPermissions } from 'react-native-health-connect';
import { fetchChangesToken, fetchChanges } from '../changes';
import { queryHealthRecords } from '../records';
import { ChangeProcessor } from './changeProcessor';
import { SyncRecovery } from './recovery';
import { TokenStore } from './tokenStore';
import { getSyncState, updateSyncState, getAllSyncStates } from '../../database/syncState';
import { upsertLocalHealthRecord } from '../../database/healthRecords';

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
      // 1. Check if read permission is granted FIRST to prevent SecurityExceptions
      const granted = await getGrantedPermissions();
      const hasReadPerm = granted.some(
        (p: any) => p.recordType === recordType && p.accessType === 'read'
      );

      if (!hasReadPerm) {
        console.warn(`[SyncManager] Read permission missing for ${recordType}, skipping sync.`);
        await updateSyncState(recordType, {
          status: 'no_permission',
          errorMessage: `Read permission not granted for ${recordType}`,
        });
        return {
          recordType,
          success: false,
          upsertedCount: 0,
          deletedCount: 0,
          tokenExpired: false,
          error: `Read permission not granted for ${recordType}`,
        };
      }

      await updateSyncState(recordType, { status: 'syncing' });

      let token = await TokenStore.getToken(recordType);

      // If no token exists, initialize by backfilling existing records and requesting a fresh token
      if (!token) {
        console.log(`[SyncManager] Initializing token & backfilling historical data for ${recordType}`);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        let backfilledCount = 0;
        try {
          const initialRecordsRes = await queryHealthRecords(recordType, {
            timeRangeFilter: {
              operator: 'between',
              startTime: thirtyDaysAgo,
              endTime: now,
            },
            pageSize: 1000,
          });

          for (const rec of initialRecordsRes.records) {
            const hcId = rec.metadata?.id;
            if (hcId) {
              await upsertLocalHealthRecord(hcId, recordType, rec);
              backfilledCount++;
            }
          }
        } catch (queryErr) {
          console.warn(`[SyncManager] Initial query backfill error for ${recordType}:`, queryErr);
        }

        token = await fetchChangesToken([recordType]);
        const nowIso = new Date().toISOString();
        await updateSyncState(recordType, {
          changesToken: token,
          lastSuccessfulSyncAt: nowIso,
          status: 'idle',
          updatedAt: nowIso,
        });
        return {
          recordType,
          success: true,
          upsertedCount: backfilledCount,
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
