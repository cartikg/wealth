# Wealth — Personal Finance Dashboard

A local-first personal finance app with AI receipt scanning, bank account linking via Open Banking, and itemised spend tracking.

---

## Quick Start

```bash
pip install -r requirements.txt
python app.py
# Open http://localhost:5000
```

---

## Environment Variables

Create a `.env` file or export these before running:

```bash
# Required — get from https://console.anthropic.com
export ANTHROPIC_API_KEY=sk-ant-...

# Required for bank linking — get from https://console.truelayer.com
export TRUELAYER_CLIENT_ID=your_client_id
export TRUELAYER_CLIENT_SECRET=your_client_secret

# 'sandbox' for testing with fake banks, 'live' for real banks
export TRUELAYER_ENV=sandbox

# Only change if hosting somewhere other than localhost
export TRUELAYER_REDIRECT_URI=http://localhost:5000/api/truelayer/callback
```

---

## TrueLayer Setup (Bank Linking) — 5 minutes

### Step 1 — Create a TrueLayer account
Go to [console.truelayer.com](https://console.truelayer.com) and sign up free.

### Step 2 — Create an application
- Click **New Application**
- Copy your **Client ID** and **Client Secret**

### Step 3 — Add redirect URI
In app settings under **Allowed redirect URIs** add:
```
http://localhost:5000/api/truelayer/callback
```

### Step 4 — Start in Sandbox mode
Test with fake bank data first. Switch `TRUELAYER_ENV=live` when ready for real banks.

### Step 5 — Run
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export TRUELAYER_CLIENT_ID=your_id
export TRUELAYER_CLIENT_SECRET=your_secret
export TRUELAYER_ENV=sandbox
python app.py
```

Go to **Connect Banks** in the sidebar → **Connect a Bank**.

---

## Supported Banks

| Bank | Via TrueLayer |
|------|--------------|
| Monzo, Revolut, Starling | ✅ |
| Barclays, HSBC, NatWest, Lloyds | ✅ |
| Santander, Halifax, Nationwide | ✅ |
| First Direct, TSB, Metro | ✅ |
| American Express | ❌ CSV export |
| Trading 212 | ❌ CSV export |
| HDFC / SBI / ICICI (India) | ❌ CSV export |

---

## Features

- **Bank Linking** — Connect UK banks via Open Banking, read-only, auto-syncs 90 days
- **Receipt Scanning** — Photo to itemised list via Claude Vision
- **Item Analytics** — Search any ingredient/product across 6 months of receipts
- **Transactions** — Manual entry, CSV import, rich filtering
- **Forecasting** — 12-month projection with scheduled spends
- **Investments** — Live ISA + crypto prices
- **AI Advisor** — Claude with full financial context

---

## Privacy & Cost

All data is stored locally. Nothing leaves your machine except API calls to TrueLayer (bank data) and Anthropic (AI features).

| Service | Cost |
|---------|------|
| TrueLayer | Free |
| Claude API | ~£2–5/month |
| **Total** | **~£2–5/month** |
