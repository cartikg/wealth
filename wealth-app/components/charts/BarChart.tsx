// components/charts/BarChart.tsx — Simple bar chart
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../../lib/theme';

interface BarData {
  label: string;
  values: { value: number; color: string }[];
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  legendItems?: { label: string; color: string }[];
}

export default function BarChart({ data, height = 80, legendItems }: BarChartProps) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.flatMap(d => d.values.map(v => v.value)), 1);

  return (
    <View>
      <View style={[styles.chartRow, { height: height + 20 }]}>
        {data.map((d, i) => (
          <View key={i} style={styles.col}>
            <View style={styles.barGroup}>
              {d.values.map((v, j) => (
                <View
                  key={j}
                  style={[styles.bar, {
                    height: (v.value / maxVal) * height,
                    backgroundColor: v.color,
                    opacity: 0.8,
                  }]}
                />
              ))}
            </View>
            <Text style={styles.label}>{d.label}</Text>
          </View>
        ))}
      </View>
      {legendItems && (
        <View style={styles.legendRow}>
          {legendItems.map((item, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barGroup: { flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  bar: { width: 8, borderRadius: 3, minHeight: 2 },
  label: { fontSize: 9, color: colors.text3, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text3 },
});
