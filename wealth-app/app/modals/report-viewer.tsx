// app/modals/report-viewer.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';
import { api, formatGBP } from '../../lib/api';

export default function ReportViewerModal() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWealthReport()
      .then(setReport)
      .catch((e: any) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    if (!report) return;
    const lines = [
      `Wealth Report — ${new Date().toLocaleDateString('en-GB')}`,
      '',
      `Net Worth: ${formatGBP(report.net_worth)}`,
      `Total Assets: ${formatGBP(report.total_assets)}`,
      `Total Liabilities: ${formatGBP(report.total_liabilities)}`,
      '',
      '--- Breakdown ---',
      `Cash: ${formatGBP(report.cash)}`,
      `Investments: ${formatGBP(report.investments)}`,
      `Property: ${formatGBP(report.property)}`,
      `Pensions: ${formatGBP(report.pensions)}`,
      `Mortgages: ${formatGBP(report.mortgages)}`,
      `Debts: ${formatGBP(report.debts)}`,
      '',
      `Monthly Income: ${formatGBP(report.monthly_income)}`,
      `Monthly Spend: ${formatGBP(report.monthly_spend)}`,
      `Savings Rate: ${(report.savings_rate || 0).toFixed(1)}%`,
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Generating report...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.text3} />
        <Text style={styles.loadingText}>Could not generate report</Text>
      </View>
    );
  }

  const rows = [
    { label: 'Net Worth', value: report.net_worth, color: (report.net_worth || 0) >= 0 ? colors.teal : colors.rose },
    { label: 'Total Assets', value: report.total_assets, color: colors.teal },
    { label: 'Total Liabilities', value: report.total_liabilities, color: colors.rose },
    null,
    { label: 'Cash & Savings', value: report.cash, color: colors.text },
    { label: 'Investments', value: report.investments, color: colors.primary },
    { label: 'Property', value: report.property, color: colors.teal },
    { label: 'Pensions', value: report.pensions, color: colors.lavender },
    { label: 'Mortgages', value: report.mortgages, color: colors.rose },
    { label: 'Debts', value: report.debts, color: colors.rose },
    null,
    { label: 'Monthly Income', value: report.monthly_income, color: colors.teal },
    { label: 'Monthly Spend', value: report.monthly_spend, color: colors.rose },
    { label: 'Savings Rate', value: null, pct: report.savings_rate, color: colors.primary },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>NET WORTH</Text>
        <Text style={[styles.heroValue, { color: (report.net_worth || 0) >= 0 ? colors.teal : colors.rose }]}>
          {formatGBP(report.net_worth)}
        </Text>
        <Text style={styles.heroDate}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>

      <View style={styles.card}>
        {rows.map((row, i) => {
          if (!row) return <View key={i} style={styles.divider} />;
          return (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: row.color }]}>
                {row.pct != null ? `${(row.pct || 0).toFixed(1)}%` : formatGBP(row.value)}
              </Text>
            </View>
          );
        })}
      </View>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-outline" size={18} color={colors.bg} />
        <Text style={styles.shareBtnText}>Share Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontSize: 14, color: colors.text3 },
  heroCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl,
    alignItems: 'center', marginBottom: spacing.lg, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  heroLabel: { fontSize: 10, letterSpacing: 2, color: 'rgba(59,130,246,0.6)', textTransform: 'uppercase' },
  heroValue: { fontSize: 40, fontWeight: '700', marginVertical: spacing.sm },
  heroDate: { fontSize: 12, color: colors.text3 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowLabel: { fontSize: 14, color: colors.text2 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg,
  },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
