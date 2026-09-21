import {
  insertRecords,
  readRecord,
  readRecords,
  deleteRecordsByUuids,
  deleteRecordsByTimeRange,
  type BloodPressureRecord,
  type HealthConnectRecord,
  type HeartRateRecord,
  type HydrationRecord,
  type Metadata,
  type ReadRecordsOptions,
  type RecordResult,
  type RecordType,
  type StepsRecord,
  type WeightRecord,
} from 'react-native-health-connect';
import { MAX_QUERY_PAGES, QUERY_PAGE_SIZE } from '../config';

export type TimeRangeFilter =
  | { operator: 'between'; startTime: string; endTime: string }
  | { operator: 'after'; startTime: string }
  | { operator: 'before'; endTime: string };

export interface QueryOptions {
  timeRangeFilter: TimeRangeFilter;
  dataOriginFilter?: string[];
  ascendingOrder?: boolean;
  pageSize?: number;
  pageToken?: string;
}

export interface QueryResult<T> {
  records: T[];
  /** Cursor for the next page, when the provider had more rows. */
  pageToken?: string;
  /** Non-null when the native read failed (missing permission, provider busy, ...). */
  error: string | null;
  /** False when the result was cut short by the page cap or a mid-pagination failure. */
  complete: boolean;
}

/** Health Connect body positions (mirrors `androidx.health.connect.BodyPosition`). */
export const BODY_POSITION = {
  UNKNOWN: 0,
  STANDING: 1,
  SITTING: 2,
  LYING_DOWN: 3,
} as const;

/** Health Connect measurement locations (mirrors `androidx.health.connect.MeasurementLocation`). */
export const MEASUREMENT_LOCATION = {
  UNKNOWN: 0,
  LEFT_WRIST: 1,
  RIGHT_WRIST: 2,
  LEFT_ELBOW: 3,
  RIGHT_ELBOW: 4,
  LEFT_HIP: 5,
  RIGHT_HIP: 6,
} as const;

/** Turns anything thrown by the native layer into a readable, UI-safe string. */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown Health Connect error';
  }
}

/**
 * Reads a single page of records.
 *
 * Overloaded so a literal record type yields precisely typed records, while
 * callers that treat payloads generically can still request a loose type.
 *
 * Unlike the previous implementation this never hides failures: callers get an
 * `error` string they can surface, so a denied permission no longer looks like
 * "you have no data".
 */
export function queryHealthRecords<T extends RecordType>(
  recordType: T,
  options: QueryOptions
): Promise<QueryResult<RecordResult<T>>>;
export function queryHealthRecords<T>(
  recordType: RecordType,
  options: QueryOptions
): Promise<QueryResult<T>>;
export async function queryHealthRecords(
  recordType: RecordType,
  options: QueryOptions
): Promise<QueryResult<any>> {
  const readOptions: ReadRecordsOptions = {
    timeRangeFilter: options.timeRangeFilter,
    dataOriginFilter: options.dataOriginFilter,
    ascendingOrder: options.ascendingOrder ?? false,
    pageSize: options.pageSize ?? QUERY_PAGE_SIZE,
    pageToken: options.pageToken,
  };

  try {
    const response = await readRecords(recordType, readOptions);
    return {
      records: response.records ?? [],
      pageToken: response.pageToken,
      error: null,
      complete: !response.pageToken,
    };
  } catch (error) {
    const message = describeError(error);
    console.error(`[Records] readRecords failed for ${recordType}:`, message);
    return { records: [], error: message, complete: false };
  }
}

/**
 * Reads every page of a query, following `pageToken` until the provider is
 * exhausted or {@link MAX_QUERY_PAGES} is reached.
 *
 * This is what fixes the silent truncation the previous single-page reads had:
 * a 30-day backfill for a busy user easily exceeds one page.
 */
export function readAllHealthRecords<T extends RecordType>(
  recordType: T,
  options: QueryOptions
): Promise<QueryResult<RecordResult<T>>>;
export function readAllHealthRecords<T>(
  recordType: RecordType,
  options: QueryOptions
): Promise<QueryResult<T>>;
export async function readAllHealthRecords(
  recordType: RecordType,
  options: QueryOptions
): Promise<QueryResult<any>> {
  const records: any[] = [];
  const pageSize = options.pageSize ?? QUERY_PAGE_SIZE;
  let pageToken: string | undefined;
  let pages = 0;

  while (pages < MAX_QUERY_PAGES) {
    const page = await queryHealthRecords<any>(recordType, { ...options, pageSize, pageToken });

    if (page.error) {
      return { records, pageToken, error: page.error, complete: false };
    }

    records.push(...page.records);
    pages += 1;

    if (!page.pageToken) {
      return { records, error: null, complete: true };
    }
    pageToken = page.pageToken;
  }

  console.warn(
    `[Records] Page cap (${MAX_QUERY_PAGES}) reached for ${recordType}; returning ${records.length} records`
  );
  return { records, pageToken, error: null, complete: false };
}

/**
 * Reads one record by Health Connect ID. Returns null instead of throwing when
 * the record was deleted in the meantime.
 */
export async function readHealthRecord<T = HealthConnectRecord>(
  recordType: RecordType,
  recordId: string
): Promise<T | null> {
  try {
    return (await readRecord(recordType, recordId)) as unknown as T;
  } catch (error) {
    console.warn(`[Records] readRecord failed for ${recordType}/${recordId}:`, describeError(error));
    return null;
  }
}

