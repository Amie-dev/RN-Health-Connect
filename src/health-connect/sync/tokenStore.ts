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
