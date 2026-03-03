// app/modals/add-holding.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api } from '../../lib/api';

const BUCKET_TYPES = [
  { value: 'isa', label: 'ISA' },
  { value: 'pension', label: 'Pension' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'rsu', label: 'RSU' },
  { value: 'custom', label: 'Custom' },
];

export default function AddHoldingModal() {
  const [bucket, setBucket] = useState('isa');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [invested, setInvested] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [saving, setSaving] = useState(false);

  const isCrypto = bucket === 'crypto';
  const isCustom = bucket === 'custom';
  const isPension = bucket === 'pension';

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Enter a name'); return; }
    setSaving(true);
    try {
      let body: any = { name: name.trim() };
      if (isCrypto) {
        body = { coin_id: ticker.toLowerCase().trim() || name.toLowerCase().trim(), symbol: ticker.toUpperCase().trim(), amount: Number(shares) || 0, buy_price: Number(invested) || 0 };
      } else if (isCustom) {
        body = { name: name.trim(), current_value: Number(currentValue) || 0, invested: Number(invested) || 0 };
      } else if (isPension) {
        body = { name: name.trim(), current_value: Number(currentValue) || 0, total_contributed: Number(invested) || 0 };
      } else {
        body = { ticker: ticker.toUpperCase().trim(), name: name.trim(), shares: Number(shares) || 0, invested: Number(invested) || 0 };
      }
      await api.addHolding(bucket, body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Investment Type</Text>
        <View style={styles.chips}>
          {BUCKET_TYPES.map(b => (
            <TouchableOpacity key={b.value} style={[styles.chip, bucket === b.value && styles.chipActive]} onPress={() => setBucket(b.value)}>
              <Text style={[styles.chipText, bucket === b.value && { color: colors.primary }]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{isCrypto ? 'Coin Name' : isCustom || isPension ? 'Name' : 'Name'} *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={isCrypto ? 'Bitcoin' : isPension ? 'Workplace Pension' : 'e.g. VUSA'} placeholderTextColor={colors.text3} />

        {!isCustom && !isPension && (
          <>
            <Text style={styles.label}>{isCrypto ? 'Coin ID / Symbol' : 'Ticker'}</Text>
            <TextInput style={styles.input} value={ticker} onChangeText={setTicker} placeholder={isCrypto ? 'BTC' : 'VUSA'} placeholderTextColor={colors.text3} autoCapitalize="characters" />
          </>
        )}

        {!isCustom && !isPension && (
          <>
            <Text style={styles.label}>{isCrypto ? 'Amount' : 'Shares'}</Text>
            <TextInput style={styles.input} value={shares} onChangeText={setShares} placeholder="10" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </>
        )}

        <Text style={styles.label}>{isCustom || isPension ? 'Current Value' : 'Amount Invested'}</Text>
        <TextInput style={styles.input} value={isCustom || isPension ? currentValue : invested} onChangeText={isCustom || isPension ? setCurrentValue : setInvested} placeholder="5000" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />

        {(isCustom || isPension) && (
          <>
            <Text style={styles.label}>{isPension ? 'Total Contributed' : 'Cost Basis'}</Text>
            <TextInput style={styles.input} value={invested} onChangeText={setInvested} placeholder="4000" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </>
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add Holding'}</Text>
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
