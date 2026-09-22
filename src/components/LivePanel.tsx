import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getRecordMeta, palette as C, radius as R, spacing as S } from '../theme';
import { Chip, EmptyState, SectionHeader } from './ui';
import { formatClock, formatDateTime, formatRecordSummary, formatRelative } from '../utils/format';
import { LIVE_RECORD_TYPES } from '../config';
import type { UseLiveRecordsResult } from '../hooks/useLiveRecords';

interface LivePanelProps {
  live: UseLiveRecordsResult;
}

interface LiveRow {
  key: string;
  recordType: string;
  timestamp?: string;
  payload: any;
}

/**
 * Direct read-only view into Health Connect for one record type.
 * Live reads always show what the platform currently holds — independent of the
 * local mirror — which makes this the right place to sanity-check writes.
 */
export const LivePanel = React.memo(function LivePanel({ live }: LivePanelProps) {
  const rows: LiveRow[] = React.useMemo(
    () =>
      live.records.map((record: any, index: number) => ({
        key: record?.metadata?.id ?? `live-${index}`,
        recordType: live.recordType,
        timestamp: record?.startTime ?? record?.time,
        payload: record,
      })),
    [live.records, live.recordType]
  );

  const renderItem = useCallback(
    ({ item }: { item: LiveRow }) => {
      const meta = getRecordMeta(item.recordType);
      return (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, { backgroundColor: meta.soft }]}>
              <Text style={styles.icon}>{meta.icon}</Text>
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={[styles.type, { color: meta.color }]} numberOfLines={1}>
                  {meta.label}
                </Text>
                <Text style={styles.time} numberOfLines={1}>
                  {formatClock(item.timestamp)}
                </Text>
              </View>
              <Text style={styles.summary} numberOfLines={2}>
                {formatRecordSummary(item.recordType, item.payload)}
              </Text>
              <Text style={styles.detail} numberOfLines={1}>
                {formatRelative(item.timestamp)} · {item.key}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    []
  );

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Live read"
        subtitle="Straight from Health Connect — last 30 days"
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        data={LIVE_RECORD_TYPES}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <Chip
            label={getRecordMeta(item).label}
            icon={getRecordMeta(item).icon}
            active={live.recordType === item}
            onPress={() => live.setRecordType(item)}
          />
        )}
      />

      {live.error ? <Text style={styles.error}>{live.error}</Text> : null}
      {live.truncated ? (
        <Text style={styles.warn}>Showing the newest records only (page limit reached).</Text>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={rows.length === 0 ? styles.listEmpty : undefined}
        ListEmptyComponent={
          live.loading ? null : (
            <EmptyState
              icon="📡"
              title={`No ${getRecordMeta(live.recordType).label.toLowerCase()} data found`}
              message={
                live.error
                  ? 'Health Connect returned an error — check the message above or re-grant access.'
                  : 'Log a record from this app, or give a fitness app permission to write to Health Connect.'
              }
            />
          )
        }
      />

      {rows.length > 0 ? (
        <Text style={styles.footer}>
          Newest {rows.length} record{rows.length === 1 ? '' : 's'} · updated {formatDateTime(new Date().toISOString())}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: { flexGrow: 0, marginBottom: S.sm },
  error: { fontSize: 12, color: C.red, fontWeight: '700', marginBottom: S.sm },
  warn: { fontSize: 11, color: C.amber, fontWeight: '700', marginBottom: S.sm },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    marginBottom: S.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  body: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
  },
  type: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  time: { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  summary: { fontSize: 13, color: C.text, fontWeight: '600', marginTop: 2 },
  detail: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  footer: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: S.sm,
  },
});
