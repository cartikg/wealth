// app/modals/add-disposal.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, today } from '../../lib/api';

export default function AddDisposalModal() {
  const [assetName, setAssetName] = useState('');
  const [saleDate, setSaleDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const gain = (Number(salePrice) || 0) - (Number(costBasis) || 0);

  const handleSave = async () => {
    if (!assetName.trim()) { Alert.alert('Enter asset name'); return; }
    if (!salePrice || isNaN(Number(salePrice))) { Alert.alert('Enter valid sale proceeds'); return; }
    setSaving(true);
    try {
      await api.addDisposal({
        asset_name: assetName.trim(),
        sale_date: saleDate, quantity: Number(quantity) || 1,
        sale_price: Number(salePrice), cost_basis: Number(costBasis) || 0,
        notes,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface2 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Asset Name *</Text>
        <TextInput style={styles.input} value={assetName} onChangeText={setAssetName} placeholder="e.g. AAPL" placeholderTextColor={colors.text3} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Sale Date</Text>
            <TextInput style={styles.input} value={saleDate} onChangeText={setSaleDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="10" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Sale Proceeds *</Text>
            <TextInput style={styles.input} value={salePrice} onChangeText={setSalePrice} placeholder="15000" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cost Basis</Text>
            <TextInput style={styles.input} value={costBasis} onChangeText={setCostBasis} placeholder="10000" placeholderTextColor={colors.text3} keyboardType="decimal-pad" />
          </View>
        </View>

        <View style={[styles.gainCard, { borderColor: gain >= 0 ? colors.teal : colors.rose }]}>
          <Text style={styles.gainLabel}>{gain >= 0 ? 'GAIN' : 'LOSS'}</Text>
          <Text style={[styles.gainValue, { color: gain >= 0 ? colors.teal : colors.rose }]}>
            {gain >= 0 ? '+' : ''}£{gain.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </Text>
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.text3} />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Record Disposal'}</Text>
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
  gainCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg,
    alignItems: 'center', marginTop: spacing.lg, borderWidth: 1,
  },
  gainLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 2 },
  gainValue: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },
});
