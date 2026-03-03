// app/screens/forecast.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';
import StatCard from '../../../components/cards/StatCard';
import SectionCard from '../../../components/cards/SectionCard';
import LineChart from '../../../components/charts/LineChart';

function monthLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

function shortMonth(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'short' });
  } catch { return dateStr; }
}

export default function ForecastScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getData();
      setData(d);
    } catch (e) { console.error(e); }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const forecast = data?.forecast || [];
  const transactions = data?.transactions || [];
  const totals = data?.totals || {};
  const currentBalance = totals.total_assets || totals.cash || 0;

  // Projected balances at 3, 6, 12 months
  const proj3 = forecast.length >= 3 ? forecast[2] : null;
  const proj6 = forecast.length >= 6 ? forecast[5] : null;
  const proj12 = forecast.length >= 12 ? forecast[11] : forecast[forecast.length - 1] || null;

  const projBalance = (entry: any) => entry?.balance ?? entry?.projected_balance ?? entry?.value ?? 0;
  const delta = (entry: any) => entry ? projBalance(entry) - currentBalance : 0;
  const deltaStr = (d: number) => (d >= 0 ? '+' : '') + formatGBP(d);
  const deltaColor = (d: number) => d >= 0 ? colors.teal : colors.rose;

  // Chart data
  const chartLabels = forecast.map((f: any) => shortMonth(f.date || f.month || ''));
  const chartValues = forecast.map((f: any) => projBalance(f));

  // Future transactions grouped by month
  const today = new Date().toISOString().split('T')[0];
  const futureTxns = transactions
    .filter((t: any) => t.date > today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const groupedByMonth: Record<string, any[]> = {};
  futureTxns.forEach((t: any) => {
    const key = t.date.slice(0, 7);
    if (!groupedByMonth[key]) groupedByMonth[key] = [];
    groupedByMonth[key].push(t);
  });
  const monthKeys = Object.keys(groupedByMonth).sort();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <Text style={styles.screenTitle}>12-Month Forecast</Text>
      <Text style={styles.screenSubtitle}>Projected balances based on recurring income and expenses</Text>

      {/* Stat Cards */}
      <View style={styles.statRow}>
        <StatCard
          label="3 Month"
          value={proj3 ? formatGBP(projBalance(proj3)) : '--'}
          color={colors.primary}
          sub={proj3 ? deltaStr(delta(proj3)) : undefined}
        />
        <StatCard
          label="6 Month"
          value={proj6 ? formatGBP(projBalance(proj6)) : '--'}
          color={colors.lavender}
          sub={proj6 ? deltaStr(delta(proj6)) : undefined}
        />
      </View>
      <View style={styles.statRow}>
        <StatCard
          label="12 Month"
          value={proj12 ? formatGBP(projBalance(proj12)) : '--'}
          color={colors.teal}
          sub={proj12 ? deltaStr(delta(proj12)) : undefined}
        />
        <StatCard
          label="Current"
          value={formatGBP(currentBalance)}
          color={colors.text2}
          sub="Today"
        />
      </View>

      {/* Forecast Line Chart */}
      {forecast.length > 1 && (
        <SectionCard title="Projected Balance">
          <LineChart
            datasets={[
              { values: chartValues, color: colors.primary, label: 'Forecast', fillOpacity: 0.06 },
            ]}
            labels={chartLabels}
            height={220}
          />
        </SectionCard>
      )}

      {/* Scheduled / Future Transactions */}
      {monthKeys.length > 0 && (
        <SectionCard title="Scheduled Transactions">
          {monthKeys.map(monthKey => (
            <View key={monthKey} style={styles.monthGroup}>
              <Text style={styles.monthHeader}>{monthLabel(monthKey + '-01')}</Text>
              {groupedByMonth[monthKey].map((txn: any) => {
                const isIncome = (txn.amount || 0) > 0;
                return (
                  <View key={txn.id || txn.date + txn.description} style={styles.txnRow}>
                    <View style={[styles.txnIcon, { backgroundColor: isIncome ? colors.tealDim : colors.roseDim }]}>
                      <Ionicons
                        name={isIncome ? 'arrow-down' : 'arrow-up'}
                        size={14}
                        color={isIncome ? colors.teal : colors.rose}
                      />
                    </View>
                    <View style={styles.txnInfo}>
                      <Text style={styles.txnDesc} numberOfLines={1}>
                        {txn.description || txn.category || 'Transaction'}
                      </Text>
                      <Text style={styles.txnDate}>{formatDate(txn.date)}</Text>
                    </View>
                    <Text style={[styles.txnAmount, { color: isIncome ? colors.teal : colors.rose }]}>
                      {isIncome ? '+' : ''}{formatGBP(txn.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </SectionCard>
      )}

      {/* Empty state */}
      {forecast.length === 0 && !refreshing && (
        <View style={styles.empty}>
          <Ionicons name="trending-up-outline" size={56} color={colors.text3} />
          <Text style={styles.emptyTitle}>No forecast data</Text>
          <Text style={styles.emptySubtitle}>Add recurring transactions to generate a 12-month forecast</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  screenTitle: { fontSize: 22, color: colors.text, fontWeight: '700' },
  screenSubtitle: { fontSize: 13, color: colors.text3, marginBottom: spacing.sm },

  statRow: { flexDirection: 'row', gap: spacing.sm },

  monthGroup: { marginBottom: spacing.lg },
  monthHeader: {
    fontSize: 13, fontWeight: '600', color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },

  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  txnIcon: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, color: colors.text, fontWeight: '500' },
  txnDate: { fontSize: 11, color: colors.text3, marginTop: 1 },
  txnAmount: { fontSize: 15, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center' },
});
