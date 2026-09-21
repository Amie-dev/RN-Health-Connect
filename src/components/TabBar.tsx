import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette as C, radius as R, spacing as S } from '../theme';

export type TabKey = 'explorer' | 'live' | 'sync_console';

export interface TabDefinition {
  key: TabKey;
  label: string;
  icon: string;
  count?: number;
}

interface TabBarProps {
  tabs: TabDefinition[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}

/**
 * Three-way segmented control. Rendered outside the scrolling list so the tab
 * row stays reachable while the content underneath scrolls.
 */
export const TabBar = React.memo(function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, isActive && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab`}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {tab.label}
              {tab.count !== undefined ? ` · ${tab.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: S.lg,
    marginBottom: S.md,
    backgroundColor: C.surfaceDeep,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: R.md,
  },
  tabActive: { backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primary },
  icon: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  labelActive: { color: C.mint },
});
