// components/layout/EmptyState.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon as any} size={48} color={colors.text3} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.btn} onPress={onAction}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '600', color: colors.text2 },
  subtitle: { fontSize: 13, color: colors.text3, textAlign: 'center', maxWidth: 260 },
  btn: {
    marginTop: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    backgroundColor: colors.primaryDim, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.primary,
  },
  btnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
