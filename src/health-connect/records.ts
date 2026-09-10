import {
  insertRecords,
  readRecord,
  readRecords,
  deleteRecordsByUuids,
  deleteRecordsByTimeRange,
  RecordType,
  ReadRecordsOptions,
} from 'react-native-health-connect';

export type TimeRangeFilter =
  | { operator: 'between'; startTime: string; endTime: string }
  | { operator: 'after'; startTime: string }
  | { operator: 'before'; endTime: string };

export interface ReadRecordsFilterOptions {
  timeRangeFilter: TimeRangeFilter;
  dataOriginFilter?: string[];
  ascendingOrder?: boolean;
  pageSize?: number;
  pageToken?: string;
}

export interface ReadRecordsResponse<T = any> {
  records: T[];
  pageToken?: string;
}

/**
 * Inserts one or more health records into Health Connect.
 * Returns array of created Health Connect record IDs.
 */
export async function insertHealthRecords(records: any[]): Promise<string[]> {
  try {
    const recordIds = await insertRecords(records);
    console.log('[Records] Inserted record IDs:', recordIds);
    return recordIds;
  } catch (error) {
    console.error('[Records] Insert failed:', error);
    throw error;
  }
}

/**
 * Reads a single health record by record type and Health Connect record ID.
 */
export async function readHealthRecord<T = any>(
  recordType: RecordType,
  recordId: string
): Promise<T> {
  try {
    const record = await readRecord(recordType, recordId);
    return record as unknown as T;
  } catch (error) {
    console.error(`[Records] Read single record failed for ${recordType} (${recordId}):`, error);
    throw error;
  }
}

/**
 * Reads multiple records of a specified record type with filters.
 */
export async function queryHealthRecords<T = any>(
  recordType: RecordType,
  options: ReadRecordsFilterOptions
): Promise<ReadRecordsResponse<T>> {
  try {
    const readOptions: ReadRecordsOptions = {
      timeRangeFilter: options.timeRangeFilter as any,
      dataOriginFilter: options.dataOriginFilter,
      ascendingOrder: options.ascendingOrder ?? false,
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
    };
    const response = await readRecords(recordType, readOptions);
    return response as unknown as ReadRecordsResponse<T>;
  } catch (error) {
    console.error(`[Records] Query records failed for ${recordType}:`, error);
    return { records: [] };
  }
}

/**
 * Deletes specific Health Connect records by their IDs.
 */
export async function deleteHealthRecordsByIds(
  recordType: RecordType,
  recordIds: string[],
  clientRecordIds: string[] = []
): Promise<void> {
  try {
    await deleteRecordsByUuids(recordType, recordIds, clientRecordIds);
    console.log(`[Records] Deleted ${recordIds.length} records for ${recordType}`);
  } catch (error) {
    console.error(`[Records] Delete by IDs failed for ${recordType}:`, error);
    throw error;
  }
}

/**
 * Deletes records of a specified type within a given time range.
 */
export async function deleteHealthRecordsByTimeRange(
  recordType: RecordType,
  timeRangeFilter: TimeRangeFilter
): Promise<void> {
  try {
    await deleteRecordsByTimeRange(recordType, timeRangeFilter as any);
    console.log(`[Records] Deleted records by time range for ${recordType}`);
  } catch (error) {
    console.error(`[Records] Delete by time range failed for ${recordType}:`, error);
    throw error;
  }
}

// ----------------------------------------------------
// Category-specific convenience helper write methods
// ----------------------------------------------------

export async function logStepsRecord(count: number, startTime: string, endTime: string): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Steps',
      count,
      startTime,
      endTime,
    },
  ]);
}

export async function logWeightRecord(weightInKg: number, time: string = new Date().toISOString()): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Weight',
      weight: {
        value: weightInKg,
        unit: 'kilograms',
      },
      time,
    },
  ]);
}

export async function logHeartRateRecord(bpm: number, time: string = new Date().toISOString()): Promise<string[]> {
  const dateObj = new Date(time);
  const startTime = dateObj.toISOString();
  const endTime = new Date(dateObj.getTime() + 1000).toISOString();

  return insertHealthRecords([
    {
      recordType: 'HeartRate',
      samples: [
        {
          beatsPerMinute: bpm,
          time: startTime,
        },
      ],
      startTime,
      endTime,
    },
  ]);
}

export async function logBloodPressureRecord(
  systolicMmHg: number,
  diastolicMmHg: number,
  time: string = new Date().toISOString()
): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'BloodPressure',
      systolic: {
        value: systolicMmHg,
        unit: 'millimetersOfMercury',
      },
      diastolic: {
        value: diastolicMmHg,
        unit: 'millimetersOfMercury',
      },
      time,
    },
  ]);
}

export async function logHydrationRecord(liters: number, startTime: string, endTime: string): Promise<string[]> {
  return insertHealthRecords([
    {
      recordType: 'Hydration',
      volume: {
        value: liters,
        unit: 'liters',
      },
      startTime,
      endTime,
    },
  ]);
}
