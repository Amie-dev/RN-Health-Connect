import { AppState, type AppStateStatus } from 'react-native';
import { type RecordType } from 'react-native-health-connect';
import { fetchAllAccumulatedChanges, fetchChangesToken } from '../changes';
import { readAllHealthRecords } from '../records';
import { getGrantedPermissionsCached, isPermissionGranted } from '../permissions';
import { ChangeProcessor } from './changeProcessor';
import { SyncRecovery } from './recovery';
import { TokenStore } from './tokenStore';
import { updateSyncState } from '../../database/syncState';
import { upsertLocalHealthRecords, type LocalRecordPatch } from '../../database/healthRecords';
import { MS_PER_DAY, SYNC_RECORD_TYPES } from '../../config';

/** Record types the engine keeps up to date (re-exported for backwards compatibility). */
export const DEFAULT_SYNC_RECORD_TYPES: RecordType[] = SYNC_RECORD_TYPES;

export type SyncSkipReason = 'no_permission' | 'already_running';

export interface SyncResult {
  recordType: string;
  success: boolean;
  upsertedCount: number;
  deletedCount: number;
  tokenExpired: boolean;
  /** True when a page cap cut the run short — the next run continues from the saved token. */
  truncated: boolean;
  durationMs: number;
  skippedReason?: SyncSkipReason;
  error?: string;
}

export interface SyncProgress {
  recordType: string;
  index: number;
  total: number;
}

export interface SyncRunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: SyncResult[];
  upsertedCount: number;
  deletedCount: number;
  failureCount: number;
  skippedCount: number;
}

export type SyncProgressHandler = (progress: SyncProgress) => void;

/** Builds the run summary the UI renders in the sync banner. */
export function summarizeRun(results: SyncResult[], startedAtMs: number): SyncRunSummary {
  const finishedAtMs = Date.now();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    results,
    upsertedCount: results.reduce((total, result) => total + result.upsertedCount, 0),
    deletedCount: results.reduce((total, result) => total + result.deletedCount, 0),
    failureCount: results.filter((result) => !result.success && !result.skippedReason).length,
    skippedCount: results.filter((result) => Boolean(result.skippedReason)).length,
  };
}

/**
 * Orchestrates incremental synchronisation.
 *
 * Design notes:
 *  - **Guarded**: a record type can never be synced twice concurrently, and
 *    `syncAll` refuses to start while another full run is in flight. Callers get
 *    an explicit `skippedReason` instead of a silently empty result.
 *  - **Paginated**: the initial backfill and the recovery sweep follow
 *    `pageToken` until the provider is exhausted, so a busy history is no longer
 *    silently truncated at one page.
 *  - **Batched**: changes are flushed to storage in one or two writes per page.
 *  - **Token-safe**: the cursor only advances after the corresponding changes
 *    were successfully written; a failure leaves the old token in place so the
 *    next run retries the same window.
 */
export class SyncManager {
  private static runningTypes = new Set<string>();
  private static runningAll = false;

  /** True while any sync work is in flight (used to disable UI buttons). */
  static isBusy(): boolean {
    return this.runningAll || this.runningTypes.size > 0;
  }

