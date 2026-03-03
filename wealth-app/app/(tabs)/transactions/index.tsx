// app/(tabs)/transactions.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, Alert, SectionList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, CATEGORY_COLORS } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';

const TYPE_FILTERS = ['All', 'In', 'Out', 'Scheduled'];
const TIME_FILTERS = ['All', '7d', '30d', '3m', '6m'];

const HEADER_ACTIONS = [
  { key: 'csv', icon: 'cloud-upload-outline' as const, label: 'CSV Import', route: './csv-import' },
  { key: 'recurring', icon: 'repeat-outline' as const, label: 'Recurring', route: './recurring-transactions' },
  { key: 'insights', icon: 'bar-chart-outline' as const, label: 'Insights', route: './spending-insights' },
];

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxnRow({
  txn,
  onDelete,
  onTap,
  selectMode,
  selected,
  onToggleSelect,
}: {
  txn: any;
  onDelete: (id: string) => void;
  onTap: (txn: any) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const isCredit = txn.type === 'credit';
  const isScheduled = txn.is_scheduled;
  const catColor = CATEGORY_COLORS[txn.category] || colors.text3;

  const handlePress = () => {
    if (selectMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggleSelect(txn.id);
    } else {
      onTap(txn);
    }
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectMode) {
      onToggleSelect(txn.id);
    } else {
      Alert.alert(
        txn.description,
        `${formatDate(txn.date)} · ${txn.category}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete(txn.id) },
        ]
      );
    }
  };

  return (
    <TouchableOpacity
      style={[styles.txnRow, selected && styles.txnRowSelected]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {selectMode && (
        <View style={[styles.checkbox, selected && styles.checkboxActive]}>
          {selected && <Ionicons name="checkmark" size={14} color={colors.bg} />}
        </View>
      )}
      <View style={[styles.txnIcon, { backgroundColor: `${catColor}20` }]}>
        <Text style={{ fontSize: 16 }}>
          {isScheduled ? '⏰' : isCredit ? '↓' : '↑'}
        </Text>
      </View>
      <View style={styles.txnMiddle}>
        <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
        <View style={styles.txnMeta}>
          <Text style={styles.txnDate}>{formatDate(txn.date)}</Text>
          <View style={[styles.catBadge, { backgroundColor: `${catColor}20` }]}>
            <Text style={[styles.catBadgeText, { color: catColor }]}>{txn.category}</Text>
          </View>
          {txn.bank ? <Text style={styles.txnBank}>{txn.bank}</Text> : null}
        </View>
      </View>
      <Text style={[styles.txnAmount, { color: isCredit ? colors.teal : colors.rose }]}>
        {isCredit ? '+' : '−'}{formatGBP(txn.amount_gbp || txn.amount)}
      </Text>
    </TouchableOpacity>
  );
}

function groupByMonth(txns: any[]): { title: string; data: any[] }[] {
  const groups: Record<string, any[]> = {};
  txns.forEach(t => {
    const month = t.date?.slice(0, 7) || 'Unknown';
    const label = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([title, data]) => ({ title, data }));
}

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [totals, setTotals] = useState({ in: 0, out: 0, count: 0 });

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await api.getData();
      setTransactions(d.transactions || []);
      setAccounts(d.accounts || []);
    } catch (e) { console.error(e); }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const now = new Date();
    const cutoffs: Record<string, Date> = {
      '7d': new Date(now.getTime() - 7 * 864e5),
      '30d': new Date(now.getTime() - 30 * 864e5),
      '3m': new Date(now.getTime() - 90 * 864e5),
      '6m': new Date(now.getTime() - 180 * 864e5),
    };
    const today = now.toISOString().split('T')[0];

    let result = [...transactions];

    if (timeFilter !== 'All' && cutoffs[timeFilter]) {
      const cutoff = cutoffs[timeFilter].toISOString().split('T')[0];
      result = result.filter(t => t.date >= cutoff);
    }
    if (typeFilter === 'In') result = result.filter(t => t.type === 'credit');
    if (typeFilter === 'Out') result = result.filter(t => t.type === 'debit');
    if (typeFilter === 'Scheduled') result = result.filter(t => t.date > today);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        (t.description || '').toLowerCase().includes(s) ||
        (t.category || '').toLowerCase().includes(s) ||
        (t.bank || '').toLowerCase().includes(s)
      );
    }

    result.sort((a, b) => b.date.localeCompare(a.date));
    setFiltered(result);

    const inc = result.filter(t => t.type === 'credit').reduce((s, t) => s + (t.amount_gbp || t.amount || 0), 0);
    const out = result.filter(t => t.type === 'debit').reduce((s, t) => s + (t.amount_gbp || t.amount || 0), 0);
    setTotals({ in: inc, out, count: result.length });
  }, [transactions, search, timeFilter, typeFilter]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTransaction(id);
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.error(e); }
  };

  // Tap to edit
  const handleTap = (txn: any) => {
    router.push({
      pathname: '/modals/edit-transaction',
      params: {
        id: txn.id,
        description: txn.description,
        amount: String(txn.amount),
        type: txn.type,
        category: txn.category,
        date: txn.date,
        currency: txn.currency || 'GBP',
        account_id: txn.account_id || '',
      },
    });
  };

  // Bulk selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Exit select mode if nothing is selected
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const cancelSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} transaction${count > 1 ? 's' : ''}?`,
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const ids = Array.from(selectedIds);
              await Promise.all(ids.map(id => api.deleteTransaction(id)));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              cancelSelectMode();
              await load();
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Some transactions could not be deleted.');
            }
          },
        },
      ]
    );
  }, [selectedIds, cancelSelectMode, load]);

  // Long-press handler that decides between entering selectMode or showing single-delete alert
  const handleRowLongPress = useCallback((txn: any) => {
    if (!selectMode) {
      // Enter bulk selection mode with this item selected
      enterSelectMode(txn.id);
    }
    // If already in selectMode, TxnRow handles toggling internally
  }, [selectMode, enterSelectMode]);

  const sections = groupByMonth(filtered);

  return (
    <View style={styles.container}>
      {/* Bulk selection toolbar */}
      {selectMode && (
        <View style={styles.selectionToolbar}>
          <TouchableOpacity onPress={cancelSelectMode} style={styles.selectionCancelBtn}>
            <Ionicons name="close" size={20} color={colors.text} />
            <Text style={styles.selectionCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={handleBulkDelete} style={styles.selectionDeleteBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.rose} />
            <Text style={styles.selectionDeleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.text3} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor={colors.text3}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.text3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Header Action Buttons */}
      <View style={styles.headerActionsRow}>
        {HEADER_ACTIONS.map(action => (
          <TouchableOpacity
            key={action.key}
            style={styles.headerActionBtn}
            onPress={() => router.push(action.route as any)}
            activeOpacity={0.7}
          >
            <View style={styles.headerActionIconWrap}>
              <Ionicons name={action.icon} size={18} color={colors.primary} />
            </View>
            <Text style={styles.headerActionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {TIME_FILTERS.map(f => (
          <FilterChip key={f} label={f} active={timeFilter === f} onPress={() => setTimeFilter(f)} />
        ))}
        <View style={styles.sep} />
        {TYPE_FILTERS.map(f => (
          <FilterChip key={f} label={f} active={typeFilter === f} onPress={() => setTypeFilter(f)} />
        ))}
      </ScrollView>

      {/* Summary pills */}
      <View style={styles.summaryRow}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>{totals.count} txns</Text>
        </View>
        <View style={styles.pill}>
          <Text style={[styles.pillLabel, { color: colors.teal }]}>+{formatGBP(totals.in, 0)}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={[styles.pillLabel, { color: colors.rose }]}>−{formatGBP(totals.out, 0)}</Text>
        </View>
        <View style={[styles.pill, { flex: 1 }]}>
          <Text style={[styles.pillLabel, { color: totals.in - totals.out >= 0 ? colors.teal : colors.rose }]}>
            Net {formatGBP(totals.in - totals.out, 0)}
          </Text>
        </View>
      </View>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TxnRow
            txn={item}
            onDelete={handleDelete}
            onTap={handleTap}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={toggleSelect}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <Text style={styles.sectionHeaderCount}>{section.data.length} transactions</Text>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.text3} />
            <Text style={styles.emptyText}>No transactions</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        stickySectionHeadersEnabled
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/modals/add-transaction')}
      >
        <Ionicons name="add" size={28} color={colors.bg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Bulk selection toolbar
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border2,
  },
  selectionCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  selectionCancelText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  selectionCount: {
    fontSize: 14,
    color: colors.text2,
    fontWeight: '600',
  },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.roseDim,
    borderRadius: radius.sm,
  },
  selectionDeleteText: {
    fontSize: 13,
    color: colors.rose,
    fontWeight: '600',
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 40,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },

  // Header action buttons
  headerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerActionBtn: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
  },
  headerActionLabel: {
    fontSize: 10,
    color: colors.text3,
    fontWeight: '500',
  },

  filterRow: { flexGrow: 0, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  sep: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.xs },

  summaryRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  pill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  pillLabel: { fontSize: 11, color: colors.text2, fontWeight: '600' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', color: colors.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionHeaderCount: { fontSize: 11, color: colors.text3 },

  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  txnRowSelected: {
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  txnIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  txnMiddle: { flex: 1 },
  txnDesc: { fontSize: 14, color: colors.text, fontWeight: '500', marginBottom: 3 },
  txnMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  txnDate: { fontSize: 11, color: colors.text3 },
  txnBank: { fontSize: 11, color: colors.text3 },
  catBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm },
  catBadgeText: { fontSize: 10, fontWeight: '600' },
  txnAmount: { fontSize: 15, fontWeight: '700' },

  // Checkbox for bulk selection
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: spacing.md },
  emptyText: { fontSize: 15, color: colors.text3 },

  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
