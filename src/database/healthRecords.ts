import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocalHealthRecord {
  localId: string;
  healthConnectId: string;
  recordType: string;
  dataOrigin?: string;
  startTime?: string;
  endTime?: string;
  time?: string;
  lastModifiedTime?: string;
  payload: any;
  createdAt: string;
  updatedAt: string;
}

const HEALTH_RECORDS_STORAGE_KEY = '@health_connect_records_db';

/**
 * Retrieves all stored local health records.
 */
export async function getAllLocalHealthRecords(): Promise<LocalHealthRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('[HealthRecordsDB] Failed to read health records DB:', error);
    return [];
  }
}

/**
 * Upserts a health record in the local database based on Health Connect ID.
 */
export async function upsertLocalHealthRecord(
  healthConnectId: string,
  recordType: string,
  payload: any
): Promise<LocalHealthRecord> {
  const records = await getAllLocalHealthRecords();
  const existingIndex = records.findIndex((r) => r.healthConnectId === healthConnectId);

  const now = new Date().toISOString();
  const startTime = payload.startTime || payload.time;
  const endTime = payload.endTime || payload.time;
  const dataOrigin = payload.metadata?.dataOrigin;
  const lastModifiedTime = payload.metadata?.lastModifiedTime || now;

  let updatedRecord: LocalHealthRecord;

  if (existingIndex >= 0) {
    updatedRecord = {
      ...records[existingIndex],
      recordType,
      dataOrigin: dataOrigin || records[existingIndex].dataOrigin,
      startTime: startTime || records[existingIndex].startTime,
      endTime: endTime || records[existingIndex].endTime,
      time: payload.time || records[existingIndex].time,
      lastModifiedTime,
      payload,
      updatedAt: now,
    };
    records[existingIndex] = updatedRecord;
  } else {
    updatedRecord = {
      localId: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      healthConnectId,
      recordType,
      dataOrigin,
      startTime,
      endTime,
      time: payload.time,
      lastModifiedTime,
      payload,
      createdAt: now,
      updatedAt: now,
    };
    records.unshift(updatedRecord);
  }

  try {
    await AsyncStorage.setItem(HEALTH_RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('[HealthRecordsDB] Failed to save updated record:', error);
  }

  return updatedRecord;
}

/**
 * Deletes a local health record by Health Connect ID.
 */
export async function deleteLocalHealthRecordByHCId(healthConnectId: string): Promise<boolean> {
  const records = await getAllLocalHealthRecords();
  const filtered = records.filter((r) => r.healthConnectId !== healthConnectId);
  const deleted = records.length !== filtered.length;

  if (deleted) {
    try {
      await AsyncStorage.setItem(HEALTH_RECORDS_STORAGE_KEY, JSON.stringify(filtered));
      console.log(`[HealthRecordsDB] Deleted local record with Health Connect ID ${healthConnectId}`);
    } catch (error) {
      console.error('[HealthRecordsDB] Failed to delete record:', error);
    }
  }

  return deleted;
}

/**
 * Retrieves records of a specific recordType.
 */
export async function getLocalHealthRecordsByType(recordType: string): Promise<LocalHealthRecord[]> {
  const records = await getAllLocalHealthRecords();
  return records.filter((r) => r.recordType === recordType);
}

/**
 * Clears all stored local health records.
 */
export async function clearAllLocalHealthRecords(): Promise<void> {
  await AsyncStorage.removeItem(HEALTH_RECORDS_STORAGE_KEY);
}
