// app/screens/net-worth.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';
import HeroCard from '../../../components/cards/HeroCard';
import SectionCard from '../../../components/cards/SectionCard';
import DoughnutChart from '../../../components/charts/DoughnutChart';
import LineChart from '../../../components/charts/LineChart';
import ProgressBar from '../../../components/charts/ProgressBar';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.sm) / 2;

interface BreakdownItem {
  label: string;
  value: number;
  color: string;
  icon: string;
  type: 'asset' | 'liability';
}

const BREAKDOWN: BreakdownItem[] = [
  { label: 'Cash & Savings', value: 0, color: colors.teal, icon: 'cash-outline', type: 'asset' },
  { label: 'ISA', value: 0, color: colors.primary, icon: 'shield-checkmark-outline', type: 'asset' },
  { label: 'Crypto', value: 0, color: '#F59E0B', icon: 'logo-bitcoin', type: 'asset' },
  { label: 'Property', value: 0, color: '#F97316', icon: 'home-outline', type: 'asset' },
  { label: 'Pension', value: 0, color: colors.lavender, icon: 'hourglass-outline', type: 'asset' },
  { label: 'Other Assets', value: 0, color: colors.cyan, icon: 'layers-outline', type: 'asset' },
  { label: 'Mortgages', value: 0, color: colors.rose, icon: 'business-outline', type: 'liability' },
  { label: 'Other Debts', value: 0, color: '#EC4899', icon: 'card-outline', type: 'liability' },
];

