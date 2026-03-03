/**
 * Functional tests for API helper functions.
 * Tests formatGBP, formatDate, today, and data transformation logic.
 */

// Inline the functions to test them without RN module mocking
function formatGBP(n: number | null | undefined, decimals: number = 2): string {
  if (n == null || isNaN(n)) return '£—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '£' + (n / 1_000_000).toFixed(2) + 'M';
  return '£' + n.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Transaction groupByMonth (copied from transactions screen) ──────────

function groupByMonth(txns: any[]): { title: string; data: any[] }[] {
  const groups: Record<string, any[]> = {};
  txns.forEach(t => {
    const month = t.date?.slice(0, 7) || 'Unknown';
    const label = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([title, data]) => ({ title, data }));
}

// ─── Transaction filtering logic (from transactions screen) ──────────────

function filterTransactions(
  transactions: any[],
  { search, timeFilter, typeFilter }: { search: string; timeFilter: string; typeFilter: string }
): any[] {
  const now = new Date();
  const cutoffs: Record<string, Date> = {
    '7d': new Date(now.getTime() - 7 * 864e5),
    '30d': new Date(now.getTime() - 30 * 864e5),
    '3m': new Date(now.getTime() - 90 * 864e5),
    '6m': new Date(now.getTime() - 180 * 864e5),
  };
  const todayStr = now.toISOString().split('T')[0];

  let result = [...transactions];

  if (timeFilter !== 'All' && cutoffs[timeFilter]) {
    const cutoff = cutoffs[timeFilter].toISOString().split('T')[0];
    result = result.filter(t => t.date >= cutoff);
  }
  if (typeFilter === 'In') result = result.filter(t => t.type === 'credit');
  if (typeFilter === 'Out') result = result.filter(t => t.type === 'debit');
  if (typeFilter === 'Scheduled') result = result.filter(t => t.date > todayStr);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(t =>
      (t.description || '').toLowerCase().includes(s) ||
      (t.category || '').toLowerCase().includes(s) ||
      (t.bank || '').toLowerCase().includes(s)
    );
  }

  result.sort((a: any, b: any) => b.date.localeCompare(a.date));
  return result;
}

function calcTotals(filtered: any[]) {
  const inc = filtered.filter(t => t.type === 'credit').reduce((s: number, t: any) => s + (t.amount_gbp || t.amount || 0), 0);
  const out = filtered.filter(t => t.type === 'debit').reduce((s: number, t: any) => s + (t.amount_gbp || t.amount || 0), 0);
  return { in: inc, out, count: filtered.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('formatGBP', () => {
  test('formats standard amounts with 2 decimals', () => {
    expect(formatGBP(1234.56)).toContain('1,234.56');
    expect(formatGBP(1234.56)).toMatch(/^£/);
  });

  test('formats millions with M suffix', () => {
    expect(formatGBP(2_500_000)).toBe('£2.50M');
    expect(formatGBP(1_000_000)).toBe('£1.00M');
  });

  test('handles zero', () => {
    expect(formatGBP(0)).toContain('0.00');
  });

  test('handles null/undefined/NaN', () => {
    expect(formatGBP(null)).toBe('£—');
    expect(formatGBP(undefined)).toBe('£—');
    expect(formatGBP(NaN)).toBe('£—');
  });

  test('respects custom decimal places', () => {
    expect(formatGBP(1234.5, 0)).not.toContain('.');
    expect(formatGBP(1234.5, 1)).toContain('.5');
  });

  test('handles negative amounts', () => {
    const result = formatGBP(-500);
    expect(result).toContain('500');
  });

  test('negative millions still use M suffix', () => {
    expect(formatGBP(-2_000_000)).toBe('£-2.00M');
  });
});

describe('formatDate', () => {
  test('formats ISO date string to en-GB format', () => {
    const result = formatDate('2025-06-15');
    expect(result).toContain('Jun');
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  test('handles null/undefined/empty string', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  test('different months format correctly', () => {
    expect(formatDate('2025-01-01')).toContain('Jan');
    expect(formatDate('2025-12-25')).toContain('Dec');
  });
});

describe('today', () => {
  test('returns ISO date string in YYYY-MM-DD format', () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('matches current date', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(today()).toBe(expected);
  });
});

// ─── Transaction data transformations ───────────────────────

const SAMPLE_TXNS = [
  { id: '1', description: 'Tesco', amount: 45.50, type: 'debit', category: 'Food & Dining', date: '2025-03-01', bank: 'HSBC' },
  { id: '2', description: 'Salary', amount: 3500, type: 'credit', category: 'Salary', date: '2025-03-01', bank: 'HSBC' },
  { id: '3', description: 'Netflix', amount: 15.99, type: 'debit', category: 'Entertainment', date: '2025-02-15', bank: 'Monzo' },
  { id: '4', description: 'Amazon', amount: 29.99, type: 'debit', category: 'Shopping', date: '2025-02-10', bank: 'Monzo' },
  { id: '5', description: 'Freelance', amount: 500, type: 'credit', category: 'Salary', date: '2025-01-20', bank: 'Starling' },
  { id: '6', description: 'Future rent', amount: 1200, type: 'debit', category: 'Rent/Mortgage', date: '2099-01-01' },
];

describe('groupByMonth', () => {
  test('groups transactions by month', () => {
    const groups = groupByMonth(SAMPLE_TXNS.slice(0, 4));
    expect(groups.length).toBe(2); // March + February
  });

  test('transactions in same month are grouped together', () => {
    const groups = groupByMonth(SAMPLE_TXNS.slice(0, 4));
    const marchGroup = groups.find(g => g.title.includes('March'));
    expect(marchGroup?.data.length).toBe(2);
  });

  test('returns empty array for no transactions', () => {
    expect(groupByMonth([])).toEqual([]);
  });

  test('groups are sorted descending by month', () => {
    const groups = groupByMonth(SAMPLE_TXNS.slice(0, 5));
    const titles = groups.map(g => g.title);
    // March should come before February which comes before January
    expect(titles[0]).toContain('March');
  });
});

describe('Transaction filtering', () => {
  test('type filter: In shows only credits', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'In' });
    expect(result.every(t => t.type === 'credit')).toBe(true);
    expect(result.length).toBe(2);
  });

  test('type filter: Out shows only debits', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'Out' });
    expect(result.every(t => t.type === 'debit')).toBe(true);
  });

  test('type filter: Scheduled shows only future transactions', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'Scheduled' });
    expect(result.length).toBe(1);
    expect(result[0].description).toBe('Future rent');
  });

  test('search filters by description (case-insensitive)', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: 'tesco', timeFilter: 'All', typeFilter: 'All' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  test('search filters by category', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: 'entertainment', timeFilter: 'All', typeFilter: 'All' });
    expect(result.length).toBe(1);
    expect(result[0].description).toBe('Netflix');
  });

  test('search filters by bank', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: 'monzo', timeFilter: 'All', typeFilter: 'All' });
    expect(result.length).toBe(2);
  });

  test('results are sorted by date descending', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'All' });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].date >= result[i].date).toBe(true);
    }
  });

  test('All/All returns all transactions sorted', () => {
    const result = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'All' });
    expect(result.length).toBe(SAMPLE_TXNS.length);
  });
});

