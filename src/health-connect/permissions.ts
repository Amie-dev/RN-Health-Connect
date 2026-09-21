import {
  type Permission,
  type RecordType,
  requestPermission,
  getGrantedPermissions,
  revokeAllPermissions,
} from 'react-native-health-connect';
import { APP_PACKAGE_NAME, PERMISSION_CACHE_TTL_MS } from '../config';

/**
 * Every permission the app declares in `app.json`. Kept in one place so the
 * manifest, the UI and the sync engine cannot drift apart.
 */
export const APP_HEALTH_PERMISSIONS: Permission[] = [
  // Activity
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'write', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },

  // Body measurements
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'write', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'BodyFat' },

  // Vitals
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'write', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'write', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BodyTemperature' },

  // Sleep
  { accessType: 'read', recordType: 'SleepSession' },

  // Nutrition & hydration
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'Nutrition' },
];

export type AccessType = 'read' | 'write';

export interface PermissionStatus {
  /** Permissions the user has actually granted. */
  granted: Permission[];
  /** Declared permissions that are still missing. */
  missing: Permission[];
  /** True when every declared permission is granted. */
  hasAll: boolean;
  /** Timestamp of the check (ms) so the UI can show freshness. */
  checkedAt: number;
}

/**
 * `getGrantedPermissions()` costs a native IPC round-trip and the dashboard
 * renders hundreds of rows, so results are memoized for a few seconds and
 * invalidated whenever permissions are requested or revoked.
 */
let grantedCache: { at: number; granted: Permission[] } | null = null;

export function invalidatePermissionCache(): void {
  grantedCache = null;
}

/** Normalizes the wrapper's union type down to plain record permissions. */
function toRecordPermissions(
  permissions: ReadonlyArray<Permission | { recordType?: string }>
): Permission[] {
  return permissions.filter(
    (permission): permission is Permission =>
      typeof (permission as Permission).recordType === 'string'
  );
}

/** Returns granted permissions, cached for {@link PERMISSION_CACHE_TTL_MS}. */
export async function getGrantedPermissionsCached(force = false): Promise<Permission[]> {
  if (!force && grantedCache && Date.now() - grantedCache.at < PERMISSION_CACHE_TTL_MS) {
    return grantedCache.granted;
  }
  try {
    const granted = toRecordPermissions(await getGrantedPermissions());
    grantedCache = { at: Date.now(), granted };
    return granted;
  } catch (error) {
    console.error('[Permissions] getGrantedPermissions failed:', error);
    return grantedCache?.granted ?? [];
  }
}

/** Builds the `{ accessType, recordType }` pairs for a record type. */
export function permissionsForRecord(
  recordType: RecordType,
  accessTypes: AccessType[] = ['read']
): Permission[] {
  return accessTypes.map((accessType) => ({ accessType, recordType }));
}

/** Convenience: the app's own package name (matches record `dataOrigin`). */
export const APP_DATA_ORIGIN = APP_PACKAGE_NAME;

/**
 * Checks currently granted permissions against the required set.
 * Never throws — a hard failure is reported as "everything missing" so the UI
 * can offer the permission prompt again.
 */
export async function checkHealthPermissions(
  requiredPermissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<PermissionStatus> {
  const granted = await getGrantedPermissionsCached(true);

  const missing = requiredPermissions.filter(
    (required) =>
      !granted.some(
        (grantedPermission) =>
          grantedPermission.recordType === required.recordType &&
          grantedPermission.accessType === required.accessType
      )
  );

  return { granted, missing, hasAll: missing.length === 0, checkedAt: Date.now() };
}

/** Helper to check a single record type / access type pair. */
export function isPermissionGranted(
  grantedPermissions: ReadonlyArray<Permission> | undefined,
  recordType: string,
  accessType: AccessType = 'read'
): boolean {
  if (!grantedPermissions || grantedPermissions.length === 0) return false;
  return grantedPermissions.some(
    (permission) =>
      permission.recordType === recordType && permission.accessType === accessType
  );
}

/**
 * Requests the given permissions and returns everything that is granted
 * afterwards (Health Connect only ever returns the granted subset).
 */
export async function requestHealthPermissions(
  permissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<Permission[]> {
  try {
    const result = toRecordPermissions(await requestPermission(permissions));
    invalidatePermissionCache();
    console.log(`[Permissions] Granted ${result.length}/${permissions.length} permissions`);
    return result;
  } catch (error) {
    invalidatePermissionCache();
    console.error('[Permissions] requestPermission failed:', error);
    throw error;
  }
}

/**
 * Requests read + write permissions for a single record type.
 */
export async function requestPermissionsForRecord(
  recordType: RecordType,
  accessTypes: AccessType[] = ['read', 'write']
): Promise<Permission[]> {
  return requestHealthPermissions(permissionsForRecord(recordType, accessTypes));
}

/**
 * Revokes all permissions for this app.
 *
 * Health Connect applies the revocation only after the app process restarts —
 * a documented platform limitation — so callers must tell the user to restart.
 */
export async function revokeAppPermissions(): Promise<boolean> {
  try {
    await revokeAllPermissions();
    invalidatePermissionCache();
    console.log('[Permissions] revokeAllPermissions requested; restart required to take effect');
    return true;
  } catch (error) {
    console.error('[Permissions] revokeAllPermissions failed:', error);
    return false;
  }
}
