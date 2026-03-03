from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import json
import os
import csv
import io
import uuid
from datetime import datetime, timedelta
from anthropic import Anthropic
import requests

app = Flask(__name__)
app.secret_key = 'wealth-dashboard-secret-2024'
CORS(app)
client = Anthropic()

DATA_FILE = 'data.json'

CATEGORIES = [
    'Food & Dining', 'Shopping', 'Transport', 'Entertainment',
    'Bills & Utilities', 'Health & Fitness', 'Travel', 'Rent/Mortgage',
    'Salary', 'Investment Return', 'Transfer', 'Education',
    'Personal Care', 'Gifts & Donations', 'Subscriptions', 'Other'
]

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return default_data()

def default_data():
    return {
        'transactions': [],
        'accounts': [
            {'id': 'uk-main', 'name': 'UK Current', 'currency': 'GBP', 'bank': 'Monzo', 'account_type': 'current'},
            {'id': 'uk-savings', 'name': 'UK Savings', 'currency': 'GBP', 'bank': 'Savings', 'account_type': 'savings'},
            {'id': 'india-main', 'name': 'India Account', 'currency': 'INR', 'bank': 'HDFC', 'account_type': 'current'},
        ],
        'investments': {'isa': [], 'crypto': [], 'rsu': [], 'stocks': [], 'pension': [], 'custom': []},
        'monthly_contributions': {'isa': 0, 'pension': 0, 'crypto': 0, 'stocks': 0, 'savings': 0},
        'income': 0,
        'monthly_fixed_expenses': 0,
        'savings': 0,
        'property_value': 0,
        'other_assets': 0,
        'debts': 0,
        'retirement': {
            'target_age': 60, 'current_age': 35,
            'monthly_expenses_retirement': 3000,
            'inflation_rate': 2.5, 'expected_return': 7.0,
            'post_retirement_return': 4.0, 'life_expectancy': 90,
            'partner_age': 33, 'partner_life_expectancy': 92,
        },
        'chat_history': []
    }

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_exchange_rates():
    rates = {'GBP': 1.0}
    try:
        r = requests.get('https://api.frankfurter.app/latest?from=GBP&to=INR,USD,EUR', timeout=5)
        d = r.json().get('rates', {})
        rates['INR'] = round(1.0 / d.get('INR', 105), 8)
        rates['USD'] = round(1.0 / d.get('USD', 1.27), 6)
        rates['EUR'] = round(1.0 / d.get('EUR', 1.17), 6)
    except:
        rates = {'GBP': 1.0, 'INR': 0.0095, 'USD': 0.79, 'EUR': 0.85}
    return rates

def to_gbp(amount, currency, rates):
    return round(float(amount) * rates.get(currency, 1.0), 2)

def get_crypto_prices(coins):
    if not coins:
        return {}
    ids = ','.join(set(c['coin_id'] for c in coins if c.get('coin_id')))
    if not ids:
        return {}
    try:
        r = requests.get(f'https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=gbp', timeout=5)
        return r.json()
    except:
        return {}

