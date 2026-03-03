# Wealth — iPhone App (Expo / React Native)

A native iPhone app for the Wealth finance dashboard. Built with Expo SDK 53 + React Native. Talks to your existing Flask backend over your local network.

---

## Architecture

```
iPhone App (Expo)  ←→  Flask Backend (your Mac)  ←→  Claude API + TrueLayer
```

The app has zero business logic of its own — it's a native frontend that calls your existing Flask API. Your financial data stays on your Mac.

---

## Screens

| Tab | What it does |
|-----|-------------|
| **Overview** | Net worth hero, income vs spending chart, category breakdown, quick actions |
| **Transactions** | Full list with search, time/type filters, swipe to delete, FAB to add |
| **Receipts** | Camera scan, library picker, itemised item view, add to transactions |
| **Invest** | ISA + crypto portfolio, allocation bar, gain/loss per holding |
| **Banks** | TrueLayer bank connections, sync, disconnect |

Plus modals: Add Transaction, Receipt Detail, Connect Bank (server config), Settings.

---

## Setup

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- An iPhone with **Expo Go** app installed (free from App Store)
- Your Flask backend running (from the `finance-dashboard/` folder)

### 1. Install dependencies
```bash
cd wealth-app
npm install
```

### 2. Find your Mac's IP address
```bash
ipconfig getifaddr en0
# e.g. 192.168.1.105
```

### 3. Start the Flask backend
```bash
cd ../finance-dashboard
export ANTHROPIC_API_KEY=sk-ant-...
export TRUELAYER_CLIENT_ID=...     # optional, for bank linking
export TRUELAYER_CLIENT_SECRET=...
python app.py
```

### 4. Start the Expo dev server
```bash
cd wealth-app
npx expo start
```

Scan the QR code with your iPhone camera (or Expo Go app). Make sure your iPhone and Mac are on the **same WiFi network**.

### 5. Set the server URL in the app
First time: tap **Overview → Settings icon → Connect Bank** and enter:
```
http://192.168.1.105:5000
```
(replace with your Mac's actual IP)

---

## Receipt Scanning on iPhone

The Receipts tab has two buttons:
- **📷 Camera** — point at a receipt, tap capture → Claude reads every item
- **🖼️ Library** — pick photos from your camera roll (supports multi-select)

Claude Vision extracts store, date, every item with category, and total. Works with UK supermarket receipts, restaurant bills, pharmacy receipts etc.

---

## Bank Linking (TrueLayer)

From the Banks tab, tap **Connect a Bank**. This opens TrueLayer's OAuth flow in Safari. After authorising, close Safari and tap **Sync All** to import 90 days of transactions.

Note: The redirect URI `http://YOUR_MAC_IP:5000/api/truelayer/callback` must be added to your TrueLayer Console app settings.

---

## Installing on iPhone (without App Store)

### Option A — Expo Go (development, easiest)
Just scan the QR from `npx expo start`. No Apple Developer account needed.

### Option B — Sideload via EAS Build (no App Store)
```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
```
EAS builds an `.ipa` file and emails you a download link. Install via AltStore or Apple Configurator.

### Option C — Xcode (if you have a Mac + Apple Developer account)
```bash
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx expo run:ios --device
```

---

## Project Structure

```
wealth-app/
├── app/
│   ├── _layout.tsx          # Root navigator
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab bar
│   │   ├── index.tsx        # Overview screen
│   │   ├── transactions.tsx # Transactions screen
│   │   ├── receipts.tsx     # Receipts + camera
│   │   ├── investments.tsx  # Portfolio screen
│   │   └── banks.tsx        # TrueLayer connections
│   └── modals/
│       ├── add-transaction.tsx
│       ├── receipt-detail.tsx
│       ├── connect-bank.tsx
│       ├── scan-receipt.tsx
│       └── settings.tsx
├── lib/
│   ├── api.ts               # All Flask API calls
│   └── theme.ts             # Design tokens
├── app.json                 # Expo config
├── eas.json                 # Build profiles
└── package.json
```

---

## Troubleshooting

**App can't connect to Flask**
- Make sure Flask is running: `python app.py`
- Check iPhone and Mac are on same WiFi
- Use your Mac's IP (not `localhost`) in the app's server URL setting
- Try disabling Mac firewall temporarily to test

**Camera not working**
- Grant camera permission in iPhone Settings → Wealth

**TrueLayer callback not working**
- Add `http://YOUR_MAC_IP:5000/api/truelayer/callback` to TrueLayer Console redirect URIs

**Expo Go shows "Network request failed"**
- The Flask server must be accessible on your local network
- Flask must be started with `python app.py` (default binds to `0.0.0.0:5000`)
