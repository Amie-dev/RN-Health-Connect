# Chapter 5: Changes API & Sync Tokens

This chapter covers requesting Health Connect Changes tokens, retrieving incremental upserts/deletes, and paginated `getChanges()` iteration.

**File Path:** [src/health-connect/changes.ts](file:///home/aminul/development/RN_Health_Connect/src/health-connect/changes.ts)

```typescript
import {
  getChanges,
  RecordType,
  GetChangesResults,
} from 'react-native-health-connect';

export interface ChangesResponse {
  changes: Array<
    | {
        type: 'upsert';
        record: {
          recordType: string;
          metadata?: {
            id?: string;
            dataOrigin?: string;
            lastModifiedTime?: string;
            clientRecordId?: string;
          };
          [key: string]: any;
        };
      }
    | {
        type: 'delete';
        recordId: string;
      }
  >;
  nextChangesToken: string;
  hasMore: boolean;
  changesTokenExpired: boolean;
}

/**
 * Requests a new Changes Token for a specific record type or list of record types.
 */
export async function fetchChangesToken(
  recordTypes: RecordType[],
  dataOriginFilter?: string[]
): Promise<string> {
  try {
    const res: GetChangesResults = await getChanges({
      recordTypes,
      dataOriginFilter,
    });
    console.log(`[Changes] Created Changes Token for [${recordTypes.join(', ')}]`);
    return res.nextChangesToken;
  } catch (error) {
    console.error(`[Changes] Failed to get Changes Token for [${recordTypes.join(', ')}]:`, error);
    throw error;
  }
}

/**
 * Retrieves changes using an existing Changes Token.
 */
export async function fetchChanges(changesToken: string): Promise<ChangesResponse> {
  try {
    const res: GetChangesResults = await getChanges({ changesToken });

    const changes: ChangesResponse['changes'] = [];

    if (res.upsertionChanges) {
      for (const item of res.upsertionChanges) {
        changes.push({
          type: 'upsert',
          record: item.record as any,
        });
      }
    }

    if (res.deletionChanges) {
      for (const item of res.deletionChanges) {
        changes.push({
          type: 'delete',
          recordId: item.recordId,
        });
      }
    }

    return {
      changes,
      nextChangesToken: res.nextChangesToken,
      hasMore: res.hasMore,
      changesTokenExpired: res.changesTokenExpired,
    };
  } catch (error) {
    console.error('[Changes] Failed to fetch changes using token:', error);
    throw error;
  }
}

/**
 * Helper to retrieve ALL accumulated changes by iteratively fetching while hasMore is true.
 */
export async function fetchAllAccumulatedChanges(initialToken: string): Promise<{
  allChanges: ChangesResponse['changes'];
  finalToken: string;
  tokenExpired: boolean;
}> {
  let currentToken = initialToken;
  const allChanges: ChangesResponse['changes'] = [];

  while (true) {
    const res = await fetchChanges(currentToken);

    if (res.changesTokenExpired) {
      return {
        allChanges: [],
        finalToken: currentToken,
        tokenExpired: true,
      };
    }

    if (res.changes && res.changes.length > 0) {
      allChanges.push(...res.changes);
    }

    currentToken = res.nextChangesToken;

    if (!res.hasMore) {
      break;
    }
  }

  return {
    allChanges,
    finalToken: currentToken,
    tokenExpired: false,
  };
}
```

---

## Detailed Code Explanation

1. **Token Acquisition vs Retrieval**:
   - Calling `getChanges({ recordTypes })` without a token acquires a new sync cursor token representing the current state.
   - Calling `getChanges({ changesToken })` reads incremental changes created, updated, or deleted since that cursor.
2. **Paginated Retrieval Loop (`fetchAllAccumulatedChanges`)**:
   - **Crucial Rule**: A single call to `getChanges()` might not return all accumulated changes if there is a large backlog. The caller must continue retrieving while `res.hasMore` is `true`.
3. **Token Expiration Handling**:
   - Health Connect tokens expire after 30 days. If `res.changesTokenExpired` is `true`, the application triggers recovery.
