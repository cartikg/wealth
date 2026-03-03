// components/cards/HeroCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadow } from '../../lib/theme';

interface HeroItem {
  label: string;
  value: string;
  color?: string;
}

interface HeroCardProps {
  label: string;
  value: string;
  valueColor?: string;
  items?: HeroItem[];
  children?: React.ReactNode;
}

export default function HeroCard({ label, value, valueColor, items, children }: HeroCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      {items && items.length > 0 && (
        <View style={styles.row}>
          {items.map(item => (
            <View key={item.label} style={styles.item}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={[styles.itemValue, item.color ? { color: item.color } : {}]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    ...shadow.card,
  },
  label: { fontSize: 10, letterSpacing: 2, color: 'rgba(59,130,246,0.6)', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 44, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  item: {},
  itemLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  itemValue: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
});
