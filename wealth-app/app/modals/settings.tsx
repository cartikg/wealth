// app/modals/settings.tsx — Settings screen with server URL config
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { setServerUrl, getServerUrl, clearServerUrl, api } from '../../lib/api';
import { clearToken } from '../../lib/auth';

const TAX_COUNTRIES = [
  { code: 'GB', label: '🇬🇧 UK', flag: '🇬🇧' },
  { code: 'US', label: '🇺🇸 USA', flag: '🇺🇸' },
  { code: 'IN', label: '🇮🇳 India', flag: '🇮🇳' },
];

const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR'];

export default function SettingsModal() {
  const [serverUrl, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'connected' | 'failed'>('unknown');
  const [income, setIncome] = useState('');
  const [savings, setSavings] = useState('');
  // Privacy
  const [blurMode, setBlurMode] = useState(false);
  const [maskNames, setMaskNames] = useState(false);
  const [maskBanks, setMaskBanks] = useState(false);
  const [displayAlias, setDisplayAlias] = useState('');
  // Tax
  const [taxCountry, setTaxCountry] = useState('GB');
  // Currency
  const [homeCurrency, setHomeCurrency] = useState('GBP');
  // Demo
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await getServerUrl();
      setUrl(url.replace('http://', '').replace(':5000', ''));
      try {
        const h = await api.health();
        if (h.status === 'ok') {
          setStatus('connected');
          const d = await api.getData();
          setIncome(String(d.income || ''));
          setSavings(String(d.savings || ''));
          // Load additional settings
          const s = d.settings || {};
          if (s.tax_country) setTaxCountry(s.tax_country);
          if (s.home_currency) setHomeCurrency(s.home_currency);
          if (s.blur_mode) setBlurMode(s.blur_mode);
          if (s.mask_names) setMaskNames(s.mask_names);
          if (s.mask_banks) setMaskBanks(s.mask_banks);
          if (s.display_alias) setDisplayAlias(s.display_alias);
          if (d.demo_mode) setDemoMode(true);
        }
      } catch {
        setStatus('failed');
      }
    })();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    setStatus('unknown');
    const ok = await setServerUrl(serverUrl);
    setStatus(ok ? 'connected' : 'failed');
    setTesting(false);
    if (ok) {
      Alert.alert('Connected!', 'Server is reachable. Pull to refresh any screen to load data.');
      // Reload settings from server
      try {
        const d = await api.getData();
        setIncome(String(d.income || ''));
        setSavings(String(d.savings || ''));
      } catch {}
    } else {
      Alert.alert(
        'Connection Failed',
        'Could not reach the server. Make sure:\n\n' +
        '1. Flask is running with host=\'0.0.0.0\'\n' +
        '2. Your phone and Mac are on the same Wi-Fi\n' +
        '3. Mac firewall allows connections on port 5000\n' +
        '4. The IP address is correct\n\n' +
        'Try opening http://' + serverUrl + ':5000/api/health in Safari on your phone.'
      );
    }
  };

  const saveFinancials = async () => {
    try {
      await api.saveSettings({
        income: parseFloat(income) || 0,
        savings: parseFloat(savings) || 0,
      });
      Alert.alert('Saved', 'Settings updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Server Connection */}
      <Text style={styles.sectionTitle}>Server Connection</Text>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, {
            backgroundColor: status === 'connected' ? colors.teal
              : status === 'failed' ? colors.rose : colors.text3,
          }]} />
          <Text style={styles.statusText}>
            {status === 'connected' ? 'Connected' : status === 'failed' ? 'Not connected' : 'Unknown'}
          </Text>
        </View>

        <Text style={styles.label}>Server IP or hostname</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setUrl}
          placeholder="e.g. 192.168.1.100 or my-mac.local"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          Your Mac's local IP. Port 5000 is added automatically.
          {'\n'}Find it via: System Settings → Wi-Fi → Details → IP Address
        </Text>

        <TouchableOpacity
          style={[styles.btn, testing && { opacity: 0.5 }]}
          onPress={testConnection}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Ionicons name="wifi" size={16} color={colors.bg} />
          )}
          <Text style={styles.btnText}>{testing ? 'Testing...' : 'Test & Save Connection'}</Text>
        </TouchableOpacity>
      </View>

      {/* Financial Settings */}
      <Text style={styles.sectionTitle}>Financial Settings</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Monthly Income (£)</Text>
        <TextInput
          style={styles.input}
          value={income}
          onChangeText={setIncome}
          placeholder="e.g. 4500"
          placeholderTextColor={colors.text3}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { marginTop: spacing.md }]}>Cash Savings (£)</Text>
        <TextInput
          style={styles.input}
          value={savings}
          onChangeText={setSavings}
          placeholder="e.g. 15000"
          placeholderTextColor={colors.text3}
          keyboardType="numeric"
        />

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.teal }]} onPress={saveFinancials}>
          <Ionicons name="save" size={16} color={colors.bg} />
          <Text style={styles.btnText}>Save Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Tax Residency */}
      <Text style={styles.sectionTitle}>Tax Residency</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Country</Text>
        <View style={styles.chipRow}>
          {TAX_COUNTRIES.map(c => (
            <TouchableOpacity
              key={c.code}
              style={[styles.chip, taxCountry === c.code && styles.chipActive]}
              onPress={() => {
                setTaxCountry(c.code);
                api.saveSettings({ tax_country: c.code }).catch(console.error);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.chipText, taxCountry === c.code && { color: colors.primary }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Currency */}
      <Text style={styles.sectionTitle}>Currency</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Home Currency</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, homeCurrency === c && styles.chipActive]}
              onPress={() => {
                setHomeCurrency(c);
                api.saveSettings({ home_currency: c }).catch(console.error);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.chipText, homeCurrency === c && { color: colors.primary }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Privacy Controls */}
      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Blur Mode</Text>
          <Switch
            value={blurMode}
            onValueChange={(v) => {
              setBlurMode(v);
              api.saveSettings({ blur_mode: v }).catch(console.error);
            }}
            trackColor={{ false: colors.surface2, true: colors.primary }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Mask Names</Text>
          <Switch
            value={maskNames}
            onValueChange={(v) => {
              setMaskNames(v);
              api.saveSettings({ mask_names: v }).catch(console.error);
            }}
            trackColor={{ false: colors.surface2, true: colors.primary }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Mask Bank Names</Text>
          <Switch
            value={maskBanks}
            onValueChange={(v) => {
              setMaskBanks(v);
              api.saveSettings({ mask_banks: v }).catch(console.error);
            }}
            trackColor={{ false: colors.surface2, true: colors.primary }}
          />
        </View>
        <Text style={[styles.label, { marginTop: spacing.md }]}>Display Alias</Text>
        <TextInput
          style={styles.input}
          value={displayAlias}
          onChangeText={setDisplayAlias}
          placeholder="e.g. My Finances"
          placeholderTextColor={colors.text3}
          onBlur={() => api.saveSettings({ display_alias: displayAlias }).catch(console.error)}
        />
      </View>

      {/* Category Management */}
      <Text style={styles.sectionTitle}>Data Management</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.replace('/more/category-management' as any)}>
          <Ionicons name="pricetags-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>Category Management</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.replace('/transactions/recurring-transactions' as any)}>
          <Ionicons name="repeat-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>Recurring Transactions</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.replace('/transactions/csv-import' as any)}>
          <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
          <Text style={styles.linkText}>Import CSV</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} />
        </TouchableOpacity>
      </View>

      {/* Demo Mode */}
      <Text style={styles.sectionTitle}>Demo Mode</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Demo Mode</Text>
            <Text style={styles.hint}>Load sample data for testing</Text>
          </View>
          <Switch
            value={demoMode}
            onValueChange={async (v) => {
              try {
                await api.toggleDemo();
                setDemoMode(v);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(v ? 'Demo Enabled' : 'Demo Disabled', 'Pull to refresh any screen.');
              } catch (e: any) { Alert.alert('Error', e.message); }
            }}
            trackColor={{ false: colors.surface2, true: colors.lavender }}
          />
        </View>
      </View>

      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.rose }]}
          onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Log Out', style: 'destructive',
                onPress: async () => {
                  await clearToken();
                  router.replace('/login');
                },
              },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.bg} />
          <Text style={styles.btnText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Debug */}
      <Text style={styles.sectionTitle}>Troubleshooting</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          If the app shows £0 everywhere:{'\n\n'}
          1. Make sure Flask is running:{'\n'}
          {'   '}python3 app.py{'\n\n'}
          2. Flask must bind to all interfaces:{'\n'}
          {'   '}app.run(host='0.0.0.0', port=5000){'\n\n'}
          3. Test in phone Safari:{'\n'}
          {'   '}http://YOUR_IP:5000/api/health{'\n\n'}
          4. Mac Firewall may block port 5000
        </Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.rose }]}
          onPress={async () => {
            await clearServerUrl();
            setUrl('');
            setStatus('unknown');
            Alert.alert('Reset', 'Server URL cleared. Re-enter your IP.');
          }}
        >
          <Ionicons name="refresh" size={16} color={colors.bg} />
          <Text style={styles.btnText}>Reset Connection</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.text2,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '600', color: colors.text },

  label: { fontSize: 12, color: colors.text2, marginBottom: spacing.xs, fontWeight: '500' },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border2,
  },
  hint: {
    fontSize: 11, color: colors.text3, marginTop: spacing.sm,
    lineHeight: 16,
  },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, marginTop: spacing.lg,
  },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.bg },

  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.full, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  chipText: { fontSize: 13, color: colors.text3 },

  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  switchLabel: { fontSize: 14, color: colors.text, fontWeight: '500' },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  linkText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
});