  /** Mirrors every record of a type from the trailing `windowDays` into the local cache. */
  private static async backfill(
    recordType: RecordType,
    windowDays = 30
  ): Promise<{ count: number; truncated: boolean; error: string | null }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - windowDays * MS_PER_DAY);

    const page = await readAllHealthRecords<Record<string, any>>(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      ascendingOrder: true,
    });

    if (page.error) {
      return { count: 0, truncated: false, error: page.error };
    }

    const patches: LocalRecordPatch[] = [];
    for (const record of page.records) {
      const healthConnectId = record?.metadata?.id;
      if (healthConnectId) {
        patches.push({
          healthConnectId,
          recordType: record.recordType ?? recordType,
          payload: record,
        });
      }
    }

    const writeResult = await upsertLocalHealthRecords(patches);
    return { count: writeResult.changed, truncated: !page.complete, error: writeResult.error };
  }

  /**
   * Synchronises one record type end-to-end:
   * permission check → first-run backfill or incremental drain → cursor update.
   */
  static async syncRecordType(recordType: RecordType): Promise<SyncResult> {
    const startedAt = Date.now();

    if (this.runningTypes.has(recordType)) {
      return {
        recordType,
        success: false,
        upsertedCount: 0,
        deletedCount: 0,
        tokenExpired: false,
        truncated: false,
        durationMs: 0,
        skippedReason: 'already_running',
      };
    }

    // Check the permission *first*: without it every native call throws.
    const granted = await getGrantedPermissionsCached();
    if (!isPermissionGranted(granted, recordType, 'read')) {
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
        truncated: false,
        durationMs: Date.now() - startedAt,
        skippedReason: 'no_permission',
        error: `Read permission not granted for ${recordType}`,
      };
    }

    this.runningTypes.add(recordType);
    await updateSyncState(recordType, { status: 'syncing', errorMessage: undefined });

    try {
      const token = await TokenStore.getToken(recordType);

      // ── First run for this type: mirror recent history, then start tracking ──
      if (!token) {
        console.log(`[SyncManager] Initial backfill + token for ${recordType}`);
        const backfill = await this.backfill(recordType);
        const tokenResult = await fetchChangesToken([recordType]);

        if (!tokenResult.token) {
          const error = tokenResult.error ?? 'Could not create a changes token';
          await updateSyncState(recordType, { status: 'error', errorMessage: error });
          return {
            recordType,
            success: false,
            upsertedCount: backfill.count,
            deletedCount: 0,
            tokenExpired: false,
            truncated: backfill.truncated,
            durationMs: Date.now() - startedAt,
            error,
          };
        }

        await updateSyncState(recordType, {
          changesToken: tokenResult.token,
          status: 'idle',
          errorMessage: undefined,
          lastSuccessfulSyncAt: new Date().toISOString(),
          lastSyncedCount: backfill.count,
        });

        return {
          recordType,
          success: true,
          upsertedCount: backfill.count,
          deletedCount: 0,
          tokenExpired: false,
          truncated: backfill.truncated,
          durationMs: Date.now() - startedAt,
          error: backfill.error ?? undefined,
        };
      }

      // ── Incremental: drain every pending change, then advance the cursor ──
      const accumulated = await fetchAllAccumulatedChanges(token);

      if (accumulated.tokenExpired) {
        console.warn(`[SyncManager] Token expired for ${recordType}; running recovery`);
        await updateSyncState(recordType, { status: 'token_expired' });
        const recovery = await SyncRecovery.recoverFromExpiredToken(recordType);

        return {
          recordType,
          success: recovery.success,
          upsertedCount: recovery.recoveredCount,
          deletedCount: 0,
          tokenExpired: true,
          truncated: recovery.truncated,
          durationMs: Date.now() - startedAt,
          error: recovery.error ?? undefined,
        };
      }

      if (accumulated.error) {
        // The previous token is kept, so the unprocessed window is retried next run.
        await updateSyncState(recordType, { status: 'error', errorMessage: accumulated.error });
        return {
          recordType,
          success: false,
          upsertedCount: 0,
          deletedCount: 0,
          tokenExpired: false,
          truncated: true,
          durationMs: Date.now() - startedAt,
          error: accumulated.error,
        };
      }

      const processed = await ChangeProcessor.processChanges(accumulated.changes);

      await updateSyncState(recordType, {
        changesToken: accumulated.finalToken,
        status: 'idle',
        errorMessage: undefined,
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastSyncedCount: processed.upsertedCount + processed.deletedCount,
      });

      return {
        recordType,
        success: true,
        upsertedCount: processed.upsertedCount,
        deletedCount: processed.deletedCount,
        tokenExpired: false,
        truncated: !accumulated.complete,
        durationMs: Date.now() - startedAt,
        error: processed.error ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SyncManager] Sync failed for ${recordType}:`, message);
      await updateSyncState(recordType, { status: 'error', errorMessage: message });
      return {
        recordType,
        success: false,
        upsertedCount: 0,
        deletedCount: 0,
        tokenExpired: false,
        truncated: false,
        durationMs: Date.now() - startedAt,
        error: message,
      };
    } finally {
      this.runningTypes.delete(recordType);
    }
  }

  /**
   * Synchronises several record types in sequence (sequential keeps the IPC
   * queue short and lets us report meaningful progress), returning a summary
   * with per-type results.
   */
  static async syncAll(
    recordTypes: RecordType[] = SYNC_RECORD_TYPES,
    onProgress?: SyncProgressHandler
  ): Promise<SyncRunSummary> {
    const startedAt = Date.now();

    if (this.runningAll) {
      console.log('[SyncManager] A full sync is already running; skipping this request');
      return summarizeRun(
        recordTypes.map((recordType) => ({
          recordType,
          success: false,
          upsertedCount: 0,
          deletedCount: 0,
          tokenExpired: false,
          truncated: false,
          durationMs: 0,
          skippedReason: 'already_running' as const,
        })),
        startedAt
      );
    }

    this.runningAll = true;
    const results: SyncResult[] = [];

    try {
      for (let index = 0; index < recordTypes.length; index += 1) {
        const recordType = recordTypes[index];
        onProgress?.({ recordType, index, total: recordTypes.length });
        results.push(await this.syncRecordType(recordType));
      }
    } finally {
      this.runningAll = false;
    }

    return summarizeRun(results, startedAt);
  }

  /**
   * Registers a foreground auto-sync: whenever the app returns to the
   * foreground it pulls pending changes. Returns an unsubscribe function.
   *
   * Health Connect only exposes foreground APIs to third-party apps unless the
   * user grants background read access, so this is the sanctioned way to stay
   * fresh without a background service.
   */
  static setupForegroundAutoSync(
    recordTypes: RecordType[] = SYNC_RECORD_TYPES,
    onSyncComplete?: (summary: SyncRunSummary) => void
  ): () => void {
    let previousState: AppStateStatus = AppState.currentState;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground =
        /inactive|background/.test(previousState) && nextState === 'active';
      previousState = nextState;

      if (!cameToForeground) return;

      // Debounce: Android can emit foreground transitions in quick succession
      // (e.g. permission dialog dismissal), and we never want a sync storm.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        console.log('[SyncManager] App returned to foreground; syncing…');
        void SyncManager.syncAll(recordTypes)
          .then((summary) => onSyncComplete?.(summary))
          .catch((error) => console.error('[SyncManager] Foreground sync failed:', error));
      }, 400);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      subscription.remove();
    };
  }
}


