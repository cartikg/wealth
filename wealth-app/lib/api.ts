// lib/api.ts — API client for Wealth backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getToken, clearToken } from './auth';

// ─── Server URL Configuration ────────────────────────────────────────────────
const DEFAULT_PORT = '5000';
const STORAGE_KEY = 'wealth_api_url';
const PUBLIC_TUNNEL_URL = 'https://celebrate-louise-remarkable-adware.trycloudflare.com';

const FALLBACK_URLS = [
  PUBLIC_TUNNEL_URL,
  'http://192.168.86.27:5000',
  'http://192.168.1.100:5000',
  'http://localhost:5000',
];

let _baseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) { _baseUrl = saved; return _baseUrl; }
  } catch {}
  if (Platform.OS === 'web' || __DEV__ === false) {
    _baseUrl = PUBLIC_TUNNEL_URL;
  } else {
    _baseUrl = FALLBACK_URLS[0];
  }
  return _baseUrl;
}

export async function setServerUrl(url: string): Promise<boolean> {
  let normalised = url.trim();

  // If user provides a bare host, assume http://
  if (!normalised.startsWith('http')) normalised = 'http://' + normalised;

  // Don't force-add :5000 for public tunnel URLs (Cloudflare/ngrok) or https URLs.
  const looksLikePublicTunnel =
    normalised.includes('trycloudflare.com') ||
    normalised.includes('ngrok') ||
    normalised.startsWith('https://');

  if (!looksLikePublicTunnel && !normalised.match(/:\d+$/)) {
    normalised += ':' + DEFAULT_PORT;
  }
  try {
    const resp = await fetch(`${normalised}/api/health`, {
      method: 'GET', headers: { 'Accept': 'application/json' },
    });
    const data = await resp.json();
    if (data.status === 'ok') {
      _baseUrl = normalised;
      await AsyncStorage.setItem(STORAGE_KEY, normalised);
      return true;
    }
  } catch (e) { console.warn('Server test failed:', normalised, e); }
  return false;
}

export async function getServerUrl(): Promise<string> { return getBaseUrl(); }

export async function clearServerUrl(): Promise<void> {
  _baseUrl = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function request(path: string, options?: RequestInit): Promise<any> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const token = await getToken();
  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
    });
    if (resp.status === 401) {
      await clearToken();
      throw new Error('AUTH_REQUIRED');
    }
    const text = await resp.text();
    if (text.startsWith('<') || text.startsWith('<!')) {
      throw new Error(`Server returned HTML instead of JSON for ${path}. Check server URL in Settings.`);
    }
    return JSON.parse(text);
  } catch (e: any) {
    if (e.message === 'AUTH_REQUIRED') throw e;
    if (e.message?.includes('HTML instead of JSON')) throw e;
    console.error(`[API] Request failed: ${url}`, e.message);
    throw new Error(`Cannot connect to server. Check your server URL in Settings. (${e.message})`);
  }
}

