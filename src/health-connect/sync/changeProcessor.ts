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
