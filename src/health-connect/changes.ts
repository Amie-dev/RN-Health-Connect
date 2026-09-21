import { getChanges, type RecordType } from 'react-native-health-connect';
import { MAX_CHANGE_PAGES } from '../config';
import { describeError, type TimeRangeFilter } from './records';

export type { TimeRangeFilter };

/**
 * Minimal, stable shape of a record delivered through the Changes API. The
 * wrapper's own `HealthConnectRecordResult` union is intentionally not reused
 * here so the sync engine never breaks when the wrapper changes field-level
 * result types (e.g. `Mass` -> `MassResult`).
 */
export type HealthChangeRecord = {
  recordType: string;
  metadata?: {
    id?: string;
    dataOrigin?: string;
    lastModifiedTime?: string;
    clientRecordId?: string;
  };
} & Record<string, any>;

export type HealthChange =
  | { type: 'upsert'; record: HealthChangeRecord }
  | { type: 'delete'; recordId: string };

export interface ChangesPage {
  changes: HealthChange[];
  /** Token to use for the NEXT call. Unchanged when the call failed. */
  nextChangesToken: string;
  hasMore: boolean;
  tokenExpired: boolean;
  /** Non-null when the native call failed; the token must not be advanced. */
  error: string | null;
}

function normalizeChanges(upsertionChanges: unknown, deletionChanges: unknown): HealthChange[] {
  const changes: HealthChange[] = [];

  if (Array.isArray(upsertionChanges)) {
    for (const item of upsertionChanges) {
      const record = (item as { record?: unknown })?.record;
      if (record) {
        changes.push({ type: 'upsert', record: record as HealthChangeRecord });
      }
    }
  }

  if (Array.isArray(deletionChanges)) {
    for (const item of deletionChanges) {
      const recordId = (item as { recordId?: string })?.recordId;
      if (recordId) {
        changes.push({ type: 'delete', recordId });
      }
    }
  }

  return changes;
}

export interface ChangesTokenResult {
  token: string | null;
  error: string | null;
}

/**
 * Requests a brand new Changes token, which starts change tracking from now.
 * Returns an error string instead of throwing so the sync engine can record a
 * per-record-type failure and keep going with the remaining types.
 */
export async function fetchChangesToken(
  recordTypes: RecordType[],
  dataOriginFilter?: string[]
): Promise<ChangesTokenResult> {
  try {
    const response = await getChanges({ recordTypes, dataOriginFilter });
    console.log(`[Changes] New token for [${recordTypes.join(', ')}]`);
    return { token: response.nextChangesToken, error: null };
  } catch (error) {
    const message = describeError(error);
    console.error(`[Changes] Token request failed for [${recordTypes.join(', ')}]:`, message);
    return { token: null, error: message };
  }
}

/**
 * Retrieves one page of changes using an existing Changes token.
 * The token is only safe to advance when `error === null`.
 */
export async function fetchChanges(changesToken: string): Promise<ChangesPage> {
  try {
    const response = await getChanges({ changesToken });
    return {
      changes: normalizeChanges(response.upsertionChanges, response.deletionChanges),
      nextChangesToken: response.nextChangesToken,
      hasMore: response.hasMore,
      tokenExpired: response.changesTokenExpired,
      error: null,
    };
  } catch (error) {
    const message = describeError(error);
    console.error('[Changes] fetchChanges failed:', message);
    return {
      changes: [],
      nextChangesToken: changesToken,
      hasMore: false,
      tokenExpired: false,
      error: message,
    };
  }
}

export interface AccumulatedChanges {
  changes: HealthChange[];
  finalToken: string;
  tokenExpired: boolean;
  error: string | null;
  /** False when pagination stopped early (page cap or failure). */
  complete: boolean;
}

/**
 * Drains every pending change by walking `hasMore`, bounded by
 * {@link MAX_CHANGE_PAGES} so a misbehaving provider can never hang the app.
 * The returned token is the first token that was NOT fully processed, so a
 * retry re-reads the unprocessed tail instead of losing changes.
 */
export async function fetchAllAccumulatedChanges(initialToken: string): Promise<AccumulatedChanges> {
  const changes: HealthChange[] = [];
  let currentToken = initialToken;
  let pages = 0;

  while (pages < MAX_CHANGE_PAGES) {
    const page = await fetchChanges(currentToken);

    if (page.error) {
      return { changes, finalToken: initialToken, tokenExpired: false, error: page.error, complete: false };
    }

    if (page.tokenExpired) {
      return { changes: [], finalToken: initialToken, tokenExpired: true, error: null, complete: false };
    }

    changes.push(...page.changes);
    pages += 1;

    if (!page.hasMore) {
      return {
        changes,
        finalToken: page.nextChangesToken,
        tokenExpired: false,
        error: null,
        complete: true,
      };
    }

    currentToken = page.nextChangesToken;
  }

  console.warn(`[Changes] Page cap (${MAX_CHANGE_PAGES}) reached; ${changes.length} changes buffered`);
  return { changes, finalToken: currentToken, tokenExpired: false, error: null, complete: false };
}
