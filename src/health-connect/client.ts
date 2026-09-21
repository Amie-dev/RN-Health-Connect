import {
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  openHealthConnectDataManagement,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

export interface HealthConnectClientState {
  /** Raw `SdkAvailabilityStatus` value returned by the native SDK. */
  status: number;
  /** True when reads/writes can be attempted. */
  available: boolean;
  /** True once `initialize()` succeeded. */
  initialized: boolean;
  /** Human readable explanation, safe to render directly in the UI. */
  message: string;
}

/** In-flight / completed initialization — Health Connect is initialized once per process. */
let pendingInitialization: Promise<boolean> | null = null;

/**
 * Checks the Health Connect SDK availability on the device.
 * Never throws — an unavailable SDK is a normal state, not an error.
 */
export async function checkSdkAvailability(): Promise<number> {
  try {
    return await getSdkStatus();
  } catch (error) {
    console.error('[HealthConnect] getSdkStatus failed:', error);
    return SdkAvailabilityStatus.SDK_UNAVAILABLE;
  }
}

/**
 * Initializes the Health Connect SDK exactly once, no matter how many callers
 * ask for it (UI mount, sync engine, manual write). Concurrent callers share
 * the same promise; a failed attempt clears the cache so the user can retry.
 */
export function ensureInitialized(): Promise<boolean> {
  if (!pendingInitialization) {
    pendingInitialization = initialize()
      .then((isInitialized) => {
        if (!isInitialized) {
          // Allow a later retry (e.g. after the user updates Health Connect).
          pendingInitialization = null;
        }
        return isInitialized;
      })
      .catch((error) => {
        console.error('[HealthConnect] initialize failed:', error);
        pendingInitialization = null;
        return false;
      });
  }
  return pendingInitialization;
}

/** Alias kept for the implementation guide's API surface. */
export const initializeHealthConnect = ensureInitialized;

/** Drops the memoized init promise — used when the user explicitly retries setup. */
export function resetInitializationState(): void {
  pendingInitialization = null;
}

/**
 * Convenience method to check status and initialize in one flow.
 */
export async function getClientState(): Promise<HealthConnectClientState> {
  const status = await checkSdkAvailability();

  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    const message =
      status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        ? 'The Health Connect app needs an update from the Play Store.'
        : 'Health Connect is not available on this device. Install it from the Play Store, then retry.';
    return { status, available: false, initialized: false, message };
  }

  const initialized = await ensureInitialized();
  return {
    status,
    available: true,
    initialized,
    message: initialized
      ? 'Connected to Health Connect.'
      : 'Health Connect is installed but could not be initialized. Try again.',
  };
}

/** Navigates the user to the Health Connect settings screen. */
export async function openSettings(): Promise<boolean> {
  try {
    openHealthConnectSettings();
    return true;
  } catch (error) {
    console.error('[HealthConnect] openHealthConnectSettings failed:', error);
    return false;
  }
}

/** Navigates the user to the Health Connect data-management screen for this app. */
export async function openDataManagement(providerPackageName?: string): Promise<boolean> {
  try {
    openHealthConnectDataManagement(providerPackageName);
    return true;
  } catch (error) {
    console.error('[HealthConnect] openHealthConnectDataManagement failed:', error);
    return false;
  }
}