async function uploadFile(path: string, uri: string, fields: Record<string, string> = {}): Promise<any> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const token = await getToken();
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'receipt.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  formData.append('image', {
    uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
    name: filename, type,
  } as any);
  for (const [key, value] of Object.entries(fields)) { formData.append(key, value); }
  try {
    const resp = await fetch(url, {
      method: 'POST', body: formData,
      headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    });
    if (resp.status === 401) { await clearToken(); throw new Error('AUTH_REQUIRED'); }
    const text = await resp.text();
    if (text.startsWith('<')) throw new Error('Server returned HTML instead of JSON');
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[API] Upload failed: ${url}`, e.message);
    throw e;
  }
}

async function uploadCsvFile(path: string, uri: string, fields: Record<string, string> = {}): Promise<any> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const token = await getToken();
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'import.csv';
  formData.append('file', { uri, name: filename, type: 'text/csv' } as any);
  for (const [key, value] of Object.entries(fields)) { formData.append(key, value); }
  try {
    const resp = await fetch(url, {
      method: 'POST', body: formData,
      headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    });
    if (resp.status === 401) { await clearToken(); throw new Error('AUTH_REQUIRED'); }
    const text = await resp.text();
    if (text.startsWith('<')) throw new Error('Server returned HTML instead of JSON');
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[API] CSV upload failed: ${url}`, e.message);
    throw e;
  }
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  // ── Core data ──
  getData: () => request('/api/data'),
  health: () => request('/api/health'),

  // ── Transactions ──
  addTransaction: (body: any) => request('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),
  updateTransaction: (id: string, body: any) => request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTransaction: (id: string) => request(`/api/transactions/${id}`, { method: 'DELETE' }),

  // ── Receipts ──
  getReceipts: () => request('/api/receipts'),
  scanReceipt: (uri: string, accountId: string, currency: string) =>
    uploadFile('/api/receipts/scan', uri, { account_id: accountId, currency }),
  deleteReceipt: (id: string) => request(`/api/receipts/${id}`, { method: 'DELETE' }),
  addReceiptToTransactions: (id: string) => request(`/api/receipts/${id}/add-transaction`, { method: 'POST' }),
  getReceiptAnalytics: (months?: number) => request(`/api/receipts/analytics${months ? `?months=${months}` : ''}`),

  // ── Accounts ──
  getAccounts: () => request('/api/accounts'),
  addAccount: (body: any) => request('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  deleteAccount: (id: string) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
  deleteAccountTransactions: (accId: string) => request(`/api/accounts/${accId}/transactions`, { method: 'DELETE' }),

  // ── Categories ──
  addCategory: (body: any) => request('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id: string, body: any) => request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCategory: (id: string) => request(`/api/categories/${id}`, { method: 'DELETE' }),
  mergeCategories: (sourceId: string, targetId: string) => request('/api/categories/merge', { method: 'POST', body: JSON.stringify({ source_id: sourceId, target_id: targetId }) }),

  // ── Investments ──
  addHolding: (type: string, body: any) => request(`/api/investments/${type}`, { method: 'POST', body: JSON.stringify(body) }),
  updateHolding: (type: string, id: string, body: any) => request(`/api/investments/${type}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteHolding: (type: string, id: string) => request(`/api/investments/${type}/${id}`, { method: 'DELETE' }),
  setAllocationTargets: (targets: any) => request('/api/allocation-targets', { method: 'POST', body: JSON.stringify(targets) }),

  // ── Disposals (CGT) ──
  addDisposal: (body: any) => request('/api/disposals', { method: 'POST', body: JSON.stringify(body) }),
  deleteDisposal: (id: string) => request(`/api/disposals/${id}`, { method: 'DELETE' }),

  // ── Mortgages ──
  addMortgage: (body: any) => request('/api/mortgages', { method: 'POST', body: JSON.stringify(body) }),
  updateMortgage: (id: string, body: any) => request(`/api/mortgages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMortgage: (id: string) => request(`/api/mortgages/${id}`, { method: 'DELETE' }),
  getAmortisation: (id: string) => request(`/api/mortgages/${id}/schedule`),

  // ── Debts ──
  addDebt: (body: any) => request('/api/debts', { method: 'POST', body: JSON.stringify(body) }),
  updateDebt: (id: string, body: any) => request(`/api/debts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDebt: (id: string) => request(`/api/debts/${id}`, { method: 'DELETE' }),
  optimiseDebts: (extra_monthly: number) => request('/api/debts/optimise', { method: 'POST', body: JSON.stringify({ extra_monthly }) }),

  // ── Recurring ──
  getRecurring: () => request('/api/recurring'),
  addRecurring: (body: any) => request('/api/recurring', { method: 'POST', body: JSON.stringify(body) }),
  updateRecurring: (id: string, body: any) => request(`/api/recurring/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRecurring: (id: string) => request(`/api/recurring/${id}`, { method: 'DELETE' }),

  // ── Net Worth History ──
  getNetWorthHistory: () => request('/api/networth/history'),
  takeNetWorthSnapshot: () => request('/api/networth/snapshot', { method: 'POST' }),

  // ── Intelligence & Analytics ──
  getWealthIntelligence: () => request('/api/wealth-intelligence'),
  getTaxOptimisation: () => request('/api/tax-optimisation'),
  getEstateProjection: () => request('/api/estate-projection'),
  getSpendingAnalytics: () => request('/api/spending/analytics'),
  getWealthReport: () => request('/api/reports/wealth-summary'),

  // ── Retirement & FIRE ──
  runMonteCarlo: (params: any) => request('/api/monte-carlo', { method: 'POST', body: JSON.stringify(params) }),
  compareScenarios: (scenarios: any[]) => request('/api/scenarios/compare', { method: 'POST', body: JSON.stringify({ scenarios }) }),

  // ── Settings ──
  saveSettings: (body: any) => request('/api/settings', { method: 'POST', body: JSON.stringify(body) }),

  // ── Demo Mode ──
  toggleDemo: () => request('/api/demo/toggle', { method: 'POST' }),

  // ── AI Chat ──
  sendChat: (message: string) => request('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),

  // ── TrueLayer Banking ──
  getTrueLayerStatus: () => request('/api/truelayer/status'),
  getTrueLayerConnectUrl: () => request('/api/truelayer/connect'),
  syncTrueLayer: (connectionId?: string) => request('/api/truelayer/sync', { method: 'POST', body: JSON.stringify({ connection_id: connectionId }) }),
  disconnectTrueLayer: (connectionId: string) => request(`/api/truelayer/disconnect/${connectionId}`, { method: 'DELETE' }),

  // ── Plaid Banking ──
  getPlaidStatus: () => request('/api/plaid/status'),
  createPlaidLinkToken: () => request('/api/plaid/create-link-token', { method: 'POST' }),
  exchangePlaidToken: (publicToken: string, institutionId: string, institutionName: string) =>
    request('/api/plaid/exchange-token', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken, institution_id: institutionId, institution_name: institutionName }),
    }),
  syncPlaid: () => request('/api/plaid/sync', { method: 'POST' }),
  disconnectPlaid: (connectionId: string) => request(`/api/plaid/disconnect/${connectionId}`, { method: 'DELETE' }),

  // ── CSV Import ──
  uploadCsv: (uri: string) => uploadCsvFile('/api/upload-csv', uri),
};

// ─── Streaming Chat ──────────────────────────────────────────────────────────

export async function streamChat(
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const base = await getBaseUrl();
  const token = await getToken();
  try {
    const resp = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, stream: true }),
    });
    const text = await resp.text();
    // If streaming isn't supported, fall back to full response
    try {
      const json = JSON.parse(text);
      if (json.response) onChunk(json.response);
    } catch {
      onChunk(text);
    }
  } catch (e: any) {
    onChunk(`Error: ${e.message}`);
  }
  onDone();
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

export function formatGBP(n: number | null | undefined, decimals: number = 2): string {
  if (n == null || isNaN(n)) return '£—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '£' + (n / 1_000_000).toFixed(2) + 'M';
  return '£' + n.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}