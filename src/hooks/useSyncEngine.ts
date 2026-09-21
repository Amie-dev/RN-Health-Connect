import { useCallback, useEffect, useRef, useState } from 'react';
import { type RecordType } from 'react-native-health-connect';
import { getAllSyncStates, resetSyncState, type HealthConnectSyncState } from '../database/syncState';
import {
  SyncManager,
  summarizeRun,
  type SyncProgress,
  type SyncRunSummary,
} from '../health-connect/sync/syncManager';
import { SyncRecovery } from '../health-connect/sync/recovery';
import { SYNC_RECORD_TYPES } from '../config';

export interface UseSyncEngineResult {
  syncStates: Record<string, HealthConnectSyncState>;
  syncing: boolean;
  progress: SyncProgress | null;
  lastSummary: SyncRunSummary | null;
  /** Runs a full incremental sync; resolves with the run summary. */
  runSync: (recordTypes?: RecordType[]) => Promise<SyncRunSummary>;
  /** Syncs one record type (used by the console's per-type buttons). */
  runSingle: (recordType: RecordType) => Promise<void>;
  /** Forces the token-expiry recovery path for one record type. */
  recover: (recordType: RecordType) => Promise<void>;
  /** Clears the stored cursor for one type, or all types when omitted. */
  resetState: (recordType?: string) => Promise<void>;
  refreshStates: () => Promise<void>;
}

/**
 * Drives the sync engine from the UI: exposes progress, the last run summary
 * and the per-type actions shown in the Sync Console.
 */
export function useSyncEngine(): UseSyncEngineResult {
  const [syncStates, setSyncStates] = useState<Record<string, HealthConnectSyncState>>({});
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncRunSummary | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStates = useCallback(async () => {
    const states = await getAllSyncStates();
    if (mounted.current) setSyncStates(states);
  }, []);

  useEffect(() => {
    void refreshStates();
  }, [refreshStates]);

  const runSync = useCallback(
    async (recordTypes: RecordType[] = SYNC_RECORD_TYPES): Promise<SyncRunSummary> => {
      setSyncing(true);
      setProgress({ recordType: recordTypes[0], index: 0, total: recordTypes.length });
      const startedAt = Date.now();

      try {
        const summary = await SyncManager.syncAll(recordTypes, (next) => {
          if (mounted.current) setProgress(next);
        });
        if (mounted.current) setLastSummary(summary);
        await refreshStates();
        return summary;
      } catch (caught) {
        // Never leave the UI spinning if the engine itself throws.
        const summary = summarizeRun([], startedAt);
        if (mounted.current) setLastSummary(summary);
        console.error('[useSyncEngine] sync run failed:', caught);
        return summary;
      } finally {
        if (mounted.current) {
          setSyncing(false);
          setProgress(null);
        }
      }
    },
    [refreshStates]
  );

  const runSingle = useCallback(
    async (recordType: RecordType) => {
      setSyncing(true);
      try {
        await SyncManager.syncRecordType(recordType);
        await refreshStates();
      } finally {
        if (mounted.current) setSyncing(false);
      }
    },
    [refreshStates]
  );

  const recover = useCallback(
    async (recordType: RecordType) => {
      setSyncing(true);
      try {
        await SyncRecovery.recoverFromExpiredToken(recordType);
        await refreshStates();
      } finally {
        if (mounted.current) setSyncing(false);
      }
    },
    [refreshStates]
  );

  const resetState = useCallback(
    async (recordType?: string) => {
      await resetSyncState(recordType);
      await refreshStates();
    },
    [refreshStates]
  );

  return { syncStates, syncing, progress, lastSummary, runSync, runSingle, recover, resetState, refreshStates };
}
