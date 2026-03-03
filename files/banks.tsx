// app/(tabs)/banks.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../lib/theme';
import { api, formatGBP } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const BANK_EMOJIS: Record<string, string> = {
  monzo: '🟣', revolut: '🔵', barclays: '🔵', hsbc: '🔴',
  natwest: '🟢', rbs: '🟢', lloyds: '🟠', santander: '🔴',
  starling: '🟢', halifax: '🔵', nationwide: '🔵',
};

function bankEmoji(name: string) {
  const k = (name || '').toLowerCase();
  for (const [key, em] of Object.entries(BANK_EMOJIS)) {
    if (k.includes(key)) return em;
  }
  return '🏦';
}

function BankCard({ connection, onSync, onDisconnect }: {
  connection: any;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const em = bankEmoji(connection.bank_name);
  const lastSync = connection.last_synced
    ? new Date(connection.last_synced).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  return (
    <View style={styles.bankCard}>
      <View style={styles.bankHeader}>
        <View style={styles.bankIconWrap}>
          <Text style={{ fontSize: 26 }}>{em}</Text>
        </View>
        <View style={styles.bankInfo}>
          <Text style={styles.bankName}>{connection.bank_name}</Text>
          <View style={styles.connectedBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
          <Ionicons name="close" size={18} color={colors.text3} />
        </TouchableOpacity>
      </View>

      {/* Accounts */}
      {(connection.accounts || []).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.accountsScroll} contentContainerStyle={{ gap: spacing.sm }}>
          {connection.accounts.map((a: any) => (
            <View key={a.account_id} style={styles.accountChip}>
              <Text style={styles.accountType}>{a.account_type}</Text>
              <Text style={styles.accountName}>{a.display_name}</Text>
              <Text style={styles.accountCurrency}>{a.currency}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.bankFooter}>
        <Text style={styles.lastSync}>Last sync: {lastSync}</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={onSync}>
          <Ionicons name="refresh" size={14} color={colors.teal} />
          <Text style={styles.syncBtnText}>Sync</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SyncResultBanner({ result }: { result: any }) {
  if (!result) return null;
  return (
    <View style={[styles.syncBanner, result.ok ? styles.syncBannerOk : styles.syncBannerErr]}>
      <Text style={styles.syncBannerTitle}>
        {result.ok ? `✓ Synced: ${result.imported} new transactions` : `✕ ${result.error}`}
      </Text>
      {result.ok && result.skipped > 0 && (
        <Text style={styles.syncBannerSub}>{result.skipped} already imported · {result.accounts?.length || 0} accounts updated</Text>
      )}
      {result.errors?.length > 0 && (
        <Text style={styles.syncBannerSub}>{result.errors.join('\n')}</Text>
      )}
    </View>
  );
}

export default function BanksScreen() {
  const [status, setStatus] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.getTrueLayerStatus();
      setStatus(s);
    } catch (e) { console.error(e); }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStatus();
    setRefreshing(false);
  }, [loadStatus]);

  useEffect(() => { loadStatus(); }, []);

  const handleConnect = async () => {
    if (!status?.configured) {
      router.push('/modals/connect-bank');
      return;
    }
    try {
      const d = await api.getTrueLayerConnectUrl();
      if (d.error) { Alert.alert('Error', d.error); return; }

      // Open TrueLayer auth in browser
      const result = await WebBrowser.openAuthSessionAsync(d.auth_url, 'wealth://truelayer-callback');

      if (result.type === 'success' && result.url) {
        // The Flask backend handles the callback — just refresh status
        await loadStatus();
        setSyncResult({ ok: true, imported: 0, skipped: 0, message: 'Bank connected! Tap Sync to import transactions.' });
      }
    } catch (e: any) {
      Alert.alert('Connection failed', e.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncTrueLayer();
      setSyncResult(result);
      await loadStatus();
      if (result.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setSyncResult({ ok: false, error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = (id: string, bankName: string) => {
    Alert.alert(`Disconnect ${bankName}?`, 'Imported transactions will remain.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          await api.disconnectTrueLayer(id);
          await loadStatus();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    ]);
  };

  const configured = status?.configured;
  const connections = status?.connections || [];
  const env = status?.env || 'sandbox';
  const isSandbox = env === 'sandbox';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.screenTitle}>Connected Banks</Text>
          {configured && (
            <View style={[styles.envBadge, { backgroundColor: isSandbox ? colors.goldDim : colors.tealDim,
              borderColor: isSandbox ? 'rgba(212,168,67,0.3)' : 'rgba(62,207,178,0.3)' }]}>
              <Text style={[styles.envText, { color: isSandbox ? colors.gold : colors.teal }]}>
                {isSandbox ? '🟡 Sandbox' : '🟢 Live'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerBtns}>
          {connections.length > 0 && (
            <TouchableOpacity
              style={[styles.syncAllBtn, syncing && { opacity: 0.5 }]}
              onPress={handleSync}
              disabled={syncing}
            >
              <Ionicons name="refresh" size={14} color={colors.teal} />
              <Text style={styles.syncAllText}>{syncing ? 'Syncing...' : 'Sync All'}</Text>
            </TouchableOpacity>
          )}
          {configured && (
            <TouchableOpacity style={styles.addBankBtn} onPress={handleConnect}>
              <Ionicons name="add" size={16} color={colors.bg} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sync result */}
      <SyncResultBanner result={syncResult} />

      {/* Not configured warning */}
      {!configured && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>⚠️ TrueLayer not configured</Text>
          <Text style={styles.warningText}>
            Set up a free TrueLayer developer account to connect Monzo, Revolut, Barclays and 40+ UK banks.
          </Text>
          <View style={styles.setupSteps}>
            {[
              '1. Go to console.truelayer.com → sign up free',
              '2. Create an app → copy client_id + secret',
              '3. Add redirect URI: http://localhost:5000/api/truelayer/callback',
              '4. Set env vars and restart Flask:',
            ].map((s, i) => (
              <Text key={i} style={styles.setupStep}>{s}</Text>
            ))}
            <Text style={styles.setupCode}>
              {'export TRUELAYER_CLIENT_ID=...\nexport TRUELAYER_CLIENT_SECRET=...\nexport TRUELAYER_ENV=sandbox\npython app.py'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.docsBtn}
            onPress={() => Linking.openURL('https://console.truelayer.com')}
          >
            <Text style={styles.docsBtnText}>Open TrueLayer Console →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Connected banks */}
      {connections.map((c: any) => (
        <BankCard
          key={c.id}
          connection={c}
          onSync={handleSync}
          onDisconnect={() => handleDisconnect(c.id, c.bank_name)}
        />
      ))}

      {/* Empty state */}
      {configured && connections.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🏦</Text>
          <Text style={styles.emptyTitle}>No banks connected</Text>
          <Text style={styles.emptySubtitle}>Link your UK bank accounts to automatically import transactions</Text>

          <View style={styles.bankList}>
            {['🟣 Monzo', '🔵 Revolut', '🔴 Barclays', '🔴 HSBC', '🟢 NatWest', '🟠 Lloyds', '🟢 Starling', '🔵 Santander'].map(b => (
              <View key={b} style={styles.bankPill}>
                <Text style={styles.bankPillText}>{b}</Text>
              </View>
            ))}
          </View>

          <View style={styles.trustRow}>
            {[{ icon: '🔒', label: 'Read-only' }, { icon: '🏛️', label: 'FCA regulated' }, { icon: '💸', label: 'Free' }].map(({ icon, label }) => (
              <View key={label} style={styles.trustItem}>
                <Text style={{ fontSize: 20 }}>{icon}</Text>
                <Text style={styles.trustLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <Ionicons name="add-circle" size={20} color={colors.bg} />
            <Text style={styles.connectBtnText}>Connect a Bank</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* What's not supported */}
      <View style={styles.notSupportedCard}>
        <Text style={styles.notSupportedTitle}>Manual CSV import required for:</Text>
        {[
          { name: 'American Express', reason: 'Not in UK Open Banking' },
          { name: 'Trading 212', reason: 'Investment platform, not a bank' },
          { name: 'HDFC / SBI / ICICI', reason: 'India — AA framework limited' },
        ].map(({ name, reason }) => (
          <View key={name} style={styles.notSupportedRow}>
            <Ionicons name="close-circle" size={14} color={colors.rose} />
            <Text style={styles.notSupportedName}>{name}</Text>
            <Text style={styles.notSupportedReason}>{reason}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.md },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  screenTitle: { fontFamily: 'Georgia', fontSize: 22, color: colors.text },
  envBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  envText: { fontSize: 11, fontWeight: '600' },
  headerBtns: { flexDirection: 'row', gap: spacing.sm },
  syncAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.tealDim, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(62,207,178,0.3)',
  },
  syncAllText: { fontSize: 12, color: colors.teal, fontWeight: '600' },
  addBankBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },

  syncBanner: { borderRadius: radius.md, padding: spacing.md },
  syncBannerOk: { backgroundColor: colors.tealDim, borderWidth: 1, borderColor: 'rgba(62,207,178,0.25)' },
  syncBannerErr: { backgroundColor: colors.roseDim, borderWidth: 1, borderColor: 'rgba(232,99,122,0.25)' },
  syncBannerTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  syncBannerSub: { fontSize: 12, color: colors.text3, marginTop: 4 },

  warningCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(212,168,67,0.3)',
  },
  warningTitle: { fontSize: 16, fontWeight: '700', color: colors.gold, marginBottom: spacing.sm },
  warningText: { fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: spacing.md },
  setupSteps: { gap: spacing.xs },
  setupStep: { fontSize: 12, color: colors.text2, lineHeight: 18 },
  setupCode: {
    fontFamily: 'Courier New', fontSize: 11, color: colors.teal,
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    padding: spacing.md, marginTop: spacing.sm, lineHeight: 18,
  },
  docsBtn: { marginTop: spacing.md, alignSelf: 'flex-start' },
  docsBtnText: { fontSize: 13, color: colors.gold, fontWeight: '600' },

  bankCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(62,207,178,0.2)',
  },
  bankHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  bankIconWrap: {
    width: 50, height: 50, borderRadius: radius.md,
    backgroundColor: colors.tealDim, alignItems: 'center', justifyContent: 'center',
  },
  bankInfo: { flex: 1 },
  bankName: { fontSize: 16, fontWeight: '600', color: colors.text },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal },
  connectedText: { fontSize: 12, color: colors.teal },
  disconnectBtn: { padding: spacing.sm },

  accountsScroll: { marginBottom: spacing.md },
  accountChip: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border, minWidth: 100,
  },
  accountType: { fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  accountName: { fontSize: 12, color: colors.text, fontWeight: '500', marginTop: 2 },
  accountCurrency: { fontSize: 10, color: colors.text3, marginTop: 1 },

  bankFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  lastSync: { fontSize: 11, color: colors.text3 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncBtnText: { fontSize: 12, color: colors.teal, fontWeight: '600' },

  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.xxl, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { fontFamily: 'Georgia', fontSize: 22, color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { fontSize: 13, color: colors.text3, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  bankList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.lg },
  bankPill: {
    backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  bankPillText: { fontSize: 12, color: colors.text2 },
  trustRow: { flexDirection: 'row', gap: spacing.xl, marginBottom: spacing.xl },
  trustItem: { alignItems: 'center', gap: spacing.xs },
  trustLabel: { fontSize: 11, color: colors.text3 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.gold, borderRadius: radius.full,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
  },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: colors.bg },

  notSupportedCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  notSupportedTitle: { fontSize: 12, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md },
  notSupportedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  notSupportedName: { fontSize: 13, color: colors.text2, fontWeight: '500', flex: 1 },
  notSupportedReason: { fontSize: 11, color: colors.text3, flex: 1, textAlign: 'right' },
});
