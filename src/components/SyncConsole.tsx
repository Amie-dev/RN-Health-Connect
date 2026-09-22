import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { type RecordType } from 'react-native-health-connect';
import { getRecordMeta, palette as C, radius as R, spacing as S } from '../theme';
import { ActionButton, Card, SectionHeader, StatusPill } from './ui';
import { formatDateTime, formatRelative } from '../utils/format';
import { SYNC_RECORD_TYPES } from '../config';
import type { HealthConnectSyncState } from '../database/syncState';
import type { SyncRunSummary } from '../health-connect/sync/syncManager';
import type { UseSyncEngineResult } from '../hooks/useSyncEngine';

interface SyncConsoleProps {
  engine: UseSyncEngineResult;
  lastSummary: SyncRunSummary | null;
  onTestRecovery: () => void;
}

type StatusTone = { label: string; color: string; soft: string };

function statusFor(
  state: HealthConnectSyncState | undefined,
  hasRead: boolean
): StatusTone {
  if (state?.status === 'syncing') return { label: 'SYNCING', color: C.sky, soft: C.skySoft };
  if (state?.status === 'token_expired')
    return { label: 'TOKEN EXPIRED', color: C.rose, soft: C.roseSoft };
  if (state?.status === 'error' && state.errorMessage)
    return { label: 'ERROR', color: C.red, soft: C.redSoft };
  if (!hasRead) return { label: 'NO ACCESS', color: C.amber, soft: C.amberSoft };
  if (state?.status === 'idle' && state?.lastSuccessfulSyncAt)
    return { label: 'UP TO DATE', color: C.primary, soft: C.primarySoft };
  return { label: 'PENDING', color: C.textMuted, soft: C.surfaceAlt };
}

/**
 * Per-record-type sync console.
 *
 * Shows the real engine state (cursor, last run, error message) with contextual
 * actions: grant access when missing, recover when the token expired, otherwise
 * a plain per-type sync.
 */
export const SyncConsole = React.memo(function SyncConsole({
  engine,
  lastSummary,
  onTestRecovery,
}: SyncConsoleProps) {
  const renderType = React.useCallback(
    ({ item }: { item: RecordType }) => {
      const state = engine.syncStates[item];
      const meta = getRecordMeta(item);
      const tone = statusFor(state, state !== undefined);

      return (
        <Card style={styles.typeCard}>
          <View style={styles.typeHeader}>
            <View style={[styles.iconWrap, { backgroundColor: meta.soft }]}>
              <Text style={styles.icon}>{meta.icon}</Text>
            </View>
            <View style={styles.typeBody}>
              <Text style={[styles.typeName, { color: meta.color }]} numberOfLines={1}>
                {meta.label}
              </Text>
              <Text style={styles.typeMeta} numberOfLines={1}>
                Cursor:{' '}
                {state?.changesToken ? `${state.changesToken.slice(0, 14)}…` : 'none — first sync pending'}
              </Text>
              <Text style={styles.typeMeta} numberOfLines={1}>
                Last run:{' '}
                {state?.lastSuccessfulSyncAt ? formatRelative(state.lastSuccessfulSyncAt) : 'never'}
              </Text>
            </View>
            <StatusPill label={tone.label} color={tone.color} background={tone.soft} />
          </View>

          {state?.errorMessage ? (
            <Text style={styles.errorText} numberOfLines={2}>
              {state.errorMessage}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            {tone.label === 'NO ACCESS' ? (
              <ActionButton
                label="Grant access"
                icon="🔑"
                tone="warning"
                onPress={() => engine.runSingle(item)}
                style={styles.grow}
              />
            ) : tone.label === 'TOKEN EXPIRED' ? (
              <ActionButton
                label="Recover token"
                icon="♻️"
                tone="danger"
                onPress={() => engine.recover(item)}
                style={styles.grow}
              />
            ) : (
              <ActionButton
                label="Sync type"
                icon="⟳"
                onPress={() => engine.runSingle(item)}
                disabled={engine.syncing}
                style={styles.grow}
              />
            )}
            <ActionButton
              label="Reset"
              onPress={() => engine.resetState(item)}
              disabled={engine.syncing}
            />
          </View>
        </Card>
      );
    },
    [engine]
  );

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Sync engine"
        subtitle={
          engine.syncing
            ? 'Running…'
            : lastSummary
              ? `Last full run: ${formatDateTime(lastSummary.finishedAt)} · ${lastSummary.upsertedCount} up · ${lastSummary.deletedCount} del · ${(lastSummary.durationMs / 1000).toFixed(1)}s`
              : 'Incremental change tracking per record type.'
        }
        right={
          <ActionButton
            label="Recovery test"
            icon="🧪"
            onPress={onTestRecovery}
            disabled={engine.syncing}
          />
        }
      />

      {lastSummary && lastSummary.failureCount > 0 ? (
        <Text style={styles.warn}>
          {lastSummary.failureCount} record type{lastSummary.failureCount === 1 ? '' : 's'} failed in
          the last run — see the cards below.
        </Text>
      ) : null}

      <FlatList
        data={SYNC_RECORD_TYPES}
        keyExtractor={(item) => item}
        renderItem={renderType}
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  warn: { fontSize: 12, color: C.amber, fontWeight: '700', marginBottom: S.sm },
  list: { paddingBottom: S.xl },
  typeCard: { marginBottom: S.sm },
  typeHeader: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  iconWrap: { width: 36, height: 36, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 17 },
  typeBody: { flex: 1 },
  typeName: { fontSize: 13, fontWeight: '800' },
  typeMeta: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginTop: 1 },
  errorText: { fontSize: 11, color: C.red, fontWeight: '600', marginTop: S.sm, lineHeight: 16 },
  actionRow: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  grow: { flex: 1 },
});

