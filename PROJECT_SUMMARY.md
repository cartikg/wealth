# Wealth Intelligence Platform — Complete Project Summary

**Date:** 1 March 2026
**Sessions:** 13 (across 27 Feb – 1 Mar 2026)
**Codebase:** 12,090 lines (4,365 backend + 7,485 frontend + 240 tax profiles)

---

## What This Is

A full-stack personal finance and wealth intelligence platform built for a UK-based user. It's a single-page web app (Flask + vanilla HTML/JS/CSS) that does everything from transaction tracking to retirement modelling, tax optimisation, and estate planning. There is also an Expo React Native mobile app (iOS) that connects to the same Flask backend.

---

## Architecture

### Web App (Primary)
- **Backend:** `app.py` — Flask, single Python file, 4,365 lines
- **Frontend:** `index.html` — single HTML file with embedded CSS + JS, 7,485 lines
- **Tax engine:** `tax_profiles.py` — UK/US/IN tax bands, CGT rates, allowances (240 lines)
- **Data storage:** `data.json` — flat JSON file (no database)
- **Receipt storage:** `receipts.json` — separate file for scanned receipt data
- **External APIs:** CoinGecko (crypto prices), yFinance (stock prices), Frankfurter (FX rates), Anthropic Claude (AI advisor + receipt OCR), TrueLayer/Plaid (Open Banking)

### Mobile App (Secondary)
- **Framework:** Expo / React Native (TypeScript)
- **Structure:** File-based routing with `expo-router`
- **Key files:**
  - `app/(tabs)/index.tsx` — Overview screen
  - `app/(tabs)/transactions.tsx` — Transaction list with filters
  - `app/(tabs)/receipts.tsx` — Receipt scanning via camera
  - `app/(tabs)/investments.tsx` — Portfolio view
  - `app/(tabs)/banks.tsx` — TrueLayer bank connections
  - `app/modals/settings.tsx` — Server URL config + financial settings
  - `lib/api.ts` — API client with auto-discovery, HTML guard, AsyncStorage persistence
  - `lib/theme.ts` — Colour system and design tokens

### How They Connect
- Flask runs on `0.0.0.0:5000`
- Web app is served from Flask at `/` (renders `index.html`)
- Mobile app connects via HTTP to `http://<mac-ip>:5000/api/*`
- CORS is enabled globally via `flask-cors`
- Mobile app stores server URL in AsyncStorage; configurable via Settings modal

---

## Design System

Redesigned from gold/dark to a modern fintech palette:
- **Primary:** Electric Blue `#3B82F6`
- **Background:** `#080810` (near-black)
- **Surfaces:** `#0E0E1A`, `#14142A`, `#1A1A36` (layered dark)
- **Accent Gold:** `#D4A843` (used sparingly for hero values)
- **Positive:** `#22C55E` (teal/green)
- **Negative:** `#EF4444` (rose/red)
- **Secondary:** `#8B5CF6` (lavender), `#22D3EE` (cyan)
- **Text:** `#E8E8F0` primary, `#9CA3AF` secondary, `#6B7280` muted

---

## Complete Feature List

### Phase 1 — Foundations (Sessions 1-3)

**1A. Demo Mode**
- Toggle in Settings generates realistic fake UK data (£82k salary, diversified portfolio, mortgage, 200+ transactions, 2 family members)
- Yellow "DEMO MODE" banner when active
- Backs up real data, restores on toggle off
- AI advisor aware it's demo mode

**1B. Category Management**
- Custom categories with icons, types (expense/income), monthly budgets
- Add, edit, archive, reorder categories
- Auto-migration from hardcoded category list
- Budget tracking with alert thresholds

**1C. Identity Privacy Controls**
- Privacy blur mode (toggle hides all monetary values)
- Mask family names → "Member 1", "Member 2"
- Mask bank names → "Bank A", "Bank B"
- Mask account names → "Account 1", etc.
- Custom alias display name
- Applied globally across all tabs

**1D. Emma CSV Import**
- Upload CSV from Emma finance app
- Auto-maps Emma categories to internal categories
- Handles multi-currency (GBP, INR, USD)
- Trading 212 filtering (active-only holdings)

**1E. Family Tax Profiles**
- Multi-member family with individual tax settings
- Per-member tax residency (UK, US, India)
- Per-member tax rate preference (basic, higher, additional)
- Family-aware AI advisor context

### Phase 2 — Investment Engine (Sessions 3-6)

**2A. 6-Bucket Investment Tracking**
- ISA (tax-free), Pension, RSU/Company Stock, Non-ISA Stocks, Crypto, Custom
- Per-investment contribution tracking (monthly SIP amounts)
- Live price fetching (yFinance for stocks, CoinGecko for crypto)
- Multi-currency with auto GBP conversion

**2B. Behavioural Wealth Insights**
- Wealth Velocity: monthly net worth growth in £ and %, calculated from snapshot history
- Subscription Drift Alerts: warning at >10% of income, stronger at >20%
- Fixed vs Variable spending ratio with contextual advice

**2C. Asset Allocation Intelligence**
- Target allocation setting per asset class (equity, bond, property, cash, crypto, mixed, alternative)
- Drift detection: alerts when actual vs target differs by >5%
- Rebalancing suggestions: "Reduce equity by ~£12,000 (8.3% overweight)"
- Concentration risk warnings: flags any single holding >15% of portfolio
- Top 5 Holdings table with bucket, value, portfolio %

**2D. Dividend Summary**
- Tracks dividend income across all investment buckets
- Annual yield calculation

### Phase 3 — Tax & Estate (Sessions 4-8)

**3A. Realised vs Unrealised Gains**
- Disposal tracking (sell date, proceeds, cost basis)
- Section 104 pool average cost basis
- Paper vs crystallised gains separation
- Carried forward losses
- Annual CGT exempt amount tracking (£3,000)

**3B. Income Tax Engine**
- UK tax band calculation (basic 20%, higher 40%, additional 45%)
- National Insurance contributions
- Personal allowance tapering (>£100k income)
- Marriage allowance eligibility
- Multi-country support via tax_profiles.py (UK, US, India)

**3C. Allowance Tracking**
- ISA allowance (£20,000/yr) — tracks used vs remaining
- Pension annual allowance (£60,000/yr)
- CGT annual exempt amount (£3,000)
- Dividend allowance (£1,000)
- Visual progress bars for each

**3D. Tax Optimisation Engine**
- ISA allowance optimisation with projected savings
- Bed & ISA suggestions (transfer taxable → ISA)
- Pension contribution optimisation (tax relief calculations)
- Salary sacrifice for higher-rate taxpayers (NI + IT savings)
- CGT tax-loss harvesting recommendations
- Dividend allowance utilisation
- Ownership split suggestions for couples with income disparity
- Priority levels: critical, high, medium, low, info
- Total projected annual savings calculation

**3E. Estate & IHT Projection**
- Current and projected estate value at life expectancy
- UK IHT rules: nil-rate band £325k, residence nil-rate £175k (if children)
- Spouse exemption (transferable nil-rate bands)
- Pension exclusion from IHT estate
- Year-by-year projection at 5-year intervals
- Estate composition doughnut chart
- IHT projection line chart (Estate Value, IHT Liability, Net to Heirs)
- Mitigation strategies with potential savings (gifting, pension maximisation, trusts)

### Phase 4 — Mortgage & Debt Engine (Sessions 7-8)

**4A. Structured Mortgage Tracking**
- Multiple mortgages with full details (lender, rate, term, type, overpayment)
- Property value field (current market value for equity calculation)
- Monthly payment calculation (repayment or interest-only)
- Overpayment tracking with interest saved calculation
- Full amortisation schedule generation
- Fixed rate end date tracking

**4B. Structured Debt Tracking**
- Multiple debts (credit cards, loans, car finance, student loans, other)
- Per-debt: balance, rate, minimum payment, creditor
- Debt payoff projection

**4C. Data Unification**
- Property values flow from mortgage tab → net worth (not double-counted from Settings)
- Debt balances flow from structured debt/mortgage tabs only
- Mortgage transactions excluded from spending when tracked structurally
- Settings tab shows data lineage ("Property value from: Mortgage tab £385,000")
- Manual overrides in Settings disabled when structured data exists

**4D. Forecast Integration**
- 12-month cash forecast includes mortgage + debt payments
- Amortisation over forecast period (principal reducing monthly)
- Debt trajectory chart overlay on forecast
- Monthly contributions are for investment growth projection ONLY (not deducted from cash — avoids double-counting with scheduled transactions)

### Phase 5 — Retirement & FIRE (Sessions 4-6)

**5A. FIRE Modes**
- Traditional FIRE (25x expenses)
- Lean FIRE (frugal target)
- Coast FIRE (stop contributing, let compound growth carry)
- Barista FIRE (part-time income supplement)
- Fat FIRE (luxury target)
- Each mode shows: target number, years to goal, progress %

**5B. Monte Carlo Simulation**
- 1,000 randomised retirement scenarios
- Success probability (% of simulations where money lasts)
- Failure age analysis (when money runs out in worst cases)
- Risk bands: P10, P25, P50, P75, P90 wealth trajectories
- Confidence chart with shaded bands
- Plain-English interpretation ("You have a 78% chance of not running out of money before age 90")

**5C. Scenario Comparison Engine**
- 6 preset scenarios: Base Case, +£500 Pension/mo, +£1,000 ISA/mo, Retire 5yr Early, Retire 5yr Later, Aggressive Growth
- Custom scenario builder
- Side-by-side comparison of retirement age, pot size, success probability
- Delta indicators showing improvement/decline vs base case

**5D. Assumptions Transparency Panel**
- Shows all modelling inputs explicitly (expected return, inflation, tax rates, etc.)
- Expandable panel on Overview and Retirement tabs
- No hidden assumptions — everything visible

### Phase 6 — Intelligence & Reporting (Sessions 6, 8)

**6A. Wealth Intelligence Score**
- 0-100 composite score across 5 dimensions:
  - Savings & Growth (0-25)
  - Diversification (0-20)
  - Tax Efficiency (0-20)
  - Debt Management (0-20)
  - Retirement Readiness (0-15)
- Letter grade (A+ to D)
- Colour-coded ring chart
- Dimension breakdown with specific improvement suggestions

**6B. Redesigned Overview**
- 4 decision-driving sections:
  1. **Wealth Momentum:** Savings rate, contribution pace, wealth velocity
  2. **Stability & Risk:** Emergency fund runway, debt-to-income, asset concentration
  3. **Financial Freedom:** FIRE progress, years to retirement, Monte Carlo success rate
  4. **Recommended Actions:** Top 3-5 prioritised next steps with projected impact

**6C. Professional PDF Reporting**
- "Generate Report" button on Overview
- Fetches wealth summary, tax optimisation, estate data in parallel
- Builds clean, print-ready HTML report in new browser window
- Sections: Net Worth, Asset breakdown, Income & savings, Top holdings, Mortgages, Retirement, Tax optimisation, Estate & IHT
- Professional styling with print CSS
- Use Ctrl+P → "Save as PDF"

### Phase 7 — Spending Insights (Session 3)

- Top spending categories with proportional bars
- Monthly income vs spending trend (bar chart)
- Average monthly spend (30d, 3m, 6m)
- Subscription detection from recurring transactions
- Fixed vs variable spending ratio
- Spending anomaly alerts

### Phase 8 — AI Advisor (Sessions 1, 4)

- Full-context AI chat powered by Claude
- Receives complete financial snapshot: net worth, all investments, spending patterns, debts, retirement settings, family profiles
- Aware of demo mode
- Pension contributions noted as pre-tax in context
- Streaming responses

### Phase 9 — Receipt Scanning (Session 1)

- Upload receipt photo via camera or gallery
- Claude Vision OCR extracts: store name, date, items, prices, totals, currency
- Item-level categorisation
- Add scanned receipt as transaction
- Receipt search by store or item name

### Additional Infrastructure

**Net Worth Snapshots:** Auto-captured monthly, used for wealth velocity and historical charts

**Exchange Rates:** Live rates from Frankfurter API (GBP, USD, INR, EUR)

**Accounts System:** Named accounts with bank, currency, type (current, savings, credit)

**Bulk Operations:** Bulk delete by account, bulk reclassify categories

**Recurring Payments:**
- Create recurring rules (weekly, monthly, quarterly, yearly)
- Auto-generates future scheduled transactions for 12 months
- Edit a recurring transaction → choice of "Update just this one" or "Update all future"
- Delete rule removes all associated future transactions
- Recurring badge on scheduled transaction list

---

## Bug Fixes Applied in This Session

1. **Pension double-counting in forecast:** Monthly contributions were being deducted from cash forecast AND appearing as scheduled transactions. Fixed: contributions are for investment growth projection only, never deducted from cash forecast.

2. **Property value ignored in equity calculation:** Backend `add_mortgage()` and `update_mortgage()` endpoints were silently dropping the `property_value` field — it wasn't in the creation dict or the update whitelist. Fixed: added `property_value` to both. Frontend also updated to use explicit null check instead of `||` operator (which treats 0 as falsy). Added amber warning when property value is missing.

3. **Recurring payment edit only updates single occurrence:** Added `PUT /api/recurring/<rule_id>` endpoint. Frontend now detects `recurring_id` on transactions and shows choice dialog: "Update all future payments" vs "Update just this one."

4. **Save doesn't refresh page data:** Three save functions (`saveRetirementSettings`, `savePrivacyIdentity`, `saveAllocTargets`) were missing `load()` calls. Fixed all 16 save functions to call `await load()`.

5. **Page refresh navigates to home:** Added hash-based navigation. `nav()` writes `location.hash`, `restoreNav()` reads it on load. Browser refresh returns to same tab.

6. **Flask binding to localhost only:** Changed `app.run(debug=True, port=5000)` to `app.run(debug=True, host='0.0.0.0', port=5000)` so mobile app can connect.

7. **No JSON error handlers for 404/405:** Flask was returning HTML error pages to API clients. Added JSON error handlers for 404, 405, and all exceptions.

8. **API request logging:** Added `@app.before_request` logger for all `/api/` routes to aid mobile debugging.

9. **Health check endpoint:** Added `GET /api/health` returning `{"status":"ok"}` for mobile connectivity testing.

---

## Files to Deploy

### Web App (required)
| File | Location | Lines | Description |
|------|----------|-------|-------------|
| `app.py` | Project root | 4,365 | Flask backend — all API endpoints |
| `index.html` | `templates/` | 7,485 | Complete web frontend (HTML + CSS + JS) |
| `tax_profiles.py` | Project root | 240 | UK/US/IN tax bands and allowances |

### Mobile App (in `wealth-app/` Expo project)
| File | Location | Description |
|------|----------|-------------|
| `lib/api.ts` | `wealth-app/lib/` | API client with server URL management |
| `lib/theme.ts` | `wealth-app/lib/` | Design tokens and colour system |
| `app/modals/settings.tsx` | `wealth-app/app/modals/` | Settings with server URL config |

### Data Files (auto-created)
| File | Description |
|------|-------------|
| `data.json` | All user financial data (auto-created on first run) |
| `receipts.json` | Scanned receipt data |
| `data_backup.json` | Created when entering demo mode |

---

## Running the App

```bash
# Install Python dependencies
pip install flask flask-cors anthropic requests yfinance python-dateutil

# Set environment variables
export ANTHROPIC_API_KEY=your_key_here

# Run Flask
python3 app.py
# → Running on http://0.0.0.0:5000

# Open in browser
open http://localhost:5000
```

### Mobile App
```bash
cd wealth-app
npm install
npx expo start
# Open on phone via Expo Go, then configure server IP in Settings
```

---

## Known Limitations / Technical Debt

1. **Flat JSON storage:** Works for single user but no concurrent access safety. Would need SQLite or similar for multi-user.
2. **Single HTML file:** 7,485 lines of embedded JS/CSS. Works but hard to maintain. Could benefit from a build step or framework.
3. **No authentication:** Anyone with network access to port 5000 can see all data. Fine for local use, needs auth for any remote access.
4. **Mobile app styling:** Still has original gold theme, not yet updated to match web app's electric blue design system.
5. **TrueLayer integration:** Built but untested with live data. Being replaced with Plaid.
6. **Receipt scanning:** Requires Anthropic API key with vision capability.
7. **Stock/crypto prices:** Fetched on each page load, no caching. Can be slow with many holdings.

---

## Next Steps (Planned)

1. **Plaid Integration:** Replace TrueLayer with Plaid for UK Open Banking (Starling, HSBC, Amex, Halifax). User has signed up for Plaid, awaiting Development access for UK banks.

2. **Mobile App Redesign:** Update React Native app to match web app's electric blue design system and add new sections (Tax Strategy, Estate, Wealth Intelligence).

3. **Cloudflare Tunnel:** Set up permanent public URL for:
   - Plaid OAuth callbacks
   - Remote access from mobile
   - No more IP address changes

---

## API Endpoints Reference

### Core Data
- `GET /api/data` — Full data payload (totals, investments, transactions, forecast, etc.)
- `POST /api/settings` — Update any settings field
- `GET /api/health` — Connectivity check

### Transactions
- `POST /api/transactions` — Add transaction
- `PUT /api/transactions/<id>` — Update transaction
- `DELETE /api/transactions/<id>` — Delete transaction

### Investments
- `POST /api/investments/<type>` — Add holding (isa, pension, stocks, crypto, custom)
- `PUT /api/investments/<type>/<id>` — Update holding
- `DELETE /api/investments/<type>/<id>` — Delete holding

### Mortgages & Debt
- `POST /api/mortgages` — Add mortgage
- `PUT /api/mortgages/<id>` — Update mortgage (includes property_value)
- `DELETE /api/mortgages/<id>` — Delete mortgage
- `GET /api/mortgages/<id>/schedule` — Full amortisation schedule
- `POST /api/debts` — Add debt
- `PUT /api/debts/<id>` — Update debt
- `DELETE /api/debts/<id>` — Delete debt

### Recurring Payments
- `GET /api/recurring` — List all rules
- `POST /api/recurring` — Create rule + generate future transactions
- `PUT /api/recurring/<id>` — Update rule + regenerate all future transactions
- `DELETE /api/recurring/<id>` — Delete rule + remove future transactions

### Receipts
- `GET /api/receipts` — List all receipts
- `POST /api/receipts/scan` — Upload + OCR scan receipt image
- `POST /api/receipts/<id>/add-transaction` — Create transaction from receipt
- `DELETE /api/receipts/<id>` — Delete receipt

### Intelligence
- `GET /api/tax-optimisation` — Tax saving recommendations
- `GET /api/estate-projection` — IHT projection and mitigation strategies
- `GET /api/reports/wealth-summary` — Full data for PDF report generation
- `GET /api/wealth-intelligence` — Wealth score and dimension breakdown

### Accounts
- `GET /api/accounts` — List accounts
- `POST /api/accounts` — Add account
- `DELETE /api/accounts/<id>/transactions` — Bulk delete by account

### CSV Import
- `POST /api/import/csv` — Import Emma/bank CSV

### AI Advisor
- `POST /api/chat` — Send message, returns streamed Claude response

### Banking (TrueLayer — being replaced by Plaid)
- `GET /api/truelayer/status` — Connection status
- `GET /api/truelayer/connect` — Get OAuth URL
- `GET /api/truelayer/callback` — OAuth callback handler
- `POST /api/truelayer/sync` — Sync accounts and transactions
- `DELETE /api/truelayer/disconnect/<id>` — Remove connection

### Other
- `POST /api/demo/toggle` — Toggle demo mode
- `POST /api/clear` — Delete all data
- `GET /api/net-worth-history` — Snapshot history
- `POST /api/allocation-targets` — Save target allocation %
- `POST /api/disposals` — Record investment disposal (for CGT)
