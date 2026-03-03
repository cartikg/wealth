// app/modals/connect-bank.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../lib/theme';

export default function ConnectBankModal() {
  const [serverUrl, setServerUrl] = useState('http://localhost:5000');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Trim trailing slash
      const url = serverUrl.trim().replace(/\/$/, '');
      await AsyncStorage.setItem('server_url', url);
      Alert.alert('Server URL saved', `App will now connect to:\n${url}`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Server config */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📡 Flask Server URL</Text>
        <Text style={styles.cardDesc}>
          Your finance dashboard runs on a Flask server (Python). Enter its address so the iPhone app can connect.
        </Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.100:5000"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>💡 Finding your server IP</Text>
          <Text style={styles.tipText}>On your Mac, open Terminal and run:</Text>
          <Text style={styles.code}>ipconfig getifaddr en0</Text>
          <Text style={styles.tipText}>Use that IP instead of localhost:</Text>
          <Text style={styles.code}>http://192.168.x.x:5000</Text>
          <Text style={styles.tipText}>Make sure your iPhone and Mac are on the same WiFi network.</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>Save & Connect</Text>
        </TouchableOpacity>
      </View>

      {/* TrueLayer info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏦 TrueLayer Bank Connection</Text>
        <Text style={styles.cardDesc}>
          Bank linking uses TrueLayer Open Banking. Set it up once on your Flask server, then tap "Connect a Bank" in the Banks tab.
        </Text>

        <View style={styles.stepsContainer}>
          {[
            { num: '1', text: 'Go to console.truelayer.com → sign up free' },
            { num: '2', text: 'Create an app → copy Client ID + Secret' },
            { num: '3', text: 'Add redirect URI:\nhttp://YOUR_MAC_IP:5000/api/truelayer/callback' },
            { num: '4', text: 'Set env vars and restart Flask on your Mac' },
          ].map(({ num, text }) => (
            <View key={num} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{num}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.envCode}>
          {'export TRUELAYER_CLIENT_ID=your_id\nexport TRUELAYER_CLIENT_SECRET=your_secret\nexport TRUELAYER_ENV=sandbox\npython app.py'}
        </Text>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => Linking.openURL('https://console.truelayer.com')}
        >
          <Text style={styles.linkBtnText}>Open TrueLayer Console →</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Plaid info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🟢 Plaid Bank Connection (US/UK/EU)</Text>
        <Text style={styles.cardDesc}>
          Plaid supports Chase, Wells Fargo, Bank of America, and thousands of US, UK, and EU banks. Set it up on your Flask server alongside TrueLayer.
        </Text>

        <View style={styles.stepsContainer}>
          {[
            { num: '1', text: 'Go to dashboard.plaid.com → sign up free' },
            { num: '2', text: 'Get your client_id and secret from the Keys page' },
            { num: '3', text: 'Set env vars and restart Flask on your Mac' },
          ].map(({ num, text }) => (
            <View key={num} style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: '#00dc7f' }]}>
                <Text style={styles.stepNumText}>{num}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.envCode}>
          {'export PLAID_CLIENT_ID=your_id\nexport PLAID_SECRET=your_secret\nexport PLAID_ENV=sandbox\npython app.py'}
        </Text>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => Linking.openURL('https://dashboard.plaid.com')}
        >
          <Text style={[styles.linkBtnText, { color: '#00dc7f' }]}>Open Plaid Dashboard →</Text>
          <Ionicons name="open-outline" size={14} color="#00dc7f" />
        </TouchableOpacity>
      </View>

      {/* Not supported */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ What's not in Open Banking</Text>
        {[
          { name: 'American Express', hint: 'Export CSV from Amex app → Settings → upload' },
          { name: 'Trading 212', hint: 'Download CSV from History tab' },
          { name: 'HDFC / SBI India', hint: 'Export statement from banking app' },
        ].map(({ name, hint }) => (
          <View key={name} style={styles.notSupported}>
            <Text style={styles.notSupportedName}>{name}</Text>
            <Text style={styles.notSupportedHint}>{hint}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cardDesc: { fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: spacing.md },

  label: { fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, color: colors.text, fontSize: 14,
    borderWidth: 1, borderColor: colors.border2, marginBottom: spacing.md,
    fontFamily: 'Courier New',
  },

  tipBox: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  tipTitle: { fontSize: 13, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  tipText: { fontSize: 12, color: colors.text2, lineHeight: 18 },
  code: {
    fontFamily: 'Courier New', fontSize: 12, color: colors.teal,
    backgroundColor: colors.bg, padding: spacing.sm, borderRadius: radius.sm,
    marginVertical: spacing.xs,
  },

  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    padding: spacing.md, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.bg },

  stepsContainer: { gap: spacing.md, marginBottom: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  stepNumText: { fontSize: 12, fontWeight: '700', color: colors.bg },
  stepText: { flex: 1, fontSize: 13, color: colors.text2, lineHeight: 20 },

  envCode: {
    fontFamily: 'Courier New', fontSize: 11, color: colors.teal,
    backgroundColor: colors.surface2, padding: spacing.md, borderRadius: radius.sm,
    marginBottom: spacing.md, lineHeight: 18,
  },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  linkBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  notSupported: { marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  notSupportedName: { fontSize: 13, color: colors.text, fontWeight: '600' },
  notSupportedHint: { fontSize: 12, color: colors.text3, marginTop: 2 },
});
