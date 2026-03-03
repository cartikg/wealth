// components/inputs/FilterChips.tsx
import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface FilterChipsProps {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  secondaryOptions?: string[];
  secondarySelected?: string;
  onSecondarySelect?: (value: string) => void;
}

export default function FilterChips({
  options, selected, onSelect,
  secondaryOptions, secondarySelected, onSecondarySelect,
}: FilterChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map(o => (
        <TouchableOpacity
          key={o}
          style={[styles.chip, selected === o && styles.chipActive]}
          onPress={() => onSelect(o)}
        >
          <Text style={[styles.chipText, selected === o && styles.chipTextActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
      {secondaryOptions && (
        <>
          <View style={styles.sep} />
          {secondaryOptions.map(o => (
            <TouchableOpacity
              key={o}
              style={[styles.chip, secondarySelected === o && styles.chipActive]}
              onPress={() => onSecondarySelect?.(o)}
            >
              <Text style={[styles.chipText, secondarySelected === o && styles.chipTextActive]}>{o}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  sep: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.xs },
});
