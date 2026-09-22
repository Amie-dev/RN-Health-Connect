import { useCallback, useEffect, useRef, useState } from 'react';
import { type RecordType } from 'react-native-health-connect';
import { queryHealthRecords, type TimeRangeFilter } from '../health-connect/records';
import { HISTORY_WINDOW_DAYS, MS_PER_DAY } from '../config';

export interface UseLiveRecordsResult {
  recordType: RecordType;
  setRecordType: (recordType: RecordType) => void;
  records: any[];
  loading: boolean;
  error: string | null;
  /** True when the provider had more rows than the page we read. */
  truncated: boolean;
  refresh: () => Promise<void>;
}

/**
 * Direct, read-only view of Health Connect for one record type (the "Live" tab).
 *
 * Two robustness details:
 *  - a request id guard prevents an older response from overwriting a newer one
 *    when the user taps through record types quickly;
 *  - a failure is surfaced as an error instead of an empty list.
 */
export function useLiveRecords(
  initialRecordType: RecordType = 'Steps',
  windowDays = HISTORY_WINDOW_DAYS,
  enabled = true
): UseLiveRecordsResult {
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);

    const endTime = new Date();
    const timeRangeFilter: TimeRangeFilter = {
      operator: 'between',
      startTime: new Date(endTime.getTime() - windowDays * MS_PER_DAY).toISOString(),
      endTime: endTime.toISOString(),
    };

    try {
      const page = await queryHealthRecords<any>(recordType, {
        timeRangeFilter,
        ascendingOrder: false,
      });
      if (!mounted.current || id !== requestId.current) return;
      setRecords(page.records);
      setError(page.error);
      setTruncated(!page.complete && !page.error);
    } catch (caught) {
      if (!mounted.current || id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setRecords([]);
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [recordType, windowDays]);

  // Re-reads whenever the selected type changes — but only once permissions
  // exist; before that every native read would just fail.
  useEffect(() => {
    if (!enabled) {
      setError(null);
      setRecords([]);
      return;
    }
    void refresh();
  }, [refresh, enabled]);

  return { recordType, setRecordType, records, loading, error, truncated, refresh };
}
