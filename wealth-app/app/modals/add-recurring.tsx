// app/modals/add-recurring.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, today } from '../../lib/api';

const CATEGORIES = [
  'Food & Dining', 'Shopping', 'Transport', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Rent/Mortgage',
  'Salary', 'Investment Return', 'Transfer', 'Subscriptions', 'Other',
];
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

export default function AddRecurringModal() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [txnType, setTxnType] = useState<'debit' | 'credit'>('debit');
  const [frequency, setFrequency] = useState('monthly');
  const [nextDate, setNextDate] = useState(today());
  const [category, setCategory] = useState('Bills & Utilities');
  const [currency, setCurrency] = useState('GBP');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getData().then(d => {
      setAccounts(d.accounts || []);
      if (d.accounts?.length > 0) setAccountId(d.accounts[0].id);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert('Enter description'); return; }
    if (!amount || isNaN(Number(amount))) { Alert.alert('Enter valid amount'); return; }
    setSaving(true);
    try {
      await api.addRecurring({
        description: description.trim(), amount: Number(amount),
        type: txnType, frequency, next_date: nextDate,
        category, currency, account_id: accountId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.typeToggle}>
          {(['debit', 'credit'] as const).map(t => (
            <TouchableOpacity key={t} style={[styles.typeBtn, txnType === t && (t === 'debit' ? styles.debitActive : styles.creditActive)]} onPress={() => setTxnType(t)}>
              <Text style={[styles.typeBtnText, txnType === t && { color: t === 'debit' ? colors.rose : colors.teal }]}>
                {t === 'debit' ? 'Outgoing' : 'Incoming'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description *</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="e.g. Netflix, Rent..." placeholderTextColor={colors.text3} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Amount *</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="15.99" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Next Date</Text>
            <TextInput style={styles.input} value={nextDate} onChangeText={setNextDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text3} />
          </View>
        </View>

        <Text style={styles.label}>Frequency</Text>
        <View style={styles.chips}>
          {FREQUENCIES.map(f => (
            <TouchableOpacity key={f} style={[styles.chip, frequency === f && styles.chipActive]} onPress={() => setFrequency(f)}>
              <Text style={[styles.chipText, frequency === f && { color: colors.primary }]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && { color: colors.primary }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {accounts.length > 0 && (
          <>
            <Text style={styles.label}>Account</Text>
            <View style={styles.chips}>
              {accounts.map((a: any) => (
                <TouchableOpacity key={a.id} style={[styles.chip, accountId === a.id && styles.chipActive]} onPress={() => setAccountId(a.id)}>
                  <Text style={[styles.chipText, accountId === a.id && { color: colors.primary }]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Create Recurring'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  label: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border2 },
  row: { flexDirection: 'row', gap: spacing.md },
  typeToggle: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  debitActive: { borderColor: colors.rose, backgroundColor: colors.roseDim },
  creditActive: { borderColor: colors.teal, backgroundColor: colors.tealDim },
  typeBtnText: { fontSize: 14, color: colors.text3, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
