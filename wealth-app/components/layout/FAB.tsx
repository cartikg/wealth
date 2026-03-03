// components/layout/FAB.tsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../lib/theme';

interface FABProps {
  icon?: string;
  label?: string;
  onPress: () => void;
  color?: string;
  bottom?: number;
  right?: number;
}

export default function FAB({ icon = 'add', label, onPress, color = colors.primary, bottom = 20, right = 20 }: FABProps) {
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: color, bottom, right }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon as any} size={label ? 20 : 28} color={colors.bg} />
      {label && <Text style={styles.label}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 56, height: 56, borderRadius: 28,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  label: { fontSize: 14, fontWeight: '700', color: colors.bg },
});
