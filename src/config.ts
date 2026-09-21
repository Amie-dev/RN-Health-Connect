import type { RecordType } from 'react-native-health-connect';

/**
 * Single source of truth for app-level behaviour constants.
 *
 * Everything that used to be duplicated in the screen / sync engine (record
 * type lists, page sizes, history windows, storage limits) lives here so the
 * UI, the database layer and the sync engine can never drift apart.
 */

/** Android package name — must stay in sync with `app.json -> expo.android.package`. */
export const APP_PACKAGE_NAME = 'com.healthconnect.app';

/** Record types that the sync engine keeps up to date automatically. */
export const SYNC_RECORD_TYPES: RecordType[] = [
  'Steps',
  'ActiveCaloriesBurned',
  'Distance',
  'Weight',
  'HeartRate',
  'BloodPressure',
  'Hydration',
  'SleepSession',
];

/** Record types offered in the "Live read" tab. */
export const LIVE_RECORD_TYPES: RecordType[] = [
  'Steps',
  'Weight',
  'HeartRate',
  'BloodPressure',
  'Hydration',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'Distance',
  'SleepSession',
  'BloodGlucose',
  'OxygenSaturation',
  'BodyTemperature',
];

/** Record types that can be written from the in-app data logger. */
export const LOGGABLE_RECORD_TYPES = [
  'Steps',
  'Weight',
  'HeartRate',
  'BloodPressure',
  'Hydration',
] as const;

export type LoggableRecordType = (typeof LOGGABLE_RECORD_TYPES)[number];

/** How far back the initial backfill / live read looks. */
export const HISTORY_WINDOW_DAYS = 30;

/** Page size used for Health Connect read requests (native max is generous, but this keeps IPC maps small). */
export const QUERY_PAGE_SIZE = 500;

/** Hard cap on pages fetched for one logical query, guards against infinite `pageToken` loops. */
export const MAX_QUERY_PAGES = 12;

/** Hard cap on `getChanges` iterations per record type. */
export const MAX_CHANGE_PAGES = 20;

/**
 * Upper bound of records mirrored in AsyncStorage. The local database is a
 * cache — Health Connect remains the source of truth — so the oldest rows are
 * dropped once the cap is reached to stay well inside the Android storage
 * quota and to keep the explorer list fast.
 */
export const MAX_LOCAL_RECORDS = 1500;

/** Granted-permission snapshots are cached to avoid one IPC round-trip per record row. */
export const PERMISSION_CACHE_TTL_MS = 4_000;

/** Milliseconds of "quiet time" after a write before the local echo is re-synced. */
export const POST_WRITE_SYNC_DELAY_MS = 600;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
