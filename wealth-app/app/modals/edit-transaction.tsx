// app/modals/edit-transaction.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, today } from '../../lib/api';

const CATEGORIES = [
  'Food & Dining', 'Shopping', 'Transport', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Rent/Mortgage',
  'Salary', 'Investment Return', 'Transfer', 'Education',
  'Personal Care', 'Gifts & Donations', 'Subscriptions', 'Other',
];
const CURRENCIES = ['GBP', 'INR', 'USD', 'EUR'];

export default function EditTransactionModal() {
  const params = useLocalSearchParams<{ id: string; description: string; amount: string; type: string; date: string; category: string; currency: string; notes: string; account_id: string }>();
  const [txnType, setTxnType] = useState<'debit' | 'credit'>((params.type as any) || 'debit');
  const [description, setDescription] = useState(params.description || '');
  const [amount, setAmount] = useState(params.amount || '');
  const [date, setDate] = useState(params.date || today());
  const [category, setCategory] = useState(params.category || 'Other');
  const [currency, setCurrency] = useState(params.currency || 'GBP');
  const [notes, setNotes] = useState(params.notes || '');
  const [accountId, setAccountId] = useState(params.account_id || '');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    api.getData().then(d => setAccounts(d.accounts || [])).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert('Missing description'); return; }
    if (!amount || isNaN(parseFloat(amount))) { Alert.alert('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api.updateTransaction(params.id!, {
        description: description.trim(),
        amount: parseFloat(amount),
        type: txnType,
        date,
        category,
        currency,
        notes,
        account_id: accountId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.typeToggle}>
          {(['debit', 'credit'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, txnType === t && (t === 'debit' ? styles.typeBtnDebitActive : styles.typeBtnCreditActive)]}
              onPress={() => { setTxnType(t); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.typeBtnText, txnType === t && { color: t === 'debit' ? colors.rose : colors.teal }]}>
                {t === 'debit' ? 'Outgoing' : 'Incoming'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description *</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholderTextColor={colors.text3} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Amount *</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholderTextColor={colors.text3} />
          </View>
          <View>
            <Text style={styles.label}>Currency</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[styles.chip, currency === c && styles.chipActive]} onPress={() => setCurrency(c)}>
                  <Text style={[styles.chipText, currency === c && { color: colors.primary }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.label}>Date</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholderTextColor={colors.text3} />

        <Text style={styles.label}>Category</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowCategories(!showCategories)}>
          <Text style={{ color: colors.text }}>{category}</Text>
          <Ionicons name={showCategories ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text3} />
        </TouchableOpacity>
        {showCategories && (
          <View style={styles.catGrid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => { setCategory(c); setShowCategories(false); }}>
                <Text style={[styles.chipText, category === c && { color: colors.primary }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {accounts.length > 0 && (
          <>
            <Text style={styles.label}>Account</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md }}>
              {accounts.map((a: any) => (
                <TouchableOpacity key={a.id} style={[styles.chip, accountId === a.id && styles.chipActive]} onPress={() => setAccountId(a.id)}>
                  <Text style={[styles.chipText, accountId === a.id && { color: colors.primary }]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.text3} />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Update Transaction'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  label: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.md },
  typeToggle: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: {
    flex: 1, alignItems: 'center', padding: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  typeBtnDebitActive: { borderColor: colors.rose, backgroundColor: colors.roseDim },
  typeBtnCreditActive: { borderColor: colors.teal, backgroundColor: colors.tealDim },
  typeBtnText: { fontSize: 14, color: colors.text3, fontWeight: '600' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