describe('calcTotals', () => {
  test('correctly sums credits and debits', () => {
    const totals = calcTotals(SAMPLE_TXNS);
    expect(totals.in).toBe(3500 + 500); // Salary + Freelance
    expect(totals.out).toBe(45.50 + 15.99 + 29.99 + 1200); // Tesco + Netflix + Amazon + Future rent
    expect(totals.count).toBe(6);
  });

  test('empty array gives zero totals', () => {
    const totals = calcTotals([]);
    expect(totals.in).toBe(0);
    expect(totals.out).toBe(0);
    expect(totals.count).toBe(0);
  });

  test('credits-only gives zero out', () => {
    const credits = SAMPLE_TXNS.filter(t => t.type === 'credit');
    const totals = calcTotals(credits);
    expect(totals.out).toBe(0);
    expect(totals.in).toBe(4000);
  });

  test('uses amount_gbp when available, fallback to amount', () => {
    const txns = [
      { type: 'credit', amount: 100, amount_gbp: 80 },
      { type: 'debit', amount: 50 },
    ];
    const totals = calcTotals(txns);
    expect(totals.in).toBe(80);  // Used amount_gbp
    expect(totals.out).toBe(50); // Fell back to amount
  });
});

// ─── Filter + Totals correlation ────────────────────────────

describe('Filter-to-totals correlation', () => {
  test('filtered totals match sum of filtered items', () => {
    const filtered = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'Out' });
    const totals = calcTotals(filtered);
    expect(totals.count).toBe(filtered.length);
    expect(totals.in).toBe(0); // No credits in "Out" filter
    expect(totals.out).toBe(filtered.reduce((s, t) => s + t.amount, 0));
  });

  test('groupByMonth total items equals filtered count', () => {
    const filtered = filterTransactions(SAMPLE_TXNS, { search: '', timeFilter: 'All', typeFilter: 'All' });
    const groups = groupByMonth(filtered);
    const totalInGroups = groups.reduce((s, g) => s + g.data.length, 0);
    expect(totalInGroups).toBe(filtered.length);
  });
});
