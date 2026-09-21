import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearAllLocalHealthRecords,
  getAllLocalHealthRecords,
  getLocalDatabaseStats,
  type LocalDatabaseStats,
  type LocalHealthRecord,
} from '../database/healthRecords';

export interface UseLocalRecordsResult {
  records: LocalHealthRecord[];
  stats: LocalDatabaseStats | null;
  loading: boolean;
  error: string | null;
  /** Re-reads the local mirror (cheap: served from an in-memory cache). */
  refresh: () => Promise<void>;
  /** Removes every cached record. Health Connect data is untouched. */
  clear: () => Promise<void>;
}

/**
 * Reads the locally mirrored records.
 *
 * The database module keeps an in-memory mirror, so `refresh()` is a cheap
 * synchronous-ish operation rather than a full AsyncStorage parse.
 */
export function useLocalRecords(): UseLocalRecordsResult {
  const [records, setRecords] = useState<LocalHealthRecord[]>([]);
  const [stats, setStats] = useState<LocalDatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Guards against overlapping reads (a sync finishing while a pull-to-refresh runs).
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const task = (async () => {
      setLoading(true);
      try {
        const [nextRecords, nextStats] = await Promise.all([
          getAllLocalHealthRecords(),
          getLocalDatabaseStats(),
        ]);
        if (mounted.current) {
          setRecords(nextRecords);
          setStats(nextStats);
          setError(null);
        }
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : String(caught);
        if (mounted.current) setError(text);
      } finally {
        if (mounted.current) setLoading(false);
        inFlight.current = null;
      }
    })();

    inFlight.current = task;
    return task;
  }, []);

  const clear = useCallback(async () => {
    await clearAllLocalHealthRecords();
    await refresh();
  }, [refresh]);

  return { records, stats, loading, error, refresh, clear };
}
