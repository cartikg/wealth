// lib/api.ts
// Points to your Flask backend. Change this to your server IP when running on a real device.
// On simulator: http://localhost:5000 works fine.
// On real iPhone: use your Mac's local IP e.g. http://192.168.1.100:5000

import AsyncStorage from '@react-native-async-storage/async-storage';

const getBaseUrl = async (): Promise<string> => {
  const saved = await AsyncStorage.getItem('server_url');
  return saved || 'http://localhost:5000';
};

async function apiFetch(path: string, options?: RequestInit) {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  // ── Core data ──────────────────────────────────────────────────────────────
  getData: () => apiFetch('/api/data'),

  // ── Transactions ───────────────────────────────────────────────────────────
  addTransaction: (body: object) =>
    apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),

  updateTransaction: (id: string, body: object) =>
    apiFetch(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteTransaction: (id: string) =>
    apiFetch(`/api/transactions/${id}`, { method: 'DELETE' }),

  // ── Accounts ───────────────────────────────────────────────────────────────
  addAccount: (body: object) =>
    apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),

  deleteAccount: (id: string) =>
    apiFetch(`/api/accounts/${id}`, { method: 'DELETE' }),

  // ── Receipts ───────────────────────────────────────────────────────────────
  getReceipts: () => apiFetch('/api/receipts'),

  scanReceipt: async (imageUri: string, accountId: string, currency: string) => {
    const base = await getBaseUrl();
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'receipt.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    formData.append('image', { uri: imageUri, name: filename, type: mimeType } as any);
    formData.append('account_id', accountId);
    formData.append('currency', currency);

    const res = await fetch(`${base}/api/receipts/scan`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.json();
  },

  addReceiptToTransactions: (receiptId: string) =>
    apiFetch(`/api/receipts/${receiptId}/add-transaction`, { method: 'POST' }),

  deleteReceipt: (receiptId: string) =>
    apiFetch(`/api/receipts/${receiptId}`, { method: 'DELETE' }),

  getReceiptAnalytics: (months = 6, store = '', item = '') => {
    let url = `/api/receipts/analytics?months=${months}`;
    if (store) url += `&store=${encodeURIComponent(store)}`;
    if (item) url += `&item=${encodeURIComponent(item)}`;
    return apiFetch(url);
  },

  // ── TrueLayer ──────────────────────────────────────────────────────────────
  getTrueLayerStatus: () => apiFetch('/api/truelayer/status'),

  getTrueLayerConnectUrl: () => apiFetch('/api/truelayer/connect'),

  syncTrueLayer: () => apiFetch('/api/truelayer/sync', { method: 'POST' }),

  disconnectTrueLayer: (id: string) =>
    apiFetch(`/api/truelayer/disconnect/${id}`, { method: 'DELETE' }),

  // ── Settings ───────────────────────────────────────────────────────────────
  updateSettings: (body: object) =>
    apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(body) }),

  updateInvestments: (body: object) =>
    apiFetch('/api/investments', { method: 'POST', body: JSON.stringify(body) }),

  // ── AI Chat ────────────────────────────────────────────────────────────────
  chat: (message: string) =>
    apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatGBP(amount: number, decimals = 2): string {
  if (amount == null || isNaN(amount)) return '£—';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `£${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  return `£${amount.toFixed(decimals)}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

export const today = () => new Date().toISOString().split('T')[0];
