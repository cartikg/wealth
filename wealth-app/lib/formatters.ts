// lib/formatters.ts — Extended formatting utilities

export function formatPercent(n: number | null | undefined, decimals: number = 1): string {
  if (n == null || isNaN(n)) return '—%';
  return n.toFixed(decimals) + '%';
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function formatCurrency(n: number | null | undefined, currency: string = 'GBP', decimals: number = 2): string {
  if (n == null || isNaN(n)) return '—';
  const symbols: Record<string, string> = { GBP: '£', USD: '$', INR: '₹', EUR: '€' };
  const sym = symbols[currency] || currency + ' ';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return sym + (n / 1_000_000).toFixed(2) + 'M';
  return sym + n.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

export function signPrefix(n: number): string {
  return n >= 0 ? '+' : '';
}
