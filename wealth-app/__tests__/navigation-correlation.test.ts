/**
 * Navigation correlation tests.
 *
 * Verifies that navigation routes referenced in screen code actually
 * resolve to real files in the file system, and that cross-screen
 * data contracts are consistent.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname, '..', 'app');
const TABS_DIR = path.join(APP_DIR, '(tabs)');

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ─── Extract route strings from source code ─────────────────

function extractRoutes(source: string): string[] {
  const routes: string[] = [];
  // Match route: './something' or route: '/modals/something'
  const routePattern = /route:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = routePattern.exec(source)) !== null) {
    routes.push(match[1]);
  }
  // Match router.push('/something') and router.replace('/something')
  const pushPattern = /router\.(?:push|replace)\(\s*['"]([^'"]+)['"]/g;
  while ((match = pushPattern.exec(source)) !== null) {
    routes.push(match[1]);
  }
  // Match pathname: '/something'
  const pathnamePattern = /pathname:\s*['"]([^'"]+)['"]/g;
  while ((match = pathnamePattern.exec(source)) !== null) {
    routes.push(match[1]);
  }
  return routes;
}

function routeToFile(route: string, sourceDir: string): string | null {
  // Relative route: ./foo → sourceDir/foo.tsx or sourceDir/foo/index.tsx
  if (route.startsWith('./')) {
    const name = route.slice(2);
    const direct = path.join(sourceDir, `${name}.tsx`);
    const indexed = path.join(sourceDir, name, 'index.tsx');
    if (fs.existsSync(direct)) return direct;
    if (fs.existsSync(indexed)) return indexed;
    return null;
  }
  // Absolute route: /modals/foo → app/modals/foo.tsx
  if (route.startsWith('/modals/')) {
    const name = route.replace('/modals/', '');
    return path.join(APP_DIR, 'modals', `${name}.tsx`);
  }
  // Absolute tab route: /more/foo → app/(tabs)/more/foo.tsx
  if (route.startsWith('/more/')) {
    const name = route.replace('/more/', '');
    return path.join(TABS_DIR, 'more', `${name}.tsx`);
  }
  if (route.startsWith('/transactions/')) {
    const name = route.replace('/transactions/', '');
    return path.join(TABS_DIR, 'transactions', `${name}.tsx`);
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════

describe('More hub → all routes resolve to real files', () => {
  const moreSource = readFile(path.join(TABS_DIR, 'more', 'index.tsx'));
  const routes = extractRoutes(moreSource);
  const moreDir = path.join(TABS_DIR, 'more');

  test('more hub has at least 13 routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(13);
  });

  test.each(routes)('route "%s" resolves to a file', (route) => {
    const file = routeToFile(route, moreDir);
    expect(file).not.toBeNull();
    expect(fileExists(file!)).toBe(true);
  });
});

describe('Transactions header → all routes resolve to real files', () => {
  const txnSource = readFile(path.join(TABS_DIR, 'transactions', 'index.tsx'));
  const routes = extractRoutes(txnSource);
  const txnDir = path.join(TABS_DIR, 'transactions');

  test('transactions has routes for csv-import, recurring, insights, and modals', () => {
    expect(routes).toEqual(expect.arrayContaining([
      './csv-import',
      './recurring-transactions',
      './spending-insights',
    ]));
  });

  test.each(routes)('route "%s" resolves to a file', (route) => {
    const file = routeToFile(route, txnDir);
    expect(file).not.toBeNull();
    expect(fileExists(file!)).toBe(true);
  });
});

describe('Overview quick actions → all routes resolve to real files', () => {
  const overviewSource = readFile(path.join(TABS_DIR, 'index.tsx'));
  const routes = extractRoutes(overviewSource);
  const overviewDir = TABS_DIR;

  test('overview routes are all modal paths', () => {
    const modalRoutes = routes.filter(r => r.startsWith('/modals/'));
    expect(modalRoutes.length).toBeGreaterThanOrEqual(4);
  });

  test.each(routes)('route "%s" resolves to a file', (route) => {
    const file = routeToFile(route, overviewDir);
    expect(file).not.toBeNull();
    expect(fileExists(file!)).toBe(true);
  });
});

describe('Settings modal → all routes resolve to real files', () => {
  const settingsSource = readFile(path.join(APP_DIR, 'modals', 'settings.tsx'));
  const routes = extractRoutes(settingsSource);
  const settingsDir = path.join(APP_DIR, 'modals');

  test('settings has routes to category-management, recurring, csv-import', () => {
    const routeStrings = routes.join(' ');
    expect(routeStrings).toContain('category-management');
    expect(routeStrings).toContain('recurring-transactions');
    expect(routeStrings).toContain('csv-import');
  });

  test.each(routes)('route "%s" resolves to a file', (route) => {
    const file = routeToFile(route, settingsDir);
    expect(file).not.toBeNull();
    expect(fileExists(file!)).toBe(true);
  });
});

// ─── Cross-tab route consistency ────────────────────────────

describe('Cross-tab route consistency', () => {
  test('spending-insights accessible from both more/ and transactions/', () => {
    // Canonical file in more/
    expect(fileExists(path.join(TABS_DIR, 'more', 'spending-insights.tsx'))).toBe(true);
    // Re-export in transactions/
    expect(fileExists(path.join(TABS_DIR, 'transactions', 'spending-insights.tsx'))).toBe(true);

    // The transactions version re-exports the more version
    const txnVersion = readFile(path.join(TABS_DIR, 'transactions', 'spending-insights.tsx'));
    expect(txnVersion).toContain('../more/spending-insights');
  });

  test('recurring-transactions accessible from both more/ and transactions/', () => {
    expect(fileExists(path.join(TABS_DIR, 'more', 'recurring-transactions.tsx'))).toBe(true);
    expect(fileExists(path.join(TABS_DIR, 'transactions', 'recurring-transactions.tsx'))).toBe(true);

    const txnVersion = readFile(path.join(TABS_DIR, 'transactions', 'recurring-transactions.tsx'));
    expect(txnVersion).toContain('../more/recurring-transactions');
  });

  test('more hub and transactions header reference the same screens', () => {
    // Both more/index.tsx and transactions/index.tsx should reference spending-insights and recurring
    const moreSource = readFile(path.join(TABS_DIR, 'more', 'index.tsx'));
    const txnSource = readFile(path.join(TABS_DIR, 'transactions', 'index.tsx'));

    expect(moreSource).toContain('spending-insights');
    expect(moreSource).toContain('recurring-transactions');
    expect(txnSource).toContain('spending-insights');
    expect(txnSource).toContain('recurring-transactions');
  });
});

// ─── API usage correlation ──────────────────────────────────

describe('API usage correlation across screens', () => {
  test('overview and transactions both call api.getData()', () => {
    const overview = readFile(path.join(TABS_DIR, 'index.tsx'));
    const txn = readFile(path.join(TABS_DIR, 'transactions', 'index.tsx'));
    expect(overview).toContain('api.getData()');
    expect(txn).toContain('api.getData()');
  });

  test('transactions screen uses deleteTransaction which api exposes', () => {
    const txn = readFile(path.join(TABS_DIR, 'transactions', 'index.tsx'));
    expect(txn).toContain('api.deleteTransaction');
  });

  test('advisor screen calls api.sendChat', () => {
    const advisor = readFile(path.join(TABS_DIR, 'advisor', 'index.tsx'));
    expect(advisor).toContain('api.sendChat');
  });

  test('advisor parses resp.reply (matching Flask endpoint return key)', () => {
    const advisor = readFile(path.join(TABS_DIR, 'advisor', 'index.tsx'));
    expect(advisor).toContain('resp.reply');
  });
});

// ─── Root layout ↔ Tabs layout correlation ──────────────────

describe('Root ↔ Tabs layout correlation', () => {
  const rootLayout = readFile(path.join(APP_DIR, '_layout.tsx'));
  const tabsLayout = readFile(path.join(TABS_DIR, '_layout.tsx'));

  test('root layout registers (tabs) group which matches folder', () => {
    expect(rootLayout).toContain('name="(tabs)"');
    expect(fileExists(path.join(TABS_DIR, '_layout.tsx'))).toBe(true);
  });

  test('every tab name in tabs layout has a matching folder or file', () => {
    // Only match Tabs.Screen name= attributes (not TabIcon name=)
    const tabNames = [...tabsLayout.matchAll(/Tabs\.Screen[^>]*name="([^"]+)"/g)].map(m => m[1]);
    expect(tabNames.length).toBe(5);
    for (const name of tabNames) {
      const isFolder = fileExists(path.join(TABS_DIR, name, '_layout.tsx'));
      const isFile = fileExists(path.join(TABS_DIR, `${name}.tsx`));
      const isIndexFolder = fileExists(path.join(TABS_DIR, name, 'index.tsx'));
      expect({ name, found: isFolder || isFile || isIndexFolder }).toEqual({ name, found: true });
    }
  });

  test('every modal in root layout has a matching file', () => {
    const modalNames = [...rootLayout.matchAll(/name="modals\/([^"]+)"/g)].map(m => m[1]);
    expect(modalNames.length).toBeGreaterThanOrEqual(10);
    for (const name of modalNames) {
      expect(fileExists(path.join(APP_DIR, 'modals', `${name}.tsx`))).toBe(true);
    }
  });
});

// ─── Theme correlation: screens use correct theme tokens ────

describe('Theme usage consistency', () => {
  const themeFile = readFile(path.resolve(__dirname, '..', 'lib', 'theme.ts'));

  test('theme exports colors object', () => {
    expect(themeFile).toContain('export const colors');
  });

  test('all tab layouts import theme from correct relative path', () => {
    for (const tab of ['transactions', 'investments', 'advisor', 'more']) {
      const layout = readFile(path.join(TABS_DIR, tab, '_layout.tsx'));
      expect(layout).toContain("from '../../../lib/theme'");
      expect(layout).toContain('colors.bg');
    }
  });

  test('tabs _layout.tsx imports theme correctly', () => {
    const tabsLayout = readFile(path.join(TABS_DIR, '_layout.tsx'));
    expect(tabsLayout).toContain("from '../../lib/theme'");
  });
});

// ─── MENU structure correlation ─────────────────────────────

describe('More hub MENU covers all detail screens', () => {
  const moreSource = readFile(path.join(TABS_DIR, 'more', 'index.tsx'));

  const EXPECTED_SCREENS = [
    'net-worth', 'forecast', 'accounts',
    'receipts', 'banks', 'mortgage-debt',
    'retirement', 'tax-strategy', 'estate-legacy',
    'spending-insights', 'recurring-transactions', 'category-management',
  ];

  test.each(EXPECTED_SCREENS)('MENU references %s', (screen) => {
    expect(moreSource).toContain(screen);
  });

  test('settings route points to modal, not a tab screen', () => {
    expect(moreSource).toContain("route: '/modals/settings'");
  });
});