def get_stock_price_gbp(ticker, rates):
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        hist = t.history(period='1d')
        if not hist.empty:
            price = hist['Close'].iloc[-1]
            if ticker.upper().endswith('.L'):
                return round(price / 100, 4)
            else:
                return round(price * rates.get('USD', 0.79), 4)
    except:
        pass
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_all_data():
    data = load_data()
    rates = get_exchange_rates()
    today = datetime.now().strftime('%Y-%m-%d')

    transactions = []
    for t in data['transactions']:
        tx = dict(t)
        currency = tx.get('currency', 'GBP')
        tx['amount_gbp'] = to_gbp(tx.get('amount', 0), currency, rates)
        tx['is_future'] = tx.get('date', '') > today
        transactions.append(tx)
    transactions.sort(key=lambda x: x.get('date', ''), reverse=True)

    # UK Capital Gains Tax constants (2024/25)
    CGT_ANNUAL_EXEMPT = 3000       # £3,000 annual exempt amount
    CGT_RATE_BASIC = 0.18          # 18% basic rate (post Oct 2024 Budget)
    CGT_RATE_HIGHER = 0.24         # 24% higher rate
    # Assume higher rate taxpayer for worst-case CGT calc
    CGT_RATE = CGT_RATE_HIGHER

    crypto = data['investments'].get('crypto', [])
    crypto_prices = get_crypto_prices(crypto)
    crypto_valued = []
    total_crypto_gbp = 0
    total_crypto_gain = 0
    for c in crypto:
        price = crypto_prices.get(c['coin_id'], {}).get('gbp', 0)
        value = round(c['amount'] * price, 2)
        total_crypto_gbp += value
        invested = c.get('invested_gbp', 0)
        gain = round(value - invested, 2)
        total_crypto_gain += gain
        crypto_valued.append({**c, 'price_gbp': price, 'value_gbp': value,
            'gain_gbp': gain,
            'gain_pct': round(((value - invested) / invested * 100), 1) if invested else 0,
            'tax_type': 'cgt'})

    isa = data['investments'].get('isa', [])
    isa_valued = []
    total_isa_gbp = 0
    for s in isa:
        price = get_stock_price_gbp(s['ticker'], rates) if s.get('ticker') else None
        if price is None:
            price = s.get('current_price', s.get('manual_price', 0))
        value = round(s['shares'] * price, 2) if s.get('shares') else s.get('current_value', 0)
        total_isa_gbp += value
        invested = s.get('invested', s.get('cost_basis', 0) * s.get('shares', 1))
        isa_valued.append({**s, 'price_gbp': round(price, 4), 'value_gbp': value,
            'gain_gbp': round(value - invested, 2),
            'gain_pct': round(((value - invested) / invested * 100), 1) if invested else 0,
            'tax_type': 'isa'})  # ISA = no CGT

    # RSU holdings (taxed as income on vest, CGT on gain since vest)
    rsu_list = data['investments'].get('rsu', [])
    rsu_valued = []
    total_rsu_gbp = 0
    total_rsu_gain = 0
    for s in rsu_list:
        price = get_stock_price_gbp(s['ticker'], rates) if s.get('ticker') else None
        if price is None:
            price = s.get('current_price', s.get('vest_price', 0))
        value = round(s.get('shares', 0) * price, 2)
        total_rsu_gbp += value
        vest_value = round(s.get('shares', 0) * s.get('vest_price', price), 2)
        gain_since_vest = round(value - vest_value, 2)  # CGT only on gain SINCE vest
        total_rsu_gain += gain_since_vest
        rsu_valued.append({**s, 'price_gbp': round(price, 4), 'value_gbp': value,
            'vest_value_gbp': vest_value,
            'gain_since_vest': gain_since_vest,
            'gain_pct': round((gain_since_vest / vest_value * 100), 1) if vest_value else 0,
            'tax_type': 'rsu'})

    # Non-ISA stocks (full CGT on all gains)
    stocks_list = data['investments'].get('stocks', [])
    stocks_valued = []
    total_stocks_gbp = 0
    total_stocks_gain = 0
    for s in stocks_list:
        price = get_stock_price_gbp(s['ticker'], rates) if s.get('ticker') else None
        if price is None:
            price = s.get('current_price', s.get('manual_price', 0))
        value = round(s.get('shares', 0) * price, 2)
        total_stocks_gbp += value
        invested = s.get('invested', s.get('cost_basis', 0) * s.get('shares', 1))
        gain = round(value - invested, 2)
        total_stocks_gain += gain
        stocks_valued.append({**s, 'price_gbp': round(price, 4), 'value_gbp': value,
            'gain_gbp': gain,
            'gain_pct': round((gain / invested * 100), 1) if invested else 0,
            'tax_type': 'cgt'})

    # Pension (no CGT — taxed as income on withdrawal)
    pension_list = data['investments'].get('pension', [])
    pension_valued = []
    total_pension_gbp = 0
    for p in pension_list:
        value = float(p.get('current_value', 0))
        total_pension_gbp += value
        invested = float(p.get('total_contributed', 0))
        gain = round(value - invested, 2)
        pension_valued.append({**p, 'value_gbp': value,
            'gain_gbp': gain,
            'gain_pct': round((gain / invested * 100), 1) if invested else 0,
            'tax_type': 'pension'})

    # Custom investments (user-defined tax type)
    custom_list = data['investments'].get('custom', [])
    custom_valued = []
    total_custom_gbp = 0
    total_custom_gain = 0
    for c in custom_list:
        value = float(c.get('current_value', 0))
        total_custom_gbp += value
        invested = float(c.get('invested', 0))
        gain = round(value - invested, 2)
        tax_type = c.get('tax_type', 'cgt')
        if tax_type == 'cgt':
            total_custom_gain += gain
        custom_valued.append({**c, 'value_gbp': value,
            'gain_gbp': gain,
            'gain_pct': round((gain / invested * 100), 1) if invested else 0})

    # CGT calculation (UK 2024/25 rules)
    total_taxable_gains = total_crypto_gain + total_rsu_gain + total_stocks_gain + total_custom_gain
    taxable_after_exempt = max(0, total_taxable_gains - CGT_ANNUAL_EXEMPT)
    cgt_liability = round(taxable_after_exempt * CGT_RATE, 2)

    total_investments = total_crypto_gbp + total_isa_gbp + total_rsu_gbp + total_stocks_gbp + total_pension_gbp + total_custom_gbp
    bank_balance = data.get('savings', 0)
    property_value = data.get('property_value', 0)
    other_assets = data.get('other_assets', 0)
    debts = data.get('debts', 0)
    net_worth = round(bank_balance + total_investments + property_value + other_assets - debts, 2)
    net_worth_after_cgt = round(net_worth - cgt_liability, 2)

    cutoff_30 = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    recent_spend = sum(t['amount_gbp'] for t in transactions
        if t.get('type') == 'debit' and cutoff_30 <= t.get('date', '') <= today)

    monthly_income = data.get('income', 0)
    avg_monthly_spend = recent_spend if recent_spend > 0 else data.get('monthly_fixed_expenses', 0)

    future_txns = [t for t in transactions if t.get('is_future')]
    forecast = []
    balance = bank_balance
    for i in range(1, 13):
        month_dt = datetime.now() + timedelta(days=30 * i)
        month_key = month_dt.strftime('%Y-%m')
        scheduled_in = sum(t['amount_gbp'] for t in future_txns
            if t.get('date', '').startswith(month_key) and t.get('type') == 'credit')
        scheduled_out = sum(t['amount_gbp'] for t in future_txns
            if t.get('date', '').startswith(month_key) and t.get('type') == 'debit')
        balance = round(balance + monthly_income + scheduled_in - avg_monthly_spend - scheduled_out, 2)
        forecast.append({
            'month': month_dt.strftime('%b %Y'),
            'balance': balance,
            'scheduled_in': round(scheduled_in, 2),
            'scheduled_out': round(scheduled_out, 2)
        })

    categories = {}
    for t in transactions:
        if t.get('type') == 'debit' and not t.get('is_future'):
            cat = t.get('category', 'Other')
            categories[cat] = round(categories.get(cat, 0) + t['amount_gbp'], 2)

    monthly_trend = {}
    for i in range(5, -1, -1):
        dt = datetime.now() - timedelta(days=30 * i)
        monthly_trend[dt.strftime('%b %Y')] = {'income': 0, 'spend': 0, 'key': dt.strftime('%Y-%m')}

    for t in transactions:
        if t.get('is_future'):
            continue
        try:
            dt = datetime.strptime(t.get('date', '')[:7], '%Y-%m')
            label = dt.strftime('%b %Y')
        except:
            continue
        if label in monthly_trend:
            if t.get('type') == 'credit':
                monthly_trend[label]['income'] = round(monthly_trend[label]['income'] + t['amount_gbp'], 2)
            elif t.get('type') == 'debit':
                monthly_trend[label]['spend'] = round(monthly_trend[label]['spend'] + t['amount_gbp'], 2)

    account_summary = {}
    for acc in data.get('accounts', []):
        aid = acc['id']
        acc_txns = [t for t in transactions if t.get('account_id') == aid and not t.get('is_future')]
        credits = sum(t['amount_gbp'] for t in acc_txns if t.get('type') == 'credit')
        debits = sum(t['amount_gbp'] for t in acc_txns if t.get('type') == 'debit')
        account_summary[aid] = {
            'name': acc['name'], 'bank': acc.get('bank', ''),
            'currency': acc.get('currency', 'GBP'),
            'total_in': round(credits, 2), 'total_out': round(debits, 2),
            'txn_count': len(acc_txns)
        }

    return jsonify({
        'transactions': transactions,
        'accounts': data.get('accounts', []),
        'account_summary': account_summary,
        'investments': {'isa': isa_valued, 'crypto': crypto_valued, 'rsu': rsu_valued, 'stocks': stocks_valued, 'pension': pension_valued, 'custom': custom_valued},
        'totals': {
            'crypto_gbp': round(total_crypto_gbp, 2),
            'isa_gbp': round(total_isa_gbp, 2),
            'rsu_gbp': round(total_rsu_gbp, 2),
            'stocks_gbp': round(total_stocks_gbp, 2),
            'pension_gbp': round(total_pension_gbp, 2),
            'custom_gbp': round(total_custom_gbp, 2),
            'investments_gbp': round(total_investments, 2),
            'bank_balance': bank_balance,
            'property_value': property_value,
            'other_assets': other_assets,
            'debts': debts,
            'net_worth': net_worth,
            'net_worth_after_cgt': net_worth_after_cgt,
            'cgt_liability': cgt_liability,
            'taxable_gains': round(total_taxable_gains, 2),
            'cgt_exempt_amount': CGT_ANNUAL_EXEMPT,
            'cgt_rate': CGT_RATE,
            'monthly_spend': round(recent_spend, 2),
            'monthly_income': monthly_income,
            'total_assets': round(bank_balance + total_investments + property_value + other_assets, 2),
        },
        'forecast': forecast,
        'monthly_contributions': data.get('monthly_contributions', {}),
        'retirement': data.get('retirement', {}),
        'categories': categories,
        'monthly_trend': monthly_trend,
        'exchange_rates': rates,
        'categories_list': CATEGORIES,
    })

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = load_data()
    body = request.json
    today = datetime.now().strftime('%Y-%m-%d')
    txn_date = body.get('date', today)
    txn = {
        'id': str(uuid.uuid4()),
        'date': txn_date,
        'description': body.get('description', ''),
        'amount': float(body.get('amount', 0)),
        'type': body.get('type', 'debit'),
        'category': body.get('category', 'Other'),
        'currency': body.get('currency', 'GBP'),
        'account_id': body.get('account_id', ''),
        'bank': body.get('bank', ''),
        'notes': body.get('notes', ''),
        'is_scheduled': txn_date > today,
        'source': 'manual'
    }
    data['transactions'].append(txn)
    save_data(data)
    return jsonify({'ok': True, 'id': txn['id'], 'txn': txn})

