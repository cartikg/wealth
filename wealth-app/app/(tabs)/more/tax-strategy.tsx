// app/screens/tax-strategy.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP } from '../../../lib/api';
import HeroCard from '../../../components/cards/HeroCard';
import SectionCard from '../../../components/cards/SectionCard';
import ProgressBar from '../../../components/charts/ProgressBar';

const PRIORITY_COLORS: Record<string, string> = {
  critical: colors.rose,
  high: colors.primary,
  medium: colors.lavender,
  low: colors.text3,
};

export default function TaxStrategyScreen() {
  const [taxData, setTaxData] = useState<any>(null);
  const [appData, setAppData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [tax, app] = await Promise.all([
        api.getTaxOptimisation(),
        api.getData(),
      ]);
      setTaxData(tax);
      setAppData(app);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load tax data');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading tax strategy...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color={colors.rose} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const summary = taxData?.summary || {};
  const recommendations = taxData?.recommendations || [];
  const allowances = appData?.allowances || {};
  const incomeTax = appData?.income_tax;

  const isaUsed = taxData?.summary?.isa_used ?? allowances?.isa?.used ?? 0;
  const pensionUsed = allowances?.pension?.used ?? 0;
  const cgtUsed = allowances?.cgt_exempt?.used ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Hero */}
      <HeroCard
        label="TAX SAVINGS"
        value={formatGBP(taxData?.total_projected_annual_saving)}
        valueColor={colors.teal}
        items={[
          { label: 'Marginal Rate', value: summary.marginal_tax_rate || '--' },
          { label: 'Recommendations', value: String(recommendations.length) },
        ]}
      />

      {/* Allowances */}
      <SectionCard title="Allowances">
        <ProgressBar
          label="ISA Allowance"
          value={isaUsed}
          max={20000}
          color={colors.primary}
          valueFormat={(v, m) => formatGBP(v) + ' / ' + formatGBP(m, 0)}
        />
        <Text style={styles.remainingText}>
          {formatGBP(Math.max(20000 - isaUsed, 0))} remaining
        </Text>

        <ProgressBar
          label="Pension"
          value={pensionUsed}
          max={60000}
          color={colors.lavender}
          valueFormat={(v, m) => formatGBP(v) + ' / ' + formatGBP(m, 0)}
        />
        <Text style={styles.remainingText}>
          {formatGBP(Math.max(60000 - pensionUsed, 0))} remaining
        </Text>

        <ProgressBar
          label="CGT Exempt"
          value={cgtUsed}
          max={3000}
          color={colors.teal}
          valueFormat={(v, m) => formatGBP(v) + ' / ' + formatGBP(m, 0)}
        />
        <Text style={styles.remainingText}>
          {formatGBP(Math.max(3000 - cgtUsed, 0))} remaining
        </Text>
      </SectionCard>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard title="Tax Recommendations">
          {recommendations.map((rec: any, index: number) => (
            <View key={rec.id || index} style={styles.recCard}>
              <View style={styles.recHeader}>
                <View
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: (PRIORITY_COLORS[rec.priority] || colors.text3) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: PRIORITY_COLORS[rec.priority] || colors.text3 },
                    ]}
                  >
                    {(rec.priority || 'low').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.recSaving}>
                  Save {formatGBP(rec.projected_annual_saving)}/yr
                </Text>
              </View>
              <Text style={styles.recTitle}>{rec.title}</Text>
              <Text style={styles.recDescription}>{rec.description}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Income Tax Breakdown */}
      {incomeTax && (
        <SectionCard title="Income Tax Breakdown">
          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>Gross Income</Text>
            <Text style={styles.taxValue}>{formatGBP(incomeTax.gross_income)}</Text>
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>Personal Allowance</Text>
            <Text style={styles.taxValue}>{formatGBP(incomeTax.personal_allowance)}</Text>
          </View>

          {(incomeTax.bands || []).map((band: any, i: number) => (
            <View key={i} style={styles.taxRow}>
              <Text style={styles.taxLabel}>{band.label} ({band.rate})</Text>
              <Text style={styles.taxValue}>{formatGBP(band.tax)}</Text>
            </View>
          ))}

          {incomeTax.national_insurance != null && (
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>National Insurance</Text>
              <Text style={styles.taxValue}>{formatGBP(incomeTax.national_insurance)}</Text>
            </View>
          )}

          <View style={[styles.taxRow, styles.taxTotalRow]}>
            <Text style={styles.taxTotalLabel}>Total Tax</Text>
            <Text style={styles.taxTotalValue}>{formatGBP(incomeTax.total_tax)}</Text>
          </View>

          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>Effective Rate</Text>
            <Text style={[styles.taxValue, { color: colors.primary }]}>
              {incomeTax.effective_rate != null
                ? incomeTax.effective_rate + '%'
                : '--'}
            </Text>
          </View>
        </SectionCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },

  centered: {
    flex: 1, backgroundColor: colors.bg,
    justifyContent: 'center', alignItems: 'center', gap: spacing.md,
  },
  loadingText: { fontSize: 14, color: colors.text3, marginTop: spacing.sm },
  errorText: { fontSize: 14, color: colors.rose, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: colors.bg },

  remainingText: {
    fontSize: 11, color: colors.text3, textAlign: 'right',
    marginTop: -4, marginBottom: spacing.sm,
  },

  recCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  recHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.sm,
  },
  priorityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  recSaving: { fontSize: 13, fontWeight: '600', color: colors.teal },
  recTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  recDescription: { fontSize: 12, color: colors.text2, lineHeight: 18 },

  taxRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  taxLabel: { fontSize: 13, color: colors.text2 },
  taxValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  taxTotalRow: {
    borderBottomWidth: 0, marginTop: spacing.xs,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border2,
  },
  taxTotalLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  taxTotalValue: { fontSize: 16, fontWeight: '700', color: colors.rose },
});
