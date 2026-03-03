// app/modals/add-account.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api } from '../../lib/api';

const ACCOUNT_TYPES = ['current', 'savings', 'credit'];
const CURRENCIES = ['GBP', 'INR', 'USD', 'EUR'];

export default function AddAccountModal() {
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [accountType, setAccountType] = useState('current');
  const [currency, setCurrency] = useState('GBP');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Enter account name'); return; }
    setSaving(true);
    try {
      await api.addAccount({ name: name.trim(), bank: bank.trim(), account_type: accountType, currency });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Account Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Monzo Current" placeholderTextColor={colors.text3} />

        <Text style={styles.label}>Bank</Text>
        <TextInput style={styles.input} value={bank} onChangeText={setBank} placeholder="e.g. Monzo" placeholderTextColor={colors.text3} />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {ACCOUNT_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, accountType === t && styles.chipActive]} onPress={() => setAccountType(t)}>
              <Text style={[styles.chipText, accountType === t && { color: colors.primary }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Currency</Text>
        <View style={styles.chips}>
          {CURRENCIES.map(c => (
            <TouchableOpacity key={c} style={[styles.chip, currency === c && styles.chipActive]} onPress={() => setCurrency(c)}>
              <Text style={[styles.chipText, currency === c && { color: colors.primary }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add Account'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 60 },
  label: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border2 },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 12, color: colors.text3 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