@app.route('/api/transactions/<txn_id>', methods=['PUT'])
def update_transaction(txn_id):
    data = load_data()
    body = request.json
    today = datetime.now().strftime('%Y-%m-%d')
    for i, t in enumerate(data['transactions']):
        if t.get('id') == txn_id:
            updated = {**t, **body}
            updated['is_scheduled'] = updated.get('date', today) > today
            data['transactions'][i] = updated
            save_data(data)
            return jsonify({'ok': True})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/transactions/<txn_id>', methods=['DELETE'])
def delete_transaction(txn_id):
    data = load_data()
    data['transactions'] = [t for t in data['transactions'] if t.get('id') != txn_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    return jsonify(load_data().get('accounts', []))

@app.route('/api/accounts', methods=['POST'])
def add_account():
    data = load_data()
    body = request.json
    acc = {
        'id': str(uuid.uuid4()),
        'name': body.get('name', 'Account'),
        'bank': body.get('bank', ''),
        'currency': body.get('currency', 'GBP'),
        'account_type': body.get('account_type', 'current')
    }
    data.setdefault('accounts', []).append(acc)
    save_data(data)
    return jsonify({'ok': True, 'account': acc})

@app.route('/api/accounts/<acc_id>', methods=['DELETE'])
def delete_account(acc_id):
    data = load_data()
    data['accounts'] = [a for a in data.get('accounts', []) if a.get('id') != acc_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    data = load_data()
    file = request.files.get('file')
    currency = request.form.get('currency', 'GBP')
    bank = request.form.get('bank', 'unknown')
    account_id = request.form.get('account_id', '')

    if not file:
        return jsonify({'error': 'No file'}), 400

    content = file.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)

    msg = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=8000,
        messages=[{'role': 'user', 'content': f"""Parse bank transactions into JSON array.
Each item: date (YYYY-MM-DD), description (string), amount (positive number), type ("debit" or "credit"), category (pick from: {', '.join(CATEGORIES)}).
Data: {json.dumps(rows, indent=2)}
Return ONLY a JSON array."""}]
    )

    try:
        text = msg.content[0].text.strip()
        if text.startswith('```'):
            text = '\n'.join(text.split('\n')[1:])
            text = text.rsplit('```', 1)[0]
        parsed = json.loads(text)
        new_txns = []
        today = datetime.now().strftime('%Y-%m-%d')
        for t in parsed:
            txn_date = t.get('date', '')
            new_txns.append({
                'id': str(uuid.uuid4()),
                'date': txn_date,
                'description': t.get('description', ''),
                'amount': float(t.get('amount', 0)),
                'type': t.get('type', 'debit'),
                'category': t.get('category', 'Other'),
                'currency': currency,
                'account_id': account_id,
                'bank': bank,
                'notes': '',
                'is_scheduled': txn_date > today,
                'source': 'csv'
            })
        data['transactions'].extend(new_txns)
        save_data(data)
        return jsonify({'added': len(new_txns), 'total': len(data['transactions'])})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolio/import', methods=['POST'])
def import_portfolio():
    """Import Trading 212 or any broker portfolio CSV into ISA holdings."""
    data = load_data()
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file'}), 400

    try:
        raw = file.read()
        try:
            content_str = raw.decode('utf-8-sig')
        except Exception:
            content_str = raw.decode('latin-1')

        reader = csv.DictReader(io.StringIO(content_str))
        rows = list(reader)
        if not rows:
            return jsonify({'error': 'Empty CSV'}), 400

        headers = list(rows[0].keys())

        # Try to auto-detect and parse Trading 212 format
        holdings = []
        for row in rows:
            try:
                ticker = (row.get('Ticker') or row.get('Symbol') or row.get('ISIN') or '').strip()
                name = (row.get('Name') or row.get('Instrument') or row.get('Security') or ticker).strip()
                shares = float((row.get('Shares') or row.get('Quantity') or row.get('Units') or '0').replace(',','') or 0)
                avg_price = float((row.get('Average price') or row.get('Avg. price') or row.get('Cost price') or '0').replace(',','') or 0)
                curr_price = float((row.get('Current price') or row.get('Market price') or row.get('Price') or str(avg_price)).replace(',','') or avg_price)
                curr_value = float((row.get('Current value') or row.get('Market value') or row.get('Value') or str(shares * curr_price)).replace(',','') or shares * curr_price)
                invested = float((row.get('Invested') or row.get('Cost basis') or row.get('Book cost') or str(shares * avg_price)).replace(',','') or shares * avg_price)
                result = float((row.get('Result') or row.get('P&L') or row.get('Gain/Loss') or str(curr_value - invested)).replace(',','') or curr_value - invested)
                currency = (row.get('Currency') or row.get('CCY') or 'GBP').strip()

                if (ticker or name) and shares > 0:
                    holdings.append({
                        'id': str(uuid.uuid4()),
                        'ticker': ticker or name[:6].upper(),
                        'name': name,
                        'shares': shares,
                        'avg_price': avg_price,
                        'current_price': curr_price,
                        'current_value': curr_value,
                        'invested': invested,
                        'gain_loss': result,
                        'currency': currency,
                        'source': 'import'
                    })
            except Exception:
                continue

        if not holdings:
            # Fall back to Claude parsing
            msg = client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=4000,
                messages=[{'role': 'user', 'content': f"""Parse this investment portfolio CSV into JSON array.
Headers: {headers}
Data: {json.dumps(rows[:30])}
Return JSON array where each item has: ticker, name, shares (number), avg_price (number), current_price (number), current_value (number), invested (number), gain_loss (number), currency.
Return ONLY valid JSON array."""}]
            )
            text = msg.content[0].text.strip().strip('```json').strip('```').strip()
            holdings = json.loads(text)
            for h in holdings:
                h['id'] = str(uuid.uuid4())
                h['source'] = 'import'

        if not data.get('investments'):
            data['investments'] = {'isa': [], 'crypto': []}

        added = updated = 0
        for h in holdings:
            found = False
            for i, existing in enumerate(data['investments']['isa']):
                if existing.get('ticker') == h.get('ticker'):
                    data['investments']['isa'][i] = h
                    updated += 1
                    found = True
                    break
            if not found:
                data['investments']['isa'].append(h)
                added += 1

        save_data(data)
        return jsonify({'added': added, 'updated': updated, 'total': len(data['investments']['isa'])})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/recurring', methods=['GET'])
