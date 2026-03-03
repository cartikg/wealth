// app/modals/add-transaction.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
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

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
}

function TypeToggle({ value, onChange }: { value: 'debit' | 'credit'; onChange: (v: 'debit' | 'credit') => void }) {
  return (
    <View style={styles.typeToggle}>
      {(['debit', 'credit'] as const).map(t => (
        <TouchableOpacity
          key={t}
          style={[styles.typeBtn, value === t && (t === 'debit' ? styles.typeBtnDebitActive : styles.typeBtnCreditActive)]}
          onPress={() => { onChange(t); Haptics.selectionAsync(); }}
        >
          <Ionicons
            name={t === 'debit' ? 'arrow-up-circle' : 'arrow-down-circle'}
            size={18}
            color={value === t ? (t === 'debit' ? colors.rose : colors.teal) : colors.text3}
          />
          <Text style={[styles.typeBtnText, value === t && { color: t === 'debit' ? colors.rose : colors.teal }]}>
            {t === 'debit' ? 'Outgoing' : 'Incoming'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AddTransactionModal() {
  const [txnType, setTxnType] = useState<'debit' | 'credit'>('debit');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('Other');
  const [currency, setCurrency] = useState('GBP');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    api.getData().then(d => {
      setAccounts(d.accounts || []);
      if (d.accounts?.length > 0) setAccountId(d.accounts[0].id);
    }).catch(console.error);
  }, []);

  const isScheduled = date > today();

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert('Missing description'); return; }
    if (!amount || isNaN(parseFloat(amount))) { Alert.alert('Enter a valid amount'); return; }

    setSaving(true);
    try {
      await api.addTransaction({
        description: description.trim(),
        amount: parseFloat(amount),
        type: txnType,
        date,
        category,
        currency,
        notes,
        account_id: accountId,
        is_scheduled: isScheduled,
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
        {/* Type toggle */}
        <TypeToggle value={txnType} onChange={setTxnType} />

        {/* Scheduled badge */}
        {isScheduled && (
          <View style={styles.scheduledBadge}>
            <Text style={styles.scheduledText}>⏰ Future date — will be saved as scheduled</Text>
          </View>
        )}

        {/* Description */}
        <FieldLabel label="Description *" />
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Tesco, Salary, Rent..."
          placeholderTextColor={colors.text3}
        />

        {/* Amount + Currency */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <FieldLabel label="Amount *" />
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.text3}
            />
          </View>
          <View style={{ width: 90 }}>
            <FieldLabel label="Currency" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chipSm, currency === c && styles.chipSmActive]}
                    onPress={() => setCurrency(c)}
                  >
                    <Text style={[styles.chipSmText, currency === c && { color: colors.primary }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Date */}
        <FieldLabel label="Date" />
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.text3}
          keyboardType="numbers-and-punctuation"
        />

        {/* Category */}
        <FieldLabel label="Category" />
        <TouchableOpacity style={styles.input} onPress={() => setShowCategories(!showCategories)}>
          <Text style={{ color: colors.text }}>{category}</Text>
          <Ionicons name={showCategories ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text3} />
        </TouchableOpacity>
        {showCategories && (
          <View style={styles.catGrid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, category === c && styles.catChipActive]}
                onPress={() => { setCategory(c); setShowCategories(false); }}
              >
                <Text style={[styles.catChipText, category === c && { color: colors.primary }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Account */}
        {accounts.length > 0 && (
          <>
            <FieldLabel label="Account" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {accounts.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.chipSm, accountId === a.id && styles.chipSmActive]}
                    onPress={() => setAccountId(a.id)}
                  >
                    <Text style={[styles.chipSmText, accountId === a.id && { color: colors.primary }]}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* Notes */}
        <FieldLabel label="Notes (optional)" />
        <TextInput
          style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any additional notes..."
          placeholderTextColor={colors.text3}
          multiline
        />

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Transaction'}</Text>
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
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  typeToggle: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md,
  },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  typeBtnDebitActive: { borderColor: colors.rose, backgroundColor: colors.roseDim },
  typeBtnCreditActive: { borderColor: colors.teal, backgroundColor: colors.tealDim },
  typeBtnText: { fontSize: 14, color: colors.text3, fontWeight: '600' },

  scheduledBadge: {
    backgroundColor: 'rgba(155,142,232,0.1)', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(155,142,232,0.3)',
  },
  scheduledText: { fontSize: 12, color: colors.lavender, textAlign: 'center' },

  chipSm: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipSmActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipSmText: { fontSize: 12, color: colors.text3 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  catChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  catChipText: { fontSize: 12, color: colors.text2 },

  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    padding: spacing.lg, alignItems: 'center', marginTop: spacing.lg,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
