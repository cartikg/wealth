// components/charts/AllocationBar.tsx — Segmented horizontal allocation bar
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface Segment {
  value: number;
  color: string;
  label: string;
}

interface AllocationBarProps {
  segments: Segment[];
  height?: number;
  showLegend?: boolean;
  formatValue?: (v: number, total: number) => string;
}

export default function AllocationBar({ segments, height = 12, showLegend = true, formatValue }: AllocationBarProps) {
  const total = segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0);
  if (total <= 0) return null;

  const fmt = formatValue || ((v: number, t: number) => `${((v / t) * 100).toFixed(1)}%`);

  return (
    <View>
      <View style={[styles.bar, { height }]}>
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <View
            key={i}
            style={{
              flex: seg.value / total,
              height,
              backgroundColor: seg.color,
              borderTopLeftRadius: i === 0 ? height / 2 : 0,
              borderBottomLeftRadius: i === 0 ? height / 2 : 0,
              borderTopRightRadius: i === segments.filter(s => s.value > 0).length - 1 ? height / 2 : 0,
              borderBottomRightRadius: i === segments.filter(s => s.value > 0).length - 1 ? height / 2 : 0,
            }}
          />
        ))}
      </View>
      {showLegend && (
        <View style={styles.legend}>
          {segments.filter(s => s.value > 0).map((seg, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: seg.color }]} />
              <Text style={styles.legendLabel}>{seg.label}</Text>
              <Text style={[styles.legendValue, { color: seg.color }]}>{fmt(seg.value, total)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', overflow: 'hidden', marginBottom: spacing.sm },
  legend: { gap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, color: colors.text2, flex: 1 },
  legendValue: { fontSize: 12, fontWeight: '600' },
});
