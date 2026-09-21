import { type RecordType } from 'react-native-health-connect';
import { fetchChangesToken } from '../changes';
import { readAllHealthRecords } from '../records';
import { upsertLocalHealthRecords, type LocalRecordPatch } from '../../database/healthRecords';
import { getSyncState, updateSyncState } from '../../database/syncState';
import { MS_PER_DAY } from '../../config';

export interface RecoveryResult {
  recordType: RecordType;
  success: boolean;
  recoveredCount: number;
  /** True when the sweep hit the page cap and only part of the window was read. */
  truncated: boolean;
  error: string | null;
}

/**
 * Recovers from an expired Changes token.
 *
 * Health Connect invalidates a token after ~30 days of inactivity, after which
 * `getChanges` reports `changesTokenExpired`. Recovery re-reads everything that
 * changed since the last successful sync, mirrors it locally and mints a fresh
 * token — so no data is lost while the app was idle.
 */
export class SyncRecovery {
  static async recoverFromExpiredToken(recordType: RecordType): Promise<RecoveryResult> {
    console.log(`[SyncRecovery] Recovering expired token for ${recordType}…`);
    const state = await getSyncState(recordType);

    const endTime = new Date();
    const startTime = state?.lastSuccessfulSyncAt
      ? new Date(state.lastSuccessfulSyncAt)
      : new Date(endTime.getTime() - 30 * MS_PER_DAY);

    // Guard against an implausible stored timestamp (clock changes, corrupt state).
    if (!Number.isFinite(startTime.getTime()) || startTime > endTime) {
      startTime.setTime(endTime.getTime() - 30 * MS_PER_DAY);
    }

    const page = await readAllHealthRecords<Record<string, any>>(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      ascendingOrder: true,
    });

    if (page.error) {
      await updateSyncState(recordType, { status: 'error', errorMessage: page.error });
      return { recordType, success: false, recoveredCount: 0, truncated: false, error: page.error };
    }

    const patches: LocalRecordPatch[] = [];
    for (const record of page.records) {
      const healthConnectId = record?.metadata?.id;
      if (healthConnectId) {
        patches.push({ healthConnectId, recordType: record.recordType ?? recordType, payload: record });
      }
    }
    const writeResult = await upsertLocalHealthRecords(patches);

    const tokenResult = await fetchChangesToken([recordType]);
    if (!tokenResult.token) {
      await updateSyncState(recordType, {
        status: 'error',
        errorMessage: tokenResult.error ?? 'Could not create a new changes token',
      });
      return {
        recordType,
        success: false,
        recoveredCount: writeResult.changed,
        truncated: !page.complete,
        error: tokenResult.error ?? 'Could not create a new changes token',
      };
    }

    await updateSyncState(recordType, {
      changesToken: tokenResult.token,
      status: 'idle',
      errorMessage: undefined,
      lastSuccessfulSyncAt: new Date().toISOString(),
      lastSyncedCount: writeResult.changed,
    });

    console.log(`[SyncRecovery] Recovered ${writeResult.changed} record(s) for ${recordType}`);
    return {
      recordType,
      success: true,
      recoveredCount: writeResult.changed,
      truncated: !page.complete,
      error: writeResult.error,
    };
  }
}