export default function NetWorthScreen() {
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

  const totals = data?.totals || {};
  const netWorth = (totals.total_assets || 0) - (totals.total_liabilities || 0);
  const totalAssets = totals.total_assets || 0;
  const totalLiabilities = totals.total_liabilities || 0;

  // Build breakdown values from totals
  const breakdown = BREAKDOWN.map(item => {
    let value = 0;
    switch (item.label) {
      case 'Cash & Savings': value = totals.cash || 0; break;
      case 'ISA': value = totals.isa || 0; break;
      case 'Crypto': value = totals.crypto || 0; break;
      case 'Property': value = totals.property || 0; break;
      case 'Pension': value = totals.pension || 0; break;
      case 'Other Assets': value = totals.other_assets || 0; break;
      case 'Mortgages': value = totals.mortgages || 0; break;
      case 'Other Debts': value = totals.other_debts || 0; break;
    }
    return { ...item, value };
  });

  const assets = breakdown.filter(b => b.type === 'asset');
  const liabilities = breakdown.filter(b => b.type === 'liability');

  // Doughnut segments (assets only)
  const doughnutSegments = assets
    .filter(a => a.value > 0)
    .map(a => ({ value: a.value, color: a.color, label: a.label }));

  // Net worth history for line chart
  const history = data?.net_worth_history || [];
  const historyLabels = history.map((h: any) =>
    new Date(h.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  );
  const historyValues = history.map((h: any) => h.net_worth ?? h.value ?? 0);

  // Emergency fund calculation
  const monthlyExpenses = totals.monthly_expenses || totals.avg_monthly_spend || 2000;
  const cashReserves = totals.cash || totals.emergency_fund || 0;
  const monthsCovered = monthlyExpenses > 0 ? cashReserves / monthlyExpenses : 0;
  const targetMonths = 6;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Hero */}
      <HeroCard
        label="Net Worth"
        value={formatGBP(netWorth)}
        valueColor={netWorth >= 0 ? colors.teal : colors.rose}
        items={[
          { label: 'Cash', value: formatGBP(totals.cash || 0), color: colors.teal },
          { label: 'Invested', value: formatGBP(totals.invested || totals.isa || 0), color: colors.primary },
          { label: 'Property', value: formatGBP(totals.property || 0), color: '#F97316' },
          { label: 'Debts', value: formatGBP(totalLiabilities), color: colors.rose },
        ]}
      />

      {/* Asset Breakdown Grid */}
      <SectionCard title="Asset Breakdown">
        <View style={styles.grid}>
          {assets.map(item => {
            const pct = totalAssets > 0 ? ((item.value / totalAssets) * 100).toFixed(1) : '0.0';
            return (
              <View key={item.label} style={styles.gridCard}>
                <View style={styles.gridCardHeader}>
                  <View style={[styles.gridIcon, { backgroundColor: item.color + '1A' }]}>
                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={styles.gridPct}>{pct}%</Text>
                </View>
                <Text style={styles.gridLabel}>{item.label}</Text>
                <Text style={[styles.gridValue, { color: item.color }]}>{formatGBP(item.value)}</Text>
              </View>
            );
          })}
        </View>
      </SectionCard>

      {/* Liability Breakdown Grid */}
      <SectionCard title="Liabilities">
        <View style={styles.grid}>
          {liabilities.map(item => {
            const pct = totalAssets > 0 ? ((item.value / totalAssets) * 100).toFixed(1) : '0.0';
            return (
              <View key={item.label} style={styles.gridCard}>
                <View style={styles.gridCardHeader}>
                  <View style={[styles.gridIcon, { backgroundColor: item.color + '1A' }]}>
                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={styles.gridPct}>{pct}%</Text>
                </View>
                <Text style={styles.gridLabel}>{item.label}</Text>
                <Text style={[styles.gridValue, { color: item.color }]}>{formatGBP(item.value)}</Text>
              </View>
            );
          })}
        </View>
      </SectionCard>

      {/* Doughnut Chart */}
      <SectionCard title="Asset Composition">
        <View style={styles.chartCenter}>
          <DoughnutChart
            segments={doughnutSegments}
            centerLabel="Total Assets"
            centerValue={formatGBP(totalAssets, 0)}
            centerColor={colors.teal}
          />
        </View>
      </SectionCard>

      {/* Net Worth Over Time */}
      {history.length > 1 && (
        <SectionCard title="Net Worth Over Time">
          <LineChart
            datasets={[
              { values: historyValues, color: colors.primary, label: 'Net Worth', fillOpacity: 0.08 },
            ]}
            labels={historyLabels}
            height={220}
          />
        </SectionCard>
      )}

      {/* Emergency Fund */}
      <SectionCard title="Emergency Fund">
        <View style={styles.emergencyRow}>
          <Text style={styles.emergencyValue}>
            {monthsCovered.toFixed(1)} months
          </Text>
          <Text style={styles.emergencyTarget}>
            Target: {targetMonths} months
          </Text>
        </View>
        <ProgressBar
          value={monthsCovered}
          max={targetMonths}
          color={monthsCovered >= targetMonths ? colors.teal : monthsCovered >= 3 ? '#F59E0B' : colors.rose}
          label="Expenses Covered"
          valueFormat={(v, m) => `${Math.min(Math.round((v / m) * 100), 100)}%`}
          height={8}
        />
        <View style={styles.emergencyDetails}>
          <View style={styles.emergencyDetail}>
            <Text style={styles.emergencyDetailLabel}>Cash reserves</Text>
            <Text style={styles.emergencyDetailValue}>{formatGBP(cashReserves)}</Text>
          </View>
          <View style={styles.emergencyDetail}>
            <Text style={styles.emergencyDetailLabel}>Monthly expenses</Text>
            <Text style={styles.emergencyDetailValue}>{formatGBP(monthlyExpenses)}</Text>
          </View>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gridIcon: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  gridPct: { fontSize: 11, color: colors.text3, fontWeight: '600' },
  gridLabel: { fontSize: 11, color: colors.text2, marginBottom: 2 },
  gridValue: { fontSize: 16, fontWeight: '700', color: colors.text },

  chartCenter: { alignItems: 'center', paddingVertical: spacing.md },

  emergencyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  emergencyValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  emergencyTarget: { fontSize: 12, color: colors.text3 },
  emergencyDetails: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  emergencyDetail: {},
  emergencyDetailLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  emergencyDetailValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
});
