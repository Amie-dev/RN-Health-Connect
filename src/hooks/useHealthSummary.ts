import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealthSummary, type HealthSummary } from '../health-connect/aggregation';

export type SummaryRange = 'today' | 'week' | 'month';

export interface UseHealthSummaryResult {
  summary: HealthSummary | null;
  range: SummaryRange;
  setRange: (range: SummaryRange) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const RANGE_DAYS: Record<SummaryRange, number> = {
  today: 1,
  week: 7,
  month: 30,
};

function rangeStart(range: SummaryRange): Date {
  const start = new Date();
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Resolves the dashboard metrics for the selected range.
 *
 * Requests are sequenced so a fast range switch cannot be overwritten by a
 * slower, earlier response (last-write-wins on the request id).
 */
export function useHealthSummary(initialRange: SummaryRange = 'today'): UseHealthSummaryResult {
  const [range, setRange] = useState<SummaryRange>(initialRange);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const next = await getHealthSummary(rangeStart(range), new Date());
      if (!mounted.current || id !== requestId.current) return;
      setSummary(next);
      setError(next.partial ? 'Some metrics could not be read from Health Connect.' : null);
    } catch (caught) {
      if (!mounted.current || id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, range, setRange, loading, error, refresh };
}
