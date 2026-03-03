// app/modals/add-debt.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api } from '../../lib/api';

const DEBT_TYPES = ['credit_card', 'loan', 'instalment'];

export default function AddDebtModal() {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [debtType, setDebtType] = useState('loan');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Enter debt name'); return; }
    if (!balance || isNaN(Number(balance))) { Alert.alert('Enter valid balance'); return; }
    setSaving(true);
    try {
      await api.addDebt({
        name: name.trim(), balance: Number(balance),
        interest_rate: Number(rate) || 0, minimum_payment: Number(minPayment) || 0,
        type: debtType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Debt Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Barclaycard" placeholderTextColor={colors.text3} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Balance *</Text>
            <TextInput style={styles.input} value={balance} onChangeText={setBalance} placeholder="5000" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Interest Rate (%)</Text>
            <TextInput style={styles.input} value={rate} onChangeText={setRate} placeholder="19.9" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
        </View>

        <Text style={styles.label}>Minimum Payment / Month</Text>
        <TextInput style={styles.input} value={minPayment} onChangeText={setMinPayment} placeholder="150" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {DEBT_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, debtType === t && styles.chipActive]} onPress={() => setDebtType(t)}>
              <Text style={[styles.chipText, debtType === t && { color: colors.primary }]}>
                {t === 'credit_card' ? 'Credit Card' : t === 'loan' ? 'Loan' : 'Instalment'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add Debt'}</Text>
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
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
