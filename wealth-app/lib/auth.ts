// lib/auth.ts — Secure token management with biometric unlock
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'wealth_jwt_token';
const SERVER_URL_KEY = 'wealth_api_url';
const FALLBACK_URL = 'http://192.168.86.27:5000';

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null;
}

// ── API helpers for auth endpoints ───────────────────────────────────────────
// NOTE: reads server URL directly from AsyncStorage to avoid circular dep with api.ts

async function getBaseUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (saved) return saved;
  } catch {}
  return FALLBACK_URL;
}

async function authRequest(path: string, body?: object): Promise<any> {
  const base = await getBaseUrl();
  const resp = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Auth request failed');
  return data;
}

export async function checkPasswordSet(): Promise<boolean> {
  const data = await authRequest('/api/auth/status');
  return data.password_set;
}

export async function login(password: string): Promise<string> {
  const data = await authRequest('/api/auth/login', { password });
  await setToken(data.token);
  return data.token;
}

export async function setupPassword(password: string): Promise<string> {
  const data = await authRequest('/api/auth/setup', { password });
  await setToken(data.token);
  return data.token;
}
