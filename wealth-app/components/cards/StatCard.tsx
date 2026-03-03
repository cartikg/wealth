// components/cards/StatCard.tsx
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

const { width } = Dimensions.get('window');

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}

export default function StatCard({ label, value, color, sub }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : {}]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: (width - 48) / 2 - 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: '600', color: colors.text },
  sub: { fontSize: 11, color: colors.text3, marginTop: 3 },
});
