import {
  Permission,
  requestPermission,
  getGrantedPermissions,
  revokeAllPermissions,
} from 'react-native-health-connect';

export const APP_HEALTH_PERMISSIONS: Permission[] = [
  // Activity
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'write', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },

  // Body Measurements
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

  // Nutrition & Hydration
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'Nutrition' },
];

export interface PermissionStatusResult {
  grantedPermissions: any[];
  hasAll: boolean;
  missingPermissions: Permission[];
}

/**
 * Requests the specified array of Health Connect permissions.
 */
export async function requestHealthPermissions(
  permissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<any[]> {
  try {
    const granted = await requestPermission(permissions);
    console.log('[Permissions] Requested and granted:', granted.length, 'permissions');
    return granted;
  } catch (error) {
    console.error('[Permissions] Error requesting permissions:', error);
    throw error;
  }
}

/**
 * Checks currently granted permissions against required permissions.
 */
export async function checkHealthPermissions(
  requiredPermissions: Permission[] = APP_HEALTH_PERMISSIONS
): Promise<PermissionStatusResult> {
  try {
    const grantedPermissions = await getGrantedPermissions();

    const missingPermissions = requiredPermissions.filter(
      (required) =>
        !grantedPermissions.some(
          (granted: any) =>
            granted.recordType === required.recordType &&
            granted.accessType === required.accessType
        )
    );

    const hasAll = missingPermissions.length === 0;

    return {
      grantedPermissions,
      hasAll,
      missingPermissions,
    };
  } catch (error) {
    console.error('[Permissions] Error checking granted permissions:', error);
    return {
      grantedPermissions: [],
      hasAll: false,
      missingPermissions: requiredPermissions,
    };
  }
}


/**
 * Helper to check if a specific record type and access type permission is granted.
 */
export function isPermissionGranted(
  grantedPermissions: any[],
  recordType: string,
  accessType: 'read' | 'write' = 'read'
): boolean {
  if (!Array.isArray(grantedPermissions)) return false;
  return grantedPermissions.some(
    (p: any) => p.recordType === recordType && p.accessType === accessType
  );
}

/**
 * Requests permissions specifically for a single record type (read and/or write).
 */
export async function requestPermissionsForRecord(
  recordType: string,
  accessTypes: ('read' | 'write')[] = ['read', 'write']
): Promise<any[]> {
  const permissionsToRequest: Permission[] = accessTypes.map((accessType) => ({
    accessType,
    recordType: recordType as any,
  }));
  return requestHealthPermissions(permissionsToRequest);
}

/**
 * Revokes all granted permissions for this application.
 */
export async function revokeAppPermissions(): Promise<void> {
  try {
    await revokeAllPermissions();
    console.log('[Permissions] All permissions revoked successfully.');
  } catch (error) {
    console.error('[Permissions] Failed to revoke permissions:', error);
  }
}

