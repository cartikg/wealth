// app/screens/retirement.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP } from '../../../lib/api';
import HeroCard from '../../../components/cards/HeroCard';
import SectionCard from '../../../components/cards/SectionCard';
import LineChart from '../../../components/charts/LineChart';
import ChipSelector from '../../../components/inputs/ChipSelector';

const FIRE_OPTIONS = [
  { value: 'lean', label: 'Lean' },
  { value: 'regular', label: 'Regular' },
  { value: 'fat', label: 'Fat' },
  { value: 'coast', label: 'Coast' },
  { value: 'barista', label: 'Barista' },
];

const FIRE_MULTIPLIERS: Record<string, number> = {
  lean: 20,
  regular: 25,
  fat: 33,
  coast: 25,
  barista: 25,
};

const MC_COLORS = [
  '#1E40AF', // P10 — deep blue
  '#3B82F6', // P25 — blue
  '#8B5CF6', // P50 — purple
  '#A78BFA', // P75 — light purple
  '#C4B5FD', // P90 — lavender
];

function successColor(rate: number): string {
  if (rate >= 80) return colors.teal;
  if (rate >= 60) return '#F59E0B';
  return colors.rose;
}

export default function RetirementScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fireMode, setFireMode] = useState('regular');
  const [monteCarloResult, setMonteCarloResult] = useState<any>(null);
  const [runningMC, setRunningMC] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const d = await api.getData();
      setData(d);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, []);

  const retirement = data?.retirement || {};
  const totals = data?.totals || {};
  const fireSettings = data?.fire_settings || {};
  const monthlyContributions = data?.monthly_contributions || 0;

  const currentAge = retirement.current_age || 30;
  const targetAge = retirement.target_age || 65;
  const lifeExpectancy = retirement.life_expectancy || 90;
  const expectedReturn = retirement.expected_return || 0.07;
  const inflationRate = retirement.inflation_rate || 0.03;
  const netWorth = totals.net_worth || 0;
  const monthlySpend = totals.monthly_spend || 0;
  const annualSpend = monthlySpend * 12;
  const yearsToRetirement = targetAge - currentAge;

  // FIRE calculations based on mode
  const fireMultiplier = FIRE_MULTIPLIERS[fireMode] || 25;
  const corpusNeeded = annualSpend * fireMultiplier;

  // Future value of current portfolio + contributions
  const monthlyReturn = expectedReturn / 12;
  const months = yearsToRetirement * 12;
  const projectedPortfolio = months > 0
    ? netWorth * Math.pow(1 + monthlyReturn, months)
      + (monthlyContributions * (Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn)
    : netWorth;

  // On-track age: when will projected portfolio reach corpus
  const onTrackAge = useMemo(() => {
    if (netWorth >= corpusNeeded) return currentAge;
    let portfolio = netWorth;
    for (let m = 0; m < (lifeExpectancy - currentAge) * 12; m++) {
      portfolio = portfolio * (1 + monthlyReturn) + monthlyContributions;
      if (portfolio >= corpusNeeded) return currentAge + Math.ceil(m / 12);
    }
    return lifeExpectancy;
  }, [netWorth, corpusNeeded, currentAge, lifeExpectancy, monthlyReturn, monthlyContributions]);

  // Trajectory chart data
  const trajectoryData = useMemo(() => {
    const ages: string[] = [];
    const projected: number[] = [];
    const target: number[] = [];

    let portfolio = netWorth;
    for (let age = currentAge; age <= lifeExpectancy; age++) {
      ages.push(String(age));
      projected.push(portfolio);
      target.push(corpusNeeded);
      // Grow for next year
      for (let m = 0; m < 12; m++) {
        portfolio = portfolio * (1 + monthlyReturn) + monthlyContributions;
      }
    }

    return { ages, projected, target };
  }, [netWorth, currentAge, lifeExpectancy, corpusNeeded, monthlyReturn, monthlyContributions]);

  const handleRunMonteCarlo = async () => {
    setRunningMC(true);
    try {
      const params = {
        current_age: currentAge,
        target_age: targetAge,
        life_expectancy: lifeExpectancy,
        current_portfolio: netWorth,
        monthly_contribution: monthlyContributions,
        annual_spend: annualSpend,
        expected_return: expectedReturn,
        inflation_rate: inflationRate,
        fire_multiplier: fireMultiplier,
        simulations: 1000,
      };
      const result = await api.runMonteCarlo(params);
      setMonteCarloResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRunningMC(false);
    }
  };

  // Monte Carlo chart data
  const mcChartData = useMemo(() => {
    if (!monteCarloResult?.percentiles) return null;
    const p = monteCarloResult.percentiles;
    const ages = p.ages?.map(String) || [];
    return {
      ages,
      datasets: [
        { values: p.p10 || [], color: MC_COLORS[0], label: 'P10 (Worst)' },
        { values: p.p25 || [], color: MC_COLORS[1], label: 'P25' },
        { values: p.p50 || [], color: MC_COLORS[2], label: 'P50 (Median)' },
        { values: p.p75 || [], color: MC_COLORS[3], label: 'P75' },
        { values: p.p90 || [], color: MC_COLORS[4], label: 'P90 (Best)' },
      ],
    };
  }, [monteCarloResult]);

  const successRate = monteCarloResult?.success_rate ?? null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Header with settings */}
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Retirement</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/modals/retirement-settings')}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text2} />
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <HeroCard
        label="RETIREMENT"
        value={`${yearsToRetirement} years`}
        valueColor={colors.primary}
        items={[
          { label: 'Corpus Needed', value: formatGBP(corpusNeeded), color: colors.text },
          { label: 'Projected', value: formatGBP(projectedPortfolio), color: projectedPortfolio >= corpusNeeded ? colors.teal : colors.rose },
          { label: 'Monthly Invested', value: formatGBP(monthlyContributions), color: colors.lavender },
          { label: 'On-Track Age', value: String(onTrackAge), color: onTrackAge <= targetAge ? colors.teal : colors.rose },
        ]}
      />

      {/* Spending Banner */}
      <View style={styles.spendBanner}>
        <Ionicons name="wallet-outline" size={20} color={colors.text2} />
        <View style={styles.spendInfo}>
          <Text style={styles.spendLabel}>Current Monthly Spend</Text>
          <Text style={styles.spendValue}>{formatGBP(monthlySpend)}</Text>
        </View>
        <View style={styles.spendDivider} />
        <View style={styles.spendInfo}>
          <Text style={styles.spendLabel}>Annual Equivalent</Text>
          <Text style={styles.spendValue}>{formatGBP(annualSpend)}</Text>
        </View>
      </View>

      {/* FIRE Mode Selector */}
      <ChipSelector
        label="FIRE Mode"
        options={FIRE_OPTIONS}
        selected={fireMode}
        onSelect={(v) => {
          setFireMode(v);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      />

      {/* Trajectory Section */}
      <SectionCard title="Portfolio Trajectory">
        <LineChart
          datasets={[
            {
              values: trajectoryData.projected,
              color: colors.primary,
              label: 'Projected Portfolio',
              fillOpacity: 0.08,
            },
            {
              values: trajectoryData.target,
              color: colors.rose,
              label: 'Required Corpus',
              dashed: true,
            },
          ]}
          labels={trajectoryData.ages}
          height={220}
        />
      </SectionCard>

      {/* Monte Carlo Section */}
      <SectionCard title="Monte Carlo Simulation">
        <TouchableOpacity
          style={[styles.mcButton, runningMC && styles.btnDisabled]}
          onPress={handleRunMonteCarlo}
          disabled={runningMC}
        >
          <Ionicons name="dice-outline" size={18} color={colors.bg} />
          <Text style={styles.mcButtonText}>
            {runningMC ? 'Running Simulations...' : 'Run 1,000 Simulations'}
          </Text>
        </TouchableOpacity>

        {successRate !== null && (
          <View style={styles.mcResults}>
            {/* Success rate */}
            <View style={styles.successRateWrap}>
              <Text style={[styles.successRateValue, { color: successColor(successRate) }]}>
                {successRate.toFixed(1)}%
              </Text>
              <Text style={styles.successRateLabel}>
                Success Rate
              </Text>
            </View>

            {/* Percentile chart */}
            {mcChartData && (
              <View style={styles.mcChartWrap}>
                <LineChart
                  datasets={mcChartData.datasets}
                  labels={mcChartData.ages}
                  height={240}
                />
              </View>
            )}

            {/* Interpretation */}
            <View style={styles.interpretWrap}>
              <Ionicons
                name={successRate >= 80 ? 'checkmark-circle' : successRate >= 60 ? 'alert-circle' : 'close-circle'}
                size={18}
                color={successColor(successRate)}
              />
              <Text style={styles.interpretText}>
                {successRate >= 80
                  ? 'Your retirement plan is on a strong trajectory. You have a high probability of achieving your target corpus.'
                  : successRate >= 60
                    ? 'Your plan has moderate success probability. Consider increasing contributions or adjusting your target retirement age.'
                    : 'Your plan has a low probability of success. Significant changes to savings rate or retirement age are recommended.'}
              </Text>
            </View>
          </View>
        )}
      </SectionCard>

      {/* Scenario Link */}
      <TouchableOpacity
        style={styles.scenarioBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Alert.alert('Coming Soon', 'Scenario comparison will be available in a future update.');
        }}
      >
        <Ionicons name="git-compare-outline" size={20} color={colors.lavender} />
        <Text style={styles.scenarioBtnText}>Compare Scenarios</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} />
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  screenTitle: { fontSize: 22, color: colors.text },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  // Spending Banner
  spendBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  spendInfo: {},
  spendLabel: { fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  spendValue: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  spendDivider: { width: 1, height: 30, backgroundColor: colors.border, marginHorizontal: spacing.xs },

  // Monte Carlo
  mcButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.lavender,
    borderRadius: radius.md, paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  mcButtonText: { fontSize: 14, fontWeight: '700', color: colors.bg },
  btnDisabled: { opacity: 0.5 },

  mcResults: { gap: spacing.md },
  successRateWrap: { alignItems: 'center', paddingVertical: spacing.md },
  successRateValue: { fontSize: 52, fontWeight: '800' },
  successRateLabel: { fontSize: 12, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },

  mcChartWrap: { marginVertical: spacing.sm },

  interpretWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  interpretText: { flex: 1, fontSize: 13, color: colors.text2, lineHeight: 20 },

  // Scenario button
  scenarioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  scenarioBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
});
