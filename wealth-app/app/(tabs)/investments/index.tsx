// app/(tabs)/investments.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';

// ─── Bucket config ──────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<string, { label: string; color: string; type: string }> = {
  isa: { label: 'ISA', color: colors.primary, type: 'isa' },
  stocks: { label: 'Stocks', color: colors.cyan, type: 'stocks' },
  crypto: { label: 'Crypto', color: colors.lavender, type: 'crypto' },
  pensions: { label: 'Pensions', color: '#F59E0B', type: 'pensions' },
  rsu: { label: 'RSUs', color: '#EC4899', type: 'rsu' },
  custom: { label: 'Custom', color: colors.text2, type: 'custom' },
};

// ─── Row component ──────────────────────────────────────────────────────────

function InvestmentRow({
  item,
  type,
  onDelete,
}: {
  item: any;
  type: string;
  onDelete: (type: string, id: string) => void;
}) {
  const isCrypto = type === 'crypto';
  const currentVal = isCrypto
    ? (item.current_price || 0) * (item.amount || 0)
    : (item.current_value || item.value || 0);
  const costBasis = isCrypto
    ? (item.buy_price || 0) * (item.amount || 0)
    : (item.invested || item.cost_basis || 0);
  const gain = currentVal - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  const isUp = gain >= 0;

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const id = item.id || item._id || '';
    if (!id) return;
    Alert.alert(
      'Delete Holding',
      `Remove "${item.name || item.ticker || 'this holding'}" from ${type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(type, id),
        },
      ],
    );
  };

  return (
    <Pressable onLongPress={handleLongPress} style={styles.investRow}>
      <View style={styles.investLeft}>
        <Text style={styles.investName}>{item.name || item.ticker || '—'}</Text>
        {isCrypto ? (
          <Text style={styles.investMeta}>{item.amount} {item.ticker}</Text>
        ) : (
          <Text style={styles.investMeta}>
            {item.provider || item.platform || BUCKET_CONFIG[type]?.label || type}
          </Text>
        )}
      </View>
      <View style={styles.investRight}>
        <Text style={styles.investValue}>{formatGBP(currentVal)}</Text>
        {costBasis > 0 && (
          <View style={styles.gainRow}>
            <Ionicons
              name={isUp ? 'trending-up' : 'trending-down'}
              size={12}
              color={isUp ? colors.teal : colors.rose}
            />
            <Text style={[styles.gainText, { color: isUp ? colors.teal : colors.rose }]}>
              {isUp ? '+' : ''}{formatGBP(gain)} ({gainPct.toFixed(1)}%)
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── CAGR Projector ─────────────────────────────────────────────────────────

function FutureValueProjector({ currentValue }: { currentValue: number }) {
  const [open, setOpen] = useState(false);
  const [annualContrib, setAnnualContrib] = useState('6000');
  const [expectedReturn, setExpectedReturn] = useState('7');
  const [years, setYears] = useState('20');

  const pv = currentValue;
  const pmt = parseFloat(annualContrib) || 0;
  const r = (parseFloat(expectedReturn) || 0) / 100;
  const n = parseInt(years) || 0;

  let fv = 0;
  if (r > 0 && n > 0) {
    const compound = Math.pow(1 + r, n);
    fv = pv * compound + pmt * ((compound - 1) / r);
  } else if (n > 0) {
    fv = pv + pmt * n;
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.projectorToggle}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="calculator-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>Future Value Projector</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.text3}
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.projectorBody}>
          <View style={styles.projectorRow}>
            <View style={styles.projectorField}>
              <Text style={styles.projectorLabel}>Current Value</Text>
              <View style={styles.projectorInputWrap}>
                <Text style={styles.projectorInputPrefix}>£</Text>
                <Text style={styles.projectorInputValue}>
                  {currentValue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>
            <View style={styles.projectorField}>
              <Text style={styles.projectorLabel}>Annual Contribution</Text>
              <View style={styles.projectorInputWrap}>
                <Text style={styles.projectorInputPrefix}>£</Text>
                <TextInput
                  style={styles.projectorInput}
                  value={annualContrib}
                  onChangeText={setAnnualContrib}
                  keyboardType="numeric"
                  placeholderTextColor={colors.text3}
                />
              </View>
            </View>
          </View>
          <View style={styles.projectorRow}>
            <View style={styles.projectorField}>
              <Text style={styles.projectorLabel}>Expected Return</Text>
              <View style={styles.projectorInputWrap}>
                <TextInput
                  style={styles.projectorInput}
                  value={expectedReturn}
                  onChangeText={setExpectedReturn}
                  keyboardType="numeric"
                  placeholderTextColor={colors.text3}
                />
                <Text style={styles.projectorInputSuffix}>%</Text>
              </View>
            </View>
            <View style={styles.projectorField}>
              <Text style={styles.projectorLabel}>Years</Text>
              <View style={styles.projectorInputWrap}>
                <TextInput
                  style={styles.projectorInput}
                  value={years}
                  onChangeText={setYears}
                  keyboardType="numeric"
                  placeholderTextColor={colors.text3}
                />
              </View>
            </View>
          </View>

          <View style={styles.projectorResult}>
            <Text style={styles.projectorResultLabel}>PROJECTED VALUE</Text>
            <Text style={styles.projectorResultValue}>{formatGBP(fv, 0)}</Text>
            <Text style={styles.projectorResultSub}>
              after {years} years at {expectedReturn}% p.a.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Allocation Dashboard ───────────────────────────────────────────────────

function AllocationDashboard({
  buckets,
  targets,
  portfolioTotal,
}: {
  buckets: { key: string; label: string; value: number; color: string }[];
  targets: Record<string, number>;
  portfolioTotal: number;
}) {
  const getDriftColor = (drift: number) => {
    const abs = Math.abs(drift);
    if (abs <= 5) return colors.teal;
    if (abs <= 10) return '#F59E0B';
    return colors.rose;
  };

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Allocation</Text>
        <TouchableOpacity
          onPress={() =>
            Alert.alert(
              'Set Targets',
              'Use the API endpoint POST /api/allocation-targets to configure your ideal allocation percentages for each asset class.',
            )
          }
        >
          <Text style={styles.linkText}>Set Targets</Text>
        </TouchableOpacity>
      </View>

      {/* Combined allocation bar */}
      <View style={styles.allocationBar}>
        {buckets.map(({ label, value, color }) => {
          const pct = portfolioTotal > 0 ? value / portfolioTotal : 0;
          if (pct <= 0) return null;
          return (
            <View
              key={label}
              style={[styles.allocationSegment, { flex: pct, backgroundColor: color }]}
            />
          );
        })}
      </View>

      {/* Per-bucket: actual vs target bars */}
      {buckets.map(({ key, label, value, color }) => {
        const actualPct = portfolioTotal > 0 ? (value / portfolioTotal) * 100 : 0;
        const targetPct = targets[key] ?? 0;
        const drift = actualPct - targetPct;
        const hasTarget = targetPct > 0;

        return (
          <View key={key} style={styles.allocRow}>
            <View style={styles.allocLabelCol}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.allocLabel}>{label}</Text>
            </View>
            <View style={styles.allocBarsCol}>
              {/* Actual bar */}
              <View style={styles.allocBarTrack}>
                <View
                  style={[
                    styles.allocBarFill,
                    { width: `${Math.min(actualPct, 100)}%`, backgroundColor: color },
                  ]}
                />
              </View>
              {/* Target bar */}
              {hasTarget && (
                <View style={styles.allocBarTrack}>
                  <View
                    style={[
                      styles.allocBarFill,
                      {
                        width: `${Math.min(targetPct, 100)}%`,
                        backgroundColor: color,
                        opacity: 0.3,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
            <View style={styles.allocValuesCol}>
              <Text style={[styles.allocPct, { color }]}>{actualPct.toFixed(1)}%</Text>
              {hasTarget && (
                <Text style={[styles.allocDrift, { color: getDriftColor(drift) }]}>
                  {drift >= 0 ? '+' : ''}{drift.toFixed(1)}%
                </Text>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.allocLegendRow}>
        <View style={styles.allocLegendItem}>
          <View style={[styles.allocLegendSwatch, { backgroundColor: colors.primary }]} />
          <Text style={styles.allocLegendText}>Actual</Text>
        </View>
        <View style={styles.allocLegendItem}>
          <View style={[styles.allocLegendSwatch, { backgroundColor: colors.primary, opacity: 0.3 }]} />
          <Text style={styles.allocLegendText}>Target</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function InvestmentsScreen() {
  const router = useRouter();
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

  useEffect(() => {
    load();
  }, []);

  const handleDeleteHolding = async (type: string, id: string) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await api.deleteHolding(type, id);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete holding');
    }
  };

  // ── Derive data ──

  const totals = data?.totals || {};
  const investments = data?.investments || {};
  const allocationTargets: Record<string, number> = data?.allocation_targets || {};
  const disposals: any[] = data?.disposals || [];

  // Build buckets from all investment types
  const bucketKeys = ['isa', 'stocks', 'crypto', 'pensions', 'rsu', 'custom'] as const;

  const bucketTotals: Record<string, number> = {};
  const bucketItems: Record<string, any[]> = {};

  for (const key of bucketKeys) {
    const items: any[] = investments[key] || [];
    bucketItems[key] = items;

    // Try totals first, then compute from items
    const totalsKey = `${key}_gbp`;
    if (totals[totalsKey] != null) {
      bucketTotals[key] = totals[totalsKey];
    } else {
      bucketTotals[key] = items.reduce((sum: number, item: any) => {
        if (key === 'crypto') {
          return sum + (item.current_price || 0) * (item.amount || 0);
        }
        return sum + (item.current_value || item.value || 0);
      }, 0);
    }
  }

  const investTotal = Object.values(bucketTotals).reduce((a, b) => a + b, 0);

  // Portfolio items for allocation (includes non-investment assets too)
  const allocationBuckets = bucketKeys
    .map((key) => ({
      key,
      label: BUCKET_CONFIG[key].label,
      value: bucketTotals[key],
      color: BUCKET_CONFIG[key].color,
    }))
    .filter((b) => b.value > 0);

  // Also include property & cash in the overall allocation view
  const propertyVal = data?.property_value || 0;
  const cashVal = totals.bank_balance || 0;
  const fullAllocationBuckets = [
    ...allocationBuckets,
    ...(propertyVal > 0
      ? [{ key: 'property', label: 'Property', value: propertyVal, color: colors.teal }]
      : []),
    ...(cashVal > 0
      ? [{ key: 'cash', label: 'Cash', value: cashVal, color: colors.text2 }]
      : []),
  ];
  const fullPortfolioTotal = fullAllocationBuckets.reduce((s, i) => s + i.value, 0);

  // Dividends
  const totalDividends = totals.total_dividends || 0;
  const dividendYield = totals.dividend_yield || 0;

  // Disposals / CGT
  const UK_CGT_EXEMPTION = 3000;
  const totalGains = disposals.reduce(
    (sum: number, d: any) => sum + (d.gain || d.gain_loss || 0),
    0,
  );
  const exemptionUsed = Math.min(Math.max(totalGains, 0), UK_CGT_EXEMPTION);
  const exemptionRemaining = UK_CGT_EXEMPTION - exemptionUsed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>TOTAL INVESTMENTS</Text>
          <Text style={styles.heroValue}>{formatGBP(investTotal)}</Text>
          <View style={styles.heroBuckets}>
            {bucketKeys.map((key) => {
              const val = bucketTotals[key];
              if (val <= 0) return null;
              const cfg = BUCKET_CONFIG[key];
              return (
                <View key={key} style={styles.heroBucketItem}>
                  <Text style={styles.heroItemLabel}>{cfg.label}</Text>
                  <Text style={[styles.heroItemValue, { color: cfg.color }]}>
                    {formatGBP(val)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── CAGR Projector ── */}
        <FutureValueProjector currentValue={investTotal} />

        {/* ── Allocation Dashboard ── */}
        {fullAllocationBuckets.length > 0 && (
          <AllocationDashboard
            buckets={fullAllocationBuckets}
            targets={allocationTargets}
            portfolioTotal={fullPortfolioTotal}
          />
        )}

        {/* ── Dividends Summary ── */}
        {(totalDividends > 0 || dividendYield > 0) && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Dividends</Text>
            <View style={styles.dividendsRow}>
              <View style={styles.dividendStat}>
                <Text style={styles.dividendStatLabel}>Total Received</Text>
                <Text style={[styles.dividendStatValue, { color: colors.teal }]}>
                  {formatGBP(totalDividends)}
                </Text>
              </View>
              <View style={styles.dividendDivider} />
              <View style={styles.dividendStat}>
                <Text style={styles.dividendStatLabel}>Yield</Text>
                <Text style={[styles.dividendStatValue, { color: colors.primary }]}>
                  {dividendYield.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Investment Bucket Sections ── */}
        {bucketKeys.map((key) => {
          const items = bucketItems[key];
          const total = bucketTotals[key];
          const cfg = BUCKET_CONFIG[key];
          if (items.length === 0 && total <= 0) return null;

          return (
            <View key={key} style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.legendDot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.sectionTitle}>{cfg.label}</Text>
                </View>
                <Text style={[styles.sectionTotal, { color: cfg.color }]}>
                  {formatGBP(total)}
                </Text>
              </View>
              {items.length > 0 ? (
                items.map((item: any, i: number) => (
                  <InvestmentRow
                    key={item.id || item._id || i}
                    item={item}
                    type={key}
                    onDelete={handleDeleteHolding}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>No {cfg.label.toLowerCase()} holdings</Text>
              )}
            </View>
          );
        })}

        {/* ── Disposals / CGT ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Disposals & CGT</Text>
            <TouchableOpacity onPress={() => router.push('/modals/add-disposal')}>
              <View style={styles.addBtn}>
                <Ionicons name="add" size={14} color={colors.primary} />
                <Text style={styles.addBtnText}>Add Disposal</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* CGT summary row */}
          <View style={styles.cgtSummaryRow}>
            <View style={styles.cgtStat}>
              <Text style={styles.cgtStatLabel}>Total Gains</Text>
              <Text
                style={[
                  styles.cgtStatValue,
                  { color: totalGains >= 0 ? colors.teal : colors.rose },
                ]}
              >
                {formatGBP(totalGains)}
              </Text>
            </View>
            <View style={styles.cgtStat}>
              <Text style={styles.cgtStatLabel}>Exemption Used</Text>
              <Text style={styles.cgtStatValue}>{formatGBP(exemptionUsed, 0)}</Text>
            </View>
            <View style={styles.cgtStat}>
              <Text style={styles.cgtStatLabel}>Remaining</Text>
              <Text
                style={[
                  styles.cgtStatValue,
                  { color: exemptionRemaining > 0 ? colors.teal : colors.rose },
                ]}
              >
                {formatGBP(exemptionRemaining, 0)}
              </Text>
            </View>
          </View>

          {/* Disposal list */}
          {disposals.length > 0 ? (
            disposals.map((d: any, i: number) => {
              const gainVal = d.gain || d.gain_loss || 0;
              const isGain = gainVal >= 0;
              return (
                <View key={d.id || d._id || i} style={styles.disposalRow}>
                  <View>
                    <Text style={styles.investName}>
                      {d.asset || d.name || 'Disposal'}
                    </Text>
                    <Text style={styles.investMeta}>
                      {d.date ? formatDate(d.date) : '—'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.disposalGain,
                      { color: isGain ? colors.teal : colors.rose },
                    ]}
                  >
                    {isGain ? '+' : ''}{formatGBP(gainVal)}
                  </Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No disposals recorded</Text>
          )}
        </View>

        {/* ── Other Assets ── */}
        {(data?.property_value > 0 || data?.other_assets > 0 || data?.debts > 0) && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Other Assets</Text>
            {[
              { label: 'Property', value: data?.property_value || 0, color: colors.teal },
              { label: 'Other Assets', value: data?.other_assets || 0, color: colors.text2 },
              { label: 'Debts', value: -(data?.debts || 0), color: colors.rose },
            ]
              .filter((i) => i.value !== 0)
              .map(({ label, value, color }) => (
                <View key={label} style={styles.otherRow}>
                  <Text style={styles.otherLabel}>{label}</Text>
                  <Text style={[styles.otherValue, { color }]}>{formatGBP(value)}</Text>
                </View>
              ))}
          </View>
        )}

        {/* Bottom spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Floating Action Button ── */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/modals/add-holding');
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  heroLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(59,130,246,0.6)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 40,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  heroBuckets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    rowGap: spacing.sm,
  },
  heroBucketItem: {},
  heroItemLabel: {
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroItemValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sectionTotal: { fontSize: 16, fontWeight: '700', color: colors.primary },

  // Allocation
  allocationBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.md,
    gap: 2,
  },
  allocationSegment: { height: 8, borderRadius: 2 },

  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  allocLabelCol: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  allocLabel: { fontSize: 12, color: colors.text2 },
  allocBarsCol: { flex: 1, gap: 3 },
  allocBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  allocBarFill: { height: 6, borderRadius: 3 },
  allocValuesCol: { width: 55, alignItems: 'flex-end' as const },
  allocPct: { fontSize: 12, fontWeight: '600' },
  allocDrift: { fontSize: 10, fontWeight: '500' },

  allocLegendRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  allocLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  allocLegendSwatch: { width: 12, height: 6, borderRadius: 3 },
  allocLegendText: { fontSize: 11, color: colors.text3 },

  legendDot: { width: 8, height: 8, borderRadius: 4 },

  // Investment rows
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  investLeft: {},
  investName: { fontSize: 14, color: colors.text, fontWeight: '500' },
  investMeta: { fontSize: 11, color: colors.text3, marginTop: 2 },
  investRight: { alignItems: 'flex-end' as const },
  investValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  gainText: { fontSize: 11 },

  emptyText: {
    fontSize: 13,
    color: colors.text3,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Other assets
  otherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  otherLabel: { fontSize: 14, color: colors.text2 },
  otherValue: { fontSize: 14, fontWeight: '700' },

  // Projector
  projectorToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectorBody: { marginTop: spacing.md, gap: spacing.md },
  projectorRow: { flexDirection: 'row', gap: spacing.md },
  projectorField: { flex: 1 },
  projectorLabel: {
    fontSize: 11,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  projectorInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border2,
  },
  projectorInputPrefix: { fontSize: 14, color: colors.text3, marginRight: 4 },
  projectorInputSuffix: { fontSize: 14, color: colors.text3, marginLeft: 4 },
  projectorInputValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  projectorInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    padding: 0,
  },
  projectorResult: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.primaryDim,
    borderRadius: radius.md,
  },
  projectorResultLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  projectorResultValue: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.primary,
  },
  projectorResultSub: { fontSize: 12, color: colors.text3, marginTop: 4 },

  // Dividends
  dividendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dividendStat: { flex: 1, alignItems: 'center' as const },
  dividendStatLabel: { fontSize: 11, color: colors.text3, marginBottom: 4 },
  dividendStatValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  dividendDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  // Disposals / CGT
  cgtSummaryRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cgtStat: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center' as const,
  },
  cgtStatLabel: { fontSize: 10, color: colors.text3, marginBottom: 2 },
  cgtStatValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  disposalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  disposalGain: { fontSize: 14, fontWeight: '700' },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryDim,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  linkText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
});
