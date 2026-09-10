import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'token_expired' | 'no_permission';

export interface HealthConnectSyncState {
  recordType: string;
  changesToken: string | null;
  lastSuccessfulSyncAt: string | null;
  status: SyncStatus;
  updatedAt: string;
  errorMessage?: string;
}

const SYNC_STATE_STORAGE_KEY = '@health_connect_sync_state';

/**
 * Retrieves all stored sync states mapped by recordType.
 */
export async function getAllSyncStates(): Promise<Record<string, HealthConnectSyncState>> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('[SyncStateDB] Failed to read sync state DB:', error);
    return {};
  }
}

/**
 * Retrieves sync state for a specific record type.
 */
export async function getSyncState(recordType: string): Promise<HealthConnectSyncState | null> {
  const allStates = await getAllSyncStates();
  return allStates[recordType] || null;
}

/**
 * Updates or creates the sync state for a specific record type.
 */
export async function updateSyncState(
  recordType: string,
  partialState: Partial<HealthConnectSyncState>
): Promise<HealthConnectSyncState> {
  const allStates = await getAllSyncStates();
  const existing = allStates[recordType] || {
    recordType,
    changesToken: null,
    lastSuccessfulSyncAt: null,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  };

  const updated: HealthConnectSyncState = {
    ...existing,
    ...partialState,
    recordType,
    updatedAt: new Date().toISOString(),
  };

  allStates[recordType] = updated;
  try {
    await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(allStates));
  } catch (error) {
    console.error(`[SyncStateDB] Failed to save sync state for ${recordType}:`, error);
  }

  return updated;
}

/**
 * Resets sync state for a given record type or all types.
 */
export async function resetSyncState(recordType?: string): Promise<void> {
  if (!recordType) {
    await AsyncStorage.removeItem(SYNC_STATE_STORAGE_KEY);
    return;
  }
  const allStates = await getAllSyncStates();
  delete allStates[recordType];
  await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(allStates));
}
