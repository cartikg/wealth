// app/screens/recurring-transactions.tsx — Recurring transaction management
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';

function FrequencyBadge({ frequency }: { frequency: string }) {
  const colorMap: Record<string, string> = {
    weekly: colors.cyan,
    monthly: colors.primary,
    quarterly: colors.lavender,
    yearly: '#F59E0B',
    annual: '#F59E0B',
  };
  const badgeColor = colorMap[(frequency || '').toLowerCase()] || colors.text3;

  return (
    <View style={[styles.freqBadge, { borderColor: badgeColor + '40', backgroundColor: badgeColor + '15' }]}>
      <Text style={[styles.freqText, { color: badgeColor }]}>{frequency || 'monthly'}</Text>
    </View>
  );
}

function CategoryBadge({ category }: { category: string }) {
  if (!category) return null;
  return (
    <View style={styles.catBadge}>
      <Text style={styles.catText}>{category}</Text>
    </View>
  );
}

function RecurringCard({ item, onDelete }: { item: any; onDelete: () => void }) {
  const isIncome = (item.type || '').toLowerCase() === 'income' || (item.amount || 0) > 0;
  const amountColor = isIncome ? colors.teal : colors.rose;
  const amount = Math.abs(item.amount || 0);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete();
      }}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: isIncome ? colors.tealDim : colors.roseDim }]}>
          <Ionicons
            name={isIncome ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isIncome ? colors.teal : colors.rose}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.description || 'Untitled'}</Text>
          <View style={styles.badgeRow}>
            <FrequencyBadge frequency={item.frequency} />
            <CategoryBadge category={item.category} />
          </View>
        </View>
        <Text style={[styles.cardAmount, { color: amountColor }]}>
          {isIncome ? '+' : '-'}{formatGBP(amount)}
        </Text>
      </View>

      {item.next_date && (
        <View style={styles.cardFooter}>
          <Ionicons name="calendar-outline" size={12} color={colors.text3} />
          <Text style={styles.nextDate}>Next: {formatDate(item.next_date)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function RecurringTransactionsScreen() {
  const [rules, setRules] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.getRecurring();
      setRules(Array.isArray(result) ? result : result.rules || result.recurring || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const handleDelete = (item: any) => {
    Alert.alert(
      'Delete Recurring Rule?',
      `Remove "${item.description || 'this rule'}"? Future auto-transactions will stop.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.deleteRecurring(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={({ item }) => (
          <RecurringCard item={item} onDelete={() => handleDelete(item)} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="repeat-outline" size={56} color={colors.text3} />
            <Text style={styles.emptyTitle}>No recurring rules</Text>
            <Text style={styles.emptySubtitle}>
              Set up recurring transactions for rent, salary, subscriptions, and more.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/modals/add-recurring')}
            >
              <Ionicons name="add" size={18} color={colors.bg} />
              <Text style={styles.emptyBtnText}>Add Recurring</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      {rules.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/modals/add-recurring');
          }}
        >
          <Ionicons name="add" size={24} color={colors.bg} />
          <Text style={styles.fabText}>Add Recurring</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  listContent: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  cardAmount: { fontSize: 16, fontWeight: '700' },

  freqBadge: {
    borderRadius: radius.sm, borderWidth: 1,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  freqText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  catBadge: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  catText: { fontSize: 10, color: colors.text3 },

  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  nextDate: { fontSize: 12, color: colors.text3 },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.xxl },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: colors.bg },

  fab: {
    position: 'absolute', bottom: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fabText: { fontSize: 15, fontWeight: '700', color: colors.bg },
});
