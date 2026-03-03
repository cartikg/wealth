// app/screens/mortgage-debt.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP } from '../../../lib/api';
import HeroCard from '../../../components/cards/HeroCard';
import SectionCard from '../../../components/cards/SectionCard';

const DEBT_TYPE_COLORS: Record<string, string> = {
  'credit_card': colors.rose,
  'personal_loan': colors.lavender,
  'student_loan': colors.primary,
  'car_loan': colors.cyan,
  'other': colors.text3,
};

function MortgageCard({ mortgage, onDelete, onViewSchedule }: {
  mortgage: any;
  onDelete: () => void;
  onViewSchedule: () => void;
}) {
  const ltv = mortgage.property_value
    ? ((mortgage.current_balance / mortgage.property_value) * 100).toFixed(1)
    : null;

  return (
    <View style={styles.mortgageCard}>
      <View style={styles.mortgageHeader}>
        <View style={styles.mortgageIconWrap}>
          <Ionicons name="home" size={20} color={colors.primary} />
        </View>
        <View style={styles.mortgageInfo}>
          <Text style={styles.mortgageName} numberOfLines={1}>
            {mortgage.property_name || 'Property'}
          </Text>
          <Text style={styles.mortgageLender}>{mortgage.lender || 'Unknown lender'}</Text>
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.rose} />
        </TouchableOpacity>
      </View>

      <View style={styles.mortgageStats}>
        <View style={styles.mortgageStat}>
          <Text style={styles.statLabel}>Balance</Text>
          <Text style={styles.statValue}>{formatGBP(mortgage.current_balance)}</Text>
        </View>
        <View style={styles.mortgageStat}>
          <Text style={styles.statLabel}>Rate</Text>
          <Text style={styles.statValue}>{(mortgage.interest_rate || 0).toFixed(2)}%</Text>
        </View>
        <View style={styles.mortgageStat}>
          <Text style={styles.statLabel}>Monthly</Text>
          <Text style={styles.statValue}>{formatGBP(mortgage.monthly_payment)}</Text>
        </View>
      </View>

      {mortgage.property_value && (
        <View style={styles.propertyRow}>
          <Text style={styles.propertyLabel}>Property Value</Text>
          <Text style={styles.propertyValue}>{formatGBP(mortgage.property_value)}</Text>
          {ltv && (
            <View style={styles.ltvBadge}>
              <Text style={styles.ltvText}>LTV {ltv}%</Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.scheduleBtn} onPress={onViewSchedule}>
        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
        <Text style={styles.scheduleBtnText}>View Schedule</Text>
      </TouchableOpacity>
    </View>
  );
}

function AmortisationView({ schedule }: { schedule: any[] }) {
  if (!schedule || schedule.length === 0) {
    return <Text style={styles.emptyText}>No amortisation data available.</Text>;
  }

  return (
    <View style={styles.amortisationWrap}>
      <View style={styles.amortisationHeader}>
        <Text style={[styles.amortCol, styles.amortColHead]}>Month</Text>
        <Text style={[styles.amortCol, styles.amortColHead]}>Payment</Text>
        <Text style={[styles.amortCol, styles.amortColHead]}>Principal</Text>
        <Text style={[styles.amortCol, styles.amortColHead]}>Interest</Text>
        <Text style={[styles.amortCol, styles.amortColHead]}>Balance</Text>
      </View>
      {schedule.slice(0, 24).map((row: any, i: number) => (
        <View key={i} style={[styles.amortisationRow, i % 2 === 0 && styles.amortRowAlt]}>
          <Text style={styles.amortCol}>{row.month || i + 1}</Text>
          <Text style={styles.amortCol}>{formatGBP(row.payment, 0)}</Text>
          <Text style={[styles.amortCol, { color: colors.teal }]}>{formatGBP(row.principal, 0)}</Text>
          <Text style={[styles.amortCol, { color: colors.rose }]}>{formatGBP(row.interest, 0)}</Text>
          <Text style={styles.amortCol}>{formatGBP(row.balance, 0)}</Text>
        </View>
      ))}
      {schedule.length > 24 && (
        <Text style={styles.amortMore}>Showing first 24 of {schedule.length} months</Text>
      )}
    </View>
  );
}

function DebtCard({ debt, onDelete }: { debt: any; onDelete: () => void }) {
  const typeColor = DEBT_TYPE_COLORS[debt.type] || colors.text3;

  return (
    <View style={styles.debtCard}>
      <View style={styles.debtHeader}>
        <View style={styles.debtInfo}>
          <View style={styles.debtNameRow}>
            <Text style={styles.debtName} numberOfLines={1}>{debt.name || 'Unnamed Debt'}</Text>
            {debt.type && (
              <View style={[styles.typeBadge, { borderColor: typeColor, backgroundColor: `${typeColor}18` }]}>
                <Text style={[styles.typeText, { color: typeColor }]}>
                  {(debt.type || '').replace(/_/g, ' ')}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.debtBalance}>{formatGBP(debt.balance)}</Text>
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.rose} />
        </TouchableOpacity>
      </View>

      <View style={styles.debtStats}>
        <View style={styles.debtStat}>
          <Text style={styles.statLabel}>Rate</Text>
          <Text style={styles.statValue}>{(debt.interest_rate || 0).toFixed(2)}%</Text>
        </View>
        <View style={styles.debtStat}>
          <Text style={styles.statLabel}>Min Payment</Text>
          <Text style={styles.statValue}>{formatGBP(debt.minimum_payment)}</Text>
        </View>
      </View>
    </View>
  );
}

function OptimiserResults({ results }: { results: any }) {
  if (!results) return null;

  return (
    <View style={styles.optimiserResults}>
      {results.avalanche && (
        <View style={styles.optimiserBlock}>
          <Text style={styles.optimiserTitle}>Avalanche (Highest Rate First)</Text>
          <Text style={styles.optimiserValue}>
            Debt-free in {results.avalanche.months_to_payoff || '?'} months
          </Text>
          <Text style={styles.optimiserSub}>
            Total interest: {formatGBP(results.avalanche.total_interest)}
          </Text>
        </View>
      )}
      {results.snowball && (
        <View style={styles.optimiserBlock}>
          <Text style={styles.optimiserTitle}>Snowball (Smallest Balance First)</Text>
          <Text style={styles.optimiserValue}>
            Debt-free in {results.snowball.months_to_payoff || '?'} months
          </Text>
          <Text style={styles.optimiserSub}>
            Total interest: {formatGBP(results.snowball.total_interest)}
          </Text>
        </View>
      )}
      {results.avalanche && results.snowball && (
        <View style={styles.savingsBanner}>
          <Ionicons name="trending-down" size={16} color={colors.teal} />
          <Text style={styles.savingsText}>
            Avalanche saves {formatGBP(
              (results.snowball.total_interest || 0) - (results.avalanche.total_interest || 0)
            )} in interest
          </Text>
        </View>
      )}
    </View>
  );
}

export default function MortgageDebtScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMortgage, setExpandedMortgage] = useState<string | null>(null);
  const [amortisationData, setAmortisationData] = useState<Record<string, any[]>>({});
  const [loadingSchedule, setLoadingSchedule] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState('');
  const [optimiserResults, setOptimiserResults] = useState<any>(null);
  const [optimising, setOptimising] = useState(false);

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

  const handleDeleteMortgage = (id: string, name: string) => {
    Alert.alert(`Delete ${name}?`, 'This mortgage will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteMortgage(id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleDeleteDebt = (id: string, name: string) => {
    Alert.alert(`Delete ${name}?`, 'This debt will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteDebt(id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleViewSchedule = async (id: string) => {
    if (expandedMortgage === id) {
      setExpandedMortgage(null);
      return;
    }
    setExpandedMortgage(id);
    if (amortisationData[id]) return;

    setLoadingSchedule(id);
    try {
      const result = await api.getAmortisation(id);
      setAmortisationData(prev => ({ ...prev, [id]: result.schedule || result || [] }));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoadingSchedule(null);
    }
  };

  const handleOptimise = async (strategy: 'avalanche' | 'snowball') => {
    const amount = parseFloat(extraPayment);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive extra monthly payment.');
      return;
    }
    setOptimising(true);
    try {
      const result = await api.optimiseDebts(amount);
      setOptimiserResults(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setOptimising(false);
    }
  };

  const mortgages = data?.mortgages || [];
  const debts = data?.debts_detailed || [];
  const totals = data?.totals || {};

  const mortgageTotal = totals.mortgage_total || 0;
  const debtTotal = totals.debts_detailed_total || 0;
  const totalLiabilities = mortgageTotal + debtTotal;
  const monthlyPayments = totals.monthly_all_debt_payments || 0;

  // Simple DTI ratio placeholder — assumes monthly income is available
  const monthlyIncome = totals.monthly_income || 1;
  const dtiRatio = monthlyIncome > 0
    ? ((monthlyPayments / monthlyIncome) * 100).toFixed(1)
    : '—';

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Hero */}
        <HeroCard
          label="TOTAL LIABILITIES"
          value={formatGBP(totalLiabilities)}
          valueColor={colors.rose}
          items={[
            { label: 'Mortgages', value: formatGBP(mortgageTotal), color: colors.primary },
            { label: 'Debts', value: formatGBP(debtTotal), color: colors.rose },
            { label: 'Monthly', value: formatGBP(monthlyPayments), color: colors.text },
            { label: 'DTI Ratio', value: `${dtiRatio}%`, color: parseFloat(dtiRatio) > 40 ? colors.rose : colors.teal },
          ]}
        />

        {/* Mortgages Section */}
        <SectionCard
          title="Mortgages"
          trailing={
            <Text style={styles.sectionCount}>{mortgages.length}</Text>
          }
        >
          {mortgages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="home-outline" size={32} color={colors.text3} />
              <Text style={styles.emptyText}>No mortgages added yet</Text>
            </View>
          ) : (
            mortgages.map((m: any) => (
              <View key={m.id}>
                <MortgageCard
                  mortgage={m}
                  onDelete={() => handleDeleteMortgage(m.id, m.property_name || 'this mortgage')}
                  onViewSchedule={() => handleViewSchedule(m.id)}
                />
                {expandedMortgage === m.id && (
                  <View style={styles.scheduleWrap}>
                    {loadingSchedule === m.id ? (
                      <Text style={styles.loadingText}>Loading schedule...</Text>
                    ) : (
                      <AmortisationView schedule={amortisationData[m.id] || []} />
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </SectionCard>

        {/* Add Mortgage Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/modals/add-mortgage');
          }}
        >
          <Ionicons name="add-circle" size={20} color={colors.bg} />
          <Text style={styles.addButtonText}>Add Mortgage</Text>
        </TouchableOpacity>

        {/* Debts Section */}
        <SectionCard
          title="Debts"
          trailing={
            <Text style={styles.sectionCount}>{debts.length}</Text>
          }
        >
          {debts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="card-outline" size={32} color={colors.text3} />
              <Text style={styles.emptyText}>No debts tracked yet</Text>
            </View>
          ) : (
            debts.map((d: any) => (
              <DebtCard
                key={d.id}
                debt={d}
                onDelete={() => handleDeleteDebt(d.id, d.name || 'this debt')}
              />
            ))
          )}
        </SectionCard>

        {/* Add Debt Button */}
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.rose }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/modals/add-debt');
          }}
        >
          <Ionicons name="add-circle" size={20} color={colors.bg} />
          <Text style={styles.addButtonText}>Add Debt</Text>
        </TouchableOpacity>

        {/* Debt Optimiser Section */}
        <SectionCard title="Debt Optimiser">
          <Text style={styles.optimiserLabel}>Extra Monthly Payment</Text>
          <View style={styles.optimiserInputRow}>
            <Text style={styles.currencySymbol}>£</Text>
            <TextInput
              style={styles.optimiserInput}
              value={extraPayment}
              onChangeText={setExtraPayment}
              placeholder="0"
              placeholderTextColor={colors.text3}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>

          <View style={styles.optimiserButtons}>
            <TouchableOpacity
              style={[styles.optimiserBtn, optimising && styles.btnDisabled]}
              onPress={() => handleOptimise('avalanche')}
              disabled={optimising}
            >
              <Ionicons name="trending-down" size={16} color={colors.bg} />
              <Text style={styles.optimiserBtnText}>
                {optimising ? 'Calculating...' : 'Avalanche'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optimiserBtn, { backgroundColor: colors.lavender }, optimising && styles.btnDisabled]}
              onPress={() => handleOptimise('snowball')}
              disabled={optimising}
            >
              <Ionicons name="snow" size={16} color={colors.bg} />
              <Text style={styles.optimiserBtnText}>
                {optimising ? 'Calculating...' : 'Snowball'}
              </Text>
            </TouchableOpacity>
          </View>

          <OptimiserResults results={optimiserResults} />
        </SectionCard>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB for quick add */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/modals/add-mortgage');
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.bg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  sectionCount: {
    fontSize: 12, fontWeight: '600', color: colors.text3,
    backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden',
  },

  // Mortgage card
  mortgageCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  mortgageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md,
  },
  mortgageIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center',
  },
  mortgageInfo: { flex: 1 },
  mortgageName: { fontSize: 15, fontWeight: '600', color: colors.text },
  mortgageLender: { fontSize: 12, color: colors.text3, marginTop: 2 },

  mortgageStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  mortgageStat: {},
  statLabel: { fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },

  propertyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    marginBottom: spacing.sm,
  },
  propertyLabel: { fontSize: 11, color: colors.text3 },
  propertyValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  ltvBadge: {
    backgroundColor: colors.primaryDim, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  ltvText: { fontSize: 10, fontWeight: '600', color: colors.primary },

  scheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  scheduleBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  scheduleWrap: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },

  // Amortisation table
  amortisationWrap: {},
  amortisationHeader: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingBottom: spacing.xs, marginBottom: spacing.xs,
  },
  amortisationRow: { flexDirection: 'row', paddingVertical: 4 },
  amortRowAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  amortCol: { flex: 1, fontSize: 10, color: colors.text2, textAlign: 'center' },
  amortColHead: { fontWeight: '700', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  amortMore: { fontSize: 11, color: colors.text3, textAlign: 'center', marginTop: spacing.sm },

  // Debt card
  debtCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  debtHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  debtInfo: { flex: 1 },
  debtNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  debtName: { fontSize: 15, fontWeight: '600', color: colors.text },
  debtBalance: { fontSize: 18, fontWeight: '700', color: colors.rose, marginTop: 4 },
  typeBadge: {
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  typeText: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  debtStats: { flexDirection: 'row', gap: spacing.xl },
  debtStat: {},

  deleteBtn: { padding: spacing.sm },

  // Add button
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    alignSelf: 'center',
  },
  addButtonText: { fontSize: 14, fontWeight: '700', color: colors.bg },

  // Optimiser
  optimiserLabel: {
    fontSize: 10, fontWeight: '600', color: colors.text3,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  optimiserInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  currencySymbol: { fontSize: 18, fontWeight: '600', color: colors.text3 },
  optimiserInput: {
    flex: 1, fontSize: 22, fontWeight: '700', color: colors.text,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
  },
  optimiserButtons: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  optimiserBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.primary,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  optimiserBtnText: { fontSize: 14, fontWeight: '700', color: colors.bg },
  btnDisabled: { opacity: 0.5 },

  // Optimiser results
  optimiserResults: { gap: spacing.sm },
  optimiserBlock: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  optimiserTitle: { fontSize: 11, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  optimiserValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  optimiserSub: { fontSize: 12, color: colors.text2, marginTop: 4 },
  savingsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.tealDim, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  savingsText: { fontSize: 13, fontWeight: '600', color: colors.teal },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 13, color: colors.text3, textAlign: 'center' },

  loadingText: { fontSize: 12, color: colors.text3, textAlign: 'center', paddingVertical: spacing.md },

  // FAB
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.card,
    shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
});
