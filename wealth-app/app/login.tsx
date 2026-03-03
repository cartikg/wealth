// app/login.tsx — Login / password setup screen
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, radius } from '../lib/theme';
import { checkPasswordSet, login, setupPassword, isAuthenticated } from '../lib/auth';

export default function LoginScreen() {
  const [mode, setMode] = useState<'loading' | 'login' | 'setup'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // If already have a valid token, skip login
      const hasToken = await isAuthenticated();
      if (hasToken) {
        router.replace('/(tabs)');
        return;
      }
      try {
        const pwSet = await checkPasswordSet();
        setMode(pwSet ? 'login' : 'setup');
      } catch {
        // Server unreachable — go to tabs so settings screen is accessible
        router.replace('/(tabs)');
      }
    })();
  }, []);

  const submit = async () => {
    setError('');
    if (!password.trim()) { setError('Password is required'); return; }

    if (mode === 'setup') {
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
      if (password !== confirm) { setError('Passwords do not match'); return; }
    }

    setBusy(true);
    try {
      if (mode === 'setup') {
        await setupPassword(password);
      } else {
        await login(password);
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Wealth</Text>
        <Text style={styles.subtitle}>
          {mode === 'setup' ? 'Create a password to protect your data' : 'Enter your password to continue'}
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.text3}
          secureTextEntry
          autoFocus
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={mode === 'setup' ? undefined : submit}
          returnKeyType={mode === 'setup' ? 'next' : 'go'}
        />

        {mode === 'setup' && (
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.text3}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
        )}

        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Text style={styles.btnText}>
              {mode === 'setup' ? 'Create Password' : 'Log In'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 32, width: '100%', maxWidth: 380,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  title: {
    fontSize: 28, fontWeight: '700', color: colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13, color: colors.text3, marginBottom: 24,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 8,
    padding: 10, marginBottom: 12, width: '100%',
  },
  errorText: { color: colors.rose, fontSize: 12, textAlign: 'center' },
  input: {
    width: '100%', backgroundColor: colors.surface2,
    borderRadius: 8, padding: 14, color: colors.text,
    fontSize: 15, borderWidth: 1, borderColor: colors.border2,
    marginBottom: 12,
  },
  btn: {
    width: '100%', backgroundColor: colors.primary,
    borderRadius: 8, padding: 14, alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: colors.bg, fontSize: 14, fontWeight: '700' },
});
