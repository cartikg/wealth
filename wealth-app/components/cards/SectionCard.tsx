// components/cards/SectionCard.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, radius } from '../../lib/theme';

interface SectionCardProps {
  title?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}

export default function SectionCard({ title, trailing, children, onPress, style }: SectionCardProps) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.card, style]} onPress={onPress} activeOpacity={0.7}>
      {(title || trailing) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {trailing}
        </View>
      )}
      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
