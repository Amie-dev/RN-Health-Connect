import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SdkAvailabilityStatus,
  type Permission,
  type RecordType,
} from 'react-native-health-connect';
import {
  getClientState,
  openDataManagement,
  openSettings,
  resetInitializationState,
} from '../health-connect/client';
import {
  APP_HEALTH_PERMISSIONS,
  checkHealthPermissions,
  isPermissionGranted,
  requestHealthPermissions,
  requestPermissionsForRecord,
  revokeAppPermissions,
  type AccessType,
  type PermissionStatus,
} from '../health-connect/permissions';

export type HealthConnectPhase = 'checking' | 'unavailable' | 'update_required' | 'ready';

export interface UseHealthConnectResult {
  /** Coarse state used to pick the screen's top-level UI. */
  phase: HealthConnectPhase;
  status: number | null;
  initialized: boolean;
  message: string;
  permissions: Permission[];
  missing: Permission[];
  hasAllPermissions: boolean;
  grantedCount: number;
  totalCount: number;
  busy: boolean;
  error: string | null;
  /** (Re)runs SDK availability + initialization. */
  initialize: () => Promise<boolean>;
  /** Requests every declared permission. */
  requestAllPermissions: () => Promise<PermissionStatus>;
  /** Requests read (+write) access for a single record type. */
  requestForRecord: (
    recordType: RecordType,
    accessTypes?: AccessType[]
  ) => Promise<PermissionStatus>;
  /** Cheap, cached check used by list rows. */
  hasPermission: (recordType: string, accessType?: AccessType) => boolean;
  openSystemSettings: () => Promise<void>;
  openDataManagementScreen: () => Promise<void>;
  revokePermissions: () => Promise<boolean>;
}

/**
 * Owns everything related to the Health Connect SDK: availability,
 * initialization and the permission lifecycle.
 *
 * All state updates are guarded against unmounts, so a slow native call can
 * never produce a "setState on unmounted component" warning or a stuck spinner.
 */
export function useHealthConnect(): UseHealthConnectResult {
  const [phase, setPhase] = useState<HealthConnectPhase>('checking');
  const [status, setStatus] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState('Checking Health Connect…');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Refreshes the granted-permission snapshot (hits the native layer). */
  const refreshPermissions = useCallback(async (): Promise<PermissionStatus> => {
    const next = await checkHealthPermissions();
    if (mounted.current) setPermissionStatus(next);
    return next;
  }, []);

  const initialize = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const client = await getClientState();
      if (!mounted.current) return client.initialized;

      setStatus(client.status);
      setInitialized(client.initialized);
      setMessage(client.message);

      if (client.status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        setPhase('update_required');
        return false;
      }
      if (!client.available) {
        setPhase('unavailable');
        return false;
      }

      await refreshPermissions();
      if (mounted.current) setPhase(client.initialized ? 'ready' : 'unavailable');
      return client.initialized;
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : String(caught);
      if (mounted.current) {
        setError(text);
        setPhase('unavailable');
      }
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refreshPermissions]);

  // Initial availability check.
  useEffect(() => {
    void initialize();
  }, [initialize]);

  const requestAllPermissions = useCallback(async (): Promise<PermissionStatus> => {
    setBusy(true);
    setError(null);
    try {
      await requestHealthPermissions();
      return await refreshPermissions();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : String(caught);
      if (mounted.current) setError(text);
      // The dialog may have been dismissed: report the current truth anyway.
      return refreshPermissions();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refreshPermissions]);

  const requestForRecord = useCallback(
    async (
      recordType: RecordType,
      accessTypes: AccessType[] = ['read', 'write']
    ): Promise<PermissionStatus> => {
      setBusy(true);
      try {
        await requestPermissionsForRecord(recordType, accessTypes);
      } catch (caught) {
        console.warn('[useHealthConnect] Permission request dismissed:', caught);
      }
      const next = await refreshPermissions();
      if (mounted.current) setBusy(false);
      return next;
    },
    [refreshPermissions]
  );

  const hasPermission = useCallback(
    (recordType: string, accessType: AccessType = 'read') =>
      isPermissionGranted(permissionStatus?.granted, recordType, accessType),
    [permissionStatus]
  );

  const openSystemSettings = useCallback(async () => {
    await openSettings();
  }, []);

  const openDataManagementScreen = useCallback(async () => {
    await openDataManagement();
  }, []);

  const revokePermissions = useCallback(async () => {
    const revoked = await revokeAppPermissions();
    if (revoked) await refreshPermissions();
    return revoked;
  }, [refreshPermissions]);

  const granted = permissionStatus?.granted ?? [];
  const missing = permissionStatus?.missing ?? APP_HEALTH_PERMISSIONS;

  return {
    phase,
    status,
    initialized,
    message,
    permissions: granted,
    missing,
    hasAllPermissions: permissionStatus?.hasAll ?? false,
    grantedCount: granted.length,
    totalCount: APP_HEALTH_PERMISSIONS.length,
    busy,
    error,
    initialize: async () => {
      resetInitializationState();
      return initialize();
    },
    requestAllPermissions,
    requestForRecord,
    hasPermission,
    openSystemSettings,
    openDataManagementScreen,
    revokePermissions,
  };
}
