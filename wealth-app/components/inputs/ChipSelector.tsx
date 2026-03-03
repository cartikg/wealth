// components/inputs/ChipSelector.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface Option {
  value: string;
  label: string;
  color?: string;
}

interface ChipSelectorProps {
  label?: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  wrap?: boolean;
}

export default function ChipSelector({ label, options, selected, onSelect, wrap = true }: ChipSelectorProps) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.chips, wrap && styles.wrap]}>
        {options.map(opt => {
          const active = selected === opt.value;
          const activeColor = opt.color || colors.primary;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, active && { borderColor: activeColor, backgroundColor: `${activeColor}18` }]}
              onPress={() => onSelect(opt.value)}
            >
              <Text style={[styles.chipText, active && { color: activeColor, fontWeight: '600' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 10, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipText: { fontSize: 13, color: colors.text3 },
});
