import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_LOCAL_RECORDS } from '../config';

/**
 * Local mirror of Health Connect.
 *
 * Health Connect stays the source of truth; this module is a cache that powers
 * the Explorer tab and gives the sync engine a cursor-independent copy.
 *
 * Two performance/robustness guarantees that the previous implementation
 * lacked:
 *
 *  1. **One read + one write per batch.** Records are kept in memory and every
 *     mutation is applied to that array before a single `setItem` call. The old
 *     read-parse-write-per-record pattern was O(n²) and made a 1000-record
 *     backfill stall the JS thread.
 *  2. **Serialized writes.** All mutations go through a promise queue, so a
 *     background sync and a manual log can never interleave read-modify-write
 *     cycles and lose records.
 */

export type RecordPayload = Record<string, any>;

export interface LocalHealthRecord {
  /** App-local identifier (stable across HC ID changes). */
  localId: string;
  /** Health Connect record UUID. */
  healthConnectId: string;
  recordType: string;
  dataOrigin?: string;
  startTime?: string;
  endTime?: string;
  time?: string;
  lastModifiedTime?: string;
  /** Full record as returned by Health Connect. */
  payload: RecordPayload;
  createdAt: string;
  updatedAt: string;
}

/** Minimal input required to insert or update a local record. */
export interface LocalRecordPatch {
  healthConnectId: string;
  recordType: string;
  payload: RecordPayload;
}

export interface WriteResult {
  /** Number of records inserted or updated. */
  changed: number;
  /** Number of oldest records dropped to respect {@link MAX_LOCAL_RECORDS}. */
  trimmed: number;
  /** Non-null when persisting failed (e.g. storage quota) — the UI surfaces this. */
  error: string | null;
}

export interface LocalDatabaseStats {
  total: number;
  byType: Record<string, number>;
  newestAt: string | null;
  trimmedAt: string | null;
}

const HEALTH_RECORDS_STORAGE_KEY = '@health_connect_records_db';

/* -------------------------------------------------------------------------- */
/* In-memory mirror                                                           */
/* -------------------------------------------------------------------------- */

let cache: LocalHealthRecord[] | null = null;
let indexById = new Map<string, number>();
let loadPromise: Promise<LocalHealthRecord[]> | null = null;
let lastTrimmedAt: string | null = null;

/** Rebuilds the HC-id → array-index lookup after any structural change. */
function rebuildIndex(records: LocalHealthRecord[]): void {
  indexById = new Map();
  for (let i = 0; i < records.length; i += 1) {
    const id = records[i]?.healthConnectId;
    if (id) indexById.set(id, i);
  }
}

function isRecordArray(value: unknown): value is LocalHealthRecord[] {
  return Array.isArray(value);
}

/** Reads the store once and memoizes it; pass `force` to re-read from disk. */
async function loadRecords(force = false): Promise<LocalHealthRecord[]> {
  if (!force && cache) return cache;

  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(HEALTH_RECORDS_STORAGE_KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const records = isRecordArray(parsed) ? parsed : [];
        cache = records;
        rebuildIndex(records);
        return records;
      })
      .catch((error) => {
        console.error('[HealthRecordsDB] Failed to read store:', error);
        cache = [];
        rebuildIndex([]);
        return [];
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  return loadPromise;
}

/** Single writer: every mutation is chained so read-modify-write cycles cannot interleave. */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  // Keep the chain alive even if a task rejects.
  writeQueue = run.catch(() => undefined);
  return run;
}

async function persist(records: LocalHealthRecord[]): Promise<string | null> {
  try {
    await AsyncStorage.setItem(HEALTH_RECORDS_STORAGE_KEY, JSON.stringify(records));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[HealthRecordsDB] Failed to persist store:', message);
    return message;
  }
}

