// app/modals/retirement-settings.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api } from '../../lib/api';

export default function RetirementSettingsModal() {
  const [targetAge, setTargetAge] = useState('60');
  const [currentAge, setCurrentAge] = useState('35');
  const [monthlyExpenses, setMonthlyExpenses] = useState('3000');
  const [inflationRate, setInflationRate] = useState('2.5');
  const [expectedReturn, setExpectedReturn] = useState('7');
  const [postRetReturn, setPostRetReturn] = useState('4');
  const [lifeExpectancy, setLifeExpectancy] = useState('90');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getData().then(d => {
      const r = d.retirement || {};
      if (r.target_age) setTargetAge(String(r.target_age));
      if (r.current_age) setCurrentAge(String(r.current_age));
      if (r.monthly_expenses_retirement) setMonthlyExpenses(String(r.monthly_expenses_retirement));
      if (r.inflation_rate) setInflationRate(String(r.inflation_rate));
      if (r.expected_return) setExpectedReturn(String(r.expected_return));
      if (r.post_retirement_return) setPostRetReturn(String(r.post_retirement_return));
      if (r.life_expectancy) setLifeExpectancy(String(r.life_expectancy));
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings({
        retirement: {
          target_age: Number(targetAge), current_age: Number(currentAge),
          monthly_expenses_retirement: Number(monthlyExpenses),
          inflation_rate: Number(inflationRate), expected_return: Number(expectedReturn),
          post_retirement_return: Number(postRetReturn), life_expectancy: Number(lifeExpectancy),
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) => (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholderTextColor={colors.text3} />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Age & Timeline</Text>
        <View style={styles.row}>
          <Field label="Current Age" value={currentAge} onChange={setCurrentAge} />
          <Field label="Retirement Age" value={targetAge} onChange={setTargetAge} />
          <Field label="Life Expectancy" value={lifeExpectancy} onChange={setLifeExpectancy} />
        </View>

        <Text style={styles.heading}>Spending</Text>
        <Field label="Monthly Expenses in Retirement" value={monthlyExpenses} onChange={setMonthlyExpenses} suffix="£/mo" />

        <Text style={styles.heading}>Returns & Inflation</Text>
        <View style={styles.row}>
          <Field label="Expected Return" value={expectedReturn} onChange={setExpectedReturn} suffix="%" />
          <Field label="Post-Retirement" value={postRetReturn} onChange={setPostRetReturn} suffix="%" />
          <Field label="Inflation" value={inflationRate} onChange={setInflationRate} suffix="%" />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  heading: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  label: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  suffix: { fontSize: 13, color: colors.text3 },
  row: { flexDirection: 'row', gap: spacing.md },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
