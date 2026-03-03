// app/screens/estate-legacy.tsx
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
import DoughnutChart from '../../../components/charts/DoughnutChart';
import LineChart from '../../../components/charts/LineChart';
import ProgressBar from '../../../components/charts/ProgressBar';

const COMPOSITION_COLORS: Record<string, string> = {
  property: '#F97316',
  investments: '#3B82F6',
  pension: '#8B5CF6',
  cash: '#22C55E',
  other: '#6B7280',
  debts: '#EF4444',
};

const COMPOSITION_LABELS: Record<string, string> = {
  property: 'Property',
  investments: 'Investments',
  pension: 'Pension',
  cash: 'Cash',
  other: 'Other',
  debts: 'Debts',
};

export default function EstateLegacyScreen() {
  const [estate, setEstate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getEstateProjection();
      setEstate(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load estate data');
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
        <Text style={styles.loadingText}>Loading estate projection...</Text>
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

  if (!estate) return null;

  const nilRateBand = estate.nil_rate_band ?? 0;
  const nilRateMax = 325000;
  const breakdown = estate.breakdown || {};
  const projections = estate.projections || [];
  const strategies = estate.strategies || [];

  // Build doughnut segments from breakdown
  const doughnutSegments = Object.entries(breakdown)
    .filter(([_, value]) => (value as number) !== 0)
    .map(([key, value]) => ({
      label: COMPOSITION_LABELS[key] || key,
      value: Math.abs(value as number),
      color: COMPOSITION_COLORS[key] || colors.text3,
    }));

  // Build line chart datasets from projections
  const projectionLabels = projections.map((p: any) => String(p.age));
  const estateValues = projections.map((p: any) => p.estate_value ?? 0);
  const ihtValues = projections.map((p: any) => p.iht_liability ?? 0);
  const netValues = projections.map((p: any) => p.net_to_heirs ?? 0);

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
        label="ESTATE PROJECTION"
        value={formatGBP(estate.projected_estate)}
        items={[
          { label: 'At Age', value: String(estate.at_age ?? '--') },
          { label: 'IHT Liability', value: formatGBP(estate.iht_liability), color: colors.rose },
          { label: 'Net to Heirs', value: formatGBP(estate.net_to_heirs), color: colors.teal },
          { label: 'Effective Rate', value: (estate.effective_rate != null ? estate.effective_rate + '%' : '--'), color: colors.text2 },
        ]}
      />

      {/* Nil-Rate Band */}
      <SectionCard title="Nil-Rate Band">
        <ProgressBar
          label="NRB Usage"
          value={nilRateBand}
          max={nilRateMax}
          color={colors.primary}
          valueFormat={(v, m) => formatGBP(v) + ' / ' + formatGBP(m, 0)}
        />
        <Text style={styles.remainingText}>
          {formatGBP(Math.max(nilRateMax - nilRateBand, 0))} remaining
        </Text>
        {nilRateBand > nilRateMax && (
          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
            <Text style={styles.noteText}>
              Includes transferable spouse nil-rate band allowance
            </Text>
          </View>
        )}
      </SectionCard>

      {/* Estate Composition */}
      {doughnutSegments.length > 0 && (
        <SectionCard title="Estate Composition">
          <DoughnutChart
            segments={doughnutSegments}
            centerValue={formatGBP(estate.projected_estate)}
            centerLabel="Total"
          />
        </SectionCard>
      )}

      {/* IHT Projection Over Time */}
      {projections.length > 0 && (
        <SectionCard title="IHT Projection Over Time">
          <LineChart
            labels={projectionLabels}
            datasets={[
              { label: 'Estate Value', values: estateValues, color: colors.primary },
              { label: 'IHT Liability', values: ihtValues, color: colors.rose, dashed: true },
              { label: 'Net to Heirs', values: netValues, color: colors.teal },
            ]}
          />
        </SectionCard>
      )}

      {/* Mitigation Strategies */}
      {strategies.length > 0 && (
        <SectionCard title="Mitigation Strategies">
          {strategies.map((strat: any, index: number) => (
            <View key={strat.id || index} style={styles.stratCard}>
              <Text style={styles.stratName}>{strat.name}</Text>
              <Text style={styles.stratDescription}>{strat.description}</Text>
              <Text style={styles.stratSaving}>
                Potential saving: {formatGBP(strat.potential_saving)}
              </Text>
            </View>
          ))}
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

  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.sm,
  },
  noteText: { fontSize: 12, color: colors.primary, flex: 1 },

  stratCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  stratName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  stratDescription: { fontSize: 12, color: colors.text2, lineHeight: 18, marginBottom: spacing.sm },
  stratSaving: { fontSize: 13, fontWeight: '600', color: colors.teal },
});
