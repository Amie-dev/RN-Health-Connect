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
