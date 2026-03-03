// app/(tabs)/index.tsx  — Overview Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
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
      <Text style={[styles.heroValue, { color: nw >= 0 ? colors.primary : colors.rose }]}>
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

/* ── Wealth Intelligence Circular Arc ── */
function ScoreArc({ score, grade }: { score: number; grade: string }) {
  const size = 140;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  // Show 270 degrees of arc (3/4 circle), starting from bottom-left
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const filledLength = arcLength * Math.min(Math.max(score, 0), 100) / 100;
  const gapLength = arcLength - filledLength;

  const scoreColor =
    score >= 80 ? colors.teal :
    score >= 60 ? colors.primary :
    score >= 40 ? '#F59E0B' :
    colors.rose;

  return (
    <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background arc */}
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={colors.surface3}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={-circumference * 0.125}
            strokeLinecap="round"
            rotation={0}
            originX={cx}
            originY={cy}
          />
          {/* Filled arc */}
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${filledLength} ${gapLength + (circumference - arcLength)}`}
            strokeDashoffset={-circumference * 0.125}
            strokeLinecap="round"
            rotation={0}
            originX={cx}
            originY={cy}
          />
        </Svg>
        {/* Center text */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: scoreColor }}>{grade}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 }}>{score}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 10, letterSpacing: 2, color: colors.text3, textTransform: 'uppercase', marginTop: 4 }}>
        WEALTH SCORE
      </Text>
    </View>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const barColor =
    pct >= 70 ? colors.teal :
    pct >= 40 ? colors.primary :
    colors.rose;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: colors.text2 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: barColor }}>{pct}</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.surface3, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: barColor, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function WealthIntelligenceCard({ wi }: { wi: any }) {
  const dims = wi.dimensions || {};
  const gradeForScore = (s: number) => {
    if (s >= 90) return 'A+';
    if (s >= 80) return 'A';
    if (s >= 70) return 'B+';
    if (s >= 60) return 'B';
    if (s >= 50) return 'C';
    if (s >= 40) return 'D';
    return 'F';
  };
  const grade = wi.grade || gradeForScore(wi.score || 0);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Wealth Intelligence</Text>
      <ScoreArc score={wi.score || 0} grade={grade} />
      <DimensionBar label="Stability" value={dims.stability || 0} />
      <DimensionBar label="Growth" value={dims.growth || 0} />
      <DimensionBar label="Tax Efficiency" value={dims.tax_efficiency || 0} />
      <DimensionBar label="Diversification" value={dims.diversification || 0} />
    </View>
  );
}

/* ── Stability & Risk ── */
function StabilityRiskRow({ totals }: { totals: any }) {
  const emergencyMonths = totals.emergency_fund_months ?? 0;
  const dti = totals.debt_to_income_ratio ?? 0;
  const savingsRate = totals.savings_rate ?? 0;

  const emergencyPct = Math.min(emergencyMonths / 6, 1) * 100;
  const emergencyColor = emergencyMonths >= 6 ? colors.teal : emergencyMonths >= 3 ? '#F59E0B' : colors.rose;
  const dtiColor = dti <= 0.3 ? colors.teal : dti <= 0.5 ? '#F59E0B' : colors.rose;
  const savingsColor = savingsRate >= 20 ? colors.teal : savingsRate >= 10 ? '#F59E0B' : colors.rose;

  return (
    <View>
      <Text style={styles.sectionTitle}>Stability & Risk</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {/* Emergency Fund */}
        <View style={styles.miniStatCard}>
          <Text style={styles.miniStatLabel}>Emergency Fund</Text>
          <Text style={[styles.miniStatValue, { color: emergencyColor }]}>
            {emergencyMonths.toFixed(1)} mo
          </Text>
          <View style={{ height: 4, backgroundColor: colors.surface3, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ height: 4, width: `${emergencyPct}%`, backgroundColor: emergencyColor, borderRadius: 2 }} />
          </View>
          <Text style={{ fontSize: 9, color: colors.text3, marginTop: 3 }}>Target: 6 months</Text>
        </View>

        {/* Debt-to-Income */}
        <View style={styles.miniStatCard}>
          <Text style={styles.miniStatLabel}>Debt-to-Income</Text>
          <Text style={[styles.miniStatValue, { color: dtiColor }]}>
            {(dti * 100).toFixed(0)}%
          </Text>
          <View style={{ height: 4, backgroundColor: colors.surface3, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ height: 4, width: `${Math.min(dti * 100, 100)}%`, backgroundColor: dtiColor, borderRadius: 2 }} />
          </View>
        </View>

        {/* Savings Rate */}
        <View style={styles.miniStatCard}>
          <Text style={styles.miniStatLabel}>Savings Rate</Text>
          <Text style={[styles.miniStatValue, { color: savingsColor }]}>
            {savingsRate.toFixed(0)}%
          </Text>
          <View style={{ height: 4, backgroundColor: colors.surface3, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ height: 4, width: `${Math.min(savingsRate, 100)}%`, backgroundColor: savingsColor, borderRadius: 2 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ── Recommended Actions ── */
function RecommendedActions({ recommendations }: { recommendations: string[] }) {
  const items = (recommendations || []).slice(0, 3);
  if (!items.length) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Recommended Actions</Text>
      {items.map((rec, i) => (
        <TouchableOpacity key={i} style={styles.recCard} activeOpacity={0.7}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={{ flexShrink: 0 }} />
          <Text style={styles.recText} numberOfLines={2}>{rec}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text3} style={{ flexShrink: 0 }} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function OverviewScreen() {
  const [data, setData] = useState<any>(null);
  const [wi, setWi] = useState<any>(null);
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
    setWi(null);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  // Load wealth intelligence after main data is available
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getWealthIntelligence();
        if (!cancelled) setWi(result);
      } catch (e) {
        console.error('Wealth intelligence load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
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

      {/* ── NEW: Wealth Intelligence Score ── */}
      {wi && <WealthIntelligenceCard wi={wi} />}

      {/* ── NEW: Stability & Risk ── */}
      {data && (
        <View style={styles.card}>
          <StabilityRiskRow totals={totals} />
        </View>
      )}

      {/* ── NEW: Recommended Actions ── */}
      {wi?.recommendations && (
        <View style={styles.card}>
          <RecommendedActions recommendations={wi.recommendations} />
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        {[
          { label: 'Add Transaction', icon: 'add-circle', route: '/modals/add-transaction', color: colors.primary },
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
    borderColor: 'rgba(59,130,246,0.2)',
    ...shadow.card,
  },
  heroLabel: { fontSize: 10, letterSpacing: 2, color: 'rgba(59,130,246,0.6)', textTransform: 'uppercase', marginBottom: 4 },
  heroValue: { fontSize: 44, fontWeight: '700', marginBottom: spacing.md },
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
  statValue: { fontSize: 20, fontWeight: '600', color: colors.text },
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

  // ── New styles for added sections ──
  miniStatCard: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniStatLabel: {
    fontSize: 9,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recText: {
    flex: 1,
    fontSize: 13,
    color: colors.text2,
    lineHeight: 18,
  },
});
