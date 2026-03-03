// app/modals/receipt-detail.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, formatGBP, formatDate } from '../../lib/api';

const CAT_EMOJIS: Record<string, string> = {
  'Fresh Produce': '🥦', 'Meat & Fish': '🥩', 'Dairy & Eggs': '🥛',
  'Bakery': '🍞', 'Frozen': '🧊', 'Drinks': '🥤',
  'Snacks & Confectionery': '🍫', 'Household': '🧹',
  'Personal Care': '🧴', 'Baby': '👶', 'Pet': '🐾',
  'Alcohol': '🍷', 'Clothing': '👔', 'Electronics': '💻',
  'Fuel': '⛽', 'Medicine': '💊', 'Other': '📦',
};

export default function ReceiptDetailModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receipt, setReceipt] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getReceipts().then(receipts => {
      const r = receipts.find((r: any) => r.id === id);
      setReceipt(r || null);
    }).catch(console.error);
  }, [id]);

  if (!receipt) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.text3 }}>Loading...</Text>
      </View>
    );
  }

  const sym = receipt.currency === 'INR' ? '₹' : receipt.currency === 'USD' ? '$' : '£';

  // Group items by category
  const byCat: Record<string, any[]> = {};
  (receipt.items || []).forEach((item: any) => {
    const cat = item.category || 'Other';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(item);
  });

  const handleAddToTxns = async () => {
    setAdding(true);
    try {
      await api.addReceiptToTransactions(receipt.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={[styles.summaryValue, { color: colors.rose }]}>{sym}{(receipt.total || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>{(receipt.items || []).length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Paid with</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>{receipt.account_name || '—'}</Text>
          </View>
        </View>

        {receipt.receipt_number && (
          <Text style={styles.receiptNum}>Receipt # {receipt.receipt_number}</Text>
        )}

        {/* Items by category */}
        {Object.entries(byCat).map(([cat, items]) => {
          const catTotal = items.reduce((s: number, i: any) => s + (i.total_price || 0), 0);
          return (
            <View key={cat} style={styles.catSection}>
              <View style={styles.catHeader}>
                <Text style={styles.catEmoji}>{CAT_EMOJIS[cat] || '📦'}</Text>
                <Text style={styles.catName}>{cat}</Text>
                <Text style={styles.catTotal}>{sym}{catTotal.toFixed(2)}</Text>
              </View>
              {items.map((item: any, i: number) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  {item.quantity > 1 && (
                    <Text style={styles.itemQty}>{item.quantity}×</Text>
                  )}
                  <Text style={styles.itemUnitPrice}>{sym}{(item.unit_price || 0).toFixed(2)}</Text>
                  <Text style={styles.itemTotal}>{sym}{(item.total_price || 0).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {/* Totals */}
        {receipt.tax > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{sym}{receipt.tax.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={[styles.grandTotalValue, { color: colors.primary }]}>{sym}{(receipt.total || 0).toFixed(2)}</Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {!receipt.added_to_transactions ? (
          <TouchableOpacity
            style={[styles.addBtn, adding && { opacity: 0.6 }]}
            onPress={handleAddToTxns}
            disabled={adding}
          >
            <Ionicons name="add-circle" size={20} color={colors.bg} />
            <Text style={styles.addBtnText}>{adding ? 'Adding...' : 'Add to Transactions'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.addedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={colors.teal} />
            <Text style={styles.addedText}>Already in transactions</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  content: { padding: spacing.lg, paddingBottom: 100 },

  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  summaryLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 3 },

  receiptNum: { fontSize: 11, color: colors.text3, textAlign: 'center', marginBottom: spacing.md },

  catSection: { marginBottom: spacing.md },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.border, marginBottom: spacing.sm,
  },
  catEmoji: { fontSize: 16 },
  catName: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  catTotal: { fontSize: 12, color: colors.text3 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemName: { flex: 1, fontSize: 13, color: colors.text },
  itemQty: { fontSize: 12, color: colors.text3, minWidth: 24 },
  itemUnitPrice: { fontSize: 12, color: colors.text3, minWidth: 55, textAlign: 'right' },
  itemTotal: { fontSize: 13, fontWeight: '600', color: colors.text, minWidth: 60, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 13, color: colors.text3 },
  totalValue: { fontSize: 13, color: colors.text },
  grandTotal: {
    backgroundColor: colors.primaryDim, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, marginTop: spacing.xs,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  grandTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  grandTotalValue: { fontSize: 18, fontWeight: '700' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: colors.surface2,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.teal, borderRadius: radius.full, padding: spacing.lg,
  },
  addBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
  addedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  addedText: { fontSize: 15, color: colors.teal },
});
