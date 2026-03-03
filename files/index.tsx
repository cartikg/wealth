// app/(tabs)/index.tsx  — Overview Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, CATEGORY_COLORS } from '../../lib/theme';
import { api, formatGBP } from '../../lib/api';

const { width } = Dimensions.get('window');

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function NetWorthCard({ totals }: { totals: any }) {
  const nw = totals?.net_worth || 0;
  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroLabel}>NET WORTH</Text>
      <Text style={[styles.heroValue, { color: nw >= 0 ? colors.gold : colors.rose }]}>
        {formatGBP(nw)}
      </Text>
      <View style={styles.heroRow}>
        {[
          { label: 'Cash', value: totals?.bank_balance },
          { label: 'Invested', value: totals?.investments_gbp },
          { label: 'Property', value: totals?.property_value },
          { label: 'Debts', value: -(totals?.debts || 0) },
        ].map(({ label, value }) => (
          <View key={label} style={styles.heroItem}>
            <Text style={styles.heroItemLabel}>{label}</Text>
            <Text style={[styles.heroItemValue, { color: (value || 0) >= 0 ? colors.teal : colors.rose }]}>
              {formatGBP(value || 0, 0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MiniBarChart({ data }: { data: { label: string; income: number; spend: number }[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.spend]), 1);
  const barH = 80;
  return (
    <View>
      <Text style={styles.sectionTitle}>Income vs Spending</Text>
      <View style={styles.chartRow}>
        {data.map((d, i) => (
          <View key={i} style={styles.chartCol}>
            <View style={styles.barGroup}>
              <View style={[styles.bar, { height: (d.income / maxVal) * barH, backgroundColor: colors.teal, opacity: 0.8 }]} />
              <View style={[styles.bar, { height: (d.spend / maxVal) * barH, backgroundColor: colors.rose, opacity: 0.8 }]} />
            </View>
            <Text style={styles.chartLabel}>{d.label.split(' ')[0]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.teal }]} /><Text style={styles.legendText}>Income</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.rose }]} /><Text style={styles.legendText}>Spending</Text></View>
      </View>
    </View>
  );
}

function CategoryList({ categories }: { categories: Record<string, number> }) {
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Top Spending</Text>
      {sorted.map(([cat, amount]) => {
        const pct = total > 0 ? (amount / total) : 0;
        const col = CATEGORY_COLORS[cat] || colors.text3;
        return (
          <View key={cat} style={styles.catRow}>
            <View style={[styles.catDot, { backgroundColor: col }]} />
            <Text style={styles.catName}>{cat}</Text>
            <View style={styles.catBarWrap}>
              <View style={[styles.catBar, { width: `${pct * 100}%`, backgroundColor: col, opacity: 0.7 }]} />
            </View>
            <Text style={[styles.catAmount, { color: col }]}>{formatGBP(amount, 0)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function OverviewScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getData();
      setData(d);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const totals = data?.totals || {};
  const trendRaw = data?.monthly_trend || {};
  const trend = Object.entries(trendRaw).map(([label, v]: [string, any]) => ({
    label, income: v.income, spend: v.spend,
  }));
  const categories = data?.categories || {};
  const forecast = data?.forecast || [];
  const fc12 = forecast[11]?.balance;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      {/* Net Worth Hero */}
      <NetWorthCard totals={totals} />

      {/* Quick stats */}
      <View style={styles.statsGrid}>
        <StatCard label="Monthly Income" value={formatGBP(totals.monthly_income)} color={colors.teal} />
        <StatCard label="Spent (30d)" value={formatGBP(totals.monthly_spend)} color={colors.rose} />
        <StatCard label="ISA" value={formatGBP(totals.isa_gbp)} />
        <StatCard label="Crypto" value={formatGBP(totals.crypto_gbp)} />
      </View>

      {/* 12-month forecast pill */}
      {fc12 != null && (
        <TouchableOpacity style={styles.forecastPill}>
          <Ionicons name="trending-up" size={16} color={fc12 >= 0 ? colors.teal : colors.rose} />
          <Text style={styles.forecastText}>
            In 12 months: <Text style={{ color: fc12 >= 0 ? colors.teal : colors.rose, fontWeight: '700' }}>{formatGBP(fc12)}</Text>
          </Text>
        </TouchableOpacity>
      )}

      {/* Trend chart */}
      <View style={styles.card}>
        <MiniBarChart data={trend} />
      </View>

      {/* Category breakdown */}
      <View style={styles.card}>
        <CategoryList categories={categories} />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        {[
          { label: 'Add Transaction', icon: 'add-circle', route: '/modals/add-transaction', color: colors.gold },
          { label: 'Scan Receipt', icon: 'camera', route: '/modals/scan-receipt', color: colors.teal },
          { label: 'Connect Bank', icon: 'business', route: '/modals/connect-bank', color: colors.lavender },
          { label: 'Settings', icon: 'settings', route: '/modals/settings', color: colors.text3 },
        ].map(({ label, icon, route, color }) => (
          <TouchableOpacity
            key={label}
            style={styles.actionBtn}
            onPress={() => router.push(route as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${color}22` }]}>
              <Ionicons name={icon as any} size={22} color={color} />
            </View>
            <Text style={styles.actionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Exchange rates */}
      {data?.exchange_rates && (
        <View style={styles.ratesRow}>
          <Text style={styles.rateText}>1 INR = {(data.exchange_rates.INR || 0).toFixed(6)} GBP</Text>
          <Text style={styles.rateText}>1 USD = {(data.exchange_rates.USD || 0).toFixed(4)} GBP</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.2)',
    ...shadow.card,
  },
  heroLabel: { fontSize: 10, letterSpacing: 2, color: 'rgba(212,168,67,0.6)', textTransform: 'uppercase', marginBottom: 4 },
  heroValue: { fontFamily: 'Georgia', fontSize: 44, fontWeight: '700', marginBottom: spacing.md },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  heroItem: {},
  heroItemLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  heroItemValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1, minWidth: (width - spacing.lg * 2 - spacing.sm) / 2 - 1,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  statLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  statValue: { fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', color: colors.text },
  statSub: { fontSize: 11, color: colors.text3, marginTop: 3 },

  forecastPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.full,
    padding: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  forecastText: { fontSize: 13, color: colors.text2 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.text2, marginBottom: spacing.md, marginTop: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.8 },

  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 90, marginBottom: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barGroup: { flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  bar: { width: 8, borderRadius: 3, minHeight: 2 },
  chartLabel: { fontSize: 9, color: colors.text3, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text3 },

  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  catDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  catName: { fontSize: 12, color: colors.text2, width: 100, flexShrink: 0 },
  catBarWrap: { flex: 1, height: 4, backgroundColor: colors.surface3, borderRadius: 2, overflow: 'hidden' },
  catBar: { height: 4, borderRadius: 2 },
  catAmount: { fontSize: 12, fontWeight: '600', width: 64, textAlign: 'right', flexShrink: 0 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg, gap: spacing.sm },
  actionBtn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  actionIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 10, color: colors.text3, textAlign: 'center' },

  ratesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  rateText: { fontSize: 11, color: colors.text3 },
});