def get_recurring():
    """Get all recurring payment rules."""
    data = load_data()
    return jsonify(data.get('recurring', []))


@app.route('/api/recurring', methods=['POST'])
def add_recurring():
    """Add a recurring payment that auto-generates future transactions."""
    data = load_data()
    body = request.json
    if not data.get('recurring'):
        data['recurring'] = []

    rule = {
        'id': str(uuid.uuid4()),
        'description': body.get('description', ''),
        'amount': float(body.get('amount', 0)),
        'type': body.get('type', 'debit'),
        'category': body.get('category', 'Bills & Utilities'),
        'currency': body.get('currency', 'GBP'),
        'account_id': body.get('account_id', ''),
        'frequency': body.get('frequency', 'monthly'),  # weekly, monthly, yearly
        'start_date': body.get('start_date', datetime.now().strftime('%Y-%m-%d')),
        'end_date': body.get('end_date', ''),
        'active': True
    }
    data['recurring'].append(rule)

    # Generate future transactions for next 12 months
    _generate_recurring_transactions(data, rule)
    save_data(data)
    return jsonify({'ok': True, 'rule': rule})


@app.route('/api/recurring/<rule_id>', methods=['DELETE'])
def delete_recurring(rule_id):
    data = load_data()
    data['recurring'] = [r for r in data.get('recurring', []) if r['id'] != rule_id]
    # Remove future transactions generated by this rule
    data['transactions'] = [t for t in data.get('transactions', [])
                           if t.get('recurring_id') != rule_id or not t.get('is_future')]
    save_data(data)
    return jsonify({'ok': True})


def _generate_recurring_transactions(data, rule):
    """Generate future transaction instances for a recurring rule."""
    from dateutil.relativedelta import relativedelta
    today = datetime.now().date()
    start = datetime.strptime(rule['start_date'], '%Y-%m-%d').date()
    end_date = datetime.strptime(rule['end_date'], '%Y-%m-%d').date() if rule.get('end_date') else (today + timedelta(days=365))

    # Remove existing future transactions for this rule
    data['transactions'] = [t for t in data.get('transactions', [])
                           if not (t.get('recurring_id') == rule['id'] and t.get('is_future'))]

    freq = rule.get('frequency', 'monthly')
    current = max(start, today)

    while current <= end_date:
        date_str = current.strftime('%Y-%m-%d')
        data['transactions'].append({
            'id': str(uuid.uuid4()),
            'date': date_str,
            'description': rule['description'],
            'amount': rule['amount'],
            'type': rule['type'],
            'category': rule['category'],
            'currency': rule['currency'],
            'account_id': rule.get('account_id', ''),
            'notes': f"Recurring ({freq})",
            'is_future': True,
            'recurring_id': rule['id'],
            'source': 'recurring'
        })

        try:
            if freq == 'weekly':
                current += timedelta(weeks=1)
            elif freq == 'monthly':
                current += relativedelta(months=1)
            elif freq == 'yearly':
                current += relativedelta(years=1)
            else:
                break
        except Exception:
            break


@app.route('/api/settings', methods=['POST'])
def update_settings():
    data = load_data()
    body = request.json
    for key in ['income', 'monthly_fixed_expenses', 'savings', 'property_value', 'other_assets', 'debts']:
        if key in body:
            data[key] = float(body[key])
    if 'monthly_contributions' in body:
        data['monthly_contributions'] = body['monthly_contributions']
    if 'retirement' in body:
        data['retirement'] = body['retirement']
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/investments', methods=['POST'])
def update_investments():
    data = load_data()
    body = request.json
    if not data.get('investments'):
        data['investments'] = {'isa': [], 'crypto': [], 'rsu': [], 'stocks': []}
    if 'isa' in body:
        data['investments']['isa'] = body['isa']
    if 'crypto' in body:
        data['investments']['crypto'] = body['crypto']
    if 'rsu' in body:
        data['investments']['rsu'] = body['rsu']
    if 'stocks' in body:
        data['investments']['stocks'] = body['stocks']
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/investments/rsu', methods=['POST'])
def add_rsu():
    data = load_data()
    if not data['investments'].get('rsu'):
        data['investments']['rsu'] = []
    body = request.json
    entry = {
        'id': str(uuid.uuid4()),
        'ticker': body.get('ticker', '').upper(),
        'company': body.get('company', ''),
        'shares': float(body.get('shares', 0)),
        'vest_price': float(body.get('vest_price', 0)),
        'vest_date': body.get('vest_date', ''),
        'current_price': float(body.get('current_price', 0)),
        'currency': body.get('currency', 'USD'),
        'notes': body.get('notes', '')
    }
    data['investments']['rsu'].append(entry)
    save_data(data)
    return jsonify({'ok': True, 'entry': entry})


@app.route('/api/investments/pension', methods=['POST'])
def add_pension():
    data = load_data()
    if not data['investments'].get('pension'):
        data['investments']['pension'] = []
    body = request.json
    entry = {
        'id': str(uuid.uuid4()),
        'name': body.get('name', ''),
        'provider': body.get('provider', ''),
        'pension_type': body.get('pension_type', 'workplace'),  # workplace, sipp, state
        'current_value': float(body.get('current_value', 0)),
        'total_contributed': float(body.get('total_contributed', 0)),
        'employer_contributions': float(body.get('employer_contributions', 0)),
        'notes': body.get('notes', '')
    }
    data['investments']['pension'].append(entry)
    save_data(data)
    return jsonify({'ok': True, 'entry': entry})


@app.route('/api/investments/pension/<entry_id>', methods=['DELETE'])
def delete_pension(entry_id):
    data = load_data()
    data['investments']['pension'] = [p for p in data['investments'].get('pension', []) if p['id'] != entry_id]
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/investments/custom', methods=['POST'])
def add_custom_investment():
    data = load_data()
    if not data['investments'].get('custom'):
        data['investments']['custom'] = []
    body = request.json
    entry = {
        'id': str(uuid.uuid4()),
        'name': body.get('name', ''),
        'tag': body.get('tag', ''),           # user-defined tag e.g. "Angel Invest", "Art"
        'tax_type': body.get('tax_type', 'cgt'),  # cgt, isa, pension, none
        'current_value': float(body.get('current_value', 0)),
        'invested': float(body.get('invested', 0)),
        'notes': body.get('notes', '')
    }
    data['investments']['custom'].append(entry)
    save_data(data)
    return jsonify({'ok': True, 'entry': entry})


