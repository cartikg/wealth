// app/screens/spending-insights.tsx — Spending analytics & budget tracking
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../../lib/theme';
import { api, formatGBP } from '../../../lib/api';
import SectionCard from '../../../components/cards/SectionCard';
import ProgressBar from '../../../components/charts/ProgressBar';
import BarChart from '../../../components/charts/BarChart';
import AllocationBar from '../../../components/charts/AllocationBar';

export default function SpendingInsightsScreen() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([
        api.getSpendingAnalytics(),
        api.getData(),
      ]);
      setAnalytics(a);
      setData(d);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [load]);

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categories = data?.user_categories || [];
  const budgetCategories = categories.filter((c: any) => c.budget_monthly && c.budget_monthly > 0);
  const monthlyTrend = analytics?.monthly_trend || [];
  const subscriptions = analytics?.subscriptions || [];
  const fixedSpend = analytics?.fixed_spend || 0;
  const variableSpend = analytics?.variable_spend || 0;

  // Category spending from analytics
  const categorySpending = analytics?.category_spending || {};

  // Build bar chart data from last 6 months of monthly_trend
  const last6 = monthlyTrend.slice(-6);
  const barData = last6.map((m: any) => ({
    label: (m.month || '').substring(5) || m.label || '',
    values: [
      { value: m.income || 0, color: colors.teal },
      { value: m.spending || m.expenses || 0, color: colors.rose },
    ],
  }));

  function getBudgetColor(spent: number, budget: number): string {
    const pct = budget > 0 ? spent / budget : 0;
    if (pct > 1) return colors.rose;
    if (pct >= 0.8) return '#F59E0B'; // amber
    return colors.teal;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Budget Tracking */}
      {budgetCategories.length > 0 && (
        <SectionCard title="Budget Tracking">
          {budgetCategories.map((cat: any) => {
            const spent = Math.abs(categorySpending[cat.name] || categorySpending[cat.id] || 0);
            const budget = cat.budget_monthly;
            const budgetColor = getBudgetColor(spent, budget);
            return (
              <ProgressBar
                key={cat.id || cat.name}
                label={cat.name}
                value={spent}
                max={budget}
                color={budgetColor}
                showValue
                valueFormat={(v, m) => `${formatGBP(v)} / ${formatGBP(m)}`}
              />
            );
          })}
        </SectionCard>
      )}

      {/* Monthly Trend */}
      {barData.length > 0 && (
        <SectionCard title="Monthly Trend">
          <BarChart
            data={barData}
            height={100}
            legendItems={[
              { label: 'Income', color: colors.teal },
              { label: 'Spending', color: colors.rose },
            ]}
          />
        </SectionCard>
      )}

      {/* Subscription Detection */}
      {subscriptions.length > 0 && (
        <SectionCard title="Detected Subscriptions">
          {subscriptions.map((sub: any, i: number) => (
            <View key={sub.id || i} style={styles.subRow}>
              <View style={styles.subIconWrap}>
                <Ionicons name="repeat" size={16} color={colors.lavender} />
              </View>
              <View style={styles.subInfo}>
                <Text style={styles.subName} numberOfLines={1}>{sub.description || sub.name}</Text>
                <View style={styles.subMeta}>
                  <View style={styles.freqBadge}>
                    <Text style={styles.freqText}>{sub.frequency || 'monthly'}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.subAmount}>{formatGBP(Math.abs(sub.amount))}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Fixed vs Variable */}
      {(fixedSpend > 0 || variableSpend > 0) && (
        <SectionCard title="Fixed vs Variable Spending">
          <AllocationBar
            segments={[
              { value: fixedSpend, color: colors.primary, label: `Fixed ${formatGBP(fixedSpend)}` },
              { value: variableSpend, color: colors.lavender, label: `Variable ${formatGBP(variableSpend)}` },
            ]}
            height={14}
          />
        </SectionCard>
      )}

      {/* Empty state if no data at all */}
      {!analytics && (
        <View style={styles.empty}>
          <Ionicons name="analytics-outline" size={56} color={colors.text3} />
          <Text style={styles.emptyTitle}>No spending data yet</Text>
          <Text style={styles.emptySubtitle}>
            Add transactions to see spending insights, budget tracking, and trends.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  subIconWrap: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.lavenderDim, alignItems: 'center', justifyContent: 'center',
  },
  subInfo: { flex: 1 },
  subName: { fontSize: 14, fontWeight: '500', color: colors.text },
  subMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  freqBadge: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  freqText: { fontSize: 10, color: colors.text3, textTransform: 'capitalize' },
  subAmount: { fontSize: 14, fontWeight: '600', color: colors.rose },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center', lineHeight: 20 },
});
