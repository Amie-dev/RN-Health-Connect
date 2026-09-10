import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,

  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SdkAvailabilityStatus, RecordType } from 'react-native-health-connect';
import {
  SafeAreaView,
  SafeAreaProvider,
  SafeAreaInsetsContext,
  useSafeAreaInsets,
  Pressable as SafePressable,
} from 'react-native-safe-area-context';
// Design tokens
import { palette as C, radius as R, spacing as S } from '../theme';

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
  getLocalHealthRecordsByType,
  clearAllLocalHealthRecords,
  LocalHealthRecord,
} from '../database/healthRecords';
import { getAllSyncStates, HealthConnectSyncState, resetSyncState } from '../database/syncState';

type TabType = 'explorer' | 'live' | 'sync_console';
type CategoryFilter = 'ALL' | 'Activity' | 'Body' | 'Vitals' | 'Sleep' | 'Nutrition';

/** Record type metadata used across the UI for badges & colors. */
const RECORD_META: Record<string, { icon: string; color: string; soft: string }> = {
  Steps: { icon: '🚶', color: C.teal, soft: C.tealSoft },
  Weight: { icon: '⚖️', color: C.amber, soft: C.amberSoft },
  HeartRate: { icon: '❤️', color: C.rose, soft: C.roseSoft },
  BloodPressure: { icon: '🩺', color: C.sky, soft: C.skySoft },
  Hydration: { icon: '💧', color: C.sky, soft: C.skySoft },
  ActiveCaloriesBurned: { icon: '🔥', color: C.amber, soft: C.amberSoft },
  TotalCaloriesBurned: { icon: '🔥', color: C.amber, soft: C.amberSoft },
  Distance: { icon: '📏', color: C.teal, soft: C.tealSoft },
  ExerciseSession: { icon: '🏃', color: C.teal, soft: C.tealSoft },
  SleepSession: { icon: '😴', color: C.violet, soft: C.violetSoft },
  BloodGlucose: { icon: '🩸', color: C.rose, soft: C.roseSoft },
  OxygenSaturation: { icon: '🫁', color: C.sky, soft: C.skySoft },
  BodyTemperature: { icon: '🌡️', color: C.amber, soft: C.amberSoft },
};
const getRecordMeta = (type: string) =>
  RECORD_META[type] || { icon: '📋', color: C.textSecondary, soft: C.surfaceAlt };

type MetricKey = 'steps' | 'activeCalories' | 'latestWeightKg' | 'avgHeartRate';
type MetricMeta = {
  key: MetricKey;
  icon: string;
  label: string;
  accent: string;
  soft: string;
  unit: string;
  goal?: number;
};

const METRIC_META: MetricMeta[] = [
  { key: 'steps', icon: '🚶', label: 'Steps', accent: C.mint, soft: C.primarySoft, unit: 'steps', goal: 10000 },
  { key: 'activeCalories', icon: '🔥', label: 'Calories', accent: C.amber, soft: C.amberSoft, unit: 'kcal', goal: 500 },
  { key: 'latestWeightKg', icon: '⚖️', label: 'Weight', accent: C.sky, soft: C.skySoft, unit: 'kg' },
  { key: 'avgHeartRate', icon: '❤️', label: 'Heart Rate', accent: C.rose, soft: C.roseSoft, unit: 'avg bpm' },
];