function toLocalRecord(patch: LocalRecordPatch, now: string): LocalHealthRecord {
  return {
    localId: `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    healthConnectId: patch.healthConnectId,
    recordType: patch.recordType,
    dataOrigin: patch.payload?.metadata?.dataOrigin,
    startTime: patch.payload?.startTime ?? patch.payload?.time,
    endTime: patch.payload?.endTime ?? patch.payload?.time,
    time: patch.payload?.time,
    lastModifiedTime: patch.payload?.metadata?.lastModifiedTime ?? now,
    payload: patch.payload,
    createdAt: now,
    updatedAt: now,
  };
}

/** Applies a patch to an existing record in place (keeps the array order stable). */
function applyPatch(existing: LocalHealthRecord, patch: LocalRecordPatch, now: string): void {
  existing.recordType = patch.recordType;
  existing.dataOrigin = patch.payload?.metadata?.dataOrigin ?? existing.dataOrigin;
  existing.startTime = patch.payload?.startTime ?? patch.payload?.time ?? existing.startTime;
  existing.endTime = patch.payload?.endTime ?? patch.payload?.time ?? existing.endTime;
  existing.time = patch.payload?.time ?? existing.time;
  existing.lastModifiedTime = patch.payload?.metadata?.lastModifiedTime ?? now;
  existing.payload = patch.payload;
  existing.updatedAt = now;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** All locally mirrored records, newest first. */
export async function getAllLocalHealthRecords(): Promise<LocalHealthRecord[]> {
  const records = await loadRecords();
  return records.slice();
}

/** Records of a single type, newest first. */
export async function getLocalHealthRecordsByType(recordType: string): Promise<LocalHealthRecord[]> {
  const records = await loadRecords();
  return records.filter((record) => record.recordType === recordType);
}

/** Lookup by Health Connect ID (used by the change processor). */
export async function getLocalHealthRecordById(
  healthConnectId: string
): Promise<LocalHealthRecord | null> {
  const records = await loadRecords();
  const index = indexById.get(healthConnectId);
  return index == null ? null : records[index] ?? null;
}

/** Aggregate counts for the dashboard header / empty states. */
export async function getLocalDatabaseStats(): Promise<LocalDatabaseStats> {
  const records = await loadRecords();
  const byType: Record<string, number> = {};
  for (const record of records) {
    byType[record.recordType] = (byType[record.recordType] ?? 0) + 1;
  }
  return {
    total: records.length,
    byType,
    newestAt: records[0]?.startTime ?? records[0]?.time ?? null,
    trimmedAt: lastTrimmedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Inserts or updates many records with a single storage read and a single
 * `setItem`. This is the only write path used by the sync engine.
 */
export function upsertLocalHealthRecords(patches: LocalRecordPatch[]): Promise<WriteResult> {
  if (patches.length === 0) {
    return Promise.resolve({ changed: 0, trimmed: 0, error: null });
  }

  return enqueue(async () => {
    const records = await loadRecords();
    const now = new Date().toISOString();
    const newRecords: LocalHealthRecord[] = [];

    // Pass 1 — update known records in place (indices stay valid).
    for (const patch of patches) {
      const index = indexById.get(patch.healthConnectId);
      if (index != null && records[index]) {
        applyPatch(records[index], patch, now);
      } else {
        newRecords.push(toLocalRecord(patch, now));
      }
    }

    // Pass 2 — prepend the new records (newest first) and refresh the index.
    if (newRecords.length > 0) {
      records.unshift(...newRecords);
      rebuildIndex(records);
    }

    let trimmed = 0;
    if (records.length > MAX_LOCAL_RECORDS) {
      trimmed = records.length - MAX_LOCAL_RECORDS;
      records.length = MAX_LOCAL_RECORDS;
      rebuildIndex(records);
      lastTrimmedAt = now;
      console.log(`[HealthRecordsDB] Trimmed ${trimmed} oldest record(s) to stay within the cache cap`);
    }

    cache = records;
    const error = await persist(records);
    return { changed: patches.length, trimmed, error };
  });
}

/** Single-record convenience wrapper around {@link upsertLocalHealthRecords}. */
export async function upsertLocalHealthRecord(
  healthConnectId: string,
  recordType: string,
  payload: RecordPayload
): Promise<WriteResult> {
  return upsertLocalHealthRecords([{ healthConnectId, recordType, payload }]);
}

/** Removes many records by Health Connect ID with a single storage write. */
export function deleteLocalHealthRecordsByIds(healthConnectIds: string[]): Promise<WriteResult> {
  if (healthConnectIds.length === 0) {
    return Promise.resolve({ changed: 0, trimmed: 0, error: null });
  }

  return enqueue(async () => {
    const records = await loadRecords();
    const ids = new Set(healthConnectIds);
    const remaining = records.filter((record) => !ids.has(record.healthConnectId));
    const changed = records.length - remaining.length;

    if (changed === 0) {
      return { changed: 0, trimmed: 0, error: null };
    }

    cache = remaining;
    rebuildIndex(remaining);
    const error = await persist(remaining);
    return { changed, trimmed: 0, error };
  });
}

/** Single-record delete convenience wrapper. */
export async function deleteLocalHealthRecordByHCId(healthConnectId: string): Promise<boolean> {
  const result = await deleteLocalHealthRecordsByIds([healthConnectId]);
  return result.changed > 0;
}

/** Clears every locally cached record (Health Connect data itself is untouched). */
export function clearAllLocalHealthRecords(): Promise<void> {
  return enqueue(async () => {
    cache = [];
    rebuildIndex([]);
    lastTrimmedAt = null;
    try {
      await AsyncStorage.removeItem(HEALTH_RECORDS_STORAGE_KEY);
      console.log('[HealthRecordsDB] Local cache cleared');
    } catch (error) {
      console.error('[HealthRecordsDB] Failed to clear store:', error);
    }
  });
}

/** Drops the in-memory mirror so the next read hits storage again. */
export function invalidateLocalCache(): void {
  cache = null;
  rebuildIndex([]);
}

