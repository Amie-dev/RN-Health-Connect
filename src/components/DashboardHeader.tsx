import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette as C, radius as R, spacing as S } from '../theme';
import { PressableScale, Pulse, Spin, StatusPill } from './ui';

export type ConnectionState = 'checking' | 'connected' | 'no_permission' | 'unavailable';

const CONNECTION_META: Record<ConnectionState, { label: string; color: string; soft: string }> = {
  checking: { label: 'CHECKING', color: C.textMuted, soft: C.surfaceAlt },
  connected: { label: 'CONNECTED', color: C.primary, soft: C.primarySoft },
  no_permission: { label: 'PERMISSIONS', color: C.amber, soft: C.amberSoft },
  unavailable: { label: 'UNAVAILABLE', color: C.red, soft: C.redSoft },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface DashboardHeaderProps {
  connection: ConnectionState;
  connectionDetail?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onLogData: () => void;
}

/**
 * Compact sticky hero: identity + connection state + the two primary actions.
 * Kept out of the scrolling list so "refresh" and "log data" are always reachable.
 */
export const DashboardHeader = React.memo(function DashboardHeader({
  connection,
  connectionDetail,
  refreshing,
  onRefresh,
  onLogData,
}: DashboardHeaderProps) {
  const meta = CONNECTION_META[connection];

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.greeting}>{greeting()} 👋</Text>
          <Text style={styles.title}>Health Connect</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {connectionDetail ??
              new Date().toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
          </Text>
        </View>

        <View style={styles.avatar}>
          <Pulse minScale={1} maxScale={1.14} duration={1500}>
            <Text style={styles.avatarIcon}>🫀</Text>
          </Pulse>
        </View>
      </View>

      <View style={styles.actionRow}>
        <StatusPill label={meta.label} color={meta.color} background={meta.soft} icon="●" />

        <View style={styles.spacer} />

        <PressableScale
          onPress={onRefresh}
          disabled={refreshing}
          style={styles.iconButton}
          accessibilityLabel="Refresh health data"
          accessibilityHint="Reloads metrics and records from Health Connect"
        >
          <Spin spinning={refreshing}>
            <Text style={styles.iconButtonGlyph}>{refreshing ? '⏳' : '⟳'}</Text>
          </Spin>
        </PressableScale>

        <PressableScale
          onPress={onLogData}
          style={styles.logButton}
          accessibilityLabel="Log a health record"
          accessibilityHint="Opens a form to write a record into Health Connect"
        >
          <Text style={styles.logButtonGlyph}>＋</Text>
          <Text style={styles.logButtonText}>Log data</Text>
        </PressableScale>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  titleBlock: { flex: 1 },
  greeting: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  title: { fontSize: 27, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginTop: 1 },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: '500' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: R.pill,
    backgroundColor: C.roseSoft,
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 22 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.lg },
  spacer: { flex: 1 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonGlyph: { fontSize: 17, color: C.textSecondary, fontWeight: '700' },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: S.lg,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.primary,
  },
  logButtonGlyph: { fontSize: 16, color: C.mint, fontWeight: '800' },
  logButtonText: { fontSize: 13, fontWeight: '800', color: C.mint },
});