/** Stable formatters so the animated count-up numbers don't restart on re-render. */
const METRIC_FORMATTERS: Record<string, (n: number) => string> = {
  steps: (n) => Math.round(n).toLocaleString(),
  activeCalories: (n) => `${Math.round(n)}`,
  latestWeightKg: (n) => n.toFixed(1),
  avgHeartRate: (n) => `${Math.round(n)}`,
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}


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

      // 4. Fetch Live Records sample
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

  /** Raw numeric values for the animated summary grid (CountUp handles formatting). */
  const metricValues: Record<string, number | null> = {
    steps: todaySummary.steps,
    activeCalories: todaySummary.activeCalories,
    latestWeightKg: todaySummary.latestWeightKg,
    avgHeartRate: todaySummary.avgHeartRate,
  };

  /** Payload summary line for a local record. */
  const payloadSummaryText = (item: LocalHealthRecord): string => {
    if (item.recordType === 'Steps') return `Count: ${item.payload.count}`;
    if (item.recordType === 'Weight') return `${item.payload.weight?.inKilograms ?? '--'} kg`;
    if (item.recordType === 'HeartRate') return `${item.payload.samples?.[0]?.beatsPerMinute ?? '--'} bpm`;
    if (item.recordType === 'BloodPressure')
      return `${item.payload.systolic?.inMillimetersOfMercury ?? '--'} / ${item.payload.diastolic?.inMillimetersOfMercury ?? '--'} mmHg`;
    if (item.recordType === 'Hydration') return `${item.payload.volume?.inLiters ?? '--'} L`;
    return '';
  };

  const isHcAvailable = sdkStatus === SdkAvailabilityStatus.SDK_AVAILABLE;


  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Header */}
        <Reveal>
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>{getGreeting()} 👋</Text>
                <Text style={styles.heroTitle}>Health Connect</Text>
                <Text style={styles.heroSubtitle}>
                  {new Date().toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <View style={styles.heroAvatar}>
                <Pulse minScale={1} maxScale={1.16} duration={1400}>
                  <Text style={styles.heroAvatarIcon}>🫀</Text>
                </Pulse>
              </View>
            </View>
          </View>
        </Reveal>

        {/* Status Card */}
        <Reveal delay={90}>
          <View style={styles.statusCard}>
            <View style={styles.statusItem}>
              {isHcAvailable ? (
                <Pulse minScale={1} maxScale={1.7} duration={1100}>
                  <View style={[styles.statusDot, styles.dotGreen]} />
                </Pulse>
              ) : (
                <View style={[styles.statusDot, styles.dotRed]} />
              )}
              <Text style={styles.statusItemText}>SDK {isHcAvailable ? 'Available' : 'Unavailable'}</Text>
            </View>
            <View style={[styles.statusItem, styles.statusItemBordered]}>
              <View style={[styles.statusDot, initialized ? styles.dotGreen : styles.dotAmber]} />
              <Text style={styles.statusItemText}>{initialized ? 'Initialized' : 'Not Initialized'}</Text>
            </View>
            <View style={[styles.statusItem, styles.statusItemBordered]}>
              <View
                style={[styles.statusDot, permissionInfo?.hasAll ? styles.dotGreen : styles.dotAmber]}
              />
              <Text style={styles.statusItemText}>
                {permissionInfo?.hasAll
                  ? 'All Permissions'
                  : `${permissionInfo?.grantedPermissions.length || 0} Permissions`}
              </Text>
            </View>
          </View>
        </Reveal>

        {/* Quick Links */}
        <View style={styles.quickLinksRow}>
          <TouchableOpacity style={styles.quickLink} onPress={openSettings}>
            <Text style={styles.quickLinkIcon}>⚙️</Text>
            <Text style={styles.quickLinkText}>System Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => openDataManagement()}>
            <Text style={styles.quickLinkIcon}>🗂️</Text>
            <Text style={styles.quickLinkText}>Manage Data</Text>
          </TouchableOpacity>
        </View>

        {/* Error Notification */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Something needs attention</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        )}

        {/* Today Summary Metrics Grid */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Today's Metrics</Text>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>LIVE</Text>
          </View>
        </View>
        <View style={styles.metricsGrid}>
          {METRIC_META.map((m) => (
            <View key={m.key} style={styles.metricCard}>
              <View style={[styles.metricIconWrap, { backgroundColor: m.soft }]}>
                <Text style={styles.metricIcon}>{m.icon}</Text>
              </View>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: m.accent }]} numberOfLines={1}>
                {formatMetric(m.key)}
              </Text>
              <Text style={styles.metricUnit}>{m.unit}</Text>
            </View>
          ))}
        </View>


        {/* Action Controls */}
        <View style={styles.actionRow}>
          {!permissionInfo?.hasAll && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionPrimary]}
              onPress={handleRequestPermissions}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.actionIcon}>🔐</Text>
                  <Text style={styles.actionText}>Grant Access</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionButton, styles.actionSync]}
            onPress={handleRunSync}
            disabled={syncing || loading}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.actionIcon}>🔄</Text>
                <Text style={styles.actionText}>Sync Now</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionSecondary]}
            onPress={() => setIsModalOpen(true)}
            disabled={loading}
          >
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.actionSecondaryText}>Log Data</Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Navigation Tabs */}
        <View style={styles.tabBar}>
          {(
            [
              { key: 'explorer', label: 'Synced DB', count: localRecords.length },
              { key: 'live', label: 'Live API' },
              { key: 'sync_console', label: 'Sync Console' },
            ] as { key: TabType; label: string; count?: number }[]
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
                {tab.count !== undefined ? ` (${tab.count})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
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
                Synced Records <Text style={styles.explorerCount}>{filteredLocalRecords.length}</Text>
              </Text>
              <TouchableOpacity style={styles.dangerLink} onPress={handleClearLocalDB}>
                <Text style={styles.dangerLinkText}>Clear Local DB</Text>
              </TouchableOpacity>
            </View>

            {filteredLocalRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyTitle}>No records here yet</Text>
                <Text style={styles.emptySubText}>
                  Tap "Sync Now" above to pull the latest records from Health Connect into your local
                  database.
                </Text>
              </View>
            ) : (
              filteredLocalRecords.map((item: LocalHealthRecord) => {
                const isExpanded = expandedRecordId === item.localId;
                const meta = getRecordMeta(item.recordType);
                return (
                  <TouchableOpacity
                    key={item.localId}
                    style={styles.recordCard}
                    onPress={() => setExpandedRecordId(isExpanded ? null : item.localId)}
                  >
                    <View style={styles.recordTopRow}>
                      <View style={[styles.recordIconWrap, { backgroundColor: meta.soft }]}>
                        <Text style={styles.recordIcon}>{meta.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.recordHeader}>
                          <Text style={[styles.recordType, { color: meta.color }]}>{item.recordType}</Text>
                          <Text style={styles.recordTime}>
                            {new Date(item.startTime || item.time || item.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                        <Text style={styles.payloadSummary} numberOfLines={1}>
                          {payloadSummaryText(item)}
                        </Text>
                      </View>
                      <Text style={[styles.chevron, isExpanded && styles.chevronOpen]}>{'›'}</Text>
                    </View>

                    {isExpanded && (
                      <View style={styles.expandedBox}>
                        {item.dataOrigin && (
                          <Text style={styles.recordOrigin}>Origin: {item.dataOrigin}</Text>
                        )}
                        <Text style={styles.recordHcId} numberOfLines={1}>
                          HC ID: {item.healthConnectId}
                        </Text>
                        <View style={styles.jsonBox}>
                          <Text style={styles.jsonText}>{JSON.stringify(item.payload, null, 2)}</Text>
                        </View>
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
            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>
                Live Read — Steps <Text style={styles.explorerCount}>{liveHCRecords.length}</Text>
              </Text>
              <View style={[styles.recordTag, { backgroundColor: C.tealSoft }]}>
                <Text style={[styles.recordTagText, { color: C.teal }]}>Last 30 Days</Text>
              </View>
            </View>

            {liveHCRecords.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📡</Text>
                <Text style={styles.emptyTitle}>No live data retrieved</Text>
                <Text style={styles.emptySubText}>
                  Grant permissions and run a sync to read records directly from Health Connect.
                </Text>
              </View>
            ) : (
              liveHCRecords.map((rec: any, idx: number) => (
                <View key={rec.metadata?.id || idx} style={styles.recordCard}>
                  <View style={styles.recordTopRow}>
                    <View style={[styles.recordIconWrap, { backgroundColor: C.tealSoft }]}>
                      <Text style={styles.recordIcon}>🚶</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.recordHeader}>
                        <Text style={[styles.recordType, { color: C.teal }]}>Live Steps Record</Text>
                        <Text style={styles.recordTime}>
                          {new Date(rec.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {new Date(rec.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.payloadSummary}>Count: {rec.count}</Text>
                      <Text style={styles.recordHcId} numberOfLines={1}>
                        ID: {rec.metadata?.id}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: Sync Console */}
        {activeTab === 'sync_console' && (
          <View style={styles.tabContent}>
            <View style={styles.explorerHeaderRow}>
              <Text style={styles.explorerTitle}>Sync State Engine</Text>
              <TouchableOpacity
                style={[styles.recordTag, { backgroundColor: C.primarySoft }]}
                onPress={() => handleTestTokenRecovery('Steps')}
              >
                <Text style={[styles.recordTagText, { color: C.primary }]}>Test Recovery</Text>
              </TouchableOpacity>
            </View>

            {DEFAULT_SYNC_RECORD_TYPES.map((type) => {
              const state = syncStates[type];
              const statusColor =
                state?.status === 'idle' ? C.green : state?.status === 'syncing' ? C.primary : C.textMuted;
              return (
                <View key={type} style={styles.syncStateCard}>
                  <View style={styles.recordTopRow}>
                    <View style={[styles.recordIconWrap, { backgroundColor: getRecordMeta(type).soft }]}>
                      <Text style={styles.recordIcon}>{getRecordMeta(type).icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.recordHeader}>
                        <Text style={styles.syncRecordType}>{type}</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusColor + '26' }]}>
                          <View style={[styles.statusDot, styles.dotSm, { backgroundColor: statusColor }]} />
                          <Text style={[styles.statusPillText, { color: statusColor }]}>
                            {state?.status || 'uninitialized'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.syncMetaText}>
                        Token: {state?.changesToken ? `${state.changesToken.substring(0, 20)}…` : 'None — needs initial sync'}
                      </Text>
                      <Text style={styles.syncMetaText}>
                        Last sync: {state?.lastSuccessfulSyncAt ? new Date(state.lastSuccessfulSyncAt).toLocaleString() : 'Never'}
                      </Text>
                    </View>
                  </View>

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
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Log Health Record</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setIsModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Select Record Type */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.lg }}>
              {(['Steps', 'Weight', 'HeartRate', 'BloodPressure', 'Hydration'] as const).map((t) => {
                const meta = getRecordMeta(t);
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.chip,
                      logType === t && styles.chipActive,
                      logType === t && { borderColor: meta.color },
                    ]}
                    onPress={() => setLogType(t)}
                  >
                    <Text style={styles.chipIcon}>{meta.icon}</Text>
                    <Text style={[styles.chipText, logType === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Inputs */}
            {logType === 'Steps' && (
              <View>
                <Text style={styles.inputLabel}>Step Count</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 5000"
                  placeholderTextColor={C.textMuted}
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
                  placeholderTextColor={C.textMuted}
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
                  placeholderTextColor={C.textMuted}
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
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
                <Text style={[styles.inputLabel, { marginTop: S.md }]}>Diastolic (mmHg)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 80"
                  placeholderTextColor={C.textMuted}
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
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                  value={inputVal1}
                  onChangeText={setInputVal1}
                />
              </View>
            )}

            {/* Modal Buttons */}
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionSecondary, { flex: 1 }]}
                onPress={() => setIsModalOpen(false)}
              >
                <Text style={styles.actionSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionPrimary, { flex: 1 }]}
                onPress={handleSaveNewData}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.actionIcon}>💾</Text>
                    <Text style={styles.actionText}>Save Record</Text>
                  </>
                )}
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
    backgroundColor: C.bg,
  },
  container: {
    padding: S.lg,
    paddingBottom: 0,
  },

  /* Hero */
  hero: {
    marginBottom: S.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSecondary,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textMuted,
    marginTop: 4,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: R.lg,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarIcon: {
    fontSize: 26,
  },

  /* Status card */
  statusCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.borderSoft,
    paddingVertical: S.md,
    marginBottom: S.sm,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: S.sm,
    gap: 6,
  },
  statusItemBordered: {
    borderLeftWidth: 1,
    borderLeftColor: C.borderSoft,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotGreen: { backgroundColor: C.green },
  dotRed: { backgroundColor: C.red },
  dotAmber: { backgroundColor: C.amber },
  statusItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textAlign: 'center',
  },

  /* Quick links */
  quickLinksRow: {
    flexDirection: 'row',
    gap: S.sm,
    marginBottom: S.lg,
  },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: R.md,
    paddingVertical: 10,
  },
  quickLinkIcon: {
    fontSize: 15,
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
  },

  /* Error */
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    backgroundColor: C.redSoft,
    borderWidth: 1,
    borderColor: C.red + '40',
    borderRadius: R.md,
    padding: S.md,
    marginBottom: S.lg,
  },
  errorIcon: {
    fontSize: 20,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.red,
    marginBottom: 2,
  },
  errorText: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },

  /* Section header */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  sectionBadge: {
    backgroundColor: C.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.5,
  },


  /* Metrics grid */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.sm,
    marginBottom: S.lg,
  },
  metricCard: {
    width: '47.5%',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: R.lg,
    padding: S.md,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricIcon: {
    fontSize: 16,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textMuted,
    marginTop: 2,
  },

  /* Action buttons */
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.sm,
    marginBottom: S.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: R.pill,
    paddingVertical: 13,
    paddingHorizontal: S.lg,
    flexGrow: 1,
  },
  actionPrimary: {
    backgroundColor: C.primary,
  },
  actionSync: {
    backgroundColor: C.teal + '26',
    borderWidth: 1,
    borderColor: C.teal + '66',
  },
  actionSecondary: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionIcon: {
    fontSize: 14,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textSecondary,
  },

  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: R.pill,
    padding: 4,
    marginBottom: S.lg,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: R.pill,
  },
  tabItemActive: {
    backgroundColor: C.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  tabTextActive: {
    color: '#fff',
  },

  /* Tab content */
  tabContent: {
    marginBottom: S.lg,
  },
  filterBar: {
    marginBottom: S.md,
  },


  /* Chips */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: C.primarySoft,
    borderColor: C.primary,
  },
  chipIcon: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
  },
  chipTextActive: {
    color: C.primary,
  },

  /* Explorer header */
  explorerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
    gap: S.sm,
  },
  explorerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flexShrink: 1,
  },
  explorerCount: {
    fontSize: 15,
    fontWeight: '800',
    color: C.primary,
  },
  dangerLink: {
    backgroundColor: C.redSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
  },
  dangerLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.red,
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: R.xl,
    padding: S.xxl,
    gap: 6,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  emptySubText: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },


  /* Record cards */
  recordCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: R.lg,
    padding: S.md,
    marginBottom: S.sm,
  },
  recordTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
  },
  recordIconWrap: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIcon: {
    fontSize: 17,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
  },
  recordType: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  recordTime: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textMuted,
  },
  payloadSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '400',
    color: C.textMuted,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  expandedBox: {
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
    gap: 3,
  },
  recordOrigin: {
    fontSize: 10,
    color: C.textMuted,
  },
  recordHcId: {
    fontSize: 10,
    color: C.textMuted,
    fontFamily: 'monospace',
  },
  recordTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  recordTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  jsonBox: {
    backgroundColor: C.surfaceDeep,
    padding: 10,
    borderRadius: R.sm,
    marginTop: 6,
  },
  jsonText: {
    fontSize: 10,
    color: '#86EFAC',
    fontFamily: 'monospace',
  },


  /* Sync console */
  syncStateCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: R.lg,
    padding: S.md,
    marginBottom: S.sm,
  },
  syncRecordType: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  syncMetaText: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 3,
  },
  syncActionRow: {
    flexDirection: 'row',
    gap: S.sm,
    marginTop: S.md,
  },
  smallButton: {
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.sm,
  },
  smallButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  smallOutlineButton: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.sm,
  },
  smallOutlineText: {
    fontSize: 11,
    color: C.textSecondary,
    fontWeight: '600',
  },


  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 15, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: S.xl,
    paddingBottom: S.xxl,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: S.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.lg,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: C.text,
  },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: C.surfaceDeep,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: S.sm,
    marginTop: S.xl,
  },
});