/**
 * Characterisation tests for the tab-based navigation architecture.
 *
 * These tests verify that:
 * 1. Every tab folder has a _layout.tsx (Stack navigator) and index.tsx
 * 2. Detail screens live inside tab folders (not at app/screens/)
 * 3. No navigation code references the old /screens/ path
 * 4. Import paths are correct for the folder depth
 * 5. Cross-tab re-exports exist for shared screens
 * 6. Root layout does not register a "screens" route
 * 7. Tabs layout references folder-based tab names
 * 8. Modal paths remain at root level
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname, '..', 'app');
const TABS_DIR = path.join(APP_DIR, '(tabs)');

// ─── Helpers ────────────────────────────────────────────────

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function getAllTsxFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Tab folder structure ───────────────────────────────────

const TAB_FOLDERS = ['transactions', 'investments', 'advisor', 'more'];

describe('Tab folder structure', () => {
  test.each(TAB_FOLDERS)('%s/ has a _layout.tsx', (tab) => {
    expect(fileExists(path.join(TABS_DIR, tab, '_layout.tsx'))).toBe(true);
  });

  test.each(TAB_FOLDERS)('%s/ has an index.tsx', (tab) => {
    expect(fileExists(path.join(TABS_DIR, tab, 'index.tsx'))).toBe(true);
  });

  test('overview tab exists as (tabs)/index.tsx (single file, no folder)', () => {
    expect(fileExists(path.join(TABS_DIR, 'index.tsx'))).toBe(true);
  });

  test.each(TAB_FOLDERS)('%s/_layout.tsx exports a Stack navigator', (tab) => {
    const content = readFile(path.join(TABS_DIR, tab, '_layout.tsx'));
    expect(content).toContain("import { Stack } from 'expo-router'");
    expect(content).toContain('<Stack');
  });
});

// ─── Detail screens placement ───────────────────────────────

const MORE_SCREENS = [
  'net-worth', 'forecast', 'accounts', 'receipts', 'banks',
  'mortgage-debt', 'retirement', 'tax-strategy', 'estate-legacy',
  'category-management', 'spending-insights', 'recurring-transactions',
];

const TXN_SCREENS = ['csv-import'];

describe('Detail screens live inside tab folders', () => {
  test.each(MORE_SCREENS)('%s.tsx exists in more/', (screen) => {
    expect(fileExists(path.join(TABS_DIR, 'more', `${screen}.tsx`))).toBe(true);
  });

  test.each(TXN_SCREENS)('%s.tsx exists in transactions/', (screen) => {
    expect(fileExists(path.join(TABS_DIR, 'transactions', `${screen}.tsx`))).toBe(true);
  });

  test('old app/screens/ directory does not exist', () => {
    expect(fileExists(path.join(APP_DIR, 'screens'))).toBe(false);
  });
});

// ─── Cross-tab re-exports ───────────────────────────────────

describe('Cross-tab re-exports', () => {
  test('transactions/spending-insights.tsx re-exports from more/', () => {
    const content = readFile(path.join(TABS_DIR, 'transactions', 'spending-insights.tsx'));
    expect(content).toContain("from '../more/spending-insights'");
  });

  test('transactions/recurring-transactions.tsx re-exports from more/', () => {
    const content = readFile(path.join(TABS_DIR, 'transactions', 'recurring-transactions.tsx'));
    expect(content).toContain("from '../more/recurring-transactions'");
  });
});

// ─── No stale /screens/ navigation references ───────────────

describe('No stale /screens/ navigation references', () => {
  const allFiles = getAllTsxFiles(APP_DIR);

  test('no file uses router.push/replace with /screens/ path', () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      const content = readFile(file);
      // Match route strings like '/screens/...' but ignore comments (lines starting with //)
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (/['"`]\/screens\//.test(line)) {
          offenders.push(path.relative(APP_DIR, file));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('more/index.tsx uses relative routes (./X) not /screens/X', () => {
    const content = readFile(path.join(TABS_DIR, 'more', 'index.tsx'));
    // Should have relative routes
    expect(content).toContain("route: './net-worth'");
    expect(content).toContain("route: './forecast'");
    expect(content).toContain("route: './accounts'");
    // Should NOT have /screens/ routes
    expect(content).not.toContain("'/screens/");
  });

  test('transactions/index.tsx uses relative routes for detail screens', () => {
    const content = readFile(path.join(TABS_DIR, 'transactions', 'index.tsx'));
    expect(content).toContain("route: './csv-import'");
    expect(content).toContain("route: './recurring-transactions'");
    expect(content).toContain("route: './spending-insights'");
    expect(content).not.toContain("'/screens/");
  });

  test('settings modal uses /more/ and /transactions/ paths', () => {
    const content = readFile(path.join(APP_DIR, 'modals', 'settings.tsx'));
    expect(content).toContain('/more/category-management');
    expect(content).toContain('/transactions/recurring-transactions');
    expect(content).toContain('/transactions/csv-import');
    expect(content).not.toContain("'/screens/");
  });
});

// ─── Import paths are correct for folder depth ─────────────

describe('Import paths match folder depth', () => {
  test.each(TAB_FOLDERS)('%s/index.tsx imports from ../../../lib/', (tab) => {
    const content = readFile(path.join(TABS_DIR, tab, 'index.tsx'));
    // Files at app/(tabs)/<tab>/index.tsx need ../../../lib/
    const libImports = content.match(/from\s+['"]([^'"]+\/lib\/[^'"]+)['"]/g) || [];
    for (const imp of libImports) {
      expect(imp).toContain('../../../lib/');
    }
  });

  test.each(MORE_SCREENS)('more/%s.tsx imports from ../../../lib/', (screen) => {
    const content = readFile(path.join(TABS_DIR, 'more', `${screen}.tsx`));
    const libImports = content.match(/from\s+['"]([^'"]+\/lib\/[^'"]+)['"]/g) || [];
    for (const imp of libImports) {
      expect(imp).toContain('../../../lib/');
    }
  });

  test('(tabs)/index.tsx (overview) imports from ../../lib/', () => {
    const content = readFile(path.join(TABS_DIR, 'index.tsx'));
    const libImports = content.match(/from\s+['"]([^'"]+\/lib\/[^'"]+)['"]/g) || [];
    for (const imp of libImports) {
      expect(imp).toContain('../../lib/');
    }
  });

  test.each(MORE_SCREENS)('more/%s.tsx imports components from ../../../components/', (screen) => {
    const content = readFile(path.join(TABS_DIR, 'more', `${screen}.tsx`));
    const compImports = content.match(/from\s+['"]([^'"]+\/components\/[^'"]+)['"]/g) || [];
    for (const imp of compImports) {
      expect(imp).toContain('../../../components/');
    }
  });
});

// ─── Root layout configuration ──────────────────────────────

describe('Root layout (app/_layout.tsx)', () => {
  const content = readFile(path.join(APP_DIR, '_layout.tsx'));

  test('registers (tabs) route', () => {
    expect(content).toContain('name="(tabs)"');
  });

  test('does NOT register a screens route', () => {
    expect(content).not.toContain('name="screens"');
  });

  test('registers modal routes', () => {
    expect(content).toContain('name="modals/add-transaction"');
    expect(content).toContain('name="modals/settings"');
    expect(content).toContain('name="modals/edit-transaction"');
  });
});

// ─── Tabs layout configuration ──────────────────────────────

describe('Tabs layout (app/(tabs)/_layout.tsx)', () => {
  const content = readFile(path.join(TABS_DIR, '_layout.tsx'));

  test('registers index tab (overview)', () => {
    expect(content).toContain('name="index"');
  });

  test.each(['transactions', 'investments', 'advisor', 'more'])(
    'registers %s tab',
    (tab) => {
      expect(content).toContain(`name="${tab}"`);
    }
  );

  test('does not reference old single-file tab names', () => {
    // These were the old single-file names that should now be folders
    expect(content).not.toContain('name="overview"');
  });
});

// ─── Modal paths remain accessible ─────────────────────────

describe('Modal paths remain at root level', () => {
  const MODALS = [
    'add-transaction', 'edit-transaction', 'scan-receipt', 'receipt-detail',
    'connect-bank', 'settings', 'add-account', 'add-mortgage', 'add-debt',
    'add-holding', 'add-disposal', 'add-recurring', 'retirement-settings',
    'report-viewer', 'scenario-compare',
  ];

  test.each(MODALS)('modals/%s.tsx exists', (modal) => {
    expect(fileExists(path.join(APP_DIR, 'modals', `${modal}.tsx`))).toBe(true);
  });

  test('overview still navigates to /modals/ paths', () => {
    const content = readFile(path.join(TABS_DIR, 'index.tsx'));
    expect(content).toContain('/modals/');
  });
});
