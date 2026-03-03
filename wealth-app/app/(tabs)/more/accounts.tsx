// app/screens/accounts.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  Alert, Dimensions, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, shadow } from '../../../lib/theme';
import { api, formatGBP, formatDate } from '../../../lib/api';
import FAB from '../../../components/layout/FAB';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.sm) / 2;

const TYPE_META: Record<string, { icon: string; color: string }> = {
  current: { icon: 'wallet-outline', color: colors.primary },
  savings: { icon: 'cash-outline', color: colors.teal },
  credit: { icon: 'card-outline', color: colors.rose },
  investment: { icon: 'trending-up-outline', color: colors.lavender },
  isa: { icon: 'shield-checkmark-outline', color: colors.primary },
  pension: { icon: 'hourglass-outline', color: '#F59E0B' },
  crypto: { icon: 'logo-bitcoin', color: '#F97316' },
  mortgage: { icon: 'home-outline', color: colors.rose },
  loan: { icon: 'document-text-outline', color: '#EC4899' },
};

function getTypeMeta(type: string) {
  const key = (type || '').toLowerCase();
  for (const [k, v] of Object.entries(TYPE_META)) {
    if (key.includes(k)) return v;
  }
  return { icon: 'ellipse-outline', color: colors.text3 };
}

function AccountCard({ account, summary, onLongPress }: {
  account: any;
  summary: any;
  onLongPress: () => void;
}) {
  const meta = getTypeMeta(account.type || account.account_type || '');
  const balance = summary?.balance ?? account.balance ?? 0;
  const txnCount = summary?.transaction_count ?? summary?.txn_count ?? 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: meta.color + '1A' }]}>
        <Ionicons name={meta.icon as any} size={22} color={meta.color} />
      </View>

      <Text style={styles.cardName} numberOfLines={1}>{account.name || account.display_name || 'Account'}</Text>
      <Text style={styles.cardBank} numberOfLines={1}>{account.bank || account.institution || '--'}</Text>

      <Text style={[styles.cardBalance, { color: balance >= 0 ? colors.teal : colors.rose }]}>
        {formatGBP(balance)}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.cardTag}>
          <Text style={styles.cardTagText}>{account.type || account.account_type || 'Other'}</Text>
        </View>
        <Text style={styles.cardCurrency}>{account.currency || 'GBP'}</Text>
      </View>

      {txnCount > 0 && (
        <Text style={styles.cardTxns}>{txnCount} transactions</Text>
      )}
    </TouchableOpacity>
  );
}

export default function AccountsScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getData();
      setData(d);
    } catch (e) { console.error(e); }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const accounts = data?.accounts || [];
  const accountSummary = data?.account_summary || {};

  const handleDelete = (account: any) => {
    const name = account.name || account.display_name || 'this account';
    Alert.alert(`Delete ${name}?`, 'This will remove the account. Transactions may be preserved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteAccount(account.id);
            await load();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleAddAccount = () => {
    router.push('/modals/add-account');
  };

  const renderItem = ({ item }: { item: any }) => {
    const summary = accountSummary[item.id] || accountSummary[item.name] || {};
    return (
      <AccountCard
        account={item}
        summary={summary}
        onLongPress={() => handleDelete(item)}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={item => item.id || item.name}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Accounts</Text>
            <Text style={styles.screenSubtitle}>{accounts.length} account{accounts.length !== 1 ? 's' : ''} connected</Text>
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={56} color={colors.text3} />
              <Text style={styles.emptyTitle}>No accounts yet</Text>
              <Text style={styles.emptySubtitle}>Add your bank accounts, credit cards, and investment accounts</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={handleAddAccount}>
                <Ionicons name="add-circle" size={20} color={colors.bg} />
                <Text style={styles.emptyBtnText}>Add Account</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      {accounts.length > 0 && (
        <FAB
          icon="add"
          label="Add Account"
          onPress={handleAddAccount}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.lg, paddingBottom: 100 },
  row: { gap: spacing.sm, marginBottom: spacing.sm },

  header: { marginBottom: spacing.lg },
  screenTitle: { fontSize: 22, color: colors.text, fontWeight: '700' },
  screenSubtitle: { fontSize: 13, color: colors.text3, marginTop: 2 },

  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  cardBank: { fontSize: 11, color: colors.text3, marginBottom: spacing.sm },
  cardBalance: { fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardTag: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTagText: { fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardCurrency: { fontSize: 10, color: colors.text3, fontWeight: '600' },
  cardTxns: { fontSize: 10, color: colors.text3, marginTop: spacing.xs },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: colors.bg },
});
