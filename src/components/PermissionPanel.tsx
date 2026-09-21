import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { palette as C, radius as R, spacing as S } from '../theme';
import { ActionButton, Card, GoalBar, SectionHeader } from './ui';

interface PermissionPanelProps {
  grantedCount: number;
  totalCount: number;
  hasAllPermissions: boolean;
  missingLabels: string[];
  busy: boolean;
  onRequestAll: () => void;
  onOpenSettings: () => void;
  onOpenDataManagement: () => void;
  onRevoke: () => void;
}

/**
 * Permission overview.
 *
 * Shows real coverage (n of m) instead of a binary state, lists the first few
 * missing types so the user knows what to grant, and keeps the two system
 * shortcuts (Health Connect settings / data management) one tap away.
 */
export const PermissionPanel = React.memo(function PermissionPanel({
  grantedCount,
  totalCount,
  hasAllPermissions,
  missingLabels,
  busy,
  onRequestAll,
  onOpenSettings,
  onOpenDataManagement,
  onRevoke,
}: PermissionPanelProps) {
  const coverage = totalCount > 0 ? (grantedCount / totalCount) * 100 : 0;
  const accent = hasAllPermissions ? C.primary : C.amber;
  const visibleMissing = missingLabels.slice(0, 4);
  const hiddenCount = Math.max(0, missingLabels.length - visibleMissing.length);

  return (
    <Card style={styles.card}>
      <SectionHeader
        title="Health Connect access"
        subtitle={
          hasAllPermissions
            ? 'All declared permissions are granted.'
            : `${missingLabels.length} permission${missingLabels.length === 1 ? '' : 's'} still missing.`
        }
        right={
          busy ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Text style={[styles.coverage, { color: accent }]}>
              {grantedCount}/{totalCount}
            </Text>
          )
        }
      />

      <GoalBar pct={coverage} color={accent} track={C.surfaceDeep} />

      {visibleMissing.length > 0 ? (
        <View style={styles.missingWrap}>
          {visibleMissing.map((label) => (
            <View key={label} style={styles.missingChip}>
              <Text style={styles.missingText}>{label}</Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <View style={styles.missingChip}>
              <Text style={styles.missingText}>+{hiddenCount} more</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <ActionButton
          label={hasAllPermissions ? 'Re-check access' : 'Grant permissions'}
          onPress={onRequestAll}
          tone="primary"
          disabled={busy}
          style={styles.grow}
        />
        <ActionButton
          label="HC settings"
          onPress={onOpenSettings}
          disabled={busy}
          style={styles.grow}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Data & access"
          onPress={onOpenDataManagement}
          disabled={busy}
          style={styles.grow}
        />
        <ActionButton
          label="Revoke"
          onPress={onRevoke}
          tone="danger"
          disabled={busy}
          style={styles.grow}
        />
      </View>

      <Text style={styles.footnote}>
        Revoking takes effect after the app is restarted — a Health Connect platform limitation.
      </Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { marginBottom: S.lg },
  coverage: { fontSize: 15, fontWeight: '800' },
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.md },
  missingChip: {
    paddingHorizontal: S.sm,
    paddingVertical: 4,
    borderRadius: R.sm,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  missingText: { fontSize: 10, fontWeight: '700', color: C.textMuted },
  buttonRow: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  grow: { flex: 1 },
  footnote: { fontSize: 10, color: C.textMuted, marginTop: S.md, lineHeight: 15, fontWeight: '500' },
});
