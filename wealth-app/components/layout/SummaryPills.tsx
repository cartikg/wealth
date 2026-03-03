// components/layout/SummaryPills.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface Pill {
  label: string;
  color?: string;
  flex?: number;
}

interface SummaryPillsProps {
  pills: Pill[];
}

export default function SummaryPills({ pills }: SummaryPillsProps) {
  return (
    <View style={styles.row}>
      {pills.map((p, i) => (
        <View key={i} style={[styles.pill, p.flex ? { flex: p.flex } : {}]}>
          <Text style={[styles.label, p.color ? { color: p.color } : {}]}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  label: { fontSize: 11, color: colors.text2, fontWeight: '600' },
});
