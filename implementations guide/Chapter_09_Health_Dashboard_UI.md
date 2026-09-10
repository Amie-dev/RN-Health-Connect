# Chapter 9: Health Dashboard UI

This chapter covers the complete React Native Expo UI dashboard screen displaying metrics, local database explorer, live query viewer, sync status console, and data logger modal.

**File Path:** [src/screens/HealthDashboard.tsx](file:///home/aminul/development/RN_Health_Connect/src/screens/HealthDashboard.tsx)

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SdkAvailabilityStatus, RecordType } from 'react-native-health-connect';

// Health Connect Services
import { getClientState, openSettings, openDataManagement } from '../health-connect/client';
import {
  requestHealthPermissions,
  checkHealthPermissions,
  PermissionStatusResult,
} from '../health-connect/permissions';
import {
  queryHealthRecords,
  logStepsRecord,
  logWeightRecord,
  logHeartRateRecord,
  logBloodPressureRecord,
  logHydrationRecord,
} from '../health-connect/records';
import { getTodayHealthSummary } from '../health-connect/aggregation';
import { SyncManager, DEFAULT_SYNC_RECORD_TYPES, SyncResult } from '../health-connect/sync/syncManager';
import { SyncRecovery } from '../health-connect/sync/recovery';

// Database
import {
  getAllLocalHealthRecords,
  clearAllLocalHealthRecords,
  LocalHealthRecord,
} from '../database/healthRecords';
import { getAllSyncStates, HealthConnectSyncState, resetSyncState } from '../database/syncState';

type TabType = 'explorer' | 'live' | 'sync_console';
type CategoryFilter = 'ALL' | 'Activity' | 'Body' | 'Vitals' | 'Sleep' | 'Nutrition';

