// app/modals/add-mortgage.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api } from '../../lib/api';

export default function AddMortgageModal() {
  const [propertyName, setPropertyName] = useState('');
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [balance, setBalance] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [mortgageType, setMortgageType] = useState('repayment');
  const [overpayment, setOverpayment] = useState('0');
  const [fixedUntil, setFixedUntil] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!propertyName.trim()) { Alert.alert('Enter property name'); return; }
    if (!principal || isNaN(Number(principal))) { Alert.alert('Enter valid principal'); return; }
    if (!rate || isNaN(Number(rate))) { Alert.alert('Enter valid interest rate'); return; }
    setSaving(true);
    try {
      await api.addMortgage({
        property_name: propertyName.trim(), lender: lender.trim(),
        principal: Number(principal), current_balance: Number(balance) || Number(principal),
        property_value: Number(propertyValue) || 0,
        interest_rate: Number(rate), term_years: Number(term) || 25,
        start_date: startDate || new Date().toISOString().split('T')[0],
        type: mortgageType, monthly_overpayment: Number(overpayment) || 0,
        fixed_until: fixedUntil || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, placeholder, keyboard }: any) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.text3} keyboardType={keyboard || 'default'} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Field label="Property Name *" value={propertyName} onChange={setPropertyName} placeholder="e.g. 42 Oak Lane" />
        <Field label="Lender" value={lender} onChange={setLender} placeholder="e.g. Nationwide" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Principal *" value={principal} onChange={setPrincipal} placeholder="607500" keyboard="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Current Balance" value={balance} onChange={setBalance} placeholder="555000" keyboard="decimal-pad" /></View>
        </View>
        <Field label="Property Value" value={propertyValue} onChange={setPropertyValue} placeholder="710000" keyboard="decimal-pad" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Interest Rate (%)" value={rate} onChange={setRate} placeholder="5.83" keyboard="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Term (years)" value={term} onChange={setTerm} placeholder="25" keyboard="number-pad" /></View>
        </View>

        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {['repayment', 'interest_only'].map(t => (
            <TouchableOpacity key={t} style={[styles.chip, mortgageType === t && styles.chipActive]} onPress={() => setMortgageType(t)}>
              <Text style={[styles.chipText, mortgageType === t && { color: colors.primary }]}>{t === 'repayment' ? 'Repayment' : 'Interest Only'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Start Date" value={startDate} onChange={setStartDate} placeholder="YYYY-MM-DD" /></View>
          <View style={{ flex: 1 }}><Field label="Fixed Until" value={fixedUntil} onChange={setFixedUntil} placeholder="YYYY-MM-DD" /></View>
        </View>
        <Field label="Monthly Overpayment" value={overpayment} onChange={setOverpayment} placeholder="0" keyboard="decimal-pad" />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add Mortgage'}</Text>
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
