import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'token_expired' | 'no_permission';

export interface HealthConnectSyncState {
  recordType: string;
  /** Cursor for the Changes API. `null` means "no initial sync yet". */
  changesToken: string | null;
  lastSuccessfulSyncAt: string | null;
  status: SyncStatus;
  updatedAt: string;
  errorMessage?: string;
  /** Records mirrored during the last successful run (nice for the console UI). */
  lastSyncedCount?: number;
}

const SYNC_STATE_STORAGE_KEY = '@health_connect_sync_state';

let cache: Record<string, HealthConnectSyncState> | null = null;

/**
 * Serialized writer — the sync engine updates several record types in sequence
 * and the UI can reset a single type at any time, so concurrent read-modify-write
 * cycles would otherwise drop updates.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

/** All sync states keyed by record type. */
export async function getAllSyncStates(): Promise<Record<string, HealthConnectSyncState>> {
  if (cache) return { ...cache };
  try {
    const raw = await AsyncStorage.getItem(SYNC_STATE_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const states =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, HealthConnectSyncState>)
        : {};
    cache = states;
    return { ...states };
  } catch (error) {
    console.error('[SyncStateDB] Failed to read sync state:', error);
    return {};
  }
}

/** Sync state for a single record type (null when never synced). */
export async function getSyncState(recordType: string): Promise<HealthConnectSyncState | null> {
  const states = await getAllSyncStates();
  return states[recordType] ?? null;
}

/** Creates or patches the sync state for one record type. */
export function updateSyncState(
  recordType: string,
  partialState: Partial<HealthConnectSyncState>
): Promise<HealthConnectSyncState> {
  return enqueue(async () => {
    const states = await getAllSyncStates();
    const existing: HealthConnectSyncState = states[recordType] ?? {
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

    cache = { ...states, [recordType]: updated };
    try {
      await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error(`[SyncStateDB] Failed to persist state for ${recordType}:`, error);
    }
    return updated;
  });
}

/** Clears the sync state for one type, or everything when omitted. */
export function resetSyncState(recordType?: string): Promise<void> {
  return enqueue(async () => {
    try {
      if (!recordType) {
        cache = {};
        await AsyncStorage.removeItem(SYNC_STATE_STORAGE_KEY);
        return;
      }
      const states = await getAllSyncStates();
      const { [recordType]: _removed, ...rest } = states;
      cache = rest;
      await AsyncStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(rest));
    } catch (error) {
      console.error('[SyncStateDB] Failed to reset sync state:', error);
    }
  });
}
