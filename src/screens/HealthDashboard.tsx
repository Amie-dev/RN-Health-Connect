import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as C, spacing as S } from '../theme';
import { getRecordMeta } from '../theme';
import { Banner, EmptyState, LoadingState } from '../components/ui';
import { DashboardHeader, type ConnectionState } from '../components/DashboardHeader';
import { TabBar, type TabDefinition, type TabKey } from '../components/TabBar';
import { MetricsPanel } from '../components/MetricsPanel';
import { PermissionPanel } from '../components/PermissionPanel';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { LivePanel } from '../components/LivePanel';
import { SyncConsole } from '../components/SyncConsole';
import { LogDataModal, type LogFormValues } from '../components/LogDataModal';
import { useHealthConnect } from '../hooks/useHealthConnect';
import { useHealthSummary } from '../hooks/useHealthSummary';
import { useLocalRecords } from '../hooks/useLocalRecords';
import { useLiveRecords } from '../hooks/useLiveRecords';
import { useSyncEngine } from '../hooks/useSyncEngine';
import {
  logBloodPressureRecord,
  logHeartRateRecord,
  logHydrationRecord,
  logStepsRecord,
  logWeightRecord,
} from '../health-connect/records';
import { POST_WRITE_SYNC_DELAY_MS, SYNC_RECORD_TYPES } from '../config';
import { SyncManager } from '../health-connect/sync/syncManager';

/**
 * Dashboard screen.
 *
 * Composition only — every behaviour lives in a hook (`useHealthConnect`,
 * `useHealthSummary`, `useLocalRecords`, `useLiveRecords`, `useSyncEngine`) and
 * every visual block is a memoized component under `src/components/`.
 */
