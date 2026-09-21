import type { HealthChange } from '../changes';
import {
  deleteLocalHealthRecordsByIds,
  upsertLocalHealthRecords,
  type LocalRecordPatch,
} from '../../database/healthRecords';

export interface ProcessChangesResult {
  upsertedCount: number;
  deletedCount: number;
  /** Changes that could not be applied (missing record id / type). */
  skippedCount: number;
  error: string | null;
}

/**
 * Turns a page of Changes API results into **two** storage writes (one upsert
 * batch, one delete batch) instead of one write per record.
 *
 * Records are de-duplicated by Health Connect ID inside the batch, so a page
 * that touches the same record twice only costs one write.
 */
export class ChangeProcessor {
  static async processChanges(changes: HealthChange[]): Promise<ProcessChangesResult> {
    const upserts = new Map<string, LocalRecordPatch>();
    const deletions = new Set<string>();
    let skippedCount = 0;

    for (const change of changes) {
      if (change.type === 'upsert') {
        const { record } = change;
        const healthConnectId = record?.metadata?.id;
        const recordType = record?.recordType;

        if (!healthConnectId || !recordType) {
          skippedCount += 1;
          console.warn('[ChangeProcessor] Upsert change without id/recordType:', record);
          continue;
        }

        upserts.set(healthConnectId, { healthConnectId, recordType, payload: record });
      } else if (change.recordId) {
        deletions.add(change.recordId);
      } else {
        skippedCount += 1;
      }
    }

    // A delete wins over an upsert of the same id within one batch.
    for (const id of deletions) {
      upserts.delete(id);
    }

    const [upsertResult, deleteResult] = await Promise.all([
      upsertLocalHealthRecords([...upserts.values()]),
      deleteLocalHealthRecordsByIds([...deletions]),
    ]);

    return {
      upsertedCount: upsertResult.changed,
      deletedCount: deleteResult.changed,
      skippedCount,
      error: upsertResult.error ?? deleteResult.error,
    };
  }
}
