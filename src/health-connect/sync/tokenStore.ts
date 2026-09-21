import { getSyncState, updateSyncState } from '../../database/syncState';

/**
 * Persists the Changes API cursor per record type.
 * Thin, typed wrapper over the sync-state store so the sync engine never
 * touches AsyncStorage directly.
 */
export class TokenStore {
  /** Stored token for a record type, or null when no initial sync has happened. */
  static async getToken(recordType: string): Promise<string | null> {
    const state = await getSyncState(recordType);
    return state?.changesToken ?? null;
  }

  /** Persists a freshly obtained / advanced token. */
  static saveToken(recordType: string, changesToken: string): Promise<void> {
    return updateSyncState(recordType, { changesToken }).then(() => undefined);
  }

  /** Marks a token as expired so the next sync runs the recovery path. */
  static async clearToken(recordType: string): Promise<void> {
    await updateSyncState(recordType, { changesToken: null, status: 'token_expired' });
  }
}
