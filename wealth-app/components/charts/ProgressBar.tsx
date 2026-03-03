// components/charts/ProgressBar.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  valueFormat?: (v: number, m: number) => string;
  height?: number;
}

export default function ProgressBar({
  value, max, color = colors.primary, label, showValue = true,
  valueFormat, height = 6,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const fmt = valueFormat || ((v, m) => `${Math.round(pct * 100)}%`);

  return (
    <View style={styles.container}>
      {(label || showValue) && (
        <View style={styles.labelRow}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showValue && <Text style={[styles.valueText, { color }]}>{fmt(value, max)}</Text>}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color, height }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  valueText: { fontSize: 11, fontWeight: '600' },
  track: { backgroundColor: colors.surface3, borderRadius: 3, overflow: 'hidden' },
  fill: { borderRadius: 3 },
});
