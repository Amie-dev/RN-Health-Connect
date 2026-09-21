import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getRecordMeta, palette as C, radius as R, spacing as S } from '../theme';
import { formatClock, formatPayloadJson, formatRecordSummary, formatRelative } from '../utils/format';
import type { LocalHealthRecord } from '../database/healthRecords';
import { APP_PACKAGE_NAME } from '../config';

interface RecordRowProps {
  record: LocalHealthRecord;
  expanded: boolean;
  onToggle: (localId: string) => void;
}

/**
 * A single cached record.
 *
 * Memoized on `localId` + `updatedAt` + `expanded`, so a list of hundreds of
 * rows only re-renders the row that actually changed or was tapped.
 */
const RecordRowComponent = function RecordRow({ record, expanded, onToggle }: RecordRowProps) {
  const meta = getRecordMeta(record.recordType);
  const timestamp = record.startTime ?? record.time ?? record.createdAt;
  const isOwnRecord = record.dataOrigin === APP_PACKAGE_NAME;

  return (
    <Pressable
      onPress={() => onToggle(record.localId)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${meta.label} record, ${formatRecordSummary(record.recordType, record.payload)}`}
      accessibilityHint="Shows the raw Health Connect payload"
      style={styles.card}
    >
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
              {formatClock(timestamp)}
            </Text>
          </View>

          <Text style={styles.summary} numberOfLines={1}>
            {formatRecordSummary(record.recordType, record.payload)}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {formatRelative(timestamp)}
            </Text>
            {isOwnRecord ? <Text style={styles.ownBadge}>· logged here</Text> : null}
          </View>
        </View>

        <Text style={[styles.chevron, expanded && styles.chevronOpen]}>›</Text>
      </View>

      {expanded ? (
        <View style={styles.expanded}>
          {record.dataOrigin ? (
            <Text style={styles.detail} numberOfLines={2}>
              <Text style={styles.detailLabel}>Origin: </Text>
              {record.dataOrigin}
            </Text>
          ) : null}
          <Text style={styles.detail} numberOfLines={2}>
            <Text style={styles.detailLabel}>HC ID: </Text>
            {record.healthConnectId}
          </Text>
          {record.lastModifiedTime ? (
            <Text style={styles.detail} numberOfLines={2}>
              <Text style={styles.detailLabel}>Modified: </Text>
              {formatRelative(record.lastModifiedTime)}
            </Text>
          ) : null}
          <View style={styles.jsonBox}>
            <Text style={styles.jsonText}>{formatPayloadJson(record.payload)}</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
};

export const RecordRow = React.memo(
  RecordRowComponent,
  (previous, next) =>
    previous.expanded === next.expanded &&
    previous.record.localId === next.record.localId &&
    previous.record.updatedAt === next.record.updatedAt
);

const styles = StyleSheet.create({
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  type: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  time: { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  summary: { fontSize: 13, color: C.text, fontWeight: '600', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
  ownBadge: { fontSize: 10, color: C.primary, fontWeight: '700' },
  chevron: {
    fontSize: 20,
    color: C.textMuted,
    transform: [{ rotate: '90deg' }],
    fontWeight: '700',
  },
  chevronOpen: { transform: [{ rotate: '-90deg' }], color: C.primary },
  expanded: {
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
    gap: 3,
  },
  detail: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  detailLabel: { color: C.textMuted, fontWeight: '700' },
  jsonBox: {
    marginTop: S.sm,
    backgroundColor: C.surfaceDeep,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: S.md,
  },
  jsonText: { fontSize: 10, color: C.mint, fontFamily: 'monospace', lineHeight: 15 },
});
