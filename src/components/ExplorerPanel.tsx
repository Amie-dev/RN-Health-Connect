import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CATEGORY_FILTERS,
  getRecordMeta,
  palette as C,
  radius as R,
  spacing as S,
  type CategoryKey,
} from '../theme';
import { ActionButton, Chip, EmptyState, SectionHeader } from './ui';
import { RecordRow } from './RecordRow';
import { formatRecordSummary } from '../utils/format';
import type { LocalHealthRecord } from '../database/healthRecords';

export interface ExplorerPanelProps {
  records: LocalHealthRecord[];
  loading: boolean;
  error: string | null;
  onRunSync: () => void;
  onClearDatabase: () => void;
  syncDisabled: boolean;
}

/**
 * Searchable, category-filtered list of every locally mirrored record.
 *
 * Performance notes:
 *  - filtering/search run inside `useMemo`, so typing only recomputes the
 *    visible slice instead of re-rendering every row;
 *  - rows are rendered by a `FlatList` (windowed rendering) instead of mapping
 *    the whole array into a `ScrollView`, which is what made the old screen
 *    janky with more than a few dozen records.
 */
export const ExplorerPanel = React.memo(function ExplorerPanel({
  records,
  loading,
  error,
  onRunSync,
  onClearDatabase,
  syncDisabled,
}: ExplorerPanelProps) {
  const [category, setCategory] = useState<CategoryKey>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const categoryFilter =
      CATEGORY_FILTERS.find((entry) => entry.key === category)?.match ?? (() => true);

    if (!needle) return records.filter((record) => categoryFilter(record.recordType));

    return records.filter((record) => {
      if (!categoryFilter(record.recordType)) return false;
      const meta = getRecordMeta(record.recordType);
      return (
        record.recordType.toLowerCase().includes(needle) ||
        meta.label.toLowerCase().includes(needle) ||
        formatRecordSummary(record.recordType, record.payload).toLowerCase().includes(needle) ||
        (record.dataOrigin ?? '').toLowerCase().includes(needle)
      );
    });
  }, [records, category, search]);

  const toggle = React.useCallback((localId: string) => {
    setExpandedId((current) => (current === localId ? null : localId));
  }, []);

  const renderItem = React.useCallback(
    ({ item }: { item: LocalHealthRecord }) => (
      <RecordRow record={item} expanded={expandedId === item.localId} onToggle={toggle} />
    ),
    [expandedId, toggle]
  );

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Synced records"
        subtitle={
          records.length === 0
            ? 'Nothing cached yet — run a sync to mirror your Health Connect data.'
            : `${filtered.length} of ${records.length} cached record${records.length === 1 ? '' : 's'}`
        }
        right={
          <ActionButton
            label="Clear"
            icon="🗑"
            tone="danger"
            onPress={onClearDatabase}
            disabled={records.length === 0}
          />
        }
      />

      <TextInput
        style={styles.search}
        placeholder="Search records…"
        placeholderTextColor={C.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search cached health records"
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        data={CATEGORY_FILTERS}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Chip
            label={item.label}
            active={category === item.key}
            onPress={() => setCategory(item.key)}
          />
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.localId}
        renderItem={renderItem}
        extraData={expandedId}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={filtered.length === 0 ? styles.listEmpty : undefined}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={search ? '🔍' : '📭'}
              title={search ? 'No matches' : 'No records here yet'}
              message={
                search
                  ? `Nothing matches “${search}”. Try another term or clear the filter.`
                  : 'Tap “Sync now” to pull the latest records from Health Connect into your local database.'
              }
              actionLabel={search ? undefined : syncDisabled ? undefined : 'Sync now'}
              onAction={search || syncDisabled ? undefined : onRunSync}
            />
          )
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    paddingVertical: 10,
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: S.sm,
  },
  filters: { flexGrow: 0, marginBottom: S.sm },
  error: { fontSize: 12, color: C.red, fontWeight: '700', marginBottom: S.sm },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
});