/** Writes records to Health Connect and returns the created record IDs. */
export async function insertHealthRecords(records: HealthConnectRecord[]): Promise<string[]> {
  if (records.length === 0) return [];
  const recordIds = await insertRecords(records);
  console.log(`[Records] Inserted ${recordIds.length} record(s)`);
  return recordIds;
}

// ---------------------------------------------------------------------------
// Convenience writers
//
// Payload shapes below use the wrapper's own record types, so a wrong unit or
// a missing required field is now a compile-time error instead of a runtime
// insert failure.
// ---------------------------------------------------------------------------

export interface LogOptions {
  /** Override the record timestamp (ISO string). Defaults to now. */
  time?: string;
  /** Optional explicit client record ID (see {@link newClientRecordId}). */
  clientRecordId?: string;
  clientRecordVersion?: number;
}

/**
 * Health Connect treats `clientRecordId` as the writer's own primary key: the
 * same ID overwrites the previous record instead of creating a duplicate. That
 * makes a double-tapped "Save" idempotent instead of inserting two records.
 */
export function newClientRecordId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildMetadata(options: LogOptions, prefix: string): Metadata {
  return {
    clientRecordId: options.clientRecordId ?? newClientRecordId(prefix),
    clientRecordVersion: options.clientRecordVersion ?? 1,
  };
}

/** Throws a user-facing error for values Health Connect would reject anyway. */
function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Enter a valid ${label} greater than zero.`);
  }
  return value;
}

/** Logs a step record covering `[startTime, endTime)`. */
export async function logStepsRecord(
  count: number,
  startTime: string,
  endTime: string,
  options: LogOptions = {}
): Promise<string[]> {
  const record: StepsRecord = {
    recordType: 'Steps',
    count: Math.max(0, Math.round(requirePositive(count, 'step count'))),
    startTime,
    endTime,
    metadata: buildMetadata(options, 'steps'),
  };
  return insertHealthRecords([record]);
}

/** Logs a body weight measurement (kilograms). */
export async function logWeightRecord(
  weightInKg: number,
  time: string = new Date().toISOString(),
  options: LogOptions = {}
): Promise<string[]> {
  const record: WeightRecord = {
    recordType: 'Weight',
    weight: { value: requirePositive(weightInKg, 'weight'), unit: 'kilograms' },
    time,
    metadata: buildMetadata(options, 'weight'),
  };
  return insertHealthRecords([record]);
}

/** Logs a single heart-rate sample. The interval is 1 second wide, as required by Health Connect. */
export async function logHeartRateRecord(
  beatsPerMinute: number,
  time: string = new Date().toISOString(),
  options: LogOptions = {}
): Promise<string[]> {
  const startTime = new Date(time).toISOString();
  const endTime = new Date(new Date(time).getTime() + 1000).toISOString();
  const record: HeartRateRecord = {
    recordType: 'HeartRate',
    samples: [{ beatsPerMinute: Math.round(requirePositive(beatsPerMinute, 'heart rate')), time: startTime }],
    startTime,
    endTime,
    metadata: buildMetadata(options, 'heartrate'),
  };
  return insertHealthRecords([record]);
}

/** Logs a blood pressure reading (mmHg). */
export async function logBloodPressureRecord(
  systolicMmHg: number,
  diastolicMmHg: number,
  time: string = new Date().toISOString(),
  options: LogOptions = {}
): Promise<string[]> {
  const systolic = Math.round(requirePositive(systolicMmHg, 'systolic pressure'));
  const diastolic = Math.round(requirePositive(diastolicMmHg, 'diastolic pressure'));
  if (diastolic >= systolic) {
    throw new Error('Diastolic pressure must be lower than systolic pressure.');
  }

  const record: BloodPressureRecord = {
    recordType: 'BloodPressure',
    systolic: { value: systolic, unit: 'millimetersOfMercury' },
    diastolic: { value: diastolic, unit: 'millimetersOfMercury' },
    // Health Connect requires both fields; UNKNOWN is the safe default for a manual entry.
    bodyPosition: BODY_POSITION.UNKNOWN,
    measurementLocation: MEASUREMENT_LOCATION.LEFT_WRIST,
    time,
    metadata: buildMetadata(options, 'bloodpressure'),
  };
  return insertHealthRecords([record]);
}

/** Logs a hydration record (liters) covering `[startTime, endTime)`. */
export async function logHydrationRecord(
  liters: number,
  startTime: string,
  endTime: string,
  options: LogOptions = {}
): Promise<string[]> {
  const record: HydrationRecord = {
    recordType: 'Hydration',
    volume: { value: requirePositive(liters, 'water volume'), unit: 'liters' },
    startTime,
    endTime,
    metadata: buildMetadata(options, 'hydration'),
  };
  return insertHealthRecords([record]);
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** Deletes specific Health Connect records by ID. */
export async function deleteHealthRecordsByIds(
  recordType: RecordType,
  recordIds: string[],
  clientRecordIds: string[] = []
): Promise<void> {
  if (recordIds.length === 0 && clientRecordIds.length === 0) return;
  await deleteRecordsByUuids(recordType, recordIds, clientRecordIds);
  console.log(`[Records] Deleted ${recordIds.length} ${recordType} record(s) by ID`);
}

/** Deletes every record of a type inside a time range. */
export async function deleteHealthRecordsByTimeRange(
  recordType: RecordType,
  timeRangeFilter: TimeRangeFilter
): Promise<void> {
  await deleteRecordsByTimeRange(recordType, timeRangeFilter);
  console.log(`[Records] Deleted ${recordType} records in range`);
}

