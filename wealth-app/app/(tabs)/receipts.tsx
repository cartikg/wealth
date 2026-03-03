// app/(tabs)/receipts.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, FlatList, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, formatGBP, formatDate } from '../../lib/api';

const STORE_EMOJIS: Record<string, string> = {
  Supermarket: '🛒', Restaurant: '🍽️', Pharmacy: '💊', Petrol: '⛽',
  Clothing: '👔', Electronics: '💻', DIY: '🔧', Other: '🏪',
};

function SummaryPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function ReceiptCard({ receipt, onDelete, onAddToTxns }: {
  receipt: any;
  onDelete: () => void;
  onAddToTxns: () => void;
}) {
  const sym = receipt.currency === 'INR' ? '₹' : receipt.currency === 'USD' ? '$' : '£';
  const emoji = STORE_EMOJIS[receipt.store_category] || '🧾';
  const topItems = (receipt.items || []).slice(0, 3);

  return (
    <TouchableOpacity
      style={styles.receiptCard}
      onPress={() => router.push({ pathname: '/modals/receipt-detail', params: { id: receipt.id } })}
      activeOpacity={0.8}
    >
      <View style={styles.receiptHeader}>
        <View style={styles.receiptIconWrap}>
          <Text style={{ fontSize: 22 }}>{emoji}</Text>
        </View>
        <View style={styles.receiptInfo}>
          <Text style={styles.receiptStore} numberOfLines={1}>{receipt.store || 'Unknown'}</Text>
          <Text style={styles.receiptMeta}>{formatDate(receipt.date)} · {receipt.account_name || '—'}</Text>
        </View>
        <View>
          <Text style={styles.receiptTotal}>{sym}{(receipt.total || 0).toFixed(2)}</Text>
          <Text style={styles.receiptItemCount}>{(receipt.items || []).length} items</Text>
        </View>
      </View>

      {/* Top items preview */}
      {topItems.length > 0 && (
        <View style={styles.itemsPreview}>
          {topItems.map((item: any, i: number) => (
            <View key={i} style={styles.itemChip}>
              <Text style={styles.itemChipText} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemChipPrice}>{sym}{(item.total_price || 0).toFixed(2)}</Text>
            </View>
          ))}
          {(receipt.items || []).length > 3 && (
            <Text style={styles.moreItems}>+{(receipt.items || []).length - 3} more</Text>
          )}
        </View>
      )}

      <View style={styles.receiptFooter}>
        {receipt.added_to_transactions ? (
          <Text style={styles.addedBadge}>✓ In transactions</Text>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={onAddToTxns}>
            <Ionicons name="add" size={12} color={colors.teal} />
            <Text style={styles.addBtnText}>Add to transactions</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={colors.rose} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([api.getReceipts(), api.getData()]);
      setReceipts(r);
      setAccounts(d.accounts || []);
    } catch (e) { console.error(e); }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, []);

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Please allow camera access in Settings to scan receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadReceipt(result.assets[0].uri);
    }
  };

  const openLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets.length > 0) {
      for (const asset of result.assets) {
        await uploadReceipt(asset.uri);
      }
    }
  };

  const uploadReceipt = async (uri: string) => {
    setScanning(true);
    try {
      const defaultAccount = accounts[0]?.id || '';
      const result = await api.scanReceipt(uri, defaultAccount, 'GBP');
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } else {
        Alert.alert('Scan failed', result.error || 'Could not read receipt');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete receipt?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await api.deleteReceipt(id);
          await load();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    ]);
  };

  const handleAddToTxns = async (id: string) => {
    try {
      await api.addReceiptToTransactions(id);
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const filtered = receipts.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.store || '').toLowerCase().includes(q) ||
      (r.items || []).some((i: any) => (i.name || '').toLowerCase().includes(q));
  });

  const totalSpend = filtered.reduce((s, r) => s + (r.total || 0), 0);
  const totalItems = filtered.reduce((s, r) => s + (r.items || []).length, 0);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.text3} style={{ marginRight: spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search store or item..."
          placeholderTextColor={colors.text3}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Summary */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={styles.summaryRow}>
        <SummaryPill label="Receipts" value={String(filtered.length)} />
        <SummaryPill label="Total Spend" value={formatGBP(totalSpend)} color={colors.rose} />
        <SummaryPill label="Items" value={String(totalItems)} />
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ReceiptCard
            receipt={item}
            onDelete={() => handleDelete(item.id)}
            onAddToTxns={() => handleAddToTxns(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          !scanning ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={56} color={colors.text3} />
              <Text style={styles.emptyTitle}>No receipts yet</Text>
              <Text style={styles.emptySubtitle}>Scan a receipt to track itemised spending</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openCamera}>
                <Ionicons name="camera" size={18} color={colors.bg} />
                <Text style={styles.emptyBtnText}>Scan Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={styles.emptyTitle}>Scanning receipt...</Text>
              <Text style={styles.emptySubtitle}>Claude is reading every item</Text>
            </View>
          )
        }
      />

      {/* Scan buttons */}
      <View style={styles.fabRow}>
        <TouchableOpacity
          style={[styles.fabSecondary, scanning && { opacity: 0.5 }]}
          onPress={openLibrary}
          disabled={scanning}
        >
          <Ionicons name="images" size={20} color={colors.teal} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fab, scanning && { opacity: 0.5 }]}
          onPress={openCamera}
          disabled={scanning}
        >
          <Ionicons name="camera" size={24} color={colors.bg} />
          <Text style={styles.fabText}>{scanning ? 'Scanning...' : 'Scan Receipt'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 40,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },

  summaryRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  summaryPill: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', minWidth: 80,
  },
  pillLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  pillValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },

  listContent: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },

  receiptCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  receiptIconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center',
  },
  receiptInfo: { flex: 1 },
  receiptStore: { fontSize: 15, fontWeight: '600', color: colors.text },
  receiptMeta: { fontSize: 11, color: colors.text3, marginTop: 2 },
  receiptTotal: { fontSize: 18, fontWeight: '700', color: colors.rose, textAlign: 'right' },
  receiptItemCount: { fontSize: 11, color: colors.text3, textAlign: 'right' },

  itemsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  itemChip: {
    flexDirection: 'row', gap: spacing.xs,
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  itemChipText: { fontSize: 11, color: colors.text2, maxWidth: 100 },
  itemChipPrice: { fontSize: 11, color: colors.text3 },
  moreItems: { fontSize: 11, color: colors.text3, alignSelf: 'center' },

  receiptFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  addedBadge: { fontSize: 12, color: colors.teal },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 12, color: colors.teal },
  deleteBtn: { padding: spacing.xs },

  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.text3 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: colors.bg },

  fabRow: {
    position: 'absolute', bottom: 20, right: 20, left: 20,
    flexDirection: 'row', gap: spacing.md, justifyContent: 'flex-end',
  },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fabText: { fontSize: 15, fontWeight: '700', color: colors.bg },
  fabSecondary: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.tealDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.teal,
  },
});
