// app/modals/scenario-compare.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';
import { api, formatGBP } from '../../lib/api';

interface Scenario {
  label: string;
  monthly_savings: string;
  annual_return: string;
  years: string;
}

const DEFAULT_SCENARIOS: Scenario[] = [
  { label: 'Conservative', monthly_savings: '500', annual_return: '4', years: '25' },
  { label: 'Moderate', monthly_savings: '800', annual_return: '7', years: '25' },
  { label: 'Aggressive', monthly_savings: '1200', annual_return: '10', years: '25' },
];

export default function ScenarioCompareModal() {
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const updateScenario = (index: number, field: keyof Scenario, value: string) => {
    const updated = [...scenarios];
    updated[index] = { ...updated[index], [field]: value };
    setScenarios(updated);
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      const payload = scenarios.map(s => ({
        label: s.label,
        monthly_savings: Number(s.monthly_savings) || 0,
        annual_return: Number(s.annual_return) || 0,
        years: Number(s.years) || 25,
      }));
      const resp = await api.compareScenarios(payload);
      setResults(resp.results || resp);
    } catch (e: any) {
      // Calculate locally as fallback
      const local = scenarios.map(s => {
        const pmt = Number(s.monthly_savings) || 0;
        const r = (Number(s.annual_return) || 0) / 100 / 12;
        const n = (Number(s.years) || 25) * 12;
        const fv = r > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : pmt * n;
        const totalContrib = pmt * n;
        return { label: s.label, future_value: fv, total_contributed: totalContrib, total_growth: fv - totalContrib };
      });
      setResults(local);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {scenarios.map((s, i) => (
        <View key={i} style={styles.scenarioCard}>
          <TextInput
            style={styles.scenarioLabel}
            value={s.label}
            onChangeText={(v) => updateScenario(i, 'label', v)}
            placeholderTextColor={colors.text3}
          />
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Monthly (£)</Text>
              <TextInput
                style={styles.input}
                value={s.monthly_savings}
                onChangeText={(v) => updateScenario(i, 'monthly_savings', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.text3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Return (%)</Text>
              <TextInput
                style={styles.input}
                value={s.annual_return}
                onChangeText={(v) => updateScenario(i, 'annual_return', v)}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.text3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Years</Text>
              <TextInput
                style={styles.input}
                value={s.years}
                onChangeText={(v) => updateScenario(i, 'years', v)}
                keyboardType="number-pad"
                placeholderTextColor={colors.text3}
              />
            </View>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.compareBtn, loading && { opacity: 0.6 }]}
        onPress={handleCompare}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Ionicons name="analytics-outline" size={18} color={colors.bg} />
        )}
        <Text style={styles.compareBtnText}>{loading ? 'Calculating...' : 'Compare Scenarios'}</Text>
      </TouchableOpacity>

      {results && (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Results</Text>
          {results.map((r: any, i: number) => {
            const best = results.reduce((max: any, cur: any) =>
              (cur.future_value || 0) > (max.future_value || 0) ? cur : max, results[0]);
            const isBest = r === best;
            return (
              <View key={i} style={[styles.resultRow, isBest && styles.resultRowBest]}>
                <View style={styles.resultHeader}>
                  <Text style={[styles.resultLabel, isBest && { color: colors.teal }]}>
                    {r.label}
                    {isBest ? ' ★' : ''}
                  </Text>
                  <Text style={[styles.resultValue, isBest && { color: colors.teal }]}>
                    {formatGBP(r.future_value)}
                  </Text>
                </View>
                <View style={styles.resultMeta}>
                  <Text style={styles.resultMetaText}>
                    Contributed: {formatGBP(r.total_contributed)}
                  </Text>
                  <Text style={[styles.resultMetaText, { color: colors.teal }]}>
                    Growth: {formatGBP(r.total_growth || (r.future_value - r.total_contributed))}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },
  scenarioCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  scenarioLabel: {
    fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border2,
  },
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg,
  },
  compareBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
  resultsCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  resultsTitle: { fontSize: 12, fontWeight: '700', color: colors.text2, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md },
  resultRow: {
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultRowBest: { backgroundColor: 'rgba(34,197,94,0.05)', borderRadius: radius.md, paddingHorizontal: spacing.sm },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  resultValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
  resultMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  resultMetaText: { fontSize: 12, color: colors.text3 },
});
