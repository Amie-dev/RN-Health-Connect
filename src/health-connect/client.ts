import {
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  openHealthConnectDataManagement,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

export interface HealthConnectClientInfo {
  status: number;
  initialized: boolean;
  message: string;
}

/**
 * Checks the Health Connect SDK availability on the Android device.
 */
export async function checkSdkAvailability(): Promise<number> {
  try {
    const status = await getSdkStatus();
    return status;
  } catch (error) {
    console.error('[HealthConnectClient] Failed to check SDK availability:', error);
    return SdkAvailabilityStatus.SDK_UNAVAILABLE;
  }
}

/**
 * Initializes the Health Connect SDK.
 * Must be called before reading or writing data.
 */
export async function initializeHealthConnect(): Promise<boolean> {
  try {
    const isInitialized = await initialize();
    console.log('[HealthConnectClient] SDK Initialized:', isInitialized);
    return isInitialized;
  } catch (error) {
    console.error('[HealthConnectClient] SDK Initialization error:', error);
    return false;
  }
}

/**
 * Convenience method to check status and initialize in one flow.
 */
export async function getClientState(): Promise<HealthConnectClientInfo> {
  const status = await checkSdkAvailability();

  if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    let message = 'Health Connect SDK is unavailable on this device.';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      message = 'Health Connect app update is required on Google Play Store.';
    }
    return { status, initialized: false, message };
  }

  const initialized = await initializeHealthConnect();
  return {
    status,
    initialized,
    message: initialized ? 'Health Connect initialized successfully.' : 'Initialization failed.',
  };
}

/**
 * Navigates the user to Health Connect settings app.
 */
export async function openSettings(): Promise<void> {
  try {
    await openHealthConnectSettings();
  } catch (error) {
    console.error('[HealthConnectClient] Failed to open Health Connect settings:', error);
  }
}

/**
 * Navigates the user to Health Connect data management screen.
 */
export async function openDataManagement(providerPackageName?: string): Promise<void> {
  try {
    await openHealthConnectDataManagement(providerPackageName);
  } catch (error) {
    console.error('[HealthConnectClient] Failed to open data management screen:', error);
  }
}