export default function HealthDashboard() {
  // SDK & Permission state
  const [sdkStatus, setSdkStatus] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [permissionInfo, setPermissionInfo] = useState<PermissionStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today Summary Metrics
  const [todaySummary, setTodaySummary] = useState({
    steps: 0,
    activeCalories: 0,
    distanceKm: 0,
    avgHeartRate: null as number | null,
    latestWeightKg: null as number | null,
  });

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  // Local DB & Sync Console data
  const [localRecords, setLocalRecords] = useState<LocalHealthRecord[]>([]);
  const [liveHCRecords, setLiveHCRecords] = useState<any[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, HealthConnectSyncState>>({});

  // Data Entry Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logType, setLogType] = useState<'Steps' | 'Weight' | 'HeartRate' | 'BloodPressure' | 'Hydration'>('Steps');
  const [inputVal1, setInputVal1] = useState('');
  const [inputVal2, setInputVal2] = useState('');

  /**
   * Initializes SDK & checks permissions
   */
  const initApp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getClientState();
      setSdkStatus(client.status);
      setInitialized(client.initialized);

      if (client.status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        setError(client.message);
        setLoading(false);
        return;
      }

      const permStatus = await checkHealthPermissions();
      setPermissionInfo(permStatus);

      if (permStatus.grantedPermissions.length > 0) {
        await refreshAllData();
      }
    } catch (err: any) {
      console.error('[Dashboard] Init error:', err);
      setError(err?.message || 'Failed to initialize Health Connect dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refreshes summary metrics, local DB records, and sync console states
   */
  const refreshAllData = useCallback(async () => {
    try {
      // 1. Fetch Today Summary Aggregations
      const summary = await getTodayHealthSummary();

      // Fetch latest weight from past 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const weightRes = await queryHealthRecords('Weight', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo,
          endTime: new Date().toISOString(),
        },
        pageSize: 1,
        ascendingOrder: false,
      });
      const latestWeight = weightRes.records[0]?.weight?.inKilograms ?? null;

      setTodaySummary({
        ...summary,
        latestWeightKg: latestWeight,
      });

      // 2. Load Local Database Records
      const dbRecords = await getAllLocalHealthRecords();
      setLocalRecords(dbRecords);

      // 3. Load Sync Console States
      const states = await getAllSyncStates();
      setSyncStates(states);

      // 4. Fetch Live Records sample if on live tab
      const liveRes = await queryHealthRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo,
          endTime: new Date().toISOString(),
        },
        pageSize: 20,
      });
      setLiveHCRecords(liveRes.records);
    } catch (err: any) {
      console.error('[Dashboard] Refresh error:', err);
    }
  }, []);

  /**
   * Trigger Manual Permission Request
   */
  const handleRequestPermissions = async () => {
    setLoading(true);
    try {
      await requestHealthPermissions();
      const permStatus = await checkHealthPermissions();
      setPermissionInfo(permStatus);
      if (permStatus.grantedPermissions.length > 0) {
        await refreshAllData();
      }
    } catch (err: any) {
      Alert.alert('Permission Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Trigger Incremental Sync via SyncManager
   */
  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const results: SyncResult[] = await SyncManager.syncAll(DEFAULT_SYNC_RECORD_TYPES);
      const totalUpserts = results.reduce((acc, r) => acc + r.upsertedCount, 0);
      const totalDeletes = results.reduce((acc, r) => acc + r.deletedCount, 0);

      await refreshAllData();
      Alert.alert(
        'Sync Complete',
        `Processed ${results.length} record types.\nUpserts: ${totalUpserts} | Deletes: ${totalDeletes}`
      );
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || String(err));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Test 30-day Token Expiration Recovery
   */
  const handleTestTokenRecovery = async (recordType: RecordType = 'Steps') => {
    setLoading(true);
    try {
      await SyncRecovery.recoverFromExpiredToken(recordType);
      await refreshAllData();
      Alert.alert('Recovery Complete', `Simulated 30-day recovery sync successfully executed for ${recordType}.`);
    } catch (err: any) {
      Alert.alert('Recovery Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Log New Health Data into Health Connect
   */
  const handleSaveNewData = async () => {
    const val1 = parseFloat(inputVal1);
    const val2 = parseFloat(inputVal2);

    if (isNaN(val1) || val1 <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid numeric value.');
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

      if (logType === 'Steps') {
        await logStepsRecord(Math.round(val1), oneHourAgo, now);
      } else if (logType === 'Weight') {
        await logWeightRecord(val1, now);
      } else if (logType === 'HeartRate') {
        await logHeartRateRecord(Math.round(val1), now);
      } else if (logType === 'BloodPressure') {
        if (isNaN(val2) || val2 <= 0) {
          Alert.alert('Validation Error', 'Please enter valid Diastolic pressure.');
          setLoading(false);
          return;
        }
        await logBloodPressureRecord(Math.round(val1), Math.round(val2), now);
      } else if (logType === 'Hydration') {
        await logHydrationRecord(val1, oneHourAgo, now);
      }

      setIsModalOpen(false);
      setInputVal1('');
      setInputVal2('');
      Alert.alert('Success', `${logType} record saved to Health Connect!`);

      // Sync changes into local database immediately
      await SyncManager.syncRecordType(logType);
      await refreshAllData();
    } catch (err: any) {
      Alert.alert('Insert Error', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearLocalDB = async () => {
    Alert.alert('Clear Local Database', 'Are you sure you want to clear all synced local records?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllLocalHealthRecords();
          await resetSyncState();
          await refreshAllData();
        },
      },
    ]);
  };

  // Register foreground lifecycle auto-sync on mount
  useEffect(() => {
    initApp();
    const unsubscribe = SyncManager.setupForegroundAutoSync(DEFAULT_SYNC_RECORD_TYPES, () => {
      refreshAllData();
    });
    return () => unsubscribe();
  }, [initApp, refreshAllData]);

  // Filter records by category
  const filteredLocalRecords = localRecords.filter((rec: LocalHealthRecord) => {
    if (categoryFilter === 'ALL') return true;
    if (categoryFilter === 'Activity')
      return ['Steps', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'Distance', 'ExerciseSession'].includes(
        rec.recordType
      );
    if (categoryFilter === 'Body') return ['Weight', 'Height', 'BodyFat', 'Bmi'].includes(rec.recordType);
    if (categoryFilter === 'Vitals')
      return [
        'HeartRate',
        'BloodPressure',
        'BloodGlucose',
        'OxygenSaturation',
        'BodyTemperature',
      ].includes(rec.recordType);
    if (categoryFilter === 'Sleep') return ['SleepSession'].includes(rec.recordType);
    if (categoryFilter === 'Nutrition') return ['Hydration', 'Nutrition'].includes(rec.recordType);
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.appTitle}>Health Connect</Text>
            <View style={styles.badgeGroup}>
              <View
                style={[
                  styles.statusBadge,
                  sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE ? styles.badgeGreen : styles.badgeRed,
                ]}
              >
                <Text style={styles.badgeText}>
                  {sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE ? 'SDK ONLINE' : 'SDK OFFLINE'}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.subtitle}>Android Health Connect Sync & Data Hub</Text>
        </View>

        {/* Status Card */}
        <View style={styles.glassCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Initialization:</Text>
            <Text style={[styles.statusValue, initialized ? styles.textGreen : styles.textRed]}>
              {initialized ? 'INITIALIZED' : 'NOT INITIALIZED'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Permissions:</Text>
            <Text
              style={[
                styles.statusValue,
                permissionInfo?.hasAll ? styles.textGreen : styles.textYellow,
              ]}
            >
              {permissionInfo?.hasAll
                ? 'ALL GRANTED'
                : `${permissionInfo?.grantedPermissions.length || 0} GRANTED`}
            </Text>
          </View>

          <View style={styles.settingsRow}>
            <TouchableOpacity style={styles.textButton} onPress={openSettings}>
              <Text style={styles.textButtonText}>System Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => openDataManagement()}>
              <Text style={styles.textButtonText}>Manage Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error Notification */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Today Summary Metrics Grid */}
        <Text style={styles.sectionHeader}>Today's Aggregated Metrics</Text>
        <View style={styles.metricsGrid}>
          {/* Steps */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>STEPS</Text>
            <Text style={styles.metricValue}>{todaySummary.steps.toLocaleString()}</Text>
            <Text style={styles.metricSub}>Total Count</Text>
          </View>

          {/* Active Calories */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>CALORIES</Text>
            <Text style={styles.metricValue}>{Math.round(todaySummary.activeCalories)}</Text>
            <Text style={styles.metricSub}>Active kcal</Text>
          </View>

          {/* Weight */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>WEIGHT</Text>
            <Text style={styles.metricValue}>
              {todaySummary.latestWeightKg ? `${todaySummary.latestWeightKg.toFixed(1)}` : '--'}
            </Text>
            <Text style={styles.metricSub}>Kilograms (kg)</Text>
          </View>

          {/* Heart Rate */}
          <View style={styles.metricCard}>
            <Text style={styles.metricTitle}>HEART RATE</Text>
            <Text style={styles.metricValue}>
              {todaySummary.avgHeartRate ? `${Math.round(todaySummary.avgHeartRate)}` : '--'}
            </Text>
            <Text style={styles.metricSub}>Avg BPM</Text>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionRow}>
          {!permissionInfo?.hasAll && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.btnFlex]}
              onPress={handleRequestPermissions}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Grant Permissions</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.accentButton, styles.btnFlex]}
            onPress={handleRunSync}
            disabled={syncing || loading}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sync Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, styles.btnFlex]}
            onPress={() => setIsModalOpen(true)}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>+ Log Data</Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Navigation Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'explorer' && styles.tabActive]}
            onPress={() => setActiveTab('explorer')}
          >
            <Text style={[styles.tabText, activeTab === 'explorer' && styles.tabTextActive]}>
              Synced DB ({localRecords.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'live' && styles.tabActive]}
            onPress={() => setActiveTab('live')}
          >
            <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
              Live HC API
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'sync_console' && styles.tabActive]}
            onPress={() => setActiveTab('sync_console')}
          >
            <Text style={[styles.tabText, activeTab === 'sync_console' && styles.tabTextActive]}>
              Sync Console
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: Synced DB Explorer */}
        {activeTab === 'explorer' && (
          <View style={styles.tabContent}>
            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
              {(['ALL', 'Activity', 'Body', 'Vitals', 'Sleep', 'Nutrition'] as CategoryFilter[]).map(
                (cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, categoryFilter === cat && styles.chipActive]}
                    onPress={() => setCategoryFilter(cat)}
                  >
                    <Text style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>

            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>
                Local Synced Records ({filteredLocalRecords.length})
              </Text>
              <TouchableOpacity onPress={handleClearLocalDB}>
                <Text style={styles.dangerText}>Clear Local DB</Text>
              </TouchableOpacity>
            </View>

            {filteredLocalRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No local records found for this category.</Text>
                <Text style={styles.emptySubText}>
                  Tap "Sync Changes" above to fetch latest records from Health Connect into local database.
                </Text>
              </View>
            ) : (
              filteredLocalRecords.map((item: LocalHealthRecord) => {
                const isExpanded = expandedRecordId === item.localId;
                return (
                  <TouchableOpacity
                    key={item.localId}
                    style={styles.recordCard}
                    onPress={() => setExpandedRecordId(isExpanded ? null : item.localId)}
                  >
                    <View style={styles.recordHeader}>
                      <View style={styles.recordTag}>
                        <Text style={styles.recordTagText}>{item.recordType}</Text>
                      </View>
                      <Text style={styles.recordTime}>
                        {new Date(item.startTime || item.time || item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    <Text style={styles.recordHcId} numberOfLines={1}>
                      HC ID: {item.healthConnectId}
                    </Text>
                    {item.dataOrigin && (
                      <Text style={styles.recordOrigin}>Origin: {item.dataOrigin}</Text>
                    )}

                    {/* Quick Payload View */}
                    <Text style={styles.payloadSummary}>
                      {item.recordType === 'Steps' && `Count: ${item.payload.count}`}
                      {item.recordType === 'Weight' && `Weight: ${item.payload.weight?.inKilograms} kg`}
                      {item.recordType === 'HeartRate' &&
                        `BPM: ${item.payload.samples?.[0]?.beatsPerMinute ?? '--'}`}
                      {item.recordType === 'BloodPressure' &&
                        `Systolic: ${item.payload.systolic?.inMillimetersOfMercury} / Diastolic: ${item.payload.diastolic?.inMillimetersOfMercury}`}
                      {item.recordType === 'Hydration' &&
                        `Volume: ${item.payload.volume?.inLiters} Liters`}
                    </Text>

                    {isExpanded && (
                      <View style={styles.jsonBox}>
                        <Text style={styles.jsonText}>{JSON.stringify(item.payload, null, 2)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: Direct Live HC Query */}
        {activeTab === 'live' && (
          <View style={styles.tabContent}>
            <Text style={styles.explorerTitle}>Direct Read sample (Steps - Last 30 Days)</Text>
            {liveHCRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No live records retrieved directly from HC.</Text>
              </View>
            ) : (
              liveHCRecords.map((rec: any, idx: number) => (
                <View key={rec.metadata?.id || idx} style={styles.recordCard}>
                  <Text style={styles.recordTagText}>Live Steps Record</Text>
                  <Text style={styles.recordTime}>
                    {new Date(rec.startTime).toLocaleString()} - {new Date(rec.endTime).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.payloadSummary}>Step Count: {rec.count}</Text>
                  <Text style={styles.recordHcId}>ID: {rec.metadata?.id}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: Sync Console */}
        {activeTab === 'sync_console' && (
          <View style={styles.tabContent}>
            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>Sync State Engine Console</Text>
              <TouchableOpacity onPress={() => handleTestTokenRecovery('Steps')}>
                <Text style={styles.actionLinkText}>Test Token Expiration Recovery</Text>
              </TouchableOpacity>
            </View>

            {DEFAULT_SYNC_RECORD_TYPES.map((type) => {
              const state = syncStates[type];
              return (
                <View key={type} style={styles.syncStateCard}>
                  <View style={styles.syncCardHeader}>
                    <Text style={styles.syncRecordType}>{type}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        state?.status === 'idle'
                          ? styles.badgeGreen
                          : state?.status === 'syncing'
                          ? styles.badgeBlue
                          : styles.badgeRed,
                      ]}
                    >
                      <Text style={styles.statusPillText}>{state?.status || 'UNINITIALIZED'}</Text>
                    </View>
                  </View>

                  <Text style={styles.syncMetaText}>
                    Token:{' '}
                    {state?.changesToken
                      ? `${state.changesToken.substring(0, 24)}...`
                      : 'None (Needs Initial Sync)'}
                  </Text>

                  <Text style={styles.syncMetaText}>
                    Last Sync:{' '}
                    {state?.lastSuccessfulSyncAt
                      ? new Date(state.lastSuccessfulSyncAt).toLocaleString()
                      : 'Never'}
                  </Text>

                  <View style={styles.syncActionRow}>
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => SyncManager.syncRecordType(type).then(refreshAllData)}
                    >
                      <Text style={styles.smallButtonText}>Sync Type</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.smallOutlineButton}
                      onPress={() => resetSyncState(type).then(refreshAllData)}
                    >
                      <Text style={styles.smallOutlineText}>Reset State</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Footer padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Log Data Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Health Record</Text>

            {/* Select Record Type */}
            <ScrollView horizontal style={{ marginBottom: 16 }}>
              {(['Steps', 'Weight', 'HeartRate', 'BloodPressure', 'Hydration'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, logType === t && styles.chipActive]}
                  onPress={() => setLogType(t)}
                >
                  <Text style={[styles.chipText, logType === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Inputs */}
            {logType === 'Steps' && (
              <View>
                <Text style={styles.inputLabel}>Step Count</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 5000"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'Weight' && (
              <View>
                <Text style={styles.inputLabel}>Weight (in Kilograms)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 72.5"
                  placeholderTextColor="#64748b"
                  keyboardType="decimal-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'HeartRate' && (
              <View>
                <Text style={styles.inputLabel}>Beats Per Minute (BPM)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 75"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {logType === 'BloodPressure' && (
              <View>
                <Text style={styles.inputLabel}>Systolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 120"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
                <Text style={[styles.inputLabel, { marginTop: 8 }]}>Diastolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 80"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={inputVal2}
                  onChangeText={setInputVal2}
                />
              </View>
            )}

            {logType === 'Hydration' && (
              <View>
                <Text style={styles.inputLabel}>Water Volume (Liters)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 0.5"
                  placeholderTextColor="#64748b"
                  keyboardType="decimal-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {/* Modal Buttons */}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.btnFlex]}
                onPress={() => setIsModalOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.btnFlex]}
                onPress={handleSaveNewData}
                disabled={loading}
              >
                <Text style={styles.buttonText}>Save Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  container: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  badgeGroup: {
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  badgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  badgeBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  glassCard: {
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  textGreen: {
    color: '#4ade80',
  },
  textRed: {
    color: '#f87171',
  },
  textYellow: {
    color: '#facc15',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  textButton: {
    paddingVertical: 4,
  },
  textButtonText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  metricTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
  },
  metricSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  btnFlex: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentButton: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#1e293b',
  },
  tabText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  tabContent: {
    marginTop: 4,
  },
  filterBar: {
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#0284c7',
  },
  chipText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  explorerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  explorerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  dangerText: {
    fontSize: 12,
    color: '#f87171',
    fontWeight: '600',
  },
  actionLinkText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptySubText: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  recordCard: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recordTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordTagText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  recordTime: {
    fontSize: 11,
    color: '#64748b',
  },
  recordHcId: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  recordOrigin: {
    fontSize: 10,
    color: '#475569',
  },
  payloadSummary: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '600',
    marginTop: 4,
  },
  jsonBox: {
    backgroundColor: '#090d16',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  jsonText: {
    fontSize: 10,
    color: '#a7f3d0',
    fontFamily: 'monospace',
  },
  syncStateCard: {
    backgroundColor: '#131b2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  syncCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  syncRecordType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  syncMetaText: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  syncActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  smallOutlineButton: {
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallOutlineText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131b2e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#090d16',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
});
```