@app.route('/api/investments/custom/<entry_id>', methods=['DELETE'])
def delete_custom_investment(entry_id):
    data = load_data()
    data['investments']['custom'] = [c for c in data['investments'].get('custom', []) if c['id'] != entry_id]
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/investments/rsu/<entry_id>', methods=['DELETE'])
def delete_rsu(entry_id):
    data = load_data()
    data['investments']['rsu'] = [r for r in data['investments'].get('rsu', []) if r['id'] != entry_id]
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/investments/stocks', methods=['POST'])
def add_stock():
    data = load_data()
    if not data['investments'].get('stocks'):
        data['investments']['stocks'] = []
    body = request.json
    entry = {
        'id': str(uuid.uuid4()),
        'ticker': body.get('ticker', '').upper(),
        'name': body.get('name', ''),
        'shares': float(body.get('shares', 0)),
        'cost_basis': float(body.get('cost_basis', 0)),
        'current_price': float(body.get('current_price', 0)),
        'currency': body.get('currency', 'GBP'),
        'notes': body.get('notes', '')
    }
    entry['invested'] = round(entry['shares'] * entry['cost_basis'], 2)
    data['investments']['stocks'].append(entry)
    save_data(data)
    return jsonify({'ok': True, 'entry': entry})


@app.route('/api/investments/stocks/<entry_id>', methods=['DELETE'])
def delete_stock(entry_id):
    data = load_data()
    data['investments']['stocks'] = [s for s in data['investments'].get('stocks', []) if s['id'] != entry_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/chat', methods=['POST'])
def chat():
    data = load_data()
    user_msg = request.json.get('message', '')
    rates = get_exchange_rates()
    today = datetime.now().strftime('%Y-%m-%d')
    transactions = data['transactions']
    for t in transactions:
        t['amount_gbp'] = to_gbp(t.get('amount', 0), t.get('currency', 'GBP'), rates)
    recent = [t for t in transactions if t.get('date', '') >= (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')]
    future = [t for t in transactions if t.get('date', '') > today]
    context = f"""Personal finance advisor with full data access:
Income: £{data.get('income',0)}/mo | Savings: £{data.get('savings',0)} | Debts: £{data.get('debts',0)}
Property: £{data.get('property_value',0)} | Other assets: £{data.get('other_assets',0)}
ISA: {json.dumps(data['investments'].get('isa',[]))}
Crypto: {json.dumps(data['investments'].get('crypto',[]))}
Recent txns (90d): {json.dumps(recent[:40])}
Scheduled future: {json.dumps(future[:20])}
Accounts: {json.dumps(data.get('accounts',[]))}
Be concise, specific, use actual numbers from the data."""
    history = data.get('chat_history', [])
    history.append({'role': 'user', 'content': user_msg})
    response = client.messages.create(model='claude-haiku-4-5-20251001', max_tokens=1000, system=context, messages=history[-10:])
    reply = response.content[0].text
    history.append({'role': 'assistant', 'content': reply})
    data['chat_history'] = history[-20:]
    save_data(data)
    return jsonify({'reply': reply})

@app.route('/api/clear', methods=['POST'])
def clear_data():
    save_data(default_data())
    return jsonify({'ok': True})

# ─── Receipt Scanning ─────────────────────────────────────────────────────────

RECEIPTS_FILE = 'receipts.json'
RECEIPTS_DIR = 'receipts_store'
os.makedirs(RECEIPTS_DIR, exist_ok=True)

def load_receipts():
    if os.path.exists(RECEIPTS_FILE):
        with open(RECEIPTS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_receipts(receipts):
    with open(RECEIPTS_FILE, 'w') as f:
        json.dump(receipts, f, indent=2)

@app.route('/api/receipts', methods=['GET'])
def get_receipts():
    receipts = load_receipts()
    receipts.sort(key=lambda r: r.get('date', ''), reverse=True)
    return jsonify(receipts)

@app.route('/api/receipts/scan', methods=['POST'])
def scan_receipt():
    """Upload and scan a receipt image using Claude Vision."""
    data = load_data()
    file = request.files.get('image')
    account_id = request.form.get('account_id', '')
    currency = request.form.get('currency', 'GBP')

    if not file:
        return jsonify({'error': 'No image uploaded'}), 400

    # Read image and convert to base64
    import base64
    img_bytes = file.read()
    img_b64 = base64.standard_b64encode(img_bytes).decode('utf-8')
    
    # Detect media type
    filename = file.filename.lower()
    if filename.endswith('.png'):
        media_type = 'image/png'
    elif filename.endswith('.webp'):
        media_type = 'image/webp'
    elif filename.endswith('.gif'):
        media_type = 'image/gif'
    else:
        media_type = 'image/jpeg'

    # Get account info for context
    accounts = data.get('accounts', [])
    account = next((a for a in accounts if a['id'] == account_id), None)
    account_name = account['name'] if account else 'Unknown account'
    account_bank = account.get('bank', '') if account else ''

    # Ask Claude to extract ALL itemised data from the receipt
    prompt = f"""You are scanning a receipt image. Extract every single item and piece of information from this receipt.

Return a JSON object with this exact structure:
{{
  "store": "store/merchant name",
  "store_category": "one of: Supermarket, Restaurant, Pharmacy, Petrol, Clothing, Electronics, DIY, Other",
  "date": "YYYY-MM-DD (use today if not visible)",
  "time": "HH:MM or null",
  "currency": "{currency}",
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "payment_method_hint": "cash/card/contactless/etc if visible on receipt, else null",
  "receipt_number": "receipt/transaction number if visible, else null",
  "items": [
    {{
      "name": "exact item name from receipt",
      "quantity": 1,
      "unit_price": 0.00,
      "total_price": 0.00,
      "category": "one of: Fresh Produce, Meat & Fish, Dairy & Eggs, Bakery, Frozen, Drinks, Snacks & Confectionery, Household, Personal Care, Baby, Pet, Alcohol, Tobacco, Clothing, Electronics, Fuel, Medicine, Other"
    }}
  ]
}}

Be thorough — capture every line item. If quantity is not shown, assume 1. Return ONLY valid JSON."""

    try:
        response = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=4000,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': media_type,
                            'data': img_b64
                        }
                    },
                    {
                        'type': 'text',
                        'text': prompt
                    }
                ]
            }]
        )

        text = response.content[0].text.strip()
        if text.startswith('```'):
            text = '\n'.join(text.split('\n')[1:])
            text = text.rsplit('```', 1)[0]
        
        parsed = json.loads(text)

        # Save image file
        receipt_id = str(uuid.uuid4())
        img_ext = 'jpg' if media_type == 'image/jpeg' else media_type.split('/')[1]
        img_filename = f"{receipt_id}.{img_ext}"
        img_path = os.path.join(RECEIPTS_DIR, img_filename)
        with open(img_path, 'wb') as f:
            f.write(img_bytes)

        # Build receipt record
        receipt = {
            'id': receipt_id,
            'image_file': img_filename,
            'account_id': account_id,
            'account_name': account_name,
            'account_bank': account_bank,
            'currency': currency,
            'store': parsed.get('store', 'Unknown'),
            'store_category': parsed.get('store_category', 'Other'),
            'date': parsed.get('date', datetime.now().strftime('%Y-%m-%d')),
            'time': parsed.get('time'),
            'subtotal': parsed.get('subtotal', 0),
            'tax': parsed.get('tax', 0),
            'total': parsed.get('total', 0),
            'payment_method_hint': parsed.get('payment_method_hint'),
            'receipt_number': parsed.get('receipt_number'),
            'items': parsed.get('items', []),
            'scanned_at': datetime.now().isoformat(),
            'added_to_transactions': False
        }

        # Save receipt
        receipts = load_receipts()
        receipts.append(receipt)
        save_receipts(receipts)

        return jsonify({'ok': True, 'receipt': receipt})

    except json.JSONDecodeError as e:
        return jsonify({'error': f'Could not parse receipt data: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/receipts/<receipt_id>/add-transaction', methods=['POST'])
def receipt_add_transaction(receipt_id):
    """Convert a scanned receipt into a transaction entry."""
    data = load_data()
    receipts = load_receipts()
    
    receipt = next((r for r in receipts if r['id'] == receipt_id), None)
    if not receipt:
        return jsonify({'error': 'Receipt not found'}), 404

    rates = get_exchange_rates()
    total_gbp = to_gbp(receipt['total'], receipt.get('currency', 'GBP'), rates)

    txn = {
        'id': str(uuid.uuid4()),
        'date': receipt['date'],
        'description': receipt['store'],
        'amount': receipt['total'],
        'amount_gbp': total_gbp,
        'type': 'debit',
        'category': 'Food & Dining' if receipt['store_category'] in ['Supermarket','Restaurant'] else 'Shopping',
        'currency': receipt.get('currency', 'GBP'),
        'account_id': receipt.get('account_id', ''),
        'bank': receipt.get('account_bank', ''),
        'notes': f"Receipt scan — {len(receipt.get('items',[]))} items",
        'receipt_id': receipt_id,
        'is_scheduled': False,
        'source': 'receipt'
    }

    data['transactions'].append(txn)
    save_data(data)

    # Mark receipt as added
    for r in receipts:
        if r['id'] == receipt_id:
            r['added_to_transactions'] = True
            r['transaction_id'] = txn['id']
    save_receipts(receipts)

    return jsonify({'ok': True, 'transaction': txn})


@app.route('/api/receipts/<receipt_id>', methods=['DELETE'])
def delete_receipt(receipt_id):
    receipts = load_receipts()
    receipt = next((r for r in receipts if r['id'] == receipt_id), None)
    if receipt:
        # Delete image file
        img_path = os.path.join(RECEIPTS_DIR, receipt.get('image_file', ''))
        if os.path.exists(img_path):
            os.remove(img_path)
    receipts = [r for r in receipts if r['id'] != receipt_id]
    save_receipts(receipts)
    return jsonify({'ok': True})


@app.route('/api/receipts/image/<filename>')
def receipt_image(filename):
    """Serve receipt image files."""
    from flask import send_from_directory
    return send_from_directory(RECEIPTS_DIR, filename)


@app.route('/api/receipts/analytics', methods=['GET'])
def receipt_analytics():
    """Aggregated item-level analytics across all receipts."""
    receipts = load_receipts()
    rates = get_exchange_rates()
    
    months_back = int(request.args.get('months', 6))
    store_filter = request.args.get('store', '').lower()
    category_filter = request.args.get('category', '')
    item_search = request.args.get('item', '').lower()

    cutoff = (datetime.now() - timedelta(days=30 * months_back)).strftime('%Y-%m-%d')

    # Filter receipts
    filtered = [r for r in receipts if r.get('date', '') >= cutoff]
    if store_filter:
        filtered = [r for r in filtered if store_filter in r.get('store', '').lower()]

    # Aggregate items
    item_totals = {}   # item_name -> {total_spent, total_qty, purchases: [{date, store, price, qty}]}
    store_totals = {}  # store -> total_spent_gbp
    monthly_totals = {}  # month -> total_spent
    category_totals = {}  # item_category -> total
    store_items = {}   # store -> [item names]

    for receipt in filtered:
        store = receipt.get('store', 'Unknown')
        date = receipt.get('date', '')
        currency = receipt.get('currency', 'GBP')
        month = date[:7]

        receipt_total_gbp = to_gbp(receipt.get('total', 0), currency, rates)
        store_totals[store] = round(store_totals.get(store, 0) + receipt_total_gbp, 2)
        
        month_label = datetime.strptime(month, '%Y-%m').strftime('%b %Y') if month else '?'
        monthly_totals[month_label] = round(monthly_totals.get(month_label, 0) + receipt_total_gbp, 2)

        for item in receipt.get('items', []):
            name = item.get('name', '').strip()
            if not name:
                continue
            if item_search and item_search not in name.lower():
                continue
            if category_filter and item.get('category') != category_filter:
                continue

            item_gbp = to_gbp(item.get('total_price', 0), currency, rates)
            qty = item.get('quantity', 1)
            item_cat = item.get('category', 'Other')

            key = name.lower()
            if key not in item_totals:
                item_totals[key] = {
                    'name': name, 'total_spent': 0, 'total_qty': 0,
                    'category': item_cat, 'purchases': []
                }
            item_totals[key]['total_spent'] = round(item_totals[key]['total_spent'] + item_gbp, 2)
            item_totals[key]['total_qty'] += qty
            item_totals[key]['purchases'].append({
                'date': date, 'store': store,
                'price': round(item_gbp, 2), 'qty': qty,
                'unit_price': round(item.get('unit_price', 0), 2)
            })

            category_totals[item_cat] = round(category_totals.get(item_cat, 0) + item_gbp, 2)

            if store not in store_items:
                store_items[store] = {}
            store_items[store][key] = round(store_items[store].get(key, 0) + item_gbp, 2)

    # Sort items by total spend desc
    items_sorted = sorted(item_totals.values(), key=lambda x: x['total_spent'], reverse=True)

    # Top items per store
    top_per_store = {}
    for store, items in store_items.items():
        top_per_store[store] = sorted(
            [{'name': k, 'total': v} for k, v in items.items()],
            key=lambda x: x['total'], reverse=True
        )[:10]

    return jsonify({
        'receipts_count': len(filtered),
        'total_receipts_gbp': round(sum(store_totals.values()), 2),
        'item_totals': items_sorted[:100],
        'store_totals': sorted([{'store': k, 'total': v} for k, v in store_totals.items()], key=lambda x: x['total'], reverse=True),
        'monthly_totals': monthly_totals,
        'category_totals': category_totals,
        'top_per_store': top_per_store,
    })


# ─── TrueLayer Open Banking Integration ──────────────────────────────────────
#
# Setup (one-time):
#   1. Go to https://console.truelayer.com and create a free account
#   2. Create an application → get CLIENT_ID and CLIENT_SECRET
#   3. Add redirect URI: http://localhost:5000/api/truelayer/callback
#   4. Set these in your environment or .env file:
#      TRUELAYER_CLIENT_ID=your_client_id
#      TRUELAYER_CLIENT_SECRET=your_client_secret
#
# TrueLayer sandbox uses: https://auth.truelayer-sandbox.com
# TrueLayer live uses:    https://auth.truelayer.com
# Set TRUELAYER_ENV=sandbox or live (default: sandbox for safety)

TRUELAYER_CLIENT_ID     = os.environ.get('TRUELAYER_CLIENT_ID', '')
TRUELAYER_CLIENT_SECRET = os.environ.get('TRUELAYER_CLIENT_SECRET', '')
TRUELAYER_REDIRECT_URI  = os.environ.get('TRUELAYER_REDIRECT_URI', 'http://localhost:5000/api/truelayer/callback')
TRUELAYER_ENV           = os.environ.get('TRUELAYER_ENV', 'sandbox')  # 'sandbox' or 'live'

TL_AUTH_URL = 'https://auth.truelayer-sandbox.com' if TRUELAYER_ENV == 'sandbox' else 'https://auth.truelayer.com'
TL_API_URL  = 'https://api.truelayer-sandbox.com'  if TRUELAYER_ENV == 'sandbox' else 'https://api.truelayer.com'

TRUELAYER_FILE = 'truelayer_connections.json'

def load_tl_connections():
    if os.path.exists(TRUELAYER_FILE):
        with open(TRUELAYER_FILE, 'r') as f:
            return json.load(f)
    return []

def save_tl_connections(connections):
    with open(TRUELAYER_FILE, 'w') as f:
        json.dump(connections, f, indent=2)

def tl_refresh_token(connection):
    """Refresh an expired TrueLayer access token."""
    try:
        r = requests.post(f'{TL_AUTH_URL}/connect/token', data={
            'grant_type': 'refresh_token',
            'client_id': TRUELAYER_CLIENT_ID,
            'client_secret': TRUELAYER_CLIENT_SECRET,
            'refresh_token': connection.get('refresh_token'),
        })
        if r.status_code == 200:
            tokens = r.json()
            connection['access_token']  = tokens['access_token']
            connection['refresh_token'] = tokens.get('refresh_token', connection['refresh_token'])
            connection['token_expires'] = (datetime.now() + timedelta(seconds=tokens.get('expires_in', 3600))).isoformat()
            # Save updated tokens
            connections = load_tl_connections()
            for i, c in enumerate(connections):
                if c['id'] == connection['id']:
                    connections[i] = connection
            save_tl_connections(connections)
            return connection
    except Exception as e:
        print(f'Token refresh error: {e}')
    return None

def tl_get(connection, endpoint):
    """Make an authenticated GET request to TrueLayer API, auto-refreshing token if needed."""
    # Refresh if token expires within 5 minutes
    expires = connection.get('token_expires')
    if expires:
        exp_dt = datetime.fromisoformat(expires)
        if datetime.now() >= exp_dt - timedelta(minutes=5):
            connection = tl_refresh_token(connection)
            if not connection:
                return None, 'Token refresh failed'

    headers = {'Authorization': f'Bearer {connection["access_token"]}'}
    try:
        r = requests.get(f'{TL_API_URL}{endpoint}', headers=headers, timeout=15)
        if r.status_code == 200:
            return r.json(), None
        return None, f'API error {r.status_code}: {r.text[:200]}'
    except Exception as e:
        return None, str(e)


@app.route('/api/truelayer/status', methods=['GET'])
def tl_status():
    """Return current connection status and config."""
    configured = bool(TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET)
    connections = load_tl_connections()
    return jsonify({
        'configured': configured,
        'env': TRUELAYER_ENV,
        'connections': [{
            'id': c['id'],
            'bank_name': c.get('bank_name', 'Unknown Bank'),
            'bank_id': c.get('bank_id', ''),
            'connected_at': c.get('connected_at', ''),
            'accounts': c.get('accounts', []),
            'last_synced': c.get('last_synced'),
            'status': c.get('status', 'connected'),
        } for c in connections]
    })


@app.route('/api/truelayer/connect', methods=['GET'])
def tl_connect():
    """Build the TrueLayer OAuth authorisation URL and return it."""
    if not TRUELAYER_CLIENT_ID:
        return jsonify({'error': 'TrueLayer not configured. Set TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET env vars.'}), 400

    import secrets
    state = secrets.token_urlsafe(16)

    # Store state for CSRF verification
    state_file = 'tl_state.json'
    with open(state_file, 'w') as f:
        json.dump({'state': state, 'created': datetime.now().isoformat()}, f)

    # TrueLayer scopes for read-only bank data
    scopes = 'info accounts balance transactions offline_access'

    # Providers we want to show (blank = all providers)
    # Use 'providers=uk-ob-all uk-ob-revolut' etc. to restrict
    params = {
        'response_type': 'code',
        'client_id': TRUELAYER_CLIENT_ID,
        'scope': scopes,
        'redirect_uri': TRUELAYER_REDIRECT_URI,
        'state': state,
        'providers': 'uk-ob-all uk-ob-revolut',  # All UK Open Banking banks
    }

    from urllib.parse import urlencode
    auth_url = f'{TL_AUTH_URL}/?{urlencode(params)}'
    return jsonify({'auth_url': auth_url, 'state': state})


@app.route('/api/truelayer/callback')
def tl_callback():
    """Handle OAuth callback from TrueLayer after user connects their bank."""
    code  = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')

    if error:
        return f'''<script>
            window.opener && window.opener.postMessage({{type:"tl_error",error:"{error}"}}, "*");
            window.close();
        </script>'''

    # Verify state
    state_file = 'tl_state.json'
    if os.path.exists(state_file):
        with open(state_file) as f:
            saved = json.load(f)
        if saved.get('state') != state:
            return '<script>window.opener&&window.opener.postMessage({type:"tl_error",error:"State mismatch"},"*");window.close();</script>'
        os.remove(state_file)

    # Exchange code for tokens
    try:
        r = requests.post(f'{TL_AUTH_URL}/connect/token', data={
            'grant_type': 'authorization_code',
            'client_id': TRUELAYER_CLIENT_ID,
            'client_secret': TRUELAYER_CLIENT_SECRET,
            'redirect_uri': TRUELAYER_REDIRECT_URI,
            'code': code,
        })
        if r.status_code != 200:
            return f'<script>window.opener&&window.opener.postMessage({{type:"tl_error",error:"Token exchange failed: {r.status_code}"}},"*");window.close();</script>'

        tokens = r.json()
        access_token  = tokens['access_token']
        refresh_token = tokens.get('refresh_token', '')
        expires_in    = tokens.get('expires_in', 3600)
        token_expires = (datetime.now() + timedelta(seconds=expires_in)).isoformat()

        # Fetch bank identity/info
        headers = {'Authorization': f'Bearer {access_token}'}
        info_r  = requests.get(f'{TL_API_URL}/data/v1/me', headers=headers, timeout=10)
        accts_r = requests.get(f'{TL_API_URL}/data/v1/accounts', headers=headers, timeout=10)

        bank_name = 'Connected Bank'
        bank_id   = ''
        accounts  = []

        if info_r.status_code == 200:
            info = info_r.json().get('results', [{}])[0]
            bank_name = info.get('provider', {}).get('display_name', 'Connected Bank')
            bank_id   = info.get('provider', {}).get('provider_id', '')

        if accts_r.status_code == 200:
            for acct in accts_r.json().get('results', []):
                accounts.append({
                    'account_id':   acct.get('account_id'),
                    'display_name': acct.get('display_name', 'Account'),
                    'account_type': acct.get('account_type', 'TRANSACTION'),
                    'currency':     acct.get('currency', 'GBP'),
                    'provider':     acct.get('provider', {}).get('display_name', bank_name),
                })

        connection = {
            'id':            str(uuid.uuid4()),
            'access_token':  access_token,
            'refresh_token': refresh_token,
            'token_expires': token_expires,
            'bank_name':     bank_name,
            'bank_id':       bank_id,
            'accounts':      accounts,
            'connected_at':  datetime.now().isoformat(),
            'last_synced':   None,
            'status':        'connected',
        }

        connections = load_tl_connections()
        connections.append(connection)
        save_tl_connections(connections)

        return f'''<html><body style="background:#080810;color:#ede9ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
                <div style="font-size:48px">✅</div>
                <h2 style="color:#3ecfb2;margin:12px 0">{bank_name} Connected!</h2>
                <p style="color:#9896b8">{len(accounts)} account(s) found. This window will close...</p>
            </div>
            <script>
                setTimeout(() => {{
                    window.opener && window.opener.postMessage({{
                        type: "tl_connected",
                        bank: "{bank_name}",
                        accounts: {len(accounts)}
                    }}, "*");
                    window.close();
                }}, 1500);
            </script>
        </body></html>'''

    except Exception as e:
        return f'<script>window.opener&&window.opener.postMessage({{type:"tl_error",error:"{str(e)}"}},"*");window.close();</script>'


@app.route('/api/truelayer/sync', methods=['POST'])
def tl_sync():
    """Sync transactions and balances from all connected banks."""
    connections = load_tl_connections()
    if not connections:
        return jsonify({'error': 'No banks connected'}), 400

    data = load_data()
    rates = get_exchange_rates()
    today = datetime.now().strftime('%Y-%m-%d')
    since = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%dT00:00:00Z')

    total_imported  = 0
    total_skipped   = 0
    errors          = []
    synced_accounts = []

    for conn in connections:
        conn_errors = []

        for acct in conn.get('accounts', []):
            acct_id   = acct['account_id']
            currency  = acct.get('currency', 'GBP')
            acct_name = acct.get('display_name', conn['bank_name'])

            # Ensure account exists in local accounts list
            existing_acct_ids = [a['id'] for a in data.get('accounts', [])]
            local_acct_id = f"tl_{acct_id}"
            if local_acct_id not in existing_acct_ids:
                data.setdefault('accounts', []).append({
                    'id':           local_acct_id,
                    'name':         f"{acct_name} ({conn['bank_name']})",
                    'bank':         conn['bank_name'],
                    'currency':     currency,
                    'account_type': acct.get('account_type', 'TRANSACTION').lower(),
                    'tl_account_id': acct_id,
                    'tl_connection_id': conn['id'],
                })

            # Fetch balance
            bal_data, bal_err = tl_get(conn, f'/data/v1/accounts/{acct_id}/balance')
            if bal_data:
                balance = bal_data.get('results', [{}])[0].get('available', 0)
                synced_accounts.append({
                    'name':     acct_name,
                    'bank':     conn['bank_name'],
                    'balance':  balance,
                    'currency': currency,
                })
            elif bal_err:
                conn_errors.append(f'{acct_name} balance: {bal_err}')

            # Fetch transactions
            txn_data, txn_err = tl_get(conn, f'/data/v1/accounts/{acct_id}/transactions?from={since}')
            if txn_data:
                existing_refs = {t.get('tl_transaction_id') for t in data['transactions'] if t.get('tl_transaction_id')}

                for txn in txn_data.get('results', []):
                    tl_id = txn.get('transaction_id')
                    if tl_id in existing_refs:
                        total_skipped += 1
                        continue

                    amount    = abs(txn.get('amount', 0))
                    txn_type  = 'credit' if txn.get('transaction_type', '').upper() == 'CREDIT' else 'debit'
                    desc      = txn.get('description', txn.get('merchant_name', 'Unknown'))
                    txn_date  = txn.get('timestamp', today)[:10]
                    norm_desc = desc.lower()

                    # Auto-categorise using description
                    category = 'Other'
                    cat_rules = [
                        (['tesco','sainsbury','asda','morrisons','waitrose','aldi','lidl','co-op','marks','m&s food','costco','ocado'], 'Food & Dining'),
                        (['uber eats','deliveroo','just eat','mcdonald','kfc','pizza','nando','greggs','starbucks','costa','pret'], 'Food & Dining'),
                        (['amazon','ebay','asos','next','zara','h&m','primark','nike','apple store'], 'Shopping'),
                        (['uber','lyft','trainline','tfl','national rail','bus','oyster','petrol','shell','bp','esso'], 'Transport'),
                        (['netflix','spotify','disney','sky','amazon prime','youtube','twitch','gaming'], 'Subscriptions'),
                        (['gym','fitness','sport','health','pharmacy','boots','lloyds pharmacy'], 'Health & Fitness'),
                        (['rent','mortgage','landlord'], 'Rent/Mortgage'),
                        (['salary','payroll','wages','employer'], 'Salary'),
                        (['transfer','revolut','monzo','bank transfer'], 'Transfer'),
                        (['electricity','gas','water','broadband','internet','phone','council tax','bt '], 'Bills & Utilities'),
                        (['hotel','airbnb','booking.com','flight','ryanair','easyjet','holiday'], 'Travel'),
                        (['cinema','theatre','ticketmaster','concert','eventbrite'], 'Entertainment'),
                    ]
                    for keywords, cat in cat_rules:
                        if any(kw in norm_desc for kw in keywords):
                            category = cat
                            break

                    new_txn = {
                        'id':                str(uuid.uuid4()),
                        'date':              txn_date,
                        'description':       desc,
                        'amount':            round(amount, 2),
                        'type':              txn_type,
                        'category':          category,
                        'currency':          currency,
                        'account_id':        local_acct_id,
                        'bank':              conn['bank_name'],
                        'notes':             txn.get('merchant_name', ''),
                        'is_scheduled':      txn_date > today,
                        'source':            'truelayer',
                        'tl_transaction_id': tl_id,
                    }
                    data['transactions'].append(new_txn)
                    total_imported += 1
            elif txn_err:
                conn_errors.append(f'{acct_name} transactions: {txn_err}')

        if conn_errors:
            errors.extend(conn_errors)

        # Update last synced
        for c in connections:
            if c['id'] == conn['id']:
                c['last_synced'] = datetime.now().isoformat()
                c['status'] = 'connected'

    save_data(data)
    save_tl_connections(connections)

    return jsonify({
        'ok': True,
        'imported':   total_imported,
        'skipped':    total_skipped,
        'accounts':   synced_accounts,
        'errors':     errors,
        'synced_at':  datetime.now().isoformat(),
    })


@app.route('/api/truelayer/disconnect/<connection_id>', methods=['DELETE'])
def tl_disconnect(connection_id):
    """Disconnect a bank by removing its stored tokens."""
    connections = load_tl_connections()
    connections = [c for c in connections if c['id'] != connection_id]
    save_tl_connections(connections)

    # Also remove the auto-created accounts from this connection
    data = load_data()
    data['accounts'] = [a for a in data.get('accounts', []) if a.get('tl_connection_id') != connection_id]
    save_data(data)

    return jsonify({'ok': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
