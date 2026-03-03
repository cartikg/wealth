// app/(tabs)/more.tsx — Hub grid linking to all sections
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../../lib/theme';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  color: string;
  description: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU: MenuGroup[] = [
  {
    title: 'Dashboards',
    items: [
      { label: 'Net Worth', icon: 'wallet-outline', route: './net-worth', color: colors.primary, description: 'Full breakdown & history' },
      { label: 'Forecast', icon: 'analytics-outline', route: './forecast', color: colors.cyan, description: '12-month projection' },
      { label: 'Accounts', icon: 'card-outline', route: './accounts', color: colors.teal, description: 'Bank accounts & balances' },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Receipts', icon: 'camera-outline', route: './receipts', color: '#F59E0B', description: 'Scan & track receipts' },
      { label: 'Banks', icon: 'business-outline', route: './banks', color: colors.lavender, description: 'Open Banking connections' },
      { label: 'Mortgage & Debt', icon: 'home-outline', route: './mortgage-debt', color: '#F97316', description: 'Mortgages, loans & payoff' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Retirement', icon: 'umbrella-outline', route: './retirement', color: colors.teal, description: 'FIRE modes & Monte Carlo' },
      { label: 'Tax Strategy', icon: 'calculator-outline', route: './tax-strategy', color: colors.primary, description: 'ISA, pension & CGT optimisation' },
      { label: 'Estate & Legacy', icon: 'shield-outline', route: './estate-legacy', color: colors.lavender, description: 'IHT projection & planning' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Spending Insights', icon: 'pie-chart-outline', route: './spending-insights', color: colors.rose, description: 'Budgets & trends' },
      { label: 'Recurring', icon: 'repeat-outline', route: './recurring-transactions', color: colors.cyan, description: 'Manage recurring payments' },
      { label: 'Categories', icon: 'pricetags-outline', route: './category-management', color: '#F59E0B', description: 'Manage spending categories' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', icon: 'settings-outline', route: '/modals/settings', color: colors.text3, description: 'Server, profile & privacy' },
    ],
  },
];

export default function MoreScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {MENU.map(group => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.grid}>
            {group.items.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.card}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon as any} size={24} color={item.color} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  group: { marginBottom: spacing.xl },
  groupTitle: {
    fontSize: 12, fontWeight: '700', color: colors.text3,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '31%', minWidth: 100, flexGrow: 1,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  cardLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 2 },
  cardDesc: { fontSize: 10, color: colors.text3 },
});