export default function HealthDashboard() {
  const health = useHealthConnect();
  const summary = useHealthSummary('today', health.grantedCount > 0);
  const localRecords = useLocalRecords();
  const live = useLiveRecords('Steps', 30, health.grantedCount > 0);
  const engine = useSyncEngine();

  const [activeTab, setActiveTab] = useState<TabKey>('explorer');
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  const ready = health.phase === 'ready' && health.initialized;
  const hasAnyPermission = health.grantedCount > 0;

  // ── Initial bootstrap: one full sync + local read once permissions exist ──
  useEffect(() => {
    if (!ready || !hasAnyPermission) return;
    let cancelled = false;

    (async () => {
      await engine.runSync(SYNC_RECORD_TYPES);
      if (!cancelled) await localRecords.refresh();
    })();

    return () => {
      cancelled = true;
    };
    // Bootstrap must only run when readiness flips, not on every engine tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasAnyPermission]);

  // ── Foreground auto-sync (debounced inside the engine) ───────────────────
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    if (!ready || !hasAnyPermission) return undefined;

    const unsubscribe = SyncManager.setupForegroundAutoSync(SYNC_RECORD_TYPES, (result) => {
      if (result.upsertedCount > 0 || result.deletedCount > 0) {
        void engineRef.current.refreshStates();
        void localRecords.refresh();
        void summary.refresh();
      }
    });
    return unsubscribe;
    // Hooks are read through a ref; registration depends on readiness only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasAnyPermission]);

  const handleRefresh = useCallback(async () => {
    setNotice(null);
    await Promise.all([summary.refresh(), localRecords.refresh(), engine.refreshStates()]);
  }, [summary, localRecords, engine]);

  const handleRunSync = useCallback(async () => {
    setNotice(null);
    const result = await engine.runSync();
    if (result.failureCount > 0) {
      setNotice({
        tone: 'error',
        text: `Sync finished with ${result.failureCount} failure(s): ${result.upsertedCount} updated, ${result.deletedCount} removed.`,
      });
    } else if (result.skippedCount > 0) {
      setNotice({
        tone: 'info',
        text: `${result.skippedCount} record type(s) skipped — grant access in the Sync tab.`,
      });
    } else {
      setNotice({
        tone: 'success',
        text: `Sync complete: ${result.upsertedCount} updated, ${result.deletedCount} removed in ${(result.durationMs / 1000).toFixed(1)}s.`,
      });
    }
  }, [engine]);

  const handleSaveRecord = useCallback(
    async (values: LogFormValues) => {
      setSavingRecord(true);
      setNotice(null);
      try {
        const now = new Date().toISOString();
        const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

        // Ask for the missing write permission first (one native dialog).
        if (!health.hasPermission(values.recordType, 'write')) {
          const status = await health.requestForRecord(values.recordType, ['read', 'write']);
          const grantedNow = status.granted.some(
            (permission) =>
              permission.recordType === values.recordType && permission.accessType === 'write'
          );
          if (!grantedNow) {
            setNotice({
              tone: 'error',
              text: `Write access for ${getRecordMeta(values.recordType).label} was not granted.`,
            });
            return;
          }
        }

        switch (values.recordType) {
          case 'Steps':
            await logStepsRecord(values.value1, oneHourAgo, now);
            break;
          case 'Weight':
            await logWeightRecord(values.value1, now);
            break;
          case 'HeartRate':
            await logHeartRateRecord(values.value1, now);
            break;
          case 'BloodPressure':
            await logBloodPressureRecord(values.value1, values.value2 ?? 0, now);
            break;
          case 'Hydration':
            await logHydrationRecord(values.value1, oneHourAgo, now);
            break;
        }

        setLogModalOpen(false);
        setNotice({
          tone: 'success',
          text: `${getRecordMeta(values.recordType).label} saved to Health Connect.`,
        });

        // Echo the write into the local mirror after the platform settles,
        // then refresh whatever is on screen.
        setTimeout(() => {
          void engine
            .runSingle(values.recordType)
            .then(() => Promise.all([summary.refresh(), localRecords.refresh()]))
            .catch((caught) =>
              console.warn('[Dashboard] Post-write sync failed:', caught)
            );
        }, POST_WRITE_SYNC_DELAY_MS);
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : String(caught);
        setNotice({ tone: 'error', text });
      } finally {
        setSavingRecord(false);
      }
    },
    [health, engine, summary, localRecords]
  );

  const handleClearDatabase = useCallback(() => {
    Alert.alert(
      'Clear local cache',
      'This removes the locally mirrored records and sync cursors. Health Connect data is not touched and will be re-synced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void localRecords
              .clear()
              .then(() => engine.resetState())
              .then(() =>
                setNotice({ tone: 'info', text: 'Local cache cleared. It will rebuild on the next sync.' })
              )
              .catch((caught) =>
                setNotice({
                  tone: 'error',
                  text: caught instanceof Error ? caught.message : String(caught),
                })
              );
          },
        },
      ]
    );
  }, [localRecords, engine]);

  const handleRevoke = useCallback(async () => {
    const revoked = await health.revokePermissions();
    setNotice({
      tone: revoked ? 'info' : 'error',
      text: revoked
        ? 'Permissions revoked. Restart the app for the change to take effect.'
        : 'Could not revoke permissions — try again from Health Connect settings.',
    });
  }, [health]);

  // ── Derived UI state ─────────────────────────────────────────────────────
  const connection: ConnectionState = !ready
    ? health.phase === 'checking'
      ? 'checking'
      : 'unavailable'
    : hasAnyPermission
      ? 'connected'
      : 'no_permission';

  const tabs: TabDefinition[] = [
    { key: 'explorer', label: 'Records', icon: '🗂', count: localRecords.records.length },
    { key: 'live', label: 'Live', icon: '📡' },
    { key: 'sync_console', label: 'Sync', icon: '⚙️' },
  ];

  const missingLabels = health.missing
    .slice(0, 6)
    .map((permission) => getRecordMeta(permission.recordType).label);

  // ── Gate screens ─────────────────────────────────────────────────────────
  if (health.phase === 'checking') {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingState label="Connecting to Health Connect…" />
      </SafeAreaView>
    );
  }

  if (health.phase === 'unavailable' || health.phase === 'update_required') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.gate}>
          <EmptyState
            icon={health.phase === 'update_required' ? '🛠' : '📵'}
            title={
              health.phase === 'update_required'
                ? 'Health Connect needs an update'
                : 'Health Connect is not available'
            }
            message={health.message}
            actionLabel="Open Health Connect settings"
            onAction={() => void health.openSystemSettings()}
          />
          <Text onPress={() => void health.initialize()} style={styles.retryLink}>
            Tap to retry
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <DashboardHeader
        connection={connection}
        connectionDetail={hasAnyPermission ? health.message : 'Permissions required'}
        refreshing={summary.loading || localRecords.loading}
        onRefresh={() => void handleRefresh()}
        onLogData={() => setLogModalOpen(true)}
      />

      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={summary.loading || localRecords.loading}
            onRefresh={() => void handleRefresh()}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        {notice ? <Banner tone={notice.tone} title={notice.text} onDismiss={() => setNotice(null)} /> : null}

        {summary.error ? (
          <Banner
            tone="warning"
            title="Metrics partially unavailable"
            message={summary.error}
            onDismiss={() => undefined}
          />
        ) : null}

        {health.error ? (
          <Banner tone="error" title="Health Connect error" message={health.error} />
        ) : null}

        <MetricsPanel
          summary={summary.summary}
          loading={summary.loading}
          range={summary.range}
          onRangeChange={summary.setRange}
          permissionHint={
            hasAnyPermission && !health.hasAllPermissions
              ? 'Some data types stay hidden until their permission is granted.'
              : undefined
          }
        />

        <PermissionPanel
          grantedCount={health.grantedCount}
          totalCount={health.totalCount}
          hasAllPermissions={health.hasAllPermissions}
          missingLabels={missingLabels}
          busy={health.busy}
          onRequestAll={() => void health.requestAllPermissions()}
          onOpenSettings={() => void health.openSystemSettings()}
          onOpenDataManagement={() => void health.openDataManagementScreen()}
          onRevoke={() => void handleRevoke()}
        />

        <View style={styles.tabContent}>
          {activeTab === 'explorer' ? (
            <ExplorerPanel
              records={localRecords.records}
              loading={localRecords.loading}
              error={localRecords.error}
              onRunSync={() => void handleRunSync()}
              onClearDatabase={handleClearDatabase}
              syncDisabled={engine.syncing || !ready}
            />
          ) : null}

          {activeTab === 'live' ? <LivePanel live={live} /> : null}

          {activeTab === 'sync_console' ? (
            <SyncConsole
              engine={engine}
              lastSummary={engine.lastSummary}
              onTestRecovery={() => void engine.recover('Steps')}
            />
          ) : null}
        </View>
      </ScrollView>

      <LogDataModal
        visible={logModalOpen}
        saving={savingRecord}
        onClose={() => setLogModalOpen(false)}
        onSave={(values) => void handleSaveRecord(values)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  gate: { flex: 1, justifyContent: 'center', padding: S.xl },
  retryLink: {
    marginTop: S.lg,
    textAlign: 'center',
    color: C.mint,
    fontSize: 13,
    fontWeight: '800',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: S.lg, paddingBottom: S.xxl, flexGrow: 1 },
  tabContent: { flex: 1, minHeight: 420 },
});

