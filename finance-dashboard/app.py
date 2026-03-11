from flask import Flask, render_template, request, jsonify
from tax_profiles import TAX_PROFILES, CURRENCIES
from flask_cors import CORS
from auth import is_password_set, verify_password, setup_password, generate_token, validate_token
import json
import os
import csv
import io
import uuid
import threading
import math
from datetime import datetime, timedelta, date
from anthropic import Anthropic
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ── Database setup ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
# Render supplies postgres:// but SQLAlchemy 1.4+ requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

from models import User, TLConnection
Base.metadata.create_all(bind=engine)

# ── Resolve paths relative to this file (works regardless of CWD) ────────────
_APP_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.secret_key = 'wealth-dashboard-secret-2024'
CORS(app)

# Lazy Anthropic client — app works without API key, Claude features just return errors
_anthropic_client = None

def get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise RuntimeError('ANTHROPIC_API_KEY not set. Add it to your environment variables.')
        _anthropic_client = Anthropic(api_key=api_key)
    return _anthropic_client

# Auth guard + request logging
AUTH_EXEMPT = {'/api/health', '/api/auth/status', '/api/auth/setup', '/api/auth/login', '/api/truelayer/callback'}

@app.before_request
def check_auth():
    if request.path.startswith('/api/'):
        print(f"[API] {request.method} {request.path} from {request.remote_addr}")
        if request.path in AUTH_EXEMPT:
            return None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            if validate_token(token):
                return None
        return jsonify({'error': 'Unauthorized', 'message': 'Valid token required'}), 401

@app.errorhandler(500)
def handle_500(e):
    import traceback
    traceback.print_exc()
    return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500

@app.errorhandler(404)
def handle_404(e):
    return jsonify({'error': 'Not found', 'path': request.path}), 404

@app.errorhandler(405)
def handle_405(e):
    return jsonify({'error': 'Method not allowed', 'path': request.path, 'method': request.method}), 405

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    traceback.print_exc()
    return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500

# ── Auth Endpoints ────────────────────────────────────────────────────────────

@app.route('/api/auth/status')
def auth_status():
    return jsonify({'password_set': is_password_set()})

@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    body = request.get_json(force=True)
    password = body.get('password', '').strip()
    if not password or len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    token = setup_password(password)
    if token is None:
        return jsonify({'error': 'Password already set. Use /api/auth/login instead.'}), 409
    return jsonify({'token': token})

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(force=True)
    password = body.get('password', '').strip()
    if not password:
        return jsonify({'error': 'Password required'}), 400
    if not verify_password(password):
        return jsonify({'error': 'Invalid password'}), 401
    return jsonify({'token': generate_token()})

# ── Data ──────────────────────────────────────────────────────────────────────

DATA_FILE = os.path.join(_APP_DIR, 'data.json')

CATEGORIES = [
    'Food & Dining', 'Shopping', 'Transport', 'Entertainment',
    'Bills & Utilities', 'Health & Fitness', 'Travel', 'Rent/Mortgage',
    'Salary', 'Investment Return', 'Transfer', 'Education',
    'Personal Care', 'Gifts & Donations', 'Subscriptions', 'Other'
]

# Default category icons
CATEGORY_ICONS = {
    'Food & Dining': '🍽️', 'Shopping': '🛍️', 'Transport': '🚗', 'Entertainment': '🎭',
    'Bills & Utilities': '📄', 'Health & Fitness': '💪', 'Travel': '✈️', 'Rent/Mortgage': '🏠',
    'Salary': '💰', 'Investment Return': '📈', 'Transfer': '↔️', 'Education': '📚',
    'Personal Care': '💅', 'Gifts & Donations': '🎁', 'Subscriptions': '📺', 'Other': '📦'
}

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
        return migrate_data(data)
    return default_data()

def migrate_data(data):
    """Add missing fields safely for backward compatibility."""
    # User categories (Phase 1B)
    if 'user_categories' not in data:
        data['user_categories'] = [
            {'id': f'cat_{i:03d}', 'name': c, 'icon': CATEGORY_ICONS.get(c, '📦'),
             'type': 'income' if c in ['Salary', 'Investment Return'] else 'expense',
             'budget_monthly': 0, 'archived': False, 'parent': None}
            for i, c in enumerate(CATEGORIES)
        ]
    if 'category_budgets' not in data:
        data['category_budgets'] = {}
    # Identity privacy settings (Phase 1C)
    gs = data.get('global_settings', {})
    privacy_defaults = {
        'privacy_mask_names': False,
        'privacy_alias': '',
        'privacy_hide_banks': False,
        'privacy_hide_accounts': False,
    }
    for k, v in privacy_defaults.items():
        if k not in gs:
            gs[k] = v
    data['global_settings'] = gs

    # Phase 2: Fix ISA holdings missing IDs
    inv = data.get('investments', {})
    for bucket in ['isa', 'crypto', 'stocks', 'pension', 'rsu', 'custom']:
        for item in inv.get(bucket, []):
            if not item.get('id'):
                item['id'] = str(uuid.uuid4())
            # Add asset allocation fields if missing (Phase 2C)
            if 'asset_class' not in item:
                if bucket == 'crypto':
                    item['asset_class'] = 'crypto'
                elif bucket == 'pension':
                    item['asset_class'] = 'mixed'
                elif bucket == 'custom':
                    item['asset_class'] = item.get('tag', 'alternative').lower() if item.get('tag') else 'alternative'
                else:
                    item['asset_class'] = 'equity'
            if 'geography' not in item:
                ticker = item.get('ticker', '')
                if ticker.endswith('.L') or ticker.endswith('.LON'):
                    item['geography'] = 'UK'
                elif bucket == 'crypto':
                    item['geography'] = 'Global'
                else:
                    item['geography'] = 'US'
            if 'sector' not in item:
                item['sector'] = ''
            # Add purchase_date if missing
            if 'purchase_date' not in item:
                item['purchase_date'] = ''
            # Add dividend fields if missing (Phase 2D)
            if 'dividend_yield_pct' not in item:
                item['dividend_yield_pct'] = 0
            if 'dividends' not in item:
                item['dividends'] = []

    # Phase 2: Asset allocation targets
    if 'allocation_targets' not in data:
        data['allocation_targets'] = {
            'equity': 60, 'bond': 20, 'property': 10, 'cash': 5, 'crypto': 5
        }

    # Phase 2: Net worth snapshots
    if 'net_worth_history' not in data:
        data['net_worth_history'] = []

    # Phase 4: Mortgage & Debt Engine
    if 'mortgages' not in data:
        data['mortgages'] = []
    if 'debts_detailed' not in data:
        data['debts_detailed'] = []

    # Phase 3B: Disposals & Realised Gains
    if 'disposals' not in data:
        data['disposals'] = []
    if 'carried_losses' not in data:
        data['carried_losses'] = {}

    # Phase 3D: Allowance Tracking
    if 'allowances' not in data:
        data['allowances'] = {}

    # Phase 5: FIRE Settings
    if 'fire_settings' not in data:
        data['fire_settings'] = {
            'mode': 'custom',
            'lean_multiplier': 0.7,
            'fat_multiplier': 1.5,
            'safe_withdrawal_rate': 4.0,
            'include_state_pension': True,
            'state_pension_age': 67,
            'state_pension_annual': 11502,
        }

    # Stock Intelligence: research data store + watchlist
    if 'research_data' not in data:
        data['research_data'] = {}
    if 'watchlist' not in data:
        data['watchlist'] = []

    return data

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
        'chat_history': [],
        'user_categories': [
            {'id': f'cat_{i:03d}', 'name': c, 'icon': CATEGORY_ICONS.get(c, '📦'),
             'type': 'income' if c in ['Salary', 'Investment Return'] else 'expense',
             'budget_monthly': 0, 'archived': False, 'parent': None}
            for i, c in enumerate(CATEGORIES)
        ],
        'category_budgets': {},
        'global_settings': {
            'tax_residency': 'GB',
            'home_currency': 'GBP',
            'secondary_currency': 'INR',
            'display_currencies': ['GBP', 'USD', 'INR'],
            'tax_rate_preference': 'higher',
            'use_actual_spend_for_retirement': True,
            'spend_average_months': 3,
            'privacy_mode': False,
            'privacy_mask_names': False,
            'privacy_alias': '',
            'privacy_hide_banks': False,
            'privacy_hide_accounts': False,
        },
        'family_profiles': [
            {
                'id': 'primary',
                'name': 'Primary',
                'relationship': 'self',
                'tax_residency': 'GB',
                'tax_rate_preference': 'higher',
                'annual_income': 0,
                'notes': '',
            }
        ],
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

def _get_tax_year(dt):
    """Return UK tax year string e.g. '2024-25' for a given date."""
    if dt.month >= 4 and dt.day >= 6 or dt.month > 4:
        return f"{dt.year}-{str(dt.year+1)[-2:]}"
    return f"{dt.year-1}-{str(dt.year)[-2:]}"

def _calc_income_tax(annual_income, profile):
    """Calculate income tax breakdown for a given profile."""
    if annual_income <= 0:
        return {'gross': 0, 'tax_free': 0, 'total_tax': 0, 'net': 0, 'effective_rate': 0, 'marginal_rate': 0, 'bands': [], 'ni': 0}
    
    tax_free = profile.get('income_tax_free', 12570)
    bands = profile.get('income_bands', [])
    
    # UK personal allowance tapering: reduced by £1 for every £2 above £100k
    if profile.get('currency') == 'GBP' and annual_income > 100000:
        reduction = (annual_income - 100000) / 2
        tax_free = max(0, tax_free - reduction)
    
    taxable = max(0, annual_income - tax_free)
    remaining = taxable
    total_tax = 0
    band_results = []
    prev_limit = 0
    marginal_rate = 0
    
    for band in bands:
        limit = band.get('limit') or float('inf')
        band_width = limit - prev_limit
        taxed_in_band = min(remaining, band_width)
        tax_in_band = round(taxed_in_band * band['rate'], 2)
        if taxed_in_band > 0:
            band_results.append({
                'label': band['label'],
                'rate': band['rate'],
                'income_in_band': round(taxed_in_band, 2),
                'tax': tax_in_band,
            })
            marginal_rate = band['rate']
        total_tax += tax_in_band
        remaining -= taxed_in_band
        prev_limit = limit
        if remaining <= 0:
            break
    
    # National Insurance (UK only, simplified)
    ni = 0
    if profile.get('currency') == 'GBP':
        ni_threshold = 12570  # Primary threshold
        ni_upper = 50270
        if annual_income > ni_threshold:
            ni_lower = min(annual_income, ni_upper) - ni_threshold
            ni_upper_part = max(0, annual_income - ni_upper)
            ni = round(ni_lower * 0.08 + ni_upper_part * 0.02, 2)  # 2024/25 rates
    
    total_deductions = total_tax + ni
    net = round(annual_income - total_deductions, 2)
    effective_rate = round(total_deductions / annual_income * 100, 1) if annual_income > 0 else 0
    
    return {
        'gross': round(annual_income, 2),
        'tax_free': round(tax_free, 2),
        'total_tax': round(total_tax, 2),
        'ni': round(ni, 2),
        'total_deductions': round(total_deductions, 2),
        'net': net,
        'net_monthly': round(net / 12, 2),
        'effective_rate': effective_rate,
        'marginal_rate': round(marginal_rate * 100, 1),
        'bands': band_results,
    }

def _calc_allowances(data, tax_year, profile):
    """Calculate ISA, pension, and CGT allowance usage for the current tax year."""
    # Approximate ISA contributions from investment data
    isa_holdings = data.get('investments', {}).get('isa', [])
    isa_contribs = data.get('monthly_contributions', {}).get('isa', 0)
    
    # Estimate annual ISA contribution based on monthly
    isa_annual_est = isa_contribs * 12
    isa_limit = profile.get('isa_annual_limit', 20000)
    
    # Pension
    pension_contribs = data.get('monthly_contributions', {}).get('pension', 0)
    pension_annual_est = pension_contribs * 12
    pension_limit = profile.get('pension_annual_limit', 60000)
    
    # CGT used
    disposals = data.get('disposals', [])
    cgt_used = sum(max(0, d.get('gain_gbp', 0)) for d in disposals if d.get('tax_year') == tax_year)
    cgt_exempt = profile.get('cgt_annual_exempt', 3000)
    
    return {
        'tax_year': tax_year,
        'isa': {
            'used': round(isa_annual_est, 2),
            'limit': isa_limit,
            'remaining': round(max(0, isa_limit - isa_annual_est), 2),
            'pct_used': round(min(100, isa_annual_est / max(1, isa_limit) * 100), 1),
        },
        'pension': {
            'used': round(pension_annual_est, 2),
            'limit': pension_limit,
            'remaining': round(max(0, pension_limit - pension_annual_est), 2),
            'pct_used': round(min(100, pension_annual_est / max(1, pension_limit) * 100), 1),
        },
        'cgt_exempt': {
            'used': round(min(cgt_used, cgt_exempt), 2),
            'limit': cgt_exempt,
            'remaining': round(max(0, cgt_exempt - cgt_used), 2),
            'pct_used': round(min(100, cgt_used / max(1, cgt_exempt) * 100), 1),
        },
    }

def _calc_monthly_payment(mortgage):
    """Calculate monthly mortgage payment from mortgage dict."""
    balance = float(mortgage.get('current_balance', 0))
    rate_annual = float(mortgage.get('interest_rate', 0)) / 100
    term_years = int(mortgage.get('term_years', 25))
    overpay = float(mortgage.get('monthly_overpayment', 0))
    
    if mortgage.get('type') == 'interest_only':
        return round(balance * rate_annual / 12 + overpay, 2)
    
    if rate_annual <= 0 or term_years <= 0 or balance <= 0:
        return overpay
    
    r = rate_annual / 12
    n = term_years * 12
    payment = balance * (r * (1 + r)**n) / ((1 + r)**n - 1)
    return round(payment + overpay, 2)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for mobile app connectivity testing."""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_all_data():
  try:
    data = load_data()
    rates = get_exchange_rates()
    today = datetime.now().strftime('%Y-%m-%d')

    # Auto-snapshot net worth monthly
    _auto_snapshot_if_needed(data, rates)
    save_data(data)

    transactions = []
    has_structured_mortgages = len(data.get('mortgages', [])) > 0
    mortgage_categories = {'Rent/Mortgage'}
    
    for t in data['transactions']:
        tx = dict(t)
        currency = tx.get('currency', 'GBP')
        tx['amount_gbp'] = to_gbp(tx.get('amount', 0), currency, rates)
        tx['is_future'] = tx.get('date', '') > today
        # Tag mortgage transactions for frontend display
        tx['is_mortgage_txn'] = (has_structured_mortgages 
            and tx.get('category') in mortgage_categories 
            and tx.get('type') == 'debit')
        transactions.append(tx)
    transactions.sort(key=lambda x: x.get('date', ''), reverse=True)

    # Dynamic tax profile based on residency setting
    gs = data.get('global_settings', {})
    residency = gs.get('tax_residency', 'GB')
    tax_pref = gs.get('tax_rate_preference', 'higher')
    profile = TAX_PROFILES.get(residency, TAX_PROFILES['GB'])
    CGT_ANNUAL_EXEMPT = profile['cgt_annual_exempt']
    CGT_RATE_BASIC    = profile['cgt_rate_basic']
    CGT_RATE_HIGHER   = profile['cgt_rate_higher']
    CGT_RATE = CGT_RATE_HIGHER if tax_pref == 'higher' else CGT_RATE_BASIC

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

    # CGT calculation — split into unrealised (paper) and realised
    total_unrealised_gains = total_crypto_gain + total_rsu_gain + total_stocks_gain + total_custom_gain
    
    # Realised gains from disposals
    disposals = data.get('disposals', [])
    carried_losses = data.get('carried_losses', {})
    current_tax_year = _get_tax_year(datetime.now())
    realised_this_year = sum(d.get('gain_gbp', 0) for d in disposals if d.get('tax_year') == current_tax_year)
    losses_carried = sum(v for v in carried_losses.values() if v < 0)
    
    realised_after_losses = realised_this_year + losses_carried  # losses are negative
    realised_taxable = max(0, realised_after_losses - CGT_ANNUAL_EXEMPT)
    realised_cgt = round(realised_taxable * CGT_RATE, 2)
    
    # Paper CGT (if sold everything now)
    paper_taxable = max(0, total_unrealised_gains - CGT_ANNUAL_EXEMPT)
    paper_cgt = round(paper_taxable * CGT_RATE, 2)
    
    # Use paper CGT for net worth display (conservative) but show both
    cgt_liability = paper_cgt

    # Income tax calculation
    gs = data.get('global_settings', {})
    family_profiles = data.get('family_profiles', [])
    primary_income = 0
    for fp in family_profiles:
        if fp.get('relationship') == 'self' or fp.get('id') == 'primary':
            primary_income = float(fp.get('annual_income', 0))
            break
    if primary_income <= 0:
        primary_income = float(data.get('income', 0)) * 12  # Fallback to monthly * 12
    
    income_tax_calc = _calc_income_tax(primary_income, profile)
    
    # Allowance tracking
    allowances = _calc_allowances(data, current_tax_year, profile)

    total_investments = total_crypto_gbp + total_isa_gbp + total_rsu_gbp + total_stocks_gbp + total_pension_gbp + total_custom_gbp

    # Compute bank balances from connected accounts (TrueLayer/Plaid)
    connected_savings_current = 0
    connected_credit_cards = 0
    has_connected_accounts = False
    for acc in data.get('accounts', []):
        bal = float(acc.get('balance', 0))
        is_connected = bool(acc.get('tl_account_id') or acc.get('pl_account_id'))
        if bal == 0 and not is_connected:
            continue  # skip offline accounts with no balance
        acc_type = (acc.get('account_type', '') or '').lower()
        if is_connected:
            has_connected_accounts = True
            if acc_type in ('credit_card', 'credit card', 'credit'):
                connected_credit_cards += abs(bal)
            else:
                connected_savings_current += bal
    manual_savings = float(data.get('savings', 0))
    bank_balance = round(connected_savings_current + manual_savings, 2)
    true_balance = round(bank_balance - connected_credit_cards, 2)
    
    # Property value: manual entry + property values from mortgages (original principal as proxy)
    manual_property = float(data.get('property_value', 0))
    mortgage_property_values = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in data.get('mortgages', []))
    # If user has mortgages, the property value IS the mortgaged properties
    # The manual property_value field is for ADDITIONAL properties not tracked by mortgages
    property_value = manual_property + mortgage_property_values
    
    other_assets = data.get('other_assets', 0)
    
    # Compute total debts — structured sources are authoritative
    manual_debts = float(data.get('debts', 0))
    mortgage_balances = sum(float(m.get('current_balance', 0)) for m in data.get('mortgages', []))
    detailed_debt_balances = sum(float(d.get('balance', 0)) for d in data.get('debts_detailed', []))
    monthly_mortgage_payments = sum(
        _calc_monthly_payment(m) for m in data.get('mortgages', [])
    )
    monthly_debt_min_payments = sum(float(d.get('minimum_payment', 0)) for d in data.get('debts_detailed', []))
    
    # Structured debts take precedence; manual field is fallback only if no structured debts exist
    structured_debts = mortgage_balances + detailed_debt_balances
    total_debts = structured_debts if structured_debts > 0 else manual_debts
    
    # Use true_balance (savings/current minus credit cards) for net worth
    net_worth = round(true_balance + total_investments + property_value + other_assets - total_debts, 2)
    net_worth_after_cgt = round(net_worth - cgt_liability, 2)

    # Spending calculation — exclude mortgage-related transactions if mortgages are tracked structurally
    # to avoid double-counting in cash flow
    cutoff_30 = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    recent_spend = sum(t['amount_gbp'] for t in transactions
        if t.get('type') == 'debit' and cutoff_30 <= t.get('date', '') <= today
        and not t.get('is_mortgage_txn'))

    monthly_income = data.get('income', 0)
    avg_monthly_spend = recent_spend if recent_spend > 0 else data.get('monthly_fixed_expenses', 0)

    # Include structured debt payments in forecast outflows
    monthly_mortgage_pmts = sum(_calc_monthly_payment(m) for m in data.get('mortgages', []))
    monthly_debt_pmts = sum(float(d.get('minimum_payment', 0)) for d in data.get('debts_detailed', []))

    future_txns = [t for t in transactions if t.get('is_future')]
    forecast = []
    balance = bank_balance
    # Track mortgage balance amortisation over forecast period
    mort_balances = [float(m.get('current_balance', 0)) for m in data.get('mortgages', [])]
    debt_balances = [float(d.get('balance', 0)) for d in data.get('debts_detailed', [])]
    
    for i in range(1, 13):
        month_dt = datetime.now() + timedelta(days=30 * i)
        month_key = month_dt.strftime('%Y-%m')
        scheduled_in = sum(t['amount_gbp'] for t in future_txns
            if t.get('date', '').startswith(month_key) and t.get('type') == 'credit')
        scheduled_out = sum(t['amount_gbp'] for t in future_txns
            if t.get('date', '').startswith(month_key) and t.get('type') == 'debit')
        
        # Amortise mortgage balances (reduce by principal portion each month)
        mort_interest = 0
        mort_principal = 0
        for idx, m in enumerate(data.get('mortgages', [])):
            if mort_balances[idx] <= 0:
                continue
            rate_m = float(m.get('interest_rate', 0)) / 100 / 12
            int_portion = mort_balances[idx] * rate_m
            payment = _calc_monthly_payment(m)
            princ_portion = min(payment - int_portion, mort_balances[idx])
            mort_balances[idx] = max(0, mort_balances[idx] - princ_portion)
            mort_interest += int_portion
            mort_principal += princ_portion
        
        # Amortise detailed debts
        debt_interest = 0
        for idx, d in enumerate(data.get('debts_detailed', [])):
            if debt_balances[idx] <= 0:
                continue
            rate_m = float(d.get('interest_rate', 0)) / 100 / 12
            int_portion = debt_balances[idx] * rate_m
            payment = float(d.get('minimum_payment', 0))
            princ_portion = min(max(0, payment - int_portion), debt_balances[idx])
            debt_balances[idx] = max(0, debt_balances[idx] - princ_portion)
            debt_interest += int_portion
        
        total_debt_payments = monthly_mortgage_pmts + monthly_debt_pmts
        # Cash forecast: income + scheduled_in - avg_spend - scheduled_out - debt_payments
        # NOTE: Monthly investment contributions are NOT deducted here.
        # They exist only for retirement/Monte Carlo growth projection.
        # Actual cash outflows for investments should be added as scheduled transactions.
        balance = round(balance + monthly_income + scheduled_in - avg_monthly_spend - scheduled_out - total_debt_payments, 2)
        
        forecast.append({
            'month': month_dt.strftime('%b %Y'),
            'balance': balance,
            'scheduled_in': round(scheduled_in, 2),
            'scheduled_out': round(scheduled_out, 2),
            'debt_payments': round(total_debt_payments, 2),
            'mortgage_remaining': round(sum(mort_balances), 2),
            'debt_remaining': round(sum(debt_balances), 2),
        })

    categories = {}
    for t in transactions:
        if t.get('type') == 'debit' and not t.get('is_future'):
            # Skip mortgage transactions when tracked in Mortgage tab
            if has_structured_mortgages and t.get('category') in mortgage_categories:
                continue
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
                # Skip mortgage-category transactions when tracked in Mortgage tab
                if has_structured_mortgages and t.get('category') in mortgage_categories:
                    continue
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
            'connected_savings_current': round(connected_savings_current, 2),
            'connected_credit_cards': round(connected_credit_cards, 2),
            'true_balance': true_balance,
            'has_connected_accounts': has_connected_accounts,
            'manual_savings': round(manual_savings, 2),
            'property_value': round(property_value, 2),
            'property_manual': round(manual_property, 2),
            'property_from_mortgages': round(mortgage_property_values, 2),
            'other_assets': other_assets,
            'debts': round(total_debts, 2),
            'debts_manual': round(manual_debts, 2),
            'mortgage_total': round(mortgage_balances, 2),
            'debts_detailed_total': round(detailed_debt_balances, 2),
            'monthly_mortgage_payments': round(monthly_mortgage_payments, 2),
            'monthly_debt_min_payments': round(monthly_debt_min_payments, 2),
            'monthly_all_debt_payments': round(monthly_mortgage_payments + monthly_debt_min_payments, 2),
            'has_structured_mortgages': has_structured_mortgages,
            'net_worth': net_worth,
            'net_worth_after_cgt': net_worth_after_cgt,
            'cgt_liability': cgt_liability,
            'cgt_liability_realised': realised_cgt,
            'cgt_liability_paper': paper_cgt,
            'taxable_gains': round(total_unrealised_gains, 2),
            'realised_gains_this_year': round(realised_this_year, 2),
            'carried_losses': round(losses_carried, 2),
            'cgt_exempt_amount': CGT_ANNUAL_EXEMPT,
            'cgt_rate': CGT_RATE,
            'monthly_spend': round(recent_spend, 2),
        'spend_3m_avg': round(sum(t['amount_gbp'] for t in transactions if t.get('type')=='debit' and not t.get('is_future') and t.get('date','') >= (datetime.now()-timedelta(days=90)).strftime('%Y-%m-%d')) / 3, 2) if any(t.get('type')=='debit' for t in transactions) else 0,
        'spend_6m_avg': round(sum(t['amount_gbp'] for t in transactions if t.get('type')=='debit' and not t.get('is_future') and t.get('date','') >= (datetime.now()-timedelta(days=180)).strftime('%Y-%m-%d')) / 6, 2) if any(t.get('type')=='debit' for t in transactions) else 0,
            'monthly_income': monthly_income,
            'total_assets': round(bank_balance + total_investments + property_value + other_assets, 2),
        },
        'forecast': forecast,
        'monthly_contributions': data.get('monthly_contributions', {}),
        'retirement': data.get('retirement', {}),
        'categories': categories,
        'monthly_trend': monthly_trend,
        'exchange_rates': rates,
        'categories_list': [c['name'] for c in data.get('user_categories', []) if not c.get('archived')],
        'user_categories': data.get('user_categories', []),
        'category_budgets': data.get('category_budgets', {}),
        'global_settings': data.get('global_settings', {}),
        'tax_profile': {
            'code': residency,
            'name': profile['name'],
            'flag': profile['flag'],
            'currency': profile['currency'],
            'symbol': profile['symbol'],
            'cgt_annual_exempt': CGT_ANNUAL_EXEMPT,
            'cgt_rate_basic': CGT_RATE_BASIC,
            'cgt_rate_higher': CGT_RATE_HIGHER,
            'cgt_rate_used': CGT_RATE,
            'pension_label': profile['pension_label'],
            'pension_tax_note': profile['pension_tax_note'],
            'isa_label': profile['isa_label'],
            'isa_annual_limit': profile['isa_annual_limit'],
            'isa_note': profile['isa_note'],
            'pension_annual_limit': profile['pension_annual_limit'],
            'has_cgt_exempt': profile['has_cgt_exempt'],
            'notes': profile['notes'],
            'income_bands': profile['income_bands'],
        },
        'available_profiles': {k: {'name': v['name'], 'flag': v['flag'], 'currency': v['currency'], 'symbol': v['symbol']} for k, v in TAX_PROFILES.items()},
        'available_currencies': CURRENCIES,
        'family_profiles': data.get('family_profiles', []),
        'all_tax_profiles': {k: {'cgt_rate_basic': v['cgt_rate_basic'], 'cgt_rate_higher': v['cgt_rate_higher'], 'cgt_annual_exempt': v['cgt_annual_exempt']} for k, v in TAX_PROFILES.items()},
        'allocation_targets': data.get('allocation_targets', {}),
        'net_worth_history': data.get('net_worth_history', []),
        'mortgages': data.get('mortgages', []),
        'debts_detailed': data.get('debts_detailed', []),
        'disposals': data.get('disposals', []),
        'carried_losses': data.get('carried_losses', {}),
        'income_tax': income_tax_calc,
        'allowances': allowances,
        'fire_settings': data.get('fire_settings', {}),
    })
  except Exception as e:
    import traceback
    traceback.print_exc()
    return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

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

@app.route('/api/accounts/<acc_id>/transactions', methods=['DELETE'])
def delete_account_transactions(acc_id):
    """Delete all transactions for a given account."""
    data = load_data()
    before = len(data['transactions'])
    data['transactions'] = [t for t in data['transactions'] if t.get('account_id') != acc_id]
    after = len(data['transactions'])
    save_data(data)
    return jsonify({'ok': True, 'deleted': before - after})

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

    msg = get_anthropic_client().messages.create(
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


@app.route('/api/import/emma', methods=['POST'])
def import_emma_csv():
    """Import Emma app CSV export (transactions, spending data)."""
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
        return _import_emma(data, rows, headers, content_str)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolio/import', methods=['POST'])
def import_portfolio():
    """Import Trading 212, Emma, or any broker portfolio CSV into ISA holdings.
    
    Trading 212: Only imports ACTIVE holdings (shares > 0), ignores sold/closed positions.
    Emma: Parses Emma's export format (accounts, transactions, or portfolio).
    """
    data = load_data()
    file = request.files.get('file')
    source_type = request.form.get('source', 'auto')  # 'auto', 't212', 'emma', 'generic'
    target_bucket = request.form.get('bucket', 'isa')
    if target_bucket not in ('isa', 'stocks', 'rsu', 'crypto', 'pension', 'custom'):
        target_bucket = 'isa'
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
        headers_lower = [h.lower().strip() for h in headers]

        # ── Auto-detect source format ─────────────────────────────────────
        is_emma = any(h in headers_lower for h in ['emma category', 'emma account', 'original description', 'provider'])
        is_t212 = any(h in headers_lower for h in ['ticker', 'shares', 'average price', 'current price'])
        
        if source_type == 'auto':
            source_type = 'emma' if is_emma else ('t212' if is_t212 else 'generic')

        # ── Emma CSV Import ───────────────────────────────────────────────
        if source_type == 'emma':
            return _import_emma(data, rows, headers, content_str)

        # ── Trading 212 / Generic Portfolio Import ────────────────────────
        holdings = []
        for row in rows:
            try:
                ticker = (row.get('Ticker') or row.get('Symbol') or row.get('ISIN') or '').strip()
                name = (row.get('Name') or row.get('Instrument') or row.get('Security') or ticker).strip()
                shares = float((row.get('Shares') or row.get('Quantity') or row.get('Units') or '0').replace(',','') or 0)
                
                # ── CRITICAL: Skip sold/closed positions (shares <= 0) ────
                if shares <= 0:
                    continue

                avg_price = float((row.get('Average price') or row.get('Avg. price') or row.get('Cost price') or '0').replace(',','') or 0)
                curr_price = float((row.get('Current price') or row.get('Market price') or row.get('Price') or str(avg_price)).replace(',','') or avg_price)
                curr_value = float((row.get('Current value') or row.get('Market value') or row.get('Value') or str(shares * curr_price)).replace(',','') or shares * curr_price)
                invested = float((row.get('Invested') or row.get('Cost basis') or row.get('Book cost') or str(shares * avg_price)).replace(',','') or shares * avg_price)
                result = float((row.get('Result') or row.get('P&L') or row.get('Gain/Loss') or str(curr_value - invested)).replace(',','') or curr_value - invested)
                currency = (row.get('Currency') or row.get('CCY') or 'GBP').strip()

                if (ticker or name):
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
            msg = get_anthropic_client().messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=4000,
                messages=[{'role': 'user', 'content': f"""Parse this investment portfolio CSV into JSON array.
IMPORTANT: Only include rows where shares/quantity is GREATER than 0. Skip any sold or closed positions.
Headers: {headers}
Data: {json.dumps(rows[:30])}
Return JSON array where each item has: ticker, name, shares (number), avg_price (number), current_price (number), current_value (number), invested (number), gain_loss (number), currency.
Return ONLY valid JSON array."""}]
            )
            text = msg.content[0].text.strip().strip('```json').strip('```').strip()
            holdings = json.loads(text)
            # Filter out zero/negative shares from Claude's output too
            holdings = [h for h in holdings if float(h.get('shares', 0)) > 0]
            for h in holdings:
                h['id'] = str(uuid.uuid4())
                h['source'] = 'import'

        if not data.get('investments'):
            data['investments'] = {'isa': [], 'crypto': []}
        if target_bucket not in data['investments']:
            data['investments'][target_bucket] = []

        added = updated = skipped = 0
        for h in holdings:
            found = False
            for i, existing in enumerate(data['investments'][target_bucket]):
                if existing.get('ticker') == h.get('ticker'):
                    data['investments'][target_bucket][i] = h
                    updated += 1
                    found = True
                    break
            if not found:
                data['investments'][target_bucket].append(h)
                added += 1

        save_data(data)
        return jsonify({'added': added, 'updated': updated, 'skipped': skipped, 'total': len(data['investments'][target_bucket]), 'bucket': target_bucket})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _import_emma(data, rows, headers, content_str):
    """Parse Emma app CSV export into transactions.
    
    Emma exports can have various formats:
    - Transactions: Date, Description, Amount, Category, Account, etc.
    - Sometimes: 'Original Description', 'Emma Category', 'Provider', etc.
    """
    headers_lower = [h.lower().strip() for h in headers]
    today = datetime.now().strftime('%Y-%m-%d')
    new_txns = []
    
    # Try to identify column mappings flexibly
    def find_col(possibilities):
        for p in possibilities:
            for h in headers:
                if p.lower() in h.lower():
                    return h
        return None
    
    date_col = find_col(['date', 'transaction date', 'created'])
    desc_col = find_col(['description', 'original description', 'merchant', 'name', 'payee'])
    amount_col = find_col(['amount', 'value', 'total'])
    category_col = find_col(['emma category', 'category', 'type'])
    account_col = find_col(['emma account', 'account', 'bank', 'provider'])
    currency_col = find_col(['currency', 'ccy'])
    notes_col = find_col(['notes', 'memo', 'reference'])
    
    if not date_col or not amount_col:
        # Fall back to Claude parsing for unusual formats
        msg = get_anthropic_client().messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=8000,
            messages=[{'role': 'user', 'content': f"""Parse these Emma app transactions into JSON array.
Each item: date (YYYY-MM-DD), description (string), amount (positive number), type ("debit" or "credit"), category (pick from: {', '.join(CATEGORIES)}).
Headers: {headers}
Data: {json.dumps(rows[:50], indent=2)}
Return ONLY a JSON array."""}]
        )
        try:
            text = msg.content[0].text.strip()
            if text.startswith('```'):
                text = '\n'.join(text.split('\n')[1:])
                text = text.rsplit('```', 1)[0]
            parsed = json.loads(text)
            for t in parsed:
                txn_date = t.get('date', '')
                new_txns.append({
                    'id': str(uuid.uuid4()),
                    'date': txn_date,
                    'description': t.get('description', ''),
                    'amount': abs(float(t.get('amount', 0))),
                    'type': t.get('type', 'debit'),
                    'category': t.get('category', 'Other'),
                    'currency': 'GBP',
                    'account_id': '',
                    'bank': 'Emma Import',
                    'notes': '',
                    'is_scheduled': txn_date > today,
                    'source': 'emma'
                })
        except Exception as e:
            return jsonify({'error': f'Could not parse Emma CSV: {str(e)}'}), 500
    else:
        # Direct parsing
        for row in rows:
            try:
                raw_date = (row.get(date_col, '') or '').strip()
                raw_amount = (row.get(amount_col, '') or '0').strip()
                description = (row.get(desc_col, '') or 'Unknown').strip() if desc_col else 'Unknown'
                category_raw = (row.get(category_col, '') or 'Other').strip() if category_col else 'Other'
                account = (row.get(account_col, '') or '').strip() if account_col else ''
                currency = (row.get(currency_col, '') or 'GBP').strip() if currency_col else 'GBP'
                notes = (row.get(notes_col, '') or '').strip() if notes_col else ''
                
                # Parse date (handle various formats)
                txn_date = ''
                for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y-%m-%dT%H:%M:%S', '%d %b %Y', '%d %B %Y']:
                    try:
                        txn_date = datetime.strptime(raw_date[:10], fmt).strftime('%Y-%m-%d')
                        break
                    except:
                        continue
                if not txn_date:
                    try:
                        # Try longer datetime formats
                        txn_date = datetime.strptime(raw_date[:19], '%Y-%m-%dT%H:%M:%S').strftime('%Y-%m-%d')
                    except:
                        continue  # Skip rows with unparseable dates
                
                # Parse amount — handle negative amounts
                raw_amount = raw_amount.replace(',', '').replace('£', '').replace('$', '').replace('€', '').replace('₹', '')
                amount = float(raw_amount)
                txn_type = 'credit' if amount > 0 else 'debit'
                amount = abs(amount)
                
                if amount == 0:
                    continue  # Skip zero-amount rows
                
                # Map Emma categories to our categories
                emma_cat_map = {
                    'eating out': 'Food & Dining', 'restaurants': 'Food & Dining',
                    'groceries': 'Food & Dining', 'food': 'Food & Dining',
                    'transport': 'Transport', 'travel': 'Travel',
                    'shopping': 'Shopping', 'clothing': 'Shopping',
                    'entertainment': 'Entertainment', 'subscriptions': 'Subscriptions',
                    'bills': 'Bills & Utilities', 'utilities': 'Bills & Utilities',
                    'health': 'Health & Fitness', 'fitness': 'Health & Fitness',
                    'rent': 'Rent/Mortgage', 'mortgage': 'Rent/Mortgage', 'housing': 'Rent/Mortgage',
                    'salary': 'Salary', 'income': 'Salary', 'wages': 'Salary',
                    'transfer': 'Transfer', 'savings': 'Transfer',
                    'education': 'Education', 'personal care': 'Personal Care',
                    'gifts': 'Gifts & Donations', 'charity': 'Gifts & Donations',
                    'general': 'Other', 'cash': 'Other', 'atm': 'Other',
                }
                category = 'Other'
                cat_lower = category_raw.lower()
                for k, v in emma_cat_map.items():
                    if k in cat_lower:
                        category = v
                        break
                
                new_txns.append({
                    'id': str(uuid.uuid4()),
                    'date': txn_date,
                    'description': description,
                    'amount': round(amount, 2),
                    'type': txn_type,
                    'category': category,
                    'currency': currency if currency in ['GBP', 'USD', 'EUR', 'INR'] else 'GBP',
                    'account_id': '',
                    'bank': account or 'Emma Import',
                    'notes': notes,
                    'is_scheduled': txn_date > today,
                    'source': 'emma'
                })
            except Exception:
                continue
    
    if not new_txns:
        return jsonify({'error': 'No transactions found in Emma CSV. Check format.'}), 400
    
    data['transactions'].extend(new_txns)
    save_data(data)
    return jsonify({'added': len(new_txns), 'total': len(data['transactions']), 'source': 'emma'})


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


@app.route('/api/recurring/<rule_id>', methods=['PUT'])
def update_recurring(rule_id):
    """Update a recurring rule and regenerate all its future transactions."""
    data = load_data()
    body = request.json
    
    rule = None
    for r in data.get('recurring', []):
        if r['id'] == rule_id:
            rule = r
            break
    
    if not rule:
        return jsonify({'error': 'Recurring rule not found'}), 404
    
    # Update rule fields
    if 'amount' in body: rule['amount'] = body['amount']
    if 'description' in body: rule['description'] = body['description']
    if 'category' in body: rule['category'] = body['category']
    if 'type' in body: rule['type'] = body['type']
    if 'frequency' in body: rule['frequency'] = body['frequency']
    if 'end_date' in body: rule['end_date'] = body['end_date']
    if 'currency' in body: rule['currency'] = body['currency']
    
    # Regenerate all future transactions for this rule (removes old ones, creates new)
    _generate_recurring_transactions(data, rule)
    save_data(data)
    
    return jsonify({'ok': True, 'rule': rule})


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
    if 'global_settings' in body:
        if not data.get('global_settings'):
            data['global_settings'] = {}
        data['global_settings'].update(body['global_settings'])
    if 'family_profiles' in body:
        data['family_profiles'] = body['family_profiles']
    if 'user_categories' in body:
        data['user_categories'] = body['user_categories']
    if 'category_budgets' in body:
        data['category_budgets'] = body['category_budgets']
    save_data(data)
    return jsonify({'ok': True})


# ─── Category Management ──────────────────────────────────────────────────────

@app.route('/api/categories', methods=['GET'])
def get_categories():
    data = load_data()
    return jsonify(data.get('user_categories', []))

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = load_data()
    body = request.json
    cats = data.get('user_categories', [])
    new_cat = {
        'id': f'cat_{uuid.uuid4().hex[:8]}',
        'name': body.get('name', 'New Category').strip(),
        'icon': body.get('icon', '📦'),
        'type': body.get('type', 'expense'),
        'budget_monthly': float(body.get('budget_monthly', 0)),
        'archived': False,
        'parent': body.get('parent', None),
    }
    # Prevent duplicate names
    existing_names = {c['name'].lower() for c in cats}
    if new_cat['name'].lower() in existing_names:
        return jsonify({'error': 'Category already exists'}), 400
    cats.append(new_cat)
    data['user_categories'] = cats
    save_data(data)
    return jsonify(new_cat)

@app.route('/api/categories/<cat_id>', methods=['PUT'])
def update_category(cat_id):
    data = load_data()
    body = request.json
    cats = data.get('user_categories', [])
    for c in cats:
        if c['id'] == cat_id:
            if 'name' in body:
                old_name = c['name']
                new_name = body['name'].strip()
                c['name'] = new_name
                # Rename in all transactions
                for t in data['transactions']:
                    if t.get('category') == old_name:
                        t['category'] = new_name
            if 'icon' in body:
                c['icon'] = body['icon']
            if 'type' in body:
                c['type'] = body['type']
            if 'budget_monthly' in body:
                c['budget_monthly'] = float(body['budget_monthly'])
            if 'archived' in body:
                c['archived'] = body['archived']
            data['user_categories'] = cats
            save_data(data)
            return jsonify(c)
    return jsonify({'error': 'Category not found'}), 404

@app.route('/api/categories/<cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    data = load_data()
    cats = data.get('user_categories', [])
    cat = next((c for c in cats if c['id'] == cat_id), None)
    if not cat:
        return jsonify({'error': 'Category not found'}), 404
    # Reassign transactions to 'Other'
    cat_name = cat['name']
    for t in data['transactions']:
        if t.get('category') == cat_name:
            t['category'] = 'Other'
    data['user_categories'] = [c for c in cats if c['id'] != cat_id]
    save_data(data)
    return jsonify({'ok': True, 'reassigned_to': 'Other'})

@app.route('/api/categories/merge', methods=['POST'])
def merge_categories():
    """Merge source category into target, reassigning all transactions."""
    data = load_data()
    body = request.json
    source_id = body.get('source_id')
    target_id = body.get('target_id')
    cats = data.get('user_categories', [])
    source = next((c for c in cats if c['id'] == source_id), None)
    target = next((c for c in cats if c['id'] == target_id), None)
    if not source or not target:
        return jsonify({'error': 'Category not found'}), 404
    if source_id == target_id:
        return jsonify({'error': 'Cannot merge category into itself'}), 400
    # Reassign transactions
    count = 0
    for t in data['transactions']:
        if t.get('category') == source['name']:
            t['category'] = target['name']
            count += 1
    # Archive the source
    source['archived'] = True
    save_data(data)
    return jsonify({'ok': True, 'merged': count, 'source': source['name'], 'target': target['name']})

@app.route('/api/categories/bulk-reassign', methods=['POST'])
def bulk_reassign_category():
    """Reassign multiple transactions to a new category."""
    data = load_data()
    body = request.json
    txn_ids = body.get('transaction_ids', [])
    new_category = body.get('category', 'Other')
    count = 0
    for t in data['transactions']:
        if t.get('id') in txn_ids:
            t['category'] = new_category
            count += 1
    save_data(data)
    return jsonify({'ok': True, 'updated': count})

@app.route('/api/spending/analytics', methods=['GET'])
def spending_analytics():
    """Enhanced spending analytics: rolling averages, lifestyle creep, subscription detection, etc."""
    data = load_data()
    rates = get_exchange_rates()
    today = datetime.now().strftime('%Y-%m-%d')
    
    transactions = []
    has_structured_mortgages = len(data.get('mortgages', [])) > 0
    mortgage_categories = {'Rent/Mortgage'}
    for t in data['transactions']:
        tx = dict(t)
        tx['amount_gbp'] = to_gbp(tx.get('amount', 0), tx.get('currency', 'GBP'), rates)
        tx['is_future'] = tx.get('date', '') > today
        # Skip mortgage-category transactions when mortgages are tracked in Mortgage tab
        tx['is_mortgage_txn'] = has_structured_mortgages and tx.get('category') in mortgage_categories and tx.get('type') == 'debit'
        if not tx['is_future']:
            transactions.append(tx)
    
    # Group by month — exclude mortgage transactions from spend analysis if tracked structurally
    from collections import defaultdict
    monthly_spend = defaultdict(float)
    monthly_income = defaultdict(float)
    monthly_cat_spend = defaultdict(lambda: defaultdict(float))
    
    for t in transactions:
        month = t.get('date', '')[:7]
        if not month:
            continue
        if t.get('type') == 'debit' and not t.get('is_mortgage_txn'):
            monthly_spend[month] += t['amount_gbp']
            monthly_cat_spend[month][t.get('category', 'Other')] += t['amount_gbp']
        elif t.get('type') == 'credit':
            monthly_income[month] += t['amount_gbp']
    
    sorted_months = sorted(monthly_spend.keys())
    
    # Rolling averages
    def rolling_avg(data_dict, months, window):
        result = {}
        for i, m in enumerate(months):
            start = max(0, i - window + 1)
            window_months = months[start:i+1]
            vals = [data_dict.get(wm, 0) for wm in window_months]
            result[m] = round(sum(vals) / len(vals), 2) if vals else 0
        return result
    
    spend_3m_avg = rolling_avg(monthly_spend, sorted_months, 3)
    spend_6m_avg = rolling_avg(monthly_spend, sorted_months, 6)
    
    # Savings rate trend
    savings_rate_trend = {}
    for m in sorted_months:
        inc = monthly_income.get(m, 0)
        sp = monthly_spend.get(m, 0)
        savings_rate_trend[m] = round(((inc - sp) / inc * 100) if inc > 0 else 0, 1)
    
    # Lifestyle creep: compare avg spend last 3 months vs same period last year
    now = datetime.now()
    recent_3m = [(now - timedelta(days=30*i)).strftime('%Y-%m') for i in range(3)]
    year_ago_3m = [(now - timedelta(days=365+30*i)).strftime('%Y-%m') for i in range(3)]
    recent_avg = sum(monthly_spend.get(m, 0) for m in recent_3m) / max(1, sum(1 for m in recent_3m if m in monthly_spend))
    year_ago_avg = sum(monthly_spend.get(m, 0) for m in year_ago_3m) / max(1, sum(1 for m in year_ago_3m if m in monthly_spend))
    lifestyle_creep = {
        'recent_avg': round(recent_avg, 2),
        'year_ago_avg': round(year_ago_avg, 2),
        'change_pct': round(((recent_avg - year_ago_avg) / year_ago_avg * 100) if year_ago_avg > 0 else 0, 1),
        'detected': recent_avg > year_ago_avg * 1.05 and year_ago_avg > 0,
    }
    
    # Subscription detection: recurring debits with similar description + amount
    from collections import Counter
    debit_sigs = defaultdict(list)
    for t in transactions:
        if t.get('type') != 'debit':
            continue
        # Normalise description for matching
        desc = t.get('description', '').lower().strip()
        amt = round(t.get('amount_gbp', 0), 0)
        key = f"{desc}|{amt}"
        debit_sigs[key].append(t.get('date', ''))
    
    subscriptions = []
    for key, dates in debit_sigs.items():
        if len(dates) >= 2:
            desc, amt = key.rsplit('|', 1)
            # Check if roughly monthly (25-35 day gaps)
            sorted_dates = sorted(dates)
            gaps = []
            for i in range(1, len(sorted_dates)):
                try:
                    d1 = datetime.strptime(sorted_dates[i-1], '%Y-%m-%d')
                    d2 = datetime.strptime(sorted_dates[i], '%Y-%m-%d')
                    gaps.append((d2 - d1).days)
                except:
                    pass
            if gaps:
                avg_gap = sum(gaps) / len(gaps)
                if 20 <= avg_gap <= 40:
                    freq = 'monthly'
                elif 80 <= avg_gap <= 100:
                    freq = 'quarterly'
                elif 350 <= avg_gap <= 380:
                    freq = 'annual'
                else:
                    freq = None
                if freq:
                    subscriptions.append({
                        'description': desc.title(),
                        'amount_gbp': float(amt),
                        'frequency': freq,
                        'occurrences': len(dates),
                        'last_date': sorted_dates[-1],
                    })
    
    subscriptions.sort(key=lambda x: -x['amount_gbp'])
    
    # Spending spike detection: months where any category > 2× its average
    spikes = []
    all_cats = set()
    for m_data in monthly_cat_spend.values():
        all_cats.update(m_data.keys())
    
    for cat in all_cats:
        cat_vals = [monthly_cat_spend[m].get(cat, 0) for m in sorted_months if m in monthly_cat_spend]
        if len(cat_vals) < 3:
            continue
        avg = sum(cat_vals) / len(cat_vals)
        if avg <= 0:
            continue
        for m in sorted_months[-6:]:  # Check last 6 months
            val = monthly_cat_spend[m].get(cat, 0)
            if val > avg * 2 and val > 50:  # Must be >2× average and >£50
                spikes.append({
                    'month': m,
                    'category': cat,
                    'amount': round(val, 2),
                    'average': round(avg, 2),
                    'multiplier': round(val / avg, 1),
                })
    
    spikes.sort(key=lambda x: -x['multiplier'])
    
    # Fixed vs variable split
    recurring_ids = {r['id'] for r in data.get('recurring_rules', [])}
    recurring_cats = {'Rent/Mortgage', 'Bills & Utilities', 'Subscriptions'}
    fixed_spend = 0
    variable_spend = 0
    for t in transactions:
        if t.get('type') != 'debit':
            continue
        month = t.get('date', '')[:7]
        if month not in recent_3m:
            continue
        if t.get('category') in recurring_cats or t.get('recurring_rule_id'):
            fixed_spend += t['amount_gbp']
        else:
            variable_spend += t['amount_gbp']
    
    months_count = max(1, sum(1 for m in recent_3m if m in monthly_spend))
    
    # Budget tracking
    user_cats = data.get('user_categories', [])
    budgets = {}
    for cat in user_cats:
        if cat.get('budget_monthly', 0) > 0 and not cat.get('archived'):
            spent = sum(monthly_cat_spend[m].get(cat['name'], 0) for m in recent_3m) / months_count
            budgets[cat['name']] = {
                'budget': cat['budget_monthly'],
                'spent_avg': round(spent, 2),
                'pct': round(spent / cat['budget_monthly'] * 100, 1) if cat['budget_monthly'] > 0 else 0,
                'over': spent > cat['budget_monthly'],
            }
    
    return jsonify({
        'monthly_spend': {m: round(v, 2) for m, v in monthly_spend.items()},
        'monthly_income': {m: round(v, 2) for m, v in monthly_income.items()},
        'spend_3m_rolling': spend_3m_avg,
        'spend_6m_rolling': spend_6m_avg,
        'savings_rate_trend': savings_rate_trend,
        'lifestyle_creep': lifestyle_creep,
        'subscriptions_detected': subscriptions[:20],
        'spending_spikes': spikes[:10],
        'fixed_vs_variable': {
            'fixed_monthly': round(fixed_spend / months_count, 2),
            'variable_monthly': round(variable_spend / months_count, 2),
            'fixed_pct': round(fixed_spend / max(1, fixed_spend + variable_spend) * 100, 1),
        },
        'category_budgets': budgets,
        'monthly_category_spend': {m: {k: round(v, 2) for k, v in cats.items()} for m, cats in monthly_cat_spend.items()},
    })

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


# ─── Bulk Investment Operations (Phase 2A) ────────────────────────────────────

@app.route('/api/investments/bulk-delete', methods=['POST'])
def bulk_delete_investments():
    """Delete multiple investments by type and IDs."""
    data = load_data()
    body = request.json
    inv_type = body.get('type', '')
    ids = set(body.get('ids', []))
    delete_all = body.get('delete_all', False)

    if inv_type not in data.get('investments', {}):
        return jsonify({'error': f'Unknown investment type: {inv_type}'}), 400

    before = len(data['investments'][inv_type])
    if delete_all:
        data['investments'][inv_type] = []
    else:
        data['investments'][inv_type] = [
            h for h in data['investments'][inv_type] if h.get('id') not in ids
        ]
    after = len(data['investments'][inv_type])
    save_data(data)
    return jsonify({'ok': True, 'deleted': before - after})

@app.route('/api/investments/<inv_type>/<entry_id>', methods=['PUT'])
def update_investment(inv_type, entry_id):
    """Update a single investment holding's fields (allocation, dividends, etc.)."""
    data = load_data()
    body = request.json
    holdings = data.get('investments', {}).get(inv_type, [])
    for h in holdings:
        if h.get('id') == entry_id:
            for key in ['asset_class', 'geography', 'sector', 'purchase_date',
                        'dividend_yield_pct', 'name', 'monthly_contribution']:
                if key in body:
                    h[key] = body[key]
            if 'dividends' in body:
                h['dividends'] = body['dividends']
            save_data(data)
            return jsonify({'ok': True, 'holding': h})
    return jsonify({'error': 'Holding not found'}), 404


# ─── Dividend Tracking (Phase 2D) ─────────────────────────────────────────────

@app.route('/api/investments/<inv_type>/<entry_id>/dividends', methods=['POST'])
def add_dividend(inv_type, entry_id):
    """Add a dividend payment to a holding."""
    data = load_data()
    body = request.json
    holdings = data.get('investments', {}).get(inv_type, [])
    for h in holdings:
        if h.get('id') == entry_id:
            if 'dividends' not in h:
                h['dividends'] = []
            div_entry = {
                'id': str(uuid.uuid4()),
                'date': body.get('date', datetime.now().strftime('%Y-%m-%d')),
                'amount_gbp': float(body.get('amount_gbp', 0)),
                'notes': body.get('notes', ''),
            }
            h['dividends'].append(div_entry)
            save_data(data)
            return jsonify({'ok': True, 'dividend': div_entry})
    return jsonify({'error': 'Holding not found'}), 404


# ─── Allocation Targets (Phase 2C) ────────────────────────────────────────────

@app.route('/api/allocation-targets', methods=['GET'])
def get_allocation_targets():
    data = load_data()
    return jsonify(data.get('allocation_targets', {}))

@app.route('/api/allocation-targets', methods=['POST'])
def update_allocation_targets():
    data = load_data()
    data['allocation_targets'] = request.json
    save_data(data)
    return jsonify({'ok': True})


# ─── Net Worth Snapshots (Phase 2A) ───────────────────────────────────────────

@app.route('/api/networth/snapshot', methods=['POST'])
def take_nw_snapshot():
    """Manually trigger a net worth snapshot."""
    data = load_data()
    rates = get_exchange_rates()
    snapshot = _build_nw_snapshot(data, rates)
    if 'net_worth_history' not in data:
        data['net_worth_history'] = []
    # Don't duplicate if same month already exists
    month_key = snapshot['date'][:7]
    data['net_worth_history'] = [s for s in data['net_worth_history'] if s['date'][:7] != month_key]
    data['net_worth_history'].append(snapshot)
    data['net_worth_history'].sort(key=lambda s: s['date'])
    save_data(data)
    return jsonify({'ok': True, 'snapshot': snapshot})

@app.route('/api/networth/history', methods=['GET'])
def get_nw_history():
    data = load_data()
    return jsonify(data.get('net_worth_history', []))

def _build_nw_snapshot(data, rates):
    """Build a point-in-time net worth snapshot."""
    inv = data.get('investments', {})
    isa_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('isa', []))
    pension_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('pension', []))
    rsu_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('rsu', []))
    stocks_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('stocks', []))
    crypto_total = sum(to_gbp(float(c.get('value_usd', 0) or 0), 'USD', rates) for c in inv.get('crypto', []))
    custom_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('custom', []))
    investments_total = isa_total + pension_total + rsu_total + stocks_total + crypto_total + custom_total

    cash = float(data.get('savings', 0))
    
    # Property value: manual + from mortgages (same logic as get_all_data)
    manual_property = float(data.get('property_value', 0))
    mortgage_property_values = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in data.get('mortgages', []))
    property_val = manual_property + mortgage_property_values
    
    other = float(data.get('other_assets', 0))
    
    # Compute total debts from all sources (same logic as get_all_data)
    manual_debts = float(data.get('debts', 0))
    mortgage_balances = sum(float(m.get('current_balance', 0)) for m in data.get('mortgages', []))
    detailed_debt_balances = sum(float(d.get('balance', 0)) for d in data.get('debts_detailed', []))
    structured_debts = mortgage_balances + detailed_debt_balances
    debts = structured_debts if structured_debts > 0 else manual_debts
    
    net_worth = cash + investments_total + property_val + other - debts

    return {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'net_worth': round(net_worth, 2),
        'cash': round(cash, 2),
        'investments': round(investments_total, 2),
        'isa': round(isa_total, 2),
        'pension': round(pension_total, 2),
        'rsu': round(rsu_total, 2),
        'stocks': round(stocks_total, 2),
        'crypto': round(crypto_total, 2),
        'custom': round(custom_total, 2),
        'property': round(property_val, 2),
        'other_assets': round(other, 2),
        'debts': round(debts, 2),
        'mortgage_total': round(mortgage_balances, 2),
        'debts_detailed_total': round(detailed_debt_balances, 2),
    }

def _auto_snapshot_if_needed(data, rates):
    """Auto-create a monthly snapshot if none exists for this month."""
    month_key = datetime.now().strftime('%Y-%m')
    history = data.get('net_worth_history', [])
    if any(s['date'][:7] == month_key for s in history):
        return  # Already have a snapshot this month
    snapshot = _build_nw_snapshot(data, rates)
    history.append(snapshot)
    history.sort(key=lambda s: s['date'])
    data['net_worth_history'] = history


# ─── Mortgage Engine (Phase 4A) ───────────────────────────────────────────────

@app.route('/api/mortgages', methods=['GET'])
def get_mortgages():
    data = load_data()
    return jsonify(data.get('mortgages', []))

@app.route('/api/mortgages', methods=['POST'])
def add_mortgage():
    data = load_data()
    body = request.json
    mortgage = {
        'id': str(uuid.uuid4()),
        'property_name': body.get('property_name', 'Home'),
        'principal': float(body.get('principal', 0)),
        'current_balance': float(body.get('current_balance', 0)),
        'property_value': float(body.get('property_value', 0)),
        'interest_rate': float(body.get('interest_rate', 4.5)),
        'term_years': int(body.get('term_years', 25)),
        'start_date': body.get('start_date', datetime.now().strftime('%Y-%m-%d')),
        'type': body.get('type', 'repayment'),
        'monthly_overpayment': float(body.get('monthly_overpayment', 0)),
        'fixed_until': body.get('fixed_until', ''),
        'lender': body.get('lender', ''),
    }
    if 'mortgages' not in data:
        data['mortgages'] = []
    data['mortgages'].append(mortgage)
    save_data(data)
    return jsonify({'ok': True, 'mortgage': mortgage})

@app.route('/api/mortgages/<mort_id>', methods=['PUT'])
def update_mortgage(mort_id):
    data = load_data()
    body = request.json
    for m in data.get('mortgages', []):
        if m['id'] == mort_id:
            for k in ['property_name','principal','current_balance','property_value','interest_rate',
                       'term_years','start_date','type','monthly_overpayment','fixed_until','lender']:
                if k in body:
                    m[k] = float(body[k]) if k in ['principal','current_balance','property_value','interest_rate','monthly_overpayment'] else body[k]
                    if k == 'term_years':
                        m[k] = int(body[k])
            save_data(data)
            return jsonify({'ok': True, 'mortgage': m})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/mortgages/<mort_id>', methods=['DELETE'])
def delete_mortgage(mort_id):
    data = load_data()
    data['mortgages'] = [m for m in data.get('mortgages', []) if m['id'] != mort_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/mortgages/<mort_id>/schedule', methods=['GET'])
def mortgage_schedule(mort_id):
    """Calculate full amortisation schedule."""
    data = load_data()
    mortgage = next((m for m in data.get('mortgages', []) if m['id'] == mort_id), None)
    if not mortgage:
        return jsonify({'error': 'Not found'}), 404
    schedule = _calc_amortisation(mortgage)
    return jsonify(schedule)

def _calc_amortisation(m):
    """Calculate monthly amortisation schedule."""
    balance = m['current_balance']
    rate_monthly = m['interest_rate'] / 100 / 12
    term_months = m['term_years'] * 12
    overpay = m.get('monthly_overpayment', 0)
    is_repayment = m.get('type', 'repayment') == 'repayment'

    if is_repayment and rate_monthly > 0:
        base_payment = balance * (rate_monthly * (1 + rate_monthly)**term_months) / ((1 + rate_monthly)**term_months - 1)
    elif is_repayment:
        base_payment = balance / max(term_months, 1)
    else:
        base_payment = balance * rate_monthly  # interest-only

    schedule = []
    total_interest = 0
    total_interest_no_overpay = 0
    bal = balance
    bal_no_overpay = balance

    for month in range(1, term_months + 1):
        if bal <= 0:
            break
        interest = round(bal * rate_monthly, 2)
        total_interest += interest
        payment = min(base_payment + overpay, bal + interest)
        principal_paid = payment - interest
        bal = round(bal - principal_paid, 2)

        # Track no-overpayment scenario for comparison
        int_no = round(bal_no_overpay * rate_monthly, 2)
        total_interest_no_overpay += int_no
        pp_no = base_payment - int_no
        bal_no_overpay = round(max(0, bal_no_overpay - pp_no), 2)

        schedule.append({
            'month': month,
            'payment': round(payment, 2),
            'interest': interest,
            'principal': round(principal_paid, 2),
            'balance': max(0, bal),
        })

    return {
        'schedule': schedule,
        'monthly_payment': round(base_payment, 2),
        'monthly_with_overpay': round(base_payment + overpay, 2),
        'total_interest': round(total_interest, 2),
        'total_interest_no_overpay': round(total_interest_no_overpay, 2),
        'interest_saved': round(total_interest_no_overpay - total_interest, 2),
        'months_to_payoff': len(schedule),
        'years_to_payoff': round(len(schedule) / 12, 1),
        'original_term_months': term_months,
        'equity': round(m.get('principal', m['current_balance']) - max(0, bal), 2),
    }


# ─── Debt Optimisation (Phase 4B) ─────────────────────────────────────────────

@app.route('/api/debts', methods=['GET'])
def get_debts():
    data = load_data()
    return jsonify(data.get('debts_detailed', []))

@app.route('/api/debts', methods=['POST'])
def add_debt():
    data = load_data()
    body = request.json
    debt = {
        'id': str(uuid.uuid4()),
        'name': body.get('name', 'Debt'),
        'balance': float(body.get('balance', 0)),
        'interest_rate': float(body.get('interest_rate', 0)),
        'min_payment': float(body.get('min_payment', 0)),
        'type': body.get('type', 'revolving'),
    }
    if 'debts_detailed' not in data:
        data['debts_detailed'] = []
    data['debts_detailed'].append(debt)
    save_data(data)
    return jsonify({'ok': True, 'debt': debt})

@app.route('/api/debts/<debt_id>', methods=['PUT'])
def update_debt(debt_id):
    data = load_data()
    body = request.json
    for d in data.get('debts_detailed', []):
        if d['id'] == debt_id:
            for k in ['name','balance','interest_rate','min_payment','type']:
                if k in body:
                    d[k] = float(body[k]) if k in ['balance','interest_rate','min_payment'] else body[k]
            save_data(data)
            return jsonify({'ok': True, 'debt': d})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/debts/<debt_id>', methods=['DELETE'])
def delete_debt(debt_id):
    data = load_data()
    data['debts_detailed'] = [d for d in data.get('debts_detailed', []) if d['id'] != debt_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/debts/optimise', methods=['POST'])
def optimise_debts():
    """Calculate snowball vs avalanche debt payoff strategies."""
    data = load_data()
    body = request.json
    extra_monthly = float(body.get('extra_monthly', 0))
    debts = [dict(d) for d in data.get('debts_detailed', []) if d.get('balance', 0) > 0]
    if not debts:
        return jsonify({'snowball': [], 'avalanche': [], 'summary': {}})

    def simulate(ordered_debts, extra):
        timeline = []
        balances = {d['id']: d['balance'] for d in ordered_debts}
        total_interest = 0
        month = 0
        while any(b > 0 for b in balances.values()) and month < 600:
            month += 1
            remaining_extra = extra
            for d in ordered_debts:
                bal = balances[d['id']]
                if bal <= 0:
                    continue
                interest = round(bal * d['interest_rate'] / 100 / 12, 2)
                total_interest += interest
                payment = d['min_payment'] + remaining_extra
                remaining_extra = 0
                actual = min(payment, bal + interest)
                balances[d['id']] = round(max(0, bal + interest - actual), 2)
                if balances[d['id']] <= 0:
                    remaining_extra += (actual - bal - interest)
                    timeline.append({'debt': d['name'], 'month': month, 'id': d['id']})
            # Cascade freed-up minimums
            for d in ordered_debts:
                if balances[d['id']] <= 0:
                    extra += d['min_payment']
                    d['min_payment'] = 0
        return timeline, total_interest, month

    # Snowball: smallest balance first
    snowball_order = sorted(debts, key=lambda d: d['balance'])
    snow_timeline, snow_interest, snow_months = simulate(
        [dict(d) for d in snowball_order], extra_monthly)

    # Avalanche: highest interest rate first
    avalanche_order = sorted(debts, key=lambda d: -d['interest_rate'])
    aval_timeline, aval_interest, aval_months = simulate(
        [dict(d) for d in avalanche_order], extra_monthly)

    total_debt = sum(d['balance'] for d in debts)
    min_payments = sum(d['min_payment'] for d in debts)

    return jsonify({
        'snowball': snow_timeline,
        'avalanche': aval_timeline,
        'summary': {
            'total_debt': round(total_debt, 2),
            'min_payments_total': round(min_payments, 2),
            'extra_monthly': extra_monthly,
            'snowball_months': snow_months,
            'snowball_interest': round(snow_interest, 2),
            'avalanche_months': aval_months,
            'avalanche_interest': round(aval_interest, 2),
            'interest_saved_avalanche': round(snow_interest - aval_interest, 2),
            'months_saved_avalanche': snow_months - aval_months,
        }
    })

# ─── Phase 3B: Disposals & Realised Gains ─────────────────────────────────────

@app.route('/api/disposals', methods=['GET'])
def get_disposals():
    data = load_data()
    disposals = data.get('disposals', [])
    disposals.sort(key=lambda d: d.get('date', ''), reverse=True)
    return jsonify(disposals)

@app.route('/api/disposals', methods=['POST'])
def add_disposal():
    data = load_data()
    body = request.json
    tax_year = _get_tax_year(datetime.strptime(body.get('date', datetime.now().strftime('%Y-%m-%d')), '%Y-%m-%d'))
    disposal = {
        'id': str(uuid.uuid4()),
        'date': body.get('date', datetime.now().strftime('%Y-%m-%d')),
        'holding_type': body.get('holding_type', 'stocks'),
        'holding_id': body.get('holding_id', ''),
        'description': body.get('description', ''),
        'ticker': body.get('ticker', ''),
        'shares_sold': float(body.get('shares_sold', 0)),
        'proceeds_gbp': float(body.get('proceeds_gbp', 0)),
        'cost_basis_gbp': float(body.get('cost_basis_gbp', 0)),
        'gain_gbp': round(float(body.get('proceeds_gbp', 0)) - float(body.get('cost_basis_gbp', 0)), 2),
        'tax_year': tax_year,
        'profile_id': body.get('profile_id', 'primary'),
    }
    data.setdefault('disposals', []).append(disposal)
    save_data(data)
    return jsonify(disposal)

@app.route('/api/disposals/<disp_id>', methods=['DELETE'])
def delete_disposal(disp_id):
    data = load_data()
    data['disposals'] = [d for d in data.get('disposals', []) if d.get('id') != disp_id]
    save_data(data)
    return jsonify({'ok': True})

@app.route('/api/disposals/tax-summary', methods=['GET'])
def disposal_tax_summary():
    """Summary of realised gains per tax year."""
    data = load_data()
    gs = data.get('global_settings', {})
    residency = gs.get('tax_residency', 'GB')
    profile = TAX_PROFILES.get(residency, TAX_PROFILES['GB'])
    tax_pref = gs.get('tax_rate_preference', 'higher')
    cgt_rate = profile['cgt_rate_higher'] if tax_pref == 'higher' else profile['cgt_rate_basic']
    cgt_exempt = profile['cgt_annual_exempt']
    
    disposals = data.get('disposals', [])
    carried = data.get('carried_losses', {})
    
    years = {}
    for d in disposals:
        ty = d.get('tax_year', 'unknown')
        if ty not in years:
            years[ty] = {'gains': 0, 'losses': 0, 'disposals': 0, 'proceeds': 0, 'cost': 0}
        gain = d.get('gain_gbp', 0)
        years[ty]['proceeds'] += d.get('proceeds_gbp', 0)
        years[ty]['cost'] += d.get('cost_basis_gbp', 0)
        years[ty]['disposals'] += 1
        if gain >= 0:
            years[ty]['gains'] += gain
        else:
            years[ty]['losses'] += gain  # negative
    
    summary = {}
    for ty, y in sorted(years.items()):
        net_gain = y['gains'] + y['losses'] + carried.get(ty, 0)
        taxable = max(0, net_gain - cgt_exempt)
        tax = round(taxable * cgt_rate, 2)
        exempt_used = min(max(0, net_gain), cgt_exempt)
        summary[ty] = {
            'total_gains': round(y['gains'], 2),
            'total_losses': round(y['losses'], 2),
            'carried_losses': round(carried.get(ty, 0), 2),
            'net_gain': round(net_gain, 2),
            'exempt_used': round(exempt_used, 2),
            'exempt_remaining': round(max(0, cgt_exempt - exempt_used), 2),
            'taxable': round(taxable, 2),
            'tax_due': tax,
            'disposals_count': y['disposals'],
            'total_proceeds': round(y['proceeds'], 2),
            'total_cost': round(y['cost'], 2),
        }
    
    return jsonify(summary)

# ─── Phase 5: FIRE Settings & Monte Carlo ─────────────────────────────────────

@app.route('/api/fire-settings', methods=['GET'])
def get_fire_settings():
    data = load_data()
    return jsonify(data.get('fire_settings', {}))

@app.route('/api/fire-settings', methods=['POST'])
def update_fire_settings():
    data = load_data()
    body = request.json
    fs = data.get('fire_settings', {})
    for key in ['mode', 'lean_multiplier', 'fat_multiplier', 'safe_withdrawal_rate',
                'include_state_pension', 'state_pension_age', 'state_pension_annual']:
        if key in body:
            fs[key] = body[key]
    data['fire_settings'] = fs
    save_data(data)
    return jsonify(fs)

@app.route('/api/monte-carlo', methods=['POST'])
def monte_carlo_simulation():
    """Run Monte Carlo retirement simulation."""
    import random
    data = load_data()
    body = request.json
    
    current_nw = float(body.get('current_nw', 0))
    monthly_contrib = float(body.get('monthly_contrib', 0))
    annual_spend = float(body.get('annual_spend', 0))
    current_age = int(body.get('current_age', 35))
    retire_age = int(body.get('retire_age', 60))
    life_exp = int(body.get('life_expectancy', 90))
    expected_return = float(body.get('expected_return', 7)) / 100
    volatility = float(body.get('volatility', 15)) / 100  # Annual std dev
    inflation = float(body.get('inflation', 2.5)) / 100
    num_sims = int(body.get('simulations', 1000))
    
    # FIRE settings
    fs = data.get('fire_settings', {})
    swr = float(fs.get('safe_withdrawal_rate', 4)) / 100
    state_pension = float(fs.get('state_pension_annual', 0)) if fs.get('include_state_pension') else 0
    state_pension_age = int(fs.get('state_pension_age', 67))
    
    years_to_retire = retire_age - current_age
    years_in_retire = life_exp - retire_age
    total_years = life_exp - current_age
    
    if total_years <= 0 or years_to_retire < 0:
        return jsonify({'error': 'Invalid age parameters'}), 400
    
    successes = 0
    all_paths = []
    final_values = []
    
    for sim in range(num_sims):
        portfolio = current_nw
        path = [portfolio]
        failed = False
        
        for year in range(total_years):
            age = current_age + year + 1
            # Random return from normal distribution
            annual_return = random.gauss(expected_return, volatility)
            
            if age <= retire_age:
                # Accumulation phase
                portfolio = portfolio * (1 + annual_return) + monthly_contrib * 12
            else:
                # Drawdown phase - inflation-adjusted spending
                years_since_start = age - current_age
                infl_spend = annual_spend * (1 + inflation) ** years_since_start
                pension_income = state_pension if age >= state_pension_age else 0
                withdrawal = max(0, infl_spend - pension_income)
                portfolio = portfolio * (1 + annual_return) - withdrawal
            
            if portfolio < 0:
                portfolio = 0
                failed = True
            
            path.append(round(portfolio, 0))
        
        if not failed and portfolio > 0:
            successes += 1
        
        final_values.append(portfolio)
        # Only store a subset of paths for the chart
        if sim < 100:
            all_paths.append(path)
    
    # Compute percentile bands
    percentiles = {}
    for year_idx in range(total_years + 1):
        year_vals = sorted([p[year_idx] if year_idx < len(p) else 0 for p in all_paths])
        n = len(year_vals)
        percentiles.setdefault('p10', []).append(round(year_vals[max(0, int(n * 0.1))], 0))
        percentiles.setdefault('p25', []).append(round(year_vals[max(0, int(n * 0.25))], 0))
        percentiles.setdefault('p50', []).append(round(year_vals[max(0, int(n * 0.5))], 0))
        percentiles.setdefault('p75', []).append(round(year_vals[max(0, int(n * 0.75))], 0))
        percentiles.setdefault('p90', []).append(round(year_vals[max(0, int(n * 0.9))], 0))
    
    ages = list(range(current_age, life_exp + 1))
    
    final_sorted = sorted(final_values)
    n = len(final_sorted)
    
    return jsonify({
        'success_rate': round(successes / num_sims * 100, 1),
        'simulations': num_sims,
        'ages': ages,
        'percentiles': percentiles,
        'final_value_median': round(final_sorted[n // 2], 0),
        'final_value_p10': round(final_sorted[max(0, int(n * 0.1))], 0),
        'final_value_p90': round(final_sorted[max(0, int(n * 0.9))], 0),
        'worst_case': round(final_sorted[0], 0),
        'best_case': round(final_sorted[-1], 0),
    })

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

    # Compute totals for context
    inv = data.get('investments', {})
    isa_total = sum(s.get('value_gbp', 0) or 0 for s in inv.get('isa', []))
    pension_total = sum(s.get('value_gbp', 0) or 0 for s in inv.get('pension', []))
    rsu_total = sum(s.get('current_value', 0) or 0 for s in inv.get('rsu', []))
    stocks_total = sum(s.get('value_gbp', 0) or 0 for s in inv.get('stocks', []))
    crypto_total = sum(to_gbp(c.get('value_usd', 0), 'USD', rates) for c in inv.get('crypto', []))
    custom_total = sum(s.get('value_gbp', 0) or 0 for s in inv.get('custom', []))
    investments_total = isa_total + pension_total + rsu_total + stocks_total + crypto_total + custom_total
    
    # Unified property and debt values (same logic as get_all_data)
    cash = float(data.get('savings', 0))
    manual_property = float(data.get('property_value', 0))
    mortgage_property_values = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in data.get('mortgages', []))
    total_property = manual_property + mortgage_property_values
    other_assets = float(data.get('other_assets', 0))
    
    mortgage_balances = sum(float(m.get('current_balance', 0)) for m in data.get('mortgages', []))
    detailed_debt_balances = sum(float(d.get('balance', 0)) for d in data.get('debts_detailed', []))
    structured_debts = mortgage_balances + detailed_debt_balances
    total_debts = structured_debts if structured_debts > 0 else float(data.get('debts', 0))
    monthly_debt_pmts = sum(_calc_monthly_payment(m) for m in data.get('mortgages', [])) + sum(float(d.get('minimum_payment', 0)) for d in data.get('debts_detailed', []))
    
    net_worth = cash + investments_total + total_property + other_assets - total_debts

    # Monthly spending analysis
    from collections import defaultdict
    cat_spend = defaultdict(float)
    monthly_spend = 0
    monthly_income = 0
    for t in recent:
        if t.get('is_future'):
            continue
        if t.get('type') == 'debit':
            cat_spend[t.get('category', 'Other')] += t.get('amount_gbp', 0)
            monthly_spend += t.get('amount_gbp', 0)
        else:
            monthly_income += t.get('amount_gbp', 0)
    months_covered = max(1, min(3, len(set(t.get('date', '')[:7] for t in recent if not t.get('is_future')))))
    monthly_spend = round(monthly_spend / months_covered, 2)
    monthly_income = round(monthly_income / months_covered, 2)
    cat_summary = ', '.join(f"{k}: £{v/months_covered:.0f}/mo" for k, v in sorted(cat_spend.items(), key=lambda x: -x[1])[:10])

    contribs = data.get('monthly_contributions', {})
    total_monthly_contribs = sum(contribs.values())

    # Receipts summary
    receipts = load_receipts()
    receipt_summary = f"{len(receipts)} receipts totalling £{sum(float(r.get('total') or 0) for r in receipts):.2f}" if receipts else "No receipts scanned"

    # Retirement settings
    gs = data.get('global_settings', {})
    ret_settings = data.get('retirement_settings', {})

    # Family profiles
    family = data.get('family_profiles', [])
    family_summary = ', '.join(f"{p.get('name','?')} ({p.get('relationship','?')}, {p.get('tax_residency','GB')} {p.get('tax_rate_preference','basic')} rate)" for p in family) if family else 'No family profiles'

    context = f"""You are a personal finance AI advisor with FULL access to this user's financial data. Give specific, actionable advice using real numbers.

── OVERVIEW ──
Net Worth: £{net_worth:,.2f}
Cash & Savings: £{cash:,.2f} | Total Debts: £{total_debts:,.2f} (Mortgage: £{mortgage_balances:,.2f}, Other: £{detailed_debt_balances:,.2f})
Property: £{total_property:,.2f} | Other Assets: £{other_assets:,.2f}
Monthly Income (avg 3mo): £{monthly_income:,.2f} | Monthly Spend (avg 3mo): £{monthly_spend:,.2f}
Monthly Debt Payments: £{monthly_debt_pmts:,.2f}
Surplus: £{monthly_income - monthly_spend - monthly_debt_pmts:,.2f}/mo | Savings Rate: {(monthly_income - monthly_spend - monthly_debt_pmts) / max(monthly_income, 1) * 100:.1f}%

── INVESTMENTS (Total: £{investments_total:,.2f}) ──
ISA (tax-free): £{isa_total:,.2f} — {len(inv.get('isa',[]))} holdings
Pension: £{pension_total:,.2f} — {len(inv.get('pension',[]))} holdings
RSU/Company Stock: £{rsu_total:,.2f} — {len(inv.get('rsu',[]))} vests
Non-ISA Stocks: £{stocks_total:,.2f} — {len(inv.get('stocks',[]))} holdings
Crypto: £{crypto_total:,.2f} — {len(inv.get('crypto',[]))} coins
Custom: £{custom_total:,.2f} — {len(inv.get('custom',[]))} items

Monthly Contributions: ISA £{contribs.get('isa',0)}/mo, Pension £{contribs.get('pension',0)}/mo (pre-tax salary sacrifice), Stocks £{contribs.get('stocks',0)}/mo, Crypto £{contribs.get('crypto',0)}/mo, Savings £{contribs.get('savings',0)}/mo — Total: £{total_monthly_contribs}/mo
Note: Pension contributions are pre-tax (salary sacrifice), already deducted before take-home pay. They do NOT reduce monthly surplus.

── SPENDING BY CATEGORY (avg/mo, last 90d) ──
{cat_summary}

── HOLDINGS DETAIL ──
ISA: {json.dumps(inv.get('isa',[]), default=str)}
Pension: {json.dumps(inv.get('pension',[]), default=str)}
RSU: {json.dumps(inv.get('rsu',[]), default=str)}
Stocks: {json.dumps(inv.get('stocks',[]), default=str)}
Crypto: {json.dumps(inv.get('crypto',[]), default=str)}
Custom: {json.dumps(inv.get('custom',[]), default=str)}

── RECENT TRANSACTIONS (last 90d, up to 50) ──
{json.dumps(recent[:50], default=str)}

── SCHEDULED/FUTURE ──
{json.dumps(future[:20], default=str)}

── ACCOUNTS ──
{json.dumps(data.get('accounts',[]), default=str)}

── RECEIPTS ──
{receipt_summary}

── FAMILY PROFILES ──
{family_summary}

── TAX SETTINGS ──
Residency: {gs.get('tax_residency','GB')} | Tax Rate: {gs.get('tax_rate_preference','basic')} rate
Currency: {gs.get('base_currency','GBP')}

── MORTGAGES & DEBTS ──
{chr(10).join(f"Mortgage: {m.get('property_name','Property')} — Balance £{float(m.get('current_balance',0)):,.0f}, Rate {m.get('interest_rate',0)}%, {m.get('term_years',0)}yr term, £{_calc_monthly_payment(m):,.0f}/mo" for m in data.get('mortgages',[])) or 'No mortgages'}
{chr(10).join(f"Debt: {d.get('name','Debt')} — Balance £{float(d.get('balance',0)):,.0f}, Rate {d.get('interest_rate',0)}%, Min £{float(d.get('minimum_payment',0)):,.0f}/mo" for d in data.get('debts_detailed',[])) or 'No other debts'}

── RETIREMENT ──
{json.dumps(ret_settings, default=str) if ret_settings else 'Not configured yet'}

── INSTRUCTIONS ──
Be concise and specific. Always reference actual numbers from the data. Provide actionable recommendations.
When discussing investments, mention tax efficiency (ISA vs non-ISA). Flag any concerns (concentration risk, high spending categories, debt levels).
Format numbers with £ and commas. Use bullet points sparingly. Keep responses under 300 words unless the user asks for detailed analysis."""

    history = data.get('chat_history', [])
    history.append({'role': 'user', 'content': user_msg})

    import time
    for attempt in range(3):
        try:
            response = get_anthropic_client().messages.create(model='claude-haiku-4-5-20251001', max_tokens=1500, system=context, messages=history[-10:])
            break
        except Exception as e:
            if 'overloaded' in str(e).lower() and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return jsonify({'error': f'AI service unavailable: {str(e)}'}), 503

    reply = response.content[0].text
    history.append({'role': 'assistant', 'content': reply})
    data['chat_history'] = history[-20:]
    save_data(data)
    return jsonify({'reply': reply})

@app.route('/api/clear', methods=['POST'])
def clear_data():
    save_data(default_data())
    return jsonify({'ok': True})

# ─── Demo Mode ─────────────────────────────────────────────────────────────────

DEMO_BACKUP_FILE = os.path.join(_APP_DIR, 'data_backup.json')

def generate_demo_data():
    """Generate a realistic but fake dataset for demo/presentation mode."""
    import random
    random.seed(42)  # Reproducible
    
    demo = default_data()
    demo['global_settings']['demo_mode'] = True
    demo['income'] = 5200
    demo['savings'] = 42500
    demo['property_value'] = 0  # Property value is tracked per-mortgage now
    demo['other_assets'] = 12000
    demo['debts'] = 0
    demo['monthly_fixed_expenses'] = 2800
    
    demo['accounts'] = [
        {'id': 'demo-current', 'name': 'Primary Current', 'currency': 'GBP', 'bank': 'Chase', 'account_type': 'current'},
        {'id': 'demo-savings', 'name': 'Easy Saver', 'currency': 'GBP', 'bank': 'Marcus', 'account_type': 'savings'},
        {'id': 'demo-joint', 'name': 'Joint Account', 'currency': 'GBP', 'bank': 'Monzo', 'account_type': 'current'},
    ]
    
    # ISA holdings
    demo['investments']['isa'] = [
        {'id':'d-isa1','name':'Vanguard FTSE Global','ticker':'VWRL.L','shares':280,'invested':42000,'current_price':168.50,'asset_class':'equity','geography':'Global','sector':'','purchase_date':'2022-03-15','dividend_yield_pct':1.8,'dividends':[],'monthly_contribution':500},
        {'id':'d-isa2','name':'iShares Core S&P 500','ticker':'CSP1.L','shares':45,'invested':18000,'current_price':440.20,'asset_class':'equity','geography':'US','sector':'','purchase_date':'2023-01-10','dividend_yield_pct':1.2,'dividends':[],'monthly_contribution':250},
        {'id':'d-isa3','name':'Vanguard UK Gilts','ticker':'VGOV.L','shares':120,'invested':6000,'current_price':52.80,'asset_class':'bond','geography':'UK','sector':'','purchase_date':'2024-06-01','dividend_yield_pct':3.5,'dividends':[],'monthly_contribution':0},
    ]
    
    # Pension
    demo['investments']['pension'] = [
        {'id':'d-pen1','name':'Workplace Pension','provider':'Aviva','current_value':145000,'total_contributed':95000,'asset_class':'mixed','geography':'Global','sector':'','purchase_date':'2018-01-01','dividend_yield_pct':0,'dividends':[],'monthly_contribution':800},
    ]
    
    # Non-ISA Stocks
    demo['investments']['stocks'] = [
        {'id':'d-stk1','name':'Apple','ticker':'AAPL','shares':25,'invested':3200,'current_price':185.50,'asset_class':'equity','geography':'US','sector':'Technology','purchase_date':'2021-11-20','dividend_yield_pct':0.5,'dividends':[],'monthly_contribution':0},
    ]
    
    # RSU
    demo['investments']['rsu'] = [
        {'id':'d-rsu1','company':'TechCorp','ticker':'AAPL','shares':50,'vest_price':142.00,'vest_date':'2024-03-15','current_price':185.50,'asset_class':'equity','geography':'US','sector':'Technology','purchase_date':'2024-03-15','dividend_yield_pct':0,'dividends':[]},
    ]
    
    # Crypto
    demo['investments']['crypto'] = [
        {'id':'d-cry1','name':'Bitcoin','coin_id':'bitcoin','amount':0.35,'invested_gbp':8500,'asset_class':'crypto','geography':'Global','sector':'','purchase_date':'2023-06-01','dividend_yield_pct':0,'dividends':[],'monthly_contribution':100},
        {'id':'d-cry2','name':'Ethereum','coin_id':'ethereum','amount':4.2,'invested_gbp':6200,'asset_class':'crypto','geography':'Global','sector':'','purchase_date':'2023-08-15','dividend_yield_pct':0,'dividends':[],'monthly_contribution':0},
    ]
    
    demo['monthly_contributions'] = {'isa':750,'pension':800,'crypto':100,'stocks':0,'savings':500}
    
    demo['retirement'] = {
        'target_age':57, 'current_age':34, 'monthly_expenses_retirement':3500,
        'inflation_rate':2.5, 'expected_return':7.0, 'post_retirement_return':4.0,
        'life_expectancy':90, 'partner_age':32, 'partner_life_expectancy':92,
    }
    
    demo['family_profiles'] = [
        {'id':'primary','name':'Alex','relationship':'self','tax_residency':'GB','tax_rate_preference':'higher','annual_income':85000,'notes':''},
        {'id':'partner','name':'Sam','relationship':'partner','tax_residency':'GB','tax_rate_preference':'basic','annual_income':42000,'notes':''},
    ]
    
    # Generate 8 months of transactions
    categories_weights = [
        ('Food & Dining', 'debit', 280, 80), ('Shopping', 'debit', 150, 100),
        ('Transport', 'debit', 120, 40), ('Entertainment', 'debit', 80, 50),
        ('Bills & Utilities', 'debit', 320, 20), ('Health & Fitness', 'debit', 55, 15),
        ('Subscriptions', 'debit', 65, 5), ('Rent/Mortgage', 'debit', 1200, 0),
        ('Salary', 'credit', 5200, 0), ('Transfer', 'credit', 200, 150),
    ]
    
    descs = {
        'Food & Dining': ['Tesco', 'Sainsburys', 'Deliveroo', 'Costa Coffee', 'Wagamama', 'Pret A Manger'],
        'Shopping': ['Amazon', 'John Lewis', 'ASOS', 'Argos', 'Boots'],
        'Transport': ['TfL Oyster', 'Shell Fuel', 'Uber', 'Trainline'],
        'Entertainment': ['Netflix', 'Cinema', 'Spotify', 'Books'],
        'Bills & Utilities': ['British Gas', 'Thames Water', 'Council Tax', 'Virgin Media', 'EE Mobile'],
        'Health & Fitness': ['PureGym', 'Boots Pharmacy'],
        'Subscriptions': ['Apple iCloud', 'Disney+', 'The Times', 'ChatGPT Plus'],
        'Rent/Mortgage': ['Mortgage Payment'],
        'Salary': ['Employer Ltd'],
        'Transfer': ['Savings Transfer', 'ISA Top-up'],
    }
    
    txns = []
    for month_offset in range(8):
        month_dt = datetime.now() - timedelta(days=30 * month_offset)
        for cat, txn_type, base_amt, variance in categories_weights:
            if cat == 'Salary':
                txns.append({
                    'id': str(uuid.uuid4()), 'date': (month_dt.replace(day=28) if month_dt.day >= 28 else month_dt.replace(day=28)).strftime('%Y-%m-%d'),
                    'description': 'Employer Ltd', 'amount': base_amt, 'type': 'credit',
                    'category': cat, 'currency': 'GBP', 'account_id': 'demo-current',
                })
            elif cat == 'Rent/Mortgage':
                txns.append({
                    'id': str(uuid.uuid4()), 'date': month_dt.replace(day=1).strftime('%Y-%m-%d'),
                    'description': 'Mortgage Payment', 'amount': base_amt, 'type': 'debit',
                    'category': cat, 'currency': 'GBP', 'account_id': 'demo-current',
                })
            else:
                num_txns = random.randint(1, 4 if txn_type == 'debit' else 1)
                for _ in range(num_txns):
                    day = random.randint(1, min(28, month_dt.day if month_offset == 0 else 28))
                    amt = max(1, base_amt / num_txns + random.uniform(-variance, variance))
                    txns.append({
                        'id': str(uuid.uuid4()),
                        'date': month_dt.replace(day=day).strftime('%Y-%m-%d'),
                        'description': random.choice(descs.get(cat, ['Transaction'])),
                        'amount': round(amt, 2), 'type': txn_type,
                        'category': cat, 'currency': 'GBP', 'account_id': random.choice(['demo-current', 'demo-joint']),
                    })
    
    demo['transactions'] = txns
    
    # Mortgage
    demo['mortgages'] = [{
        'id': 'demo-mort', 'property_name': 'Primary Home', 'principal': 320000,
        'current_balance': 245000, 'property_value': 385000, 'interest_rate': 4.49, 'term_years': 25,
        'start_date': '2021-06-01', 'type': 'repayment', 'monthly_overpayment': 100,
        'fixed_until': '2026-06-01', 'lender': 'Nationwide',
    }]
    
    # NW history
    nw_hist = []
    base_nw = 180000
    for i in range(12):
        dt = datetime.now() - timedelta(days=30 * (11 - i))
        growth = base_nw * (1 + 0.008 * (i + random.uniform(-0.5, 1.5)))
        nw_hist.append({
            'date': dt.strftime('%Y-%m-%d'),
            'net_worth': round(growth, 0),
            'investments': round(growth * 0.55, 0),
            'cash': round(growth * 0.12, 0),
        })
        base_nw = growth
    demo['net_worth_history'] = nw_hist
    
    return demo

@app.route('/api/demo/toggle', methods=['POST'])
def toggle_demo_mode():
    """Toggle demo mode on/off. Backs up real data when activating, restores when deactivating."""
    data = load_data()
    currently_demo = data.get('global_settings', {}).get('demo_mode', False)
    
    if currently_demo:
        # Deactivate demo — restore backup
        if os.path.exists(DEMO_BACKUP_FILE):
            with open(DEMO_BACKUP_FILE, 'r') as f:
                real_data = json.load(f)
            real_data.setdefault('global_settings', {})['demo_mode'] = False
            save_data(real_data)
            os.remove(DEMO_BACKUP_FILE)
            return jsonify({'ok': True, 'demo_mode': False, 'message': 'Real data restored'})
        else:
            data['global_settings']['demo_mode'] = False
            save_data(data)
            return jsonify({'ok': True, 'demo_mode': False, 'message': 'Demo mode disabled'})
    else:
        # Activate demo — backup real data, load demo
        import shutil
        shutil.copy2(DATA_FILE, DEMO_BACKUP_FILE)
        demo_data = generate_demo_data()
        save_data(demo_data)
        return jsonify({'ok': True, 'demo_mode': True, 'message': 'Demo mode activated'})

# ─── Receipt Scanning ─────────────────────────────────────────────────────────

RECEIPTS_FILE = os.path.join(_APP_DIR, 'receipts.json')
RECEIPTS_DIR = os.path.join(_APP_DIR, 'receipts_store')
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
    import base64
    import traceback

    file = request.files.get('image')
    account_id = request.form.get('account_id', '')
    currency = request.form.get('currency', 'GBP')

    if not file:
        return jsonify({'error': 'No image uploaded'}), 400

    try:
        data = load_data()

        # Read image bytes
        img_bytes = file.read()
        if not img_bytes:
            return jsonify({'error': 'Empty image file'}), 400

        # Try to normalise image to JPEG via Pillow (handles TIFF, BMP, oversized, etc.)
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(img_bytes))

            # Resize if very large (Claude limits + speed)
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)

            # Convert to RGB JPEG
            if img.mode != 'RGB':
                img = img.convert('RGB')

            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=85)
            img_bytes = buf.getvalue()
            media_type = 'image/jpeg'
        except Exception as pil_err:
            # Pillow couldn't open it (e.g. HEIC without plugin) — detect type from bytes
            print(f"[Receipt] Pillow conversion failed ({pil_err}), sending raw image")
            if img_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                media_type = 'image/png'
            elif img_bytes[:2] == b'\xff\xd8':
                media_type = 'image/jpeg'
            elif img_bytes[:4] == b'RIFF' and img_bytes[8:12] == b'WEBP':
                media_type = 'image/webp'
            else:
                media_type = 'image/jpeg'  # best guess

        img_b64 = base64.standard_b64encode(img_bytes).decode('utf-8')

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

        response = get_anthropic_client().messages.create(
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
        traceback.print_exc()
        return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500


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


# ─── Shared Category Rules (used by TrueLayer + Plaid) ────────────────────────

CATEGORY_RULES = [
    (['tesco','sainsbury','asda','morrisons','waitrose','aldi','lidl','co-op','marks','m&s food','costco','ocado',
      'walmart','target','kroger','whole foods','trader joe','publix','safeway'], 'Food & Dining'),
    (['uber eats','deliveroo','just eat','mcdonald','kfc','pizza','nando','greggs','starbucks','costa','pret',
      'doordash','grubhub','chipotle','chick-fil-a','dunkin','wendy','taco bell','subway','panera'], 'Food & Dining'),
    (['amazon','ebay','asos','next','zara','h&m','primark','nike','apple store','best buy','home depot','lowes'], 'Shopping'),
    (['uber','lyft','trainline','tfl','national rail','bus','oyster','petrol','shell','bp','esso',
      'exxon','chevron','sunoco','metro','subway fare'], 'Transport'),
    (['netflix','spotify','disney','sky','amazon prime','youtube','twitch','gaming',
      'hulu','hbo','apple tv','paramount','peacock'], 'Subscriptions'),
    (['gym','fitness','sport','health','pharmacy','boots','lloyds pharmacy','cvs','walgreens'], 'Health & Fitness'),
    (['rent','mortgage','landlord'], 'Rent/Mortgage'),
    (['salary','payroll','wages','employer','direct deposit'], 'Salary'),
    (['transfer','revolut','monzo','bank transfer','venmo','zelle','cashapp','cash app','paypal'], 'Transfer'),
    (['electricity','gas','water','broadband','internet','phone','council tax','bt ',
      'comcast','verizon','at&t','t-mobile','spectrum','xfinity','utility'], 'Bills & Utilities'),
    (['hotel','airbnb','booking.com','flight','ryanair','easyjet','holiday',
      'united airlines','delta','american airlines','southwest','marriott','hilton'], 'Travel'),
    (['cinema','theatre','ticketmaster','concert','eventbrite','amc','fandango'], 'Entertainment'),
]


def categorise_by_keywords(description):
    """Categorise a transaction description using keyword matching."""
    norm = description.lower()
    for keywords, cat in CATEGORY_RULES:
        if any(kw in norm for kw in keywords):
            return cat
    return 'Other'


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

TRUELAYER_FILE = os.path.join(_APP_DIR, 'truelayer_connections.json')  # legacy fallback

def load_tl_connections():
    """Load TrueLayer connections from DB (persistent across Render redeploys)."""
    try:
        db = SessionLocal()
        rows = db.query(TLConnection).all()
        db.close()
        if rows:
            return [json.loads(r.data) for r in rows]
    except Exception as e:
        print(f'[TL] DB load failed, falling back to file: {e}')
    # Legacy file fallback (local dev or first run before DB is ready)
    if os.path.exists(TRUELAYER_FILE):
        with open(TRUELAYER_FILE, 'r') as f:
            return json.load(f)
    return []

def save_tl_connections(connections):
    """Save TrueLayer connections to DB (persistent across Render redeploys)."""
    try:
        db = SessionLocal()
        existing_ids = {r.id for r in db.query(TLConnection).all()}
        new_ids = {c['id'] for c in connections}
        # Delete removed connections
        for rid in existing_ids - new_ids:
            db.query(TLConnection).filter(TLConnection.id == rid).delete()
        # Upsert each connection
        for conn in connections:
            row = db.query(TLConnection).filter(TLConnection.id == conn['id']).first()
            if row:
                row.data = json.dumps(conn)
            else:
                db.add(TLConnection(id=conn['id'], data=json.dumps(conn)))
        db.commit()
        db.close()
        return
    except Exception as e:
        print(f'[TL] DB save failed, falling back to file: {e}')
    # Legacy file fallback
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
    state_file = os.path.join(_APP_DIR, 'tl_state.json')
    with open(state_file, 'w') as f:
        json.dump({'state': state, 'created': datetime.now().isoformat()}, f)

    # TrueLayer scopes for read-only bank data
    # Must include cards, direct_debits, standing_orders for Live mode
    scopes = 'info accounts balance cards transactions direct_debits standing_orders offline_access'

    # uk-ob-all  = all UK Open Banking providers (traditional banks)
    # uk-oauth-all = all UK OAuth providers (Revolut, Monzo, Starling, etc.)
    params = {
        'response_type': 'code',
        'client_id': TRUELAYER_CLIENT_ID,
        'scope': scopes,
        'redirect_uri': TRUELAYER_REDIRECT_URI,
        'state': state,
        'providers': 'uk-ob-all uk-oauth-all',
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
    state_file = os.path.join(_APP_DIR, 'tl_state.json')
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
                bal_result = bal_data.get('results', [{}])[0]
                # Use 'current' (actual cash position) not 'available' which
                # includes unused overdraft/credit limit — giving inflated figures
                balance = bal_result.get('current', bal_result.get('available', 0))
                overdraft = bal_result.get('overdraft', 0)
                synced_accounts.append({
                    'name':      acct_name,
                    'bank':      conn['bank_name'],
                    'balance':   balance,
                    'overdraft': overdraft,
                    'currency':  currency,
                })
                # Persist balance back to accounts store
                for a in data.get('accounts', []):
                    if a.get('id') == local_acct_id:
                        a['balance']   = round(balance, 2)
                        a['overdraft'] = round(overdraft, 2)
                        break
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

                    # Auto-categorise using shared keyword rules
                    category = categorise_by_keywords(desc)

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


# ─── Plaid Banking Integration ────────────────────────────────────────────────
#
# Plaid supports US, UK, and EU banks (Chase, Wells Fargo, BofA, etc.)
# Setup:
#   1. Go to https://dashboard.plaid.com → create free account
#   2. Get your client_id and secret from the Keys page
#   3. Set env vars:
#      PLAID_CLIENT_ID=your_client_id
#      PLAID_SECRET=your_secret
#      PLAID_ENV=sandbox   (or production)

PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID', '')
PLAID_SECRET    = os.environ.get('PLAID_SECRET', '')
PLAID_ENV       = os.environ.get('PLAID_ENV', 'sandbox')  # 'sandbox' or 'production'

PLAID_BASE_URL = 'https://sandbox.plaid.com' if PLAID_ENV == 'sandbox' else 'https://production.plaid.com'
PLAID_FILE     = 'plaid_connections.json'

# Plaid personal_finance_category → app category mapping
PLAID_CATEGORY_MAP = {
    'FOOD_AND_DRINK':          'Food & Dining',
    'GENERAL_MERCHANDISE':     'Shopping',
    'TRANSPORTATION':          'Transport',
    'TRAVEL':                  'Travel',
    'ENTERTAINMENT':           'Entertainment',
    'PERSONAL_CARE':           'Health & Fitness',
    'MEDICAL':                 'Health & Fitness',
    'RENT_AND_UTILITIES':      'Bills & Utilities',
    'HOME_IMPROVEMENT':        'Shopping',
    'GENERAL_SERVICES':        'Other',
    'GOVERNMENT_AND_NON_PROFIT': 'Other',
    'TRANSFER_IN':             'Transfer',
    'TRANSFER_OUT':            'Transfer',
    'LOAN_PAYMENTS':           'Bills & Utilities',
    'BANK_FEES':               'Bills & Utilities',
    'INCOME':                  'Salary',
}


def load_plaid_connections():
    if os.path.exists(PLAID_FILE):
        with open(PLAID_FILE, 'r') as f:
            return json.load(f)
    return []


def save_plaid_connections(connections):
    with open(PLAID_FILE, 'w') as f:
        json.dump(connections, f, indent=2)


def plaid_post(endpoint, payload=None):
    """POST to Plaid API with client_id/secret in body."""
    body = {
        'client_id': PLAID_CLIENT_ID,
        'secret': PLAID_SECRET,
    }
    if payload:
        body.update(payload)
    try:
        r = requests.post(f'{PLAID_BASE_URL}{endpoint}', json=body, timeout=30)
        return r.json(), None if r.status_code == 200 else r.json().get('error_message', f'HTTP {r.status_code}')
    except Exception as e:
        return None, str(e)


def map_plaid_category(plaid_cat, description=''):
    """Map Plaid's personal_finance_category to app categories."""
    if plaid_cat:
        primary = plaid_cat.get('primary', '') if isinstance(plaid_cat, dict) else str(plaid_cat)
        mapped = PLAID_CATEGORY_MAP.get(primary)
        if mapped:
            return mapped
    # Fall back to keyword matching
    return categorise_by_keywords(description)


@app.route('/api/plaid/status')
def plaid_status():
    """Return Plaid configuration status and connections."""
    configured = bool(PLAID_CLIENT_ID and PLAID_SECRET)
    connections = load_plaid_connections()
    return jsonify({
        'configured': configured,
        'env': PLAID_ENV,
        'connections': [{
            'id':          c['id'],
            'bank_name':   c.get('institution_name', 'Plaid Bank'),
            'accounts':    c.get('accounts', []),
            'last_synced': c.get('last_synced'),
            'status':      c.get('status', 'connected'),
            'source':      'plaid',
        } for c in connections],
    })


@app.route('/api/plaid/create-link-token', methods=['POST'])
def plaid_create_link_token():
    """Create a Plaid Link token for the client SDK."""
    if not PLAID_CLIENT_ID:
        return jsonify({'error': 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET env vars.'}), 400

    data, err = plaid_post('/link/token/create', {
        'user': {'client_user_id': 'wealth-app-user'},
        'client_name': 'Wealth App',
        'products': ['transactions'],
        'country_codes': ['US', 'GB', 'ES', 'FR', 'DE', 'IE', 'NL'],
        'language': 'en',
    })
    if err:
        return jsonify({'error': f'Failed to create link token: {err}'}), 500
    return jsonify({'link_token': data.get('link_token')})


@app.route('/api/plaid/exchange-token', methods=['POST'])
def plaid_exchange_token():
    """Exchange a public_token from Plaid Link for a permanent access_token."""
    body = request.json
    public_token     = body.get('public_token')
    institution_id   = body.get('institution_id', '')
    institution_name = body.get('institution_name', 'Plaid Bank')

    if not public_token:
        return jsonify({'error': 'Missing public_token'}), 400

    # Exchange public_token for access_token
    data, err = plaid_post('/item/public_token/exchange', {
        'public_token': public_token,
    })
    if err:
        return jsonify({'error': f'Token exchange failed: {err}'}), 500

    access_token = data.get('access_token')
    item_id      = data.get('item_id')

    # Fetch accounts
    acct_data, acct_err = plaid_post('/accounts/get', {
        'access_token': access_token,
    })
    accounts = []
    if acct_data:
        for a in acct_data.get('accounts', []):
            accounts.append({
                'account_id':   a['account_id'],
                'display_name': a.get('name', a.get('official_name', 'Account')),
                'account_type': a.get('type', 'depository'),
                'subtype':      a.get('subtype', ''),
                'currency':     a.get('balances', {}).get('iso_currency_code', 'USD'),
                'mask':         a.get('mask', ''),
            })

    # Save connection
    connections = load_plaid_connections()
    conn_id = str(uuid.uuid4())[:8]
    connections.append({
        'id':               conn_id,
        'item_id':          item_id,
        'access_token':     access_token,
        'institution_id':   institution_id,
        'institution_name': institution_name,
        'accounts':         accounts,
        'cursor':           '',  # for transactions/sync cursor-based pagination
        'status':           'connected',
        'connected_at':     datetime.now().isoformat(),
        'last_synced':      None,
    })
    save_plaid_connections(connections)

    return jsonify({
        'ok': True,
        'connection_id': conn_id,
        'bank_name': institution_name,
        'accounts': len(accounts),
    })


@app.route('/api/plaid/sync', methods=['POST'])
def plaid_sync():
    """Sync transactions from all Plaid connections using cursor-based /transactions/sync."""
    connections = load_plaid_connections()
    if not connections:
        return jsonify({'error': 'No Plaid connections'}), 400

    data = load_data()
    today = datetime.now().strftime('%Y-%m-%d')

    total_imported = 0
    total_skipped  = 0
    total_removed  = 0
    synced_accounts = []
    errors = []

    for conn in connections:
        access_token = conn.get('access_token')
        if not access_token:
            continue

        cursor = conn.get('cursor', '')
        has_more = True
        conn_imported = 0

        # Ensure local accounts exist for each Plaid account
        for acct in conn.get('accounts', []):
            local_acct_id = f"pl_{acct['account_id'][:12]}"
            existing = next((a for a in data.get('accounts', []) if a.get('id') == local_acct_id), None)
            if not existing:
                data.setdefault('accounts', []).append({
                    'id':             local_acct_id,
                    'name':           acct.get('display_name', 'Plaid Account'),
                    'bank':           conn.get('institution_name', 'Plaid Bank'),
                    'currency':       acct.get('currency', 'USD'),
                    'account_type':   acct.get('account_type', 'depository'),
                    'pl_account_id':  acct['account_id'],
                    'pl_connection_id': conn['id'],
                })

        # Cursor-based sync loop
        while has_more:
            sync_payload = {'access_token': access_token}
            if cursor:
                sync_payload['cursor'] = cursor

            sync_data, sync_err = plaid_post('/transactions/sync', sync_payload)
            if sync_err:
                errors.append(f"{conn.get('institution_name', 'Plaid')}: {sync_err}")
                break

            # Process added transactions
            existing_pl_ids = {t.get('pl_transaction_id') for t in data['transactions'] if t.get('pl_transaction_id')}

            for txn in sync_data.get('added', []):
                pl_id = txn.get('transaction_id')
                if pl_id in existing_pl_ids:
                    total_skipped += 1
                    continue

                # Plaid amounts: positive = debit (money spent), negative = credit (money received)
                raw_amount = txn.get('amount', 0)
                amount     = abs(raw_amount)
                txn_type   = 'debit' if raw_amount > 0 else 'credit'

                desc     = txn.get('name', txn.get('merchant_name', 'Unknown'))
                txn_date = txn.get('date', today)
                currency = txn.get('iso_currency_code', txn.get('unofficial_currency_code', 'USD'))

                # Map account
                pl_acct_id = txn.get('account_id', '')
                local_acct_id = f"pl_{pl_acct_id[:12]}"

                # Categorise
                plaid_cat = txn.get('personal_finance_category')
                category  = map_plaid_category(plaid_cat, desc)

                new_txn = {
                    'id':                str(uuid.uuid4()),
                    'date':              txn_date,
                    'description':       desc,
                    'amount':            round(amount, 2),
                    'type':              txn_type,
                    'category':          category,
                    'currency':          currency,
                    'account_id':        local_acct_id,
                    'bank':              conn.get('institution_name', 'Plaid Bank'),
                    'notes':             txn.get('merchant_name', ''),
                    'is_scheduled':      txn_date > today,
                    'source':            'plaid',
                    'pl_transaction_id': pl_id,
                }
                data['transactions'].append(new_txn)
                conn_imported += 1

            # Process removed transactions
            for txn in sync_data.get('removed', []):
                pl_id = txn.get('transaction_id')
                before = len(data['transactions'])
                data['transactions'] = [t for t in data['transactions'] if t.get('pl_transaction_id') != pl_id]
                total_removed += before - len(data['transactions'])

            cursor   = sync_data.get('next_cursor', '')
            has_more = sync_data.get('has_more', False)

        total_imported += conn_imported

        # Fetch balances
        bal_data, bal_err = plaid_post('/accounts/balance/get', {'access_token': access_token})
        if bal_data:
            for a in bal_data.get('accounts', []):
                balance = a.get('balances', {}).get('available', a.get('balances', {}).get('current', 0))
                synced_accounts.append({
                    'name':     a.get('name', 'Account'),
                    'bank':     conn.get('institution_name', 'Plaid Bank'),
                    'balance':  balance,
                    'currency': a.get('balances', {}).get('iso_currency_code', 'USD'),
                })
                # Persist balance to local account store
                local_acct_id = f"pl_{a['account_id'][:12]}"
                for la in data.get('accounts', []):
                    if la.get('id') == local_acct_id:
                        la['balance'] = round(balance or 0, 2)
                        break

        # Update cursor and last_synced
        conn['cursor']      = cursor
        conn['last_synced']  = datetime.now().isoformat()
        conn['status']       = 'connected'

    save_data(data)
    save_plaid_connections(connections)

    return jsonify({
        'ok':        True,
        'imported':  total_imported,
        'skipped':   total_skipped,
        'removed':   total_removed,
        'accounts':  synced_accounts,
        'errors':    errors,
        'synced_at': datetime.now().isoformat(),
    })


@app.route('/api/plaid/disconnect/<connection_id>', methods=['DELETE'])
def plaid_disconnect(connection_id):
    """Disconnect a Plaid bank connection."""
    connections = load_plaid_connections()
    conn = next((c for c in connections if c['id'] == connection_id), None)

    if conn:
        # Call Plaid to remove the item
        plaid_post('/item/remove', {'access_token': conn.get('access_token', '')})

    # Remove connection
    connections = [c for c in connections if c['id'] != connection_id]
    save_plaid_connections(connections)

    # Remove auto-created accounts (keep transactions)
    data = load_data()
    data['accounts'] = [a for a in data.get('accounts', []) if a.get('pl_connection_id') != connection_id]
    save_data(data)

    return jsonify({'ok': True})


# ─── Scenario Comparison Engine ────────────────────────────────────────────────

@app.route('/api/scenarios/compare', methods=['POST'])
def compare_scenarios():
    """Compare multiple retirement/investment scenarios side-by-side."""
    import random
    data = load_data()
    body = request.json
    scenarios = body.get('scenarios', [])
    base_params = body.get('base', {})
    num_sims = int(body.get('simulations', 500))
    
    if not scenarios:
        return jsonify({'error': 'No scenarios provided'}), 400
    
    results = []
    for scenario in scenarios:
        params = {**base_params, **scenario.get('overrides', {})}
        result = _run_scenario_simulation(data, params, num_sims)
        result['name'] = scenario.get('name', 'Scenario')
        result['description'] = scenario.get('description', '')
        results.append(result)
    
    # Compute deltas from first scenario (baseline)
    baseline = results[0]
    for r in results[1:]:
        r['delta_success_rate'] = round(r['success_rate'] - baseline['success_rate'], 1)
        r['delta_median_final'] = round(r['median_final'] - baseline['median_final'], 0)
        r['delta_retire_age'] = r.get('earliest_safe_age', 99) - baseline.get('earliest_safe_age', 99)
        r['delta_depletion_age'] = round(r.get('median_depletion_age', 99) - baseline.get('median_depletion_age', 99), 1)
    
    return jsonify({'scenarios': results, 'baseline_name': baseline['name']})


def _run_scenario_simulation(data, params, num_sims=500):
    """Run a full Monte Carlo simulation for a given parameter set."""
    import random
    
    current_nw = float(params.get('current_nw', 0))
    monthly_contrib = float(params.get('monthly_contrib', 0))
    annual_spend = float(params.get('annual_spend', 0))
    current_age = int(params.get('current_age', 35))
    retire_age = int(params.get('retire_age', 60))
    life_exp = int(params.get('life_expectancy', 90))
    expected_return = float(params.get('expected_return', 7)) / 100
    volatility = float(params.get('volatility', 15)) / 100
    inflation = float(params.get('inflation', 2.5)) / 100
    
    # Withdrawal order & tax modelling
    isa_val = float(params.get('isa_value', 0))
    pension_val = float(params.get('pension_value', 0))
    taxable_val = float(params.get('taxable_value', 0))
    pension_access_age = int(params.get('pension_access_age', 57))
    
    # FIRE settings
    fs = data.get('fire_settings', {})
    state_pension = float(params.get('state_pension', fs.get('state_pension_annual', 0)))
    state_pension_age = int(params.get('state_pension_age', fs.get('state_pension_age', 67)))
    
    years_to_retire = max(0, retire_age - current_age)
    total_years = max(1, life_exp - current_age)
    
    successes = 0
    failure_ages = []
    depletion_ages = []
    final_values = []
    all_paths = []
    
    for sim in range(num_sims):
        portfolio = current_nw
        path = [portfolio]
        failed = False
        fail_age = None
        
        for year in range(total_years):
            age = current_age + year + 1
            
            # Sequence-of-returns risk: use random returns from normal distribution
            annual_return = random.gauss(expected_return, volatility)
            
            if age <= retire_age:
                # Accumulation phase
                portfolio = portfolio * (1 + annual_return) + monthly_contrib * 12
            else:
                # Drawdown phase
                years_since_start = age - current_age
                infl_spend = annual_spend * (1 + inflation) ** years_since_start
                
                # State pension offset
                pension_income = state_pension if age >= state_pension_age else 0
                gross_withdrawal = max(0, infl_spend - pension_income)
                
                # Tax on withdrawal (simplified: 0% on ISA, ~20% on pension, ~20% on taxable)
                tax_rate = float(params.get('withdrawal_tax_rate', 15)) / 100
                net_withdrawal = gross_withdrawal * (1 + tax_rate)
                
                portfolio = portfolio * (1 + annual_return) - net_withdrawal
            
            if portfolio < 0 and not failed:
                portfolio = 0
                failed = True
                fail_age = age
            elif portfolio < 0:
                portfolio = 0
            
            path.append(round(portfolio, 0))
        
        if not failed:
            successes += 1
            depletion_ages.append(life_exp + 10)  # Never depleted
        else:
            failure_ages.append(fail_age)
            depletion_ages.append(fail_age)
        
        final_values.append(round(portfolio, 0))
        if sim < 50:
            all_paths.append(path)
    
    # Percentile bands
    percentiles = {}
    ages = list(range(current_age, life_exp + 1))
    for year_idx in range(total_years + 1):
        year_vals = sorted([p[min(year_idx, len(p)-1)] for p in all_paths])
        n = len(year_vals)
        for pct_name, pct_val in [('p10', 0.1), ('p25', 0.25), ('p50', 0.5), ('p75', 0.75), ('p90', 0.9)]:
            percentiles.setdefault(pct_name, []).append(round(year_vals[max(0, int(n * pct_val))], 0))
    
    final_sorted = sorted(final_values)
    n = len(final_sorted)
    depletion_sorted = sorted(depletion_ages)
    dn = len(depletion_sorted)
    
    # Failure age analysis
    fail_before_70 = sum(1 for a in depletion_ages if a < 70) / num_sims * 100
    fail_before_80 = sum(1 for a in depletion_ages if a < 80) / num_sims * 100
    fail_before_90 = sum(1 for a in depletion_ages if a < 90) / num_sims * 100
    median_depletion = depletion_sorted[dn // 2] if depletion_sorted else life_exp
    
    # Failure age histogram (5-year buckets)
    failure_histogram = {}
    for age in failure_ages:
        bucket = f"{(age // 5) * 5}-{(age // 5) * 5 + 4}"
        failure_histogram[bucket] = failure_histogram.get(bucket, 0) + 1
    
    # Risk classification
    success_rate = round(successes / num_sims * 100, 1)
    if success_rate >= 80:
        risk_band = 'strong'
        risk_label = 'Strong — high confidence your money will last'
    elif success_rate >= 50:
        risk_band = 'moderate'
        risk_label = 'Moderate — some risk of running out in later years'
    else:
        risk_band = 'high_risk'
        risk_label = 'High Risk — significant chance of money running out'
    
    # Plain-English interpretation
    interpretation = _generate_mc_interpretation(success_rate, median_depletion, fail_before_80, 
                                                  retire_age, life_exp, annual_spend)
    
    # Find earliest safe retirement age (>75% success rate) by binary search
    earliest_safe_age = retire_age
    
    return {
        'success_rate': success_rate,
        'simulations': num_sims,
        'ages': ages,
        'percentiles': percentiles,
        'median_final': round(final_sorted[n // 2], 0),
        'final_p10': round(final_sorted[max(0, int(n * 0.1))], 0),
        'final_p90': round(final_sorted[max(0, int(n * 0.9))], 0),
        'worst_case': round(final_sorted[0], 0),
        'best_case': round(final_sorted[-1], 0),
        'fail_before_70': round(fail_before_70, 1),
        'fail_before_80': round(fail_before_80, 1),
        'fail_before_90': round(fail_before_90, 1),
        'median_depletion_age': round(median_depletion, 0),
        'failure_histogram': failure_histogram,
        'failure_ages': sorted(failure_ages),
        'risk_band': risk_band,
        'risk_label': risk_label,
        'interpretation': interpretation,
        'earliest_safe_age': earliest_safe_age,
        'params': {
            'retire_age': retire_age,
            'monthly_contrib': monthly_contrib,
            'annual_spend': annual_spend,
            'expected_return': expected_return * 100,
            'volatility': volatility * 100,
        },
    }


def _generate_mc_interpretation(success_rate, median_depletion, fail_before_80, 
                                 retire_age, life_exp, annual_spend):
    """Generate plain-English interpretation of Monte Carlo results."""
    lines = []
    
    if success_rate >= 90:
        lines.append(f"Your plan has a {success_rate}% probability of success — this is excellent. Your money is very likely to last through age {life_exp}.")
    elif success_rate >= 75:
        lines.append(f"Your plan has a {success_rate}% probability of success — this is solid but could be improved. Consider small adjustments to build a larger buffer.")
    elif success_rate >= 50:
        lines.append(f"Your plan has a {success_rate}% probability of success — this needs attention. There's a meaningful risk of running out of money.")
    else:
        lines.append(f"Your plan has only a {success_rate}% probability of success — this is a serious concern. Significant changes are needed to your retirement strategy.")
    
    if median_depletion < life_exp:
        lines.append(f"In the median scenario, your money runs out at age {int(median_depletion)}. This is {int(life_exp - median_depletion)} years before your life expectancy.")
    else:
        lines.append(f"In the median scenario, your money lasts beyond age {life_exp}.")
    
    if fail_before_80 > 5:
        lines.append(f"⚠ {fail_before_80:.0f}% of simulations show depletion before age 80 — this is a critical risk that should be addressed.")
    
    return ' '.join(lines)


@app.route('/api/wealth-intelligence', methods=['GET'])
def wealth_intelligence():
    """Compute the Wealth Intelligence Score (0-100) across 5 dimensions."""
    data = load_data()
    rates = get_exchange_rates()
    t = data.get('totals_cache', {})  # We'll compute fresh
    
    gs = data.get('global_settings', {})
    ret = data.get('retirement', {})
    contribs = data.get('monthly_contributions', {})
    mortgages = data.get('mortgages', [])
    debts = data.get('debts_detailed', [])
    
    income = float(data.get('income', 0))
    savings = float(data.get('savings', 0))
    # Pension is pre-tax (already deducted before take-home income)
    # Only post-tax contributions count against take-home for savings rate
    pension_contrib = float(contribs.get('pension', 0)) if isinstance(contribs.get('pension', 0), (int, float)) else 0
    post_tax_contribs = sum(float(v) for k, v in contribs.items() if isinstance(v, (int, float)) and k != 'pension')
    total_contribs_all = post_tax_contribs + pension_contrib  # For accumulation projections
    nw_history = data.get('net_worth_history', [])
    
    # Investment totals
    inv = data.get('investments', {})
    isa_total = sum(float(s.get('shares',0)*s.get('current_price',0)) for s in inv.get('isa', []))
    for s in inv.get('isa', []):
        if 'current_value' in s:
            isa_total = sum(float(s.get('current_value', s.get('shares',0)*s.get('current_price',0))) for s in inv.get('isa', []))
            break
    pension_total = sum(float(s.get('current_value', 0)) for s in inv.get('pension', []))
    
    total_investments = isa_total + pension_total
    for bucket in ['stocks', 'rsu', 'crypto', 'custom']:
        for s in inv.get(bucket, []):
            total_investments += float(s.get('current_value', s.get('value_gbp', 0)) or 0)
    
    mortgage_bal = sum(float(m.get('current_balance', 0)) for m in mortgages)
    debt_bal = sum(float(d.get('balance', 0)) for d in debts)
    total_debt = mortgage_bal + debt_bal
    
    scores = {}
    actions = []
    
    # ── 1. SAVINGS DISCIPLINE (20 pts) ──
    sd_score = 0
    sd_notes = []
    # Savings rate: post-tax contributions as % of take-home income (pension is pre-tax, excluded)
    savings_rate = post_tax_contribs / max(income, 1) * 100 if income > 0 else 0
    if savings_rate >= 25: sd_score += 8
    elif savings_rate >= 15: sd_score += 5
    elif savings_rate >= 5: sd_score += 3
    else:
        sd_notes.append(f'Savings rate is only {savings_rate:.0f}% — target at least 15%')
        actions.append({'priority': 1, 'action': f'Increase savings rate from {savings_rate:.0f}% to 15%+', 'impact': 'high'})
    
    # Consistency — are contributions set up?
    active_contribs = sum(1 for v in contribs.values() if isinstance(v, (int, float)) and v > 0)
    if active_contribs >= 3: sd_score += 6
    elif active_contribs >= 2: sd_score += 4
    elif active_contribs >= 1: sd_score += 2
    else:
        sd_notes.append('No regular investment contributions set up')
        actions.append({'priority': 2, 'action': 'Set up regular monthly investment contributions', 'impact': 'high'})
    
    # Emergency fund
    months_runway = savings / max(income * 0.7, 1) if income > 0 else 0
    if months_runway >= 6: sd_score += 6
    elif months_runway >= 3: sd_score += 3
    else:
        sd_notes.append(f'Emergency fund covers only {months_runway:.1f} months — target 6 months')
        actions.append({'priority': 3, 'action': f'Build emergency fund from {months_runway:.0f} to 6 months', 'impact': 'medium'})
    
    scores['savings_discipline'] = {'score': min(20, sd_score), 'max': 20, 'notes': sd_notes}
    
    # ── 2. WEALTH GROWTH (20 pts) ──
    wg_score = 0
    wg_notes = []
    
    # NW trend — are we growing?
    if len(nw_history) >= 3:
        recent = nw_history[-3:]
        oldest = recent[0].get('net_worth', 0)
        newest = recent[-1].get('net_worth', 0)
        growth = newest - oldest
        if growth > 0: wg_score += 8
        elif growth > -oldest * 0.02: wg_score += 4
        else:
            wg_notes.append(f'Net worth declined by {abs(growth):,.0f} over last 3 months')
    else:
        wg_score += 4  # No history yet, neutral
        wg_notes.append('Not enough history to assess growth trend')
    
    # Investment diversity
    non_empty_buckets = sum(1 for k in ['isa', 'pension', 'stocks', 'crypto', 'rsu'] if inv.get(k))
    if non_empty_buckets >= 3: wg_score += 6
    elif non_empty_buckets >= 2: wg_score += 4
    else:
        wg_notes.append('Limited investment diversification — consider spreading across more asset types')
        actions.append({'priority': 4, 'action': 'Diversify investments across ISA, pension, and general account', 'impact': 'medium'})
    
    # Contributions vs income ratio
    contrib_pct = post_tax_contribs / max(income, 1) * 100
    if contrib_pct >= 20: wg_score += 6
    elif contrib_pct >= 10: wg_score += 4
    elif contrib_pct >= 5: wg_score += 2
    
    scores['wealth_growth'] = {'score': min(20, wg_score), 'max': 20, 'notes': wg_notes}
    
    # ── 3. RISK MANAGEMENT (20 pts) ──
    rm_score = 0
    rm_notes = []
    
    # Debt-to-income
    dti = total_debt / max(income * 12, 1) * 100 if income > 0 else 0
    if dti < 200: rm_score += 6
    elif dti < 400: rm_score += 3
    else:
        rm_notes.append(f'Debt-to-income ratio is {dti:.0f}% — consider a paydown strategy')
    
    # High-interest debt
    high_rate_debt = sum(float(d.get('balance', 0)) for d in debts if float(d.get('interest_rate', 0)) > 10)
    if high_rate_debt == 0: rm_score += 7
    elif high_rate_debt < 5000: rm_score += 3
    else:
        rm_notes.append(f'£{high_rate_debt:,.0f} in high-interest debt (>10%) — prioritise paying this off')
        actions.append({'priority': 1, 'action': f'Pay off £{high_rate_debt:,.0f} in high-interest debt first', 'impact': 'critical'})
    
    # Emergency fund already scored in savings, but also matters for risk
    if months_runway >= 3: rm_score += 4
    elif months_runway >= 1: rm_score += 2
    
    # Portfolio concentration (single asset > 40% of investments)
    if total_investments > 0:
        max_bucket = max(
            isa_total, pension_total,
            sum(float(s.get('value_gbp', 0) or 0) for s in inv.get('stocks', [])),
            sum(float(s.get('value_gbp', 0) or 0) for s in inv.get('crypto', [])),
        )
        concentration = max_bucket / total_investments * 100
        if concentration < 40: rm_score += 3
        elif concentration < 60: rm_score += 1
        else:
            rm_notes.append(f'Portfolio concentration risk: largest bucket is {concentration:.0f}% of investments')
    
    scores['risk_management'] = {'score': min(20, rm_score), 'max': 20, 'notes': rm_notes}
    
    # ── 4. TAX EFFICIENCY (20 pts) ──
    te_score = 0
    te_notes = []
    
    # ISA usage
    isa_contrib = float(contribs.get('isa', 0)) * 12
    if isa_contrib >= 15000: te_score += 7
    elif isa_contrib >= 5000: te_score += 4
    elif isa_contrib > 0: te_score += 2
    else:
        te_notes.append('Not using ISA allowance — £20,000/yr tax-free investing')
        actions.append({'priority': 2, 'action': 'Start using your ISA allowance (£20k/yr tax-free)', 'impact': 'high'})
    
    # Pension usage
    pension_contrib = float(contribs.get('pension', 0)) * 12
    if pension_contrib >= 10000: te_score += 7
    elif pension_contrib >= 3000: te_score += 4
    elif pension_contrib > 0: te_score += 2
    else:
        te_notes.append('Low pension contributions — you may be missing tax relief')
    
    # CGT awareness
    disposals = data.get('disposals', [])
    if len(disposals) > 0 or isa_total > total_investments * 0.5:
        te_score += 6  # Has CGT awareness or mostly tax-sheltered
    elif total_investments > 50000:
        te_notes.append('Significant investments outside ISA — consider tax-loss harvesting')
        actions.append({'priority': 5, 'action': 'Review CGT position and consider tax-loss harvesting', 'impact': 'medium'})
    else:
        te_score += 3  # Small portfolio, less relevant
    
    scores['tax_efficiency'] = {'score': min(20, te_score), 'max': 20, 'notes': te_notes}
    
    # ── 5. FREEDOM PROGRESS (20 pts) ──
    fp_score = 0
    fp_notes = []
    
    # How close to FIRE?
    target_age = ret.get('target_age', 60)
    current_age = ret.get('current_age', 35)
    fire_corpus = float(income or 3000) * 12 * 25  # Rough 4% SWR
    
    manual_property = float(data.get('property_value', 0))
    mortgage_prop = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in mortgages)
    total_nw = savings + total_investments + manual_property + mortgage_prop + float(data.get('other_assets', 0)) - total_debt
    
    fire_pct = total_nw / max(fire_corpus, 1) * 100
    if fire_pct >= 100: fp_score += 10
    elif fire_pct >= 75: fp_score += 7
    elif fire_pct >= 50: fp_score += 5
    elif fire_pct >= 25: fp_score += 3
    else:
        fp_notes.append(f'Only {fire_pct:.0f}% to FIRE number — maintain consistent contributions')
    
    # Retirement settings configured?
    if ret.get('target_age') and ret.get('current_age'):
        fp_score += 5
    else:
        fp_notes.append('Retirement settings not configured — set your target age and assumptions')
        actions.append({'priority': 3, 'action': 'Configure retirement age and spending assumptions', 'impact': 'medium'})
    
    # Wealth velocity (monthly NW growth rate)
    if len(nw_history) >= 2:
        months = len(nw_history)
        first_nw = nw_history[0].get('net_worth', 0)
        last_nw = nw_history[-1].get('net_worth', 0)
        if first_nw > 0:
            monthly_growth = ((last_nw / first_nw) ** (1 / max(months, 1)) - 1) * 100
            if monthly_growth > 1: fp_score += 5
            elif monthly_growth > 0: fp_score += 3
            else:
                fp_notes.append('Net worth growth rate is negative')
    
    scores['freedom_progress'] = {'score': min(20, fp_score), 'max': 20, 'notes': fp_notes}
    
    # Compute total
    total_score = sum(s['score'] for s in scores.values())
    
    # Sort actions by priority
    actions.sort(key=lambda a: a['priority'])
    
    # Wealth momentum calculation
    momentum = {}
    if len(nw_history) >= 2:
        last = nw_history[-1].get('net_worth', 0)
        prev = nw_history[-2].get('net_worth', 0)
        momentum['monthly_change'] = round(last - prev, 0)
        momentum['monthly_pct'] = round((last - prev) / max(abs(prev), 1) * 100, 1)
        if len(nw_history) >= 4:
            q_ago = nw_history[-4].get('net_worth', 0)
            momentum['quarterly_change'] = round(last - q_ago, 0)
    
    return jsonify({
        'total_score': total_score,
        'max_score': 100,
        'grade': 'A+' if total_score >= 90 else 'A' if total_score >= 80 else 'B' if total_score >= 65 else 'C' if total_score >= 50 else 'D',
        'scores': scores,
        'actions': actions[:5],
        'momentum': momentum,
        'fire_pct': round(fire_pct, 1),
    })


# ─── Tax Optimisation Engine ──────────────────────────────────────────────────

@app.route('/api/tax-optimisation', methods=['GET'])
def tax_optimisation():
    """Compute tax optimisation opportunities with projected savings."""
    data = load_data()
    rates = get_exchange_rates()
    gs = data.get('global_settings', {})
    residency = gs.get('tax_residency', 'GB')
    contribs = data.get('monthly_contributions', {})
    inv = data.get('investments', {})
    family = data.get('family_profiles', [])
    income = float(data.get('income', 0))
    annual_income = income * 12
    
    recommendations = []
    total_projected_savings = 0
    
    # ── ISA Allowance Optimisation ──
    isa_annual_limit = 20000
    isa_contrib_annual = float(contribs.get('isa', 0)) * 12
    isa_remaining = max(0, isa_annual_limit - isa_contrib_annual)
    
    # Check non-ISA investments that could be in ISA
    stocks_val = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('stocks', []))
    crypto_val = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('crypto', []))
    taxable_investments = stocks_val + crypto_val
    
    if isa_remaining > 0:
        # Estimate tax savings: gains on ISA-sheltered investments are tax-free
        estimated_annual_gains = isa_remaining * 0.07  # 7% assumed return
        cgt_rate = 0.20 if annual_income > 50270 else 0.10
        tax_saved = round(estimated_annual_gains * cgt_rate, 0)
        recommendations.append({
            'category': 'ISA',
            'title': f'Use remaining ISA allowance: £{isa_remaining:,.0f}',
            'description': f'You\'ve used £{isa_contrib_annual:,.0f} of your £{isa_annual_limit:,.0f} ISA allowance this tax year. Moving investments into your ISA shelters future gains from CGT.',
            'projected_annual_saving': tax_saved,
            'priority': 'high' if isa_remaining > 10000 else 'medium',
            'action': f'Increase ISA contributions by £{isa_remaining/12:,.0f}/mo to maximise allowance',
        })
        total_projected_savings += tax_saved
    
    if taxable_investments > 5000 and isa_remaining > 0:
        transfer_amount = min(taxable_investments, isa_remaining)
        recommendations.append({
            'category': 'ISA',
            'title': f'Bed & ISA: Transfer £{transfer_amount:,.0f} from taxable to ISA',
            'description': 'Sell taxable investments and repurchase within your ISA wrapper. This crystallises any gains (using your CGT allowance) and shelters future growth.',
            'projected_annual_saving': round(transfer_amount * 0.07 * cgt_rate, 0),
            'priority': 'high',
            'action': 'Sell non-ISA holdings and rebuy within ISA this tax year',
        })
    
    # ── Pension Contribution Optimisation ──
    pension_contrib_annual = float(contribs.get('pension', 0)) * 12
    pension_limit = min(60000, annual_income)  # Annual allowance (simplified)
    pension_remaining = max(0, pension_limit - pension_contrib_annual)
    
    if pension_remaining > 0 and annual_income > 0:
        # Tax relief on pension contributions
        if annual_income > 50270:
            marginal_rate = 0.40
            rate_label = '40%'
        elif annual_income > 12570:
            marginal_rate = 0.20
            rate_label = '20%'
        else:
            marginal_rate = 0
            rate_label = '0%'
        
        # Suggest up to £500/mo additional or remaining allowance
        suggest_extra = min(pension_remaining, 6000)  # £500/mo
        tax_relief = round(suggest_extra * marginal_rate, 0)
        
        if marginal_rate > 0:
            recommendations.append({
                'category': 'Pension',
                'title': f'Increase pension contributions by £{suggest_extra/12:,.0f}/mo',
                'description': f'You have £{pension_remaining:,.0f} unused pension allowance. At your {rate_label} marginal rate, every £1 you contribute effectively costs only £{1-marginal_rate:.2f}.',
                'projected_annual_saving': tax_relief,
                'priority': 'high' if marginal_rate >= 0.40 else 'medium',
                'action': f'Salary sacrifice or personal pension top-up of £{suggest_extra/12:,.0f}/mo',
            })
            total_projected_savings += tax_relief
    
    # ── Salary Sacrifice Optimisation (higher rate) ──
    if annual_income > 50270:
        # Salary sacrifice to bring income below higher rate
        excess_over_basic = annual_income - 50270
        max_sacrifice = min(excess_over_basic, pension_remaining)
        if max_sacrifice > 1000:
            ni_saving = round(max_sacrifice * 0.02, 0)  # 2% NI saving
            it_saving = round(max_sacrifice * 0.20, 0)  # 20% difference basic vs higher
            total_ss_saving = ni_saving + it_saving
            recommendations.append({
                'category': 'Pension',
                'title': f'Salary sacrifice £{max_sacrifice:,.0f}/yr to avoid higher-rate tax',
                'description': f'You earn £{excess_over_basic:,.0f} above the basic rate threshold. Salary sacrificing this into your pension saves both income tax (20% difference) and National Insurance.',
                'projected_annual_saving': total_ss_saving,
                'priority': 'high',
                'action': 'Ask HR to set up salary sacrifice arrangement',
            })
            total_projected_savings += total_ss_saving
    
    # ── CGT Harvesting ──
    cgt_exempt = 3000  # 2024/25 annual exempt amount
    disposals = data.get('disposals', [])
    realised_gains = sum(float(d.get('gain_gbp', 0)) for d in disposals)
    
    # Check for unrealised losses
    unrealised_losses = []
    for bucket in ['stocks', 'crypto']:
        for s in inv.get(bucket, []):
            gain = float(s.get('gain_gbp', 0) or 0)
            if gain < -100:
                unrealised_losses.append({'name': s.get('symbol', s.get('name', '?')), 'loss': gain})
    
    if unrealised_losses and realised_gains > cgt_exempt:
        total_harvestable = sum(abs(l['loss']) for l in unrealised_losses)
        tax_saved = round(min(total_harvestable, realised_gains - cgt_exempt) * cgt_rate, 0)
        recommendations.append({
            'category': 'CGT',
            'title': f'Tax-loss harvest: £{total_harvestable:,.0f} in unrealised losses',
            'description': f'You have £{realised_gains:,.0f} in realised gains this year vs £{cgt_exempt:,.0f} exempt. Selling loss-making positions offsets gains and reduces your CGT bill.',
            'projected_annual_saving': tax_saved,
            'priority': 'high' if tax_saved > 500 else 'medium',
            'action': 'Sell loss-making positions before tax year end, repurchase after 30 days',
        })
        total_projected_savings += tax_saved
    elif realised_gains < cgt_exempt and taxable_investments > 10000:
        # Unused CGT allowance
        unused = cgt_exempt - max(0, realised_gains)
        recommendations.append({
            'category': 'CGT',
            'title': f'Use your £{unused:,.0f} unused CGT allowance',
            'description': 'You can realise up to this amount in gains tax-free this year. Consider selling and rebuying (or transferring to ISA) appreciated holdings to reset the cost base.',
            'projected_annual_saving': round(unused * cgt_rate, 0),
            'priority': 'low',
            'action': 'Sell appreciated non-ISA holdings within your CGT-free limit',
        })
    
    # ── Dividend Allowance ──
    dividend_allowance = 500  # 2024/25
    recommendations.append({
        'category': 'Dividends',
        'title': f'Dividend allowance: £{dividend_allowance:,.0f}/yr tax-free',
        'description': 'If you hold dividend-paying stocks outside an ISA, ensure you\'re tracking dividends against this allowance. Consider moving high-dividend holdings into your ISA.',
        'projected_annual_saving': 0,
        'priority': 'info',
        'action': 'Review dividend income from non-ISA holdings',
    })
    
    # ── Ownership Split (if couple) ──
    if len(family) >= 2:
        partner = next((p for p in family if p.get('relationship') in ['partner', 'spouse']), None)
        if partner:
            partner_income = float(partner.get('gross_income', 0))
            if partner_income < annual_income * 0.5 and taxable_investments > 20000:
                income_diff = annual_income - partner_income
                potential_saving = round(min(taxable_investments * 0.05, income_diff * 0.20) * 0.5, 0)
                recommendations.append({
                    'category': 'Ownership',
                    'title': 'Consider joint ownership of investments',
                    'description': f'Your partner earns significantly less. Splitting investment income/gains could use both your allowances and potentially be taxed at lower rates.',
                    'projected_annual_saving': potential_saving,
                    'priority': 'medium',
                    'action': 'Speak to a tax advisor about beneficial ownership arrangements',
                })
                total_projected_savings += potential_saving
    
    # Sort by projected savings
    recommendations.sort(key=lambda r: -(r.get('projected_annual_saving', 0)))
    
    return jsonify({
        'recommendations': recommendations,
        'total_projected_annual_saving': round(total_projected_savings, 0),
        'summary': {
            'isa_used': round(isa_contrib_annual, 0),
            'isa_remaining': round(isa_remaining, 0),
            'pension_used': round(pension_contrib_annual, 0),
            'pension_remaining': round(pension_remaining, 0),
            'cgt_allowance_used': round(max(0, realised_gains), 0),
            'cgt_allowance_remaining': round(max(0, cgt_exempt - realised_gains), 0),
            'marginal_tax_rate': f'{marginal_rate*100:.0f}%' if annual_income > 12570 else '0%',
        }
    })


# ─── Estate & IHT Projection ─────────────────────────────────────────────────

@app.route('/api/estate-projection', methods=['GET'])
def estate_projection():
    """Project estate value and estimate inheritance tax liability."""
    data = load_data()
    rates = get_exchange_rates()
    ret = data.get('retirement', {})
    gs = data.get('global_settings', {})
    residency = gs.get('tax_residency', 'GB')
    
    current_age = ret.get('current_age', 35)
    life_exp = ret.get('life_expectancy', 85)
    expected_return = (ret.get('expected_return', 7)) / 100
    inflation = (ret.get('inflation_rate', 2.5)) / 100
    
    # Current estate value
    savings = float(data.get('savings', 0))
    inv = data.get('investments', {})
    isa_total = sum(float(s.get('current_value', s.get('value_gbp', 0)) or 0) for s in inv.get('isa', []))
    pension_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('pension', []))
    stocks_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('stocks', []))
    crypto_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('crypto', []))
    rsu_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('rsu', []))
    custom_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('custom', []))
    
    manual_property = float(data.get('property_value', 0))
    mortgage_property = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in data.get('mortgages', []))
    total_property = manual_property + mortgage_property
    mortgage_debt = sum(float(m.get('current_balance', 0)) for m in data.get('mortgages', []))
    other_debt = sum(float(d.get('balance', 0)) for d in data.get('debts_detailed', []))
    other_assets = float(data.get('other_assets', 0))
    
    current_estate = savings + isa_total + pension_total + stocks_total + crypto_total + rsu_total + custom_total + total_property + other_assets - mortgage_debt - other_debt
    
    # Project estate at life expectancy (simplified growth)
    years_to_le = max(0, life_exp - current_age)
    real_return = max(0.01, expected_return - inflation)
    projected_estate = current_estate * (1 + real_return) ** years_to_le
    
    # IHT calculation (UK rules)
    nil_rate_band = 325000
    residence_nil_rate = 175000  # If passing main home to direct descendants
    
    family = data.get('family_profiles', [])
    has_spouse = any(p.get('relationship') in ['partner', 'spouse'] for p in family)
    has_children = any(p.get('relationship') in ['child', 'dependent'] for p in family)
    
    # Spouse exemption: everything passes to spouse tax-free
    # Residence nil-rate: applies if home goes to children
    total_threshold = nil_rate_band
    if has_children and total_property > 0:
        total_threshold += residence_nil_rate
    if has_spouse:
        total_threshold *= 2  # Transferable between spouses
    
    # Pensions are typically outside IHT
    estate_for_iht = projected_estate - pension_total
    
    taxable_estate = max(0, estate_for_iht - total_threshold)
    iht_liability = round(taxable_estate * 0.40, 0)
    effective_rate = round(iht_liability / max(estate_for_iht, 1) * 100, 1)
    
    # Year-by-year projection
    projections = []
    estate = current_estate
    for yr in range(0, years_to_le + 1, 5):
        age = current_age + yr
        est = current_estate * (1 + real_return) ** yr
        est_for_iht = est - pension_total * (1 + real_return * 0.5) ** yr  # Pension grows slower
        taxable = max(0, est_for_iht - total_threshold)
        iht = round(taxable * 0.40, 0)
        projections.append({
            'age': age,
            'estate_value': round(est, 0),
            'iht_liability': iht,
            'net_to_heirs': round(est - iht, 0),
        })
    
    # Mitigation strategies
    strategies = []
    if iht_liability > 0:
        strategies.append({
            'strategy': 'Maximise pension contributions',
            'description': 'Pensions are typically outside your estate for IHT purposes. Spending from other sources first preserves this exemption.',
            'potential_saving': round(min(pension_total * 0.4, iht_liability * 0.3), 0),
        })
        strategies.append({
            'strategy': 'Annual gifting (£3,000/yr each)',
            'description': 'Use your annual gift exemption. £3,000/yr per person, plus £250 small gifts, can reduce your estate over time.',
            'potential_saving': round(min(3000 * years_to_le * 0.40, iht_liability * 0.1), 0),
        })
        if not has_spouse:
            strategies.append({
                'strategy': 'Marriage / civil partnership',
                'description': 'Spouses can inherit everything tax-free, and their nil-rate bands transfer.',
                'potential_saving': round(min(nil_rate_band * 0.40, iht_liability), 0),
            })
        if taxable_estate > 500000:
            strategies.append({
                'strategy': 'Consider trust arrangements',
                'description': 'Trusts can help manage how assets pass and potentially reduce the IHT-liable estate. Seek professional advice.',
                'potential_saving': 0,
            })
    
    return jsonify({
        'current_estate': round(current_estate, 0),
        'projected_estate': round(projected_estate, 0),
        'at_age': life_exp,
        'nil_rate_band': nil_rate_band,
        'residence_nil_rate': residence_nil_rate if has_children else 0,
        'total_threshold': total_threshold,
        'spouse_exemption': has_spouse,
        'taxable_estate': round(taxable_estate, 0),
        'iht_liability': iht_liability,
        'effective_rate': effective_rate,
        'net_to_heirs': round(projected_estate - iht_liability, 0),
        'projections': projections,
        'strategies': strategies,
        'breakdown': {
            'property': round(total_property, 0),
            'investments': round(isa_total + stocks_total + crypto_total + rsu_total + custom_total, 0),
            'pension': round(pension_total, 0),
            'cash': round(savings, 0),
            'other': round(other_assets, 0),
            'debts': round(mortgage_debt + other_debt, 0),
        },
    })


# ─── Professional Reporting ───────────────────────────────────────────────────

@app.route('/api/reports/wealth-summary', methods=['GET'])
def generate_wealth_report():
    """Generate a comprehensive wealth summary report with all key data."""
    data = load_data()
    rates = get_exchange_rates()
    
    # Gather all the data needed for a comprehensive report
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Net worth components
    savings = float(data.get('savings', 0))
    manual_property = float(data.get('property_value', 0))
    other_assets = float(data.get('other_assets', 0))
    mortgage_prop = sum(float(m.get('property_value') or m.get('principal') or m.get('current_balance') or 0) for m in data.get('mortgages', []))
    total_property = manual_property + mortgage_prop
    
    inv = data.get('investments', {})
    isa_total = sum(float(s.get('current_value', s.get('value_gbp', 0)) or 0) for s in inv.get('isa', []))
    pension_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('pension', []))
    stocks_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('stocks', []))
    crypto_total = sum(float(s.get('value_gbp', s.get('current_value', 0)) or 0) for s in inv.get('crypto', []))
    rsu_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('rsu', []))
    custom_total = sum(float(s.get('current_value', 0) or 0) for s in inv.get('custom', []))
    total_investments = isa_total + pension_total + stocks_total + crypto_total + rsu_total + custom_total
    
    mortgage_debt = sum(float(m.get('current_balance', 0)) for m in data.get('mortgages', []))
    other_debt = sum(float(d.get('balance', 0)) for d in data.get('debts_detailed', []))
    total_debt = mortgage_debt + other_debt
    
    net_worth = savings + total_investments + total_property + other_assets - total_debt
    
    # Income and spending
    income = float(data.get('income', 0))
    contribs = data.get('monthly_contributions', {})
    total_contribs = sum(float(v) for v in contribs.values() if isinstance(v, (int, float)))
    # Pension is pre-tax — savings rate should use post-tax contributions vs take-home income
    post_tax_contribs_rpt = sum(float(v) for k, v in contribs.items() if isinstance(v, (int, float)) and k != 'pension')
    
    # Retirement
    ret = data.get('retirement', {})
    current_age = ret.get('current_age', 35)
    target_age = ret.get('target_age', 60)
    
    # FIRE
    fire_number = income * 12 * 25 if income > 0 else 0
    fire_pct = (net_worth / fire_number * 100) if fire_number > 0 else 0
    
    # NW history
    nw_hist = data.get('net_worth_history', [])
    nw_trend = []
    for h in nw_hist[-12:]:
        nw_trend.append({'date': h.get('date', ''), 'value': h.get('net_worth', 0)})
    
    # Mortgages
    mortgage_summary = []
    for m in data.get('mortgages', []):
        payment = _calc_monthly_payment(m)
        mortgage_summary.append({
            'property': m.get('property_name', 'Property'),
            'lender': m.get('lender', '—'),
            'balance': float(m.get('current_balance', 0)),
            'rate': m.get('interest_rate', 0),
            'payment': round(payment, 0),
            'remaining_years': m.get('term_years', 0),
        })
    
    # Holdings
    holdings = []
    for bucket_name in ['isa', 'pension', 'stocks', 'crypto', 'rsu', 'custom']:
        for h in inv.get(bucket_name, []):
            val = float(h.get('current_value', h.get('value_gbp', 0)) or 0)
            if val > 100:
                holdings.append({
                    'name': h.get('name', h.get('symbol', '?')),
                    'bucket': bucket_name.upper(),
                    'value': round(val, 0),
                    'gain': round(float(h.get('gain_gbp', 0) or 0), 0),
                })
    holdings.sort(key=lambda x: -x['value'])
    
    return jsonify({
        'generated_at': today,
        'report_title': 'Wealth Summary Report',
        'net_worth': round(net_worth, 0),
        'assets': {
            'cash': round(savings, 0),
            'investments': round(total_investments, 0),
            'property': round(total_property, 0),
            'other': round(other_assets, 0),
            'total': round(savings + total_investments + total_property + other_assets, 0),
        },
        'liabilities': {
            'mortgage': round(mortgage_debt, 0),
            'other_debt': round(other_debt, 0),
            'total': round(total_debt, 0),
        },
        'income_spending': {
            'monthly_income': round(income, 0),
            'monthly_contributions': round(total_contribs, 0),
            'savings_rate': round(post_tax_contribs_rpt / max(income, 1) * 100, 1) if income > 0 else 0,
        },
        'investments_breakdown': {
            'isa': round(isa_total, 0),
            'pension': round(pension_total, 0),
            'stocks': round(stocks_total, 0),
            'crypto': round(crypto_total, 0),
            'rsu': round(rsu_total, 0),
            'custom': round(custom_total, 0),
        },
        'retirement': {
            'current_age': current_age,
            'target_age': target_age,
            'years_to_retire': max(0, target_age - current_age),
            'fire_number': round(fire_number, 0),
            'fire_pct': round(fire_pct, 1),
        },
        'mortgages': mortgage_summary,
        'top_holdings': holdings[:15],
        'nw_trend': nw_trend,
    })


# ── Stock Intelligence ─────────────────────────────────────────────────────────

def _yf_safe(info, *keys, default=None):
    """Safely extract a value from yfinance info dict."""
    for k in keys:
        v = info.get(k)
        if v is not None and v != 'N/A' and not (isinstance(v, float) and math.isnan(v)):
            return v
    return default

def fetch_and_cache_ticker(ticker, force=False):
    """
    Fetch live data from yfinance for a ticker and cache in research_data.
    Returns the updated research dict or raises on error.
    """
    try:
        import yfinance as yf
    except ImportError:
        raise RuntimeError('yfinance not installed. Run: pip install yfinance')

    data = load_data()
    rd = data.setdefault('research_data', {})
    existing = rd.get(ticker.upper(), {})
    today_str = date.today().isoformat()

    # Skip if fresh (< 24h) unless forced
    if not force and existing.get('updated') == today_str and existing.get('current_price'):
        return existing

    t = yf.Ticker(ticker)
    info = t.info or {}

    # --- Price & valuation ---
    price = _yf_safe(info, 'currentPrice', 'regularMarketPrice', 'previousClose', default=0)
    pe = _yf_safe(info, 'trailingPE')
    fwd_pe = _yf_safe(info, 'forwardPE')
    peg = _yf_safe(info, 'pegRatio')
    ps = _yf_safe(info, 'priceToSalesTrailing12Months')
    pb = _yf_safe(info, 'priceToBook')
    mkt_cap = _yf_safe(info, 'marketCap', default=0)
    sector = _yf_safe(info, 'sector', default=existing.get('sector', ''))
    name = _yf_safe(info, 'longName', 'shortName', default=existing.get('name', ticker))
    currency = _yf_safe(info, 'currency', default='USD')
    div_yield = _yf_safe(info, 'dividendYield', default=0)

    # --- Beta & 52w range ---
    beta = _yf_safe(info, 'beta', default=None)
    w52_high = _yf_safe(info, 'fiftyTwoWeekHigh', default=None)
    w52_low = _yf_safe(info, 'fiftyTwoWeekLow', default=None)

    # --- Analyst targets ---
    analyst_target = _yf_safe(info, 'targetMeanPrice')
    analyst_high = _yf_safe(info, 'targetHighPrice')
    analyst_low = _yf_safe(info, 'targetLowPrice')
    analyst_strong_buy = _yf_safe(info, 'recommendationKey', default=None)
    analyst_rec = info.get('recommendationMean')

    # Buy/Hold/Sell counts from analyst grades
    a_str_buy = _yf_safe(info, 'numberOfAnalystOpinions', default=0) or 0
    # Try to get breakdown from upgrades_downgrades_history or fallback
    try:
        recs = t.recommendations
        if recs is not None and not recs.empty:
            latest = recs.iloc[-1] if len(recs) else {}
            sb = int(latest.get('strongBuy', 0) or 0)
            b = int(latest.get('buy', 0) or 0)
            h = int(latest.get('hold', 0) or 0)
            s = int(latest.get('sell', 0) or 0)
            ss = int(latest.get('strongSell', 0) or 0)
        else:
            sb = b = h = s = ss = 0
    except Exception:
        sb = b = h = s = ss = 0

    # --- Fundamentals ---
    rev_growth = _yf_safe(info, 'revenueGrowth')
    if rev_growth is not None:
        rev_growth = round(rev_growth * 100, 1)
    eps_growth = _yf_safe(info, 'earningsGrowth')
    if eps_growth is not None:
        eps_growth = round(eps_growth * 100, 1)
    margin = _yf_safe(info, 'profitMargins')
    if margin is not None:
        margin = round(margin * 100, 1)
    roe = _yf_safe(info, 'returnOnEquity')
    if roe is not None:
        roe = round(roe * 100, 1)
    roic = _yf_safe(info, 'returnOnAssets')
    if roic is not None:
        roic = round(roic * 100, 1)
    debt_eq = _yf_safe(info, 'debtToEquity')
    fcf_yield = _yf_safe(info, 'freeCashflow')
    current_ratio = _yf_safe(info, 'currentRatio')

    # --- Earnings ---
    next_earnings = None
    earnings_volatility = existing.get('earnings_volatility', 'medium')
    eps_estimate = _yf_safe(info, 'forwardEps')
    prev_eps = _yf_safe(info, 'trailingEps')
    eps_surprise = None
    try:
        cal = t.calendar
        if cal is not None and not cal.empty:
            ec = cal.get('Earnings Date')
            if ec is not None:
                ed = ec[0] if hasattr(ec, '__iter__') and not isinstance(ec, str) else ec
                if hasattr(ed, 'date'):
                    ed = ed.date()
                next_earnings = str(ed)
    except Exception:
        pass

    # --- Historical CAGR from price history ---
    cagr_1yr = cagr_3yr = cagr_5yr = cagr_10yr = None
    alpha_1yr = alpha_5yr = None
    ret_1m = ret_3m = ret_ytd = None
    try:
        hist = t.history(period='10y', auto_adjust=True)
        if hist is not None and not hist.empty:
            prices = hist['Close'].dropna()
            now_p = float(prices.iloc[-1])
            today_dt = prices.index[-1]

            def _cagr(years):
                past_dt = today_dt - timedelta(days=int(years * 365.25))
                past_prices = prices[prices.index >= past_dt]
                if len(past_prices) < 2:
                    return None
                past_p = float(past_prices.iloc[0])
                if past_p <= 0:
                    return None
                return round(((now_p / past_p) ** (1 / years) - 1) * 100, 1)

            def _ret(days):
                past_dt = today_dt - timedelta(days=days)
                past_prices = prices[prices.index >= past_dt]
                if len(past_prices) < 2:
                    return None
                past_p = float(past_prices.iloc[0])
                if past_p <= 0:
                    return None
                return round((now_p / past_p - 1) * 100, 1)

            cagr_1yr = _cagr(1)
            cagr_3yr = _cagr(3)
            cagr_5yr = _cagr(5)
            cagr_10yr = _cagr(10)
            ret_1m = _ret(30)
            ret_3m = _ret(90)

            # YTD return
            year_start = prices[prices.index >= prices.index[-1].replace(month=1, day=1)]
            if len(year_start) > 0:
                ret_ytd = round((now_p / float(year_start.iloc[0]) - 1) * 100, 1)

            # vs S&P 500 alpha
            try:
                sp = yf.Ticker('^GSPC')
                sp_hist = sp.history(period='5y', auto_adjust=True)
                if sp_hist is not None and not sp_hist.empty:
                    sp_prices = sp_hist['Close'].dropna()
                    sp_now = float(sp_prices.iloc[-1])
                    sp_today_dt = sp_prices.index[-1]

                    def _sp_cagr(years):
                        past_dt = sp_today_dt - timedelta(days=int(years * 365.25))
                        pp = sp_prices[sp_prices.index >= past_dt]
                        if len(pp) < 2:
                            return None
                        sp_past = float(pp.iloc[0])
                        if sp_past <= 0:
                            return None
                        return round(((sp_now / sp_past) ** (1 / years) - 1) * 100, 1)

                    sp_1yr = _sp_cagr(1)
                    sp_5yr = _sp_cagr(5)
                    if cagr_1yr is not None and sp_1yr is not None:
                        alpha_1yr = round(cagr_1yr - sp_1yr, 1)
                    if cagr_5yr is not None and sp_5yr is not None:
                        alpha_5yr = round(cagr_5yr - sp_5yr, 1)
            except Exception:
                pass
    except Exception:
        pass

    # --- News & sentiment ---
    news_list = existing.get('news', [])
    try:
        raw_news = t.news or []
        new_news = []
        for item in raw_news[:8]:
            headline = item.get('title', '')
            pub_dt = item.get('providerPublishTime')
            if pub_dt:
                news_date = datetime.utcfromtimestamp(pub_dt).strftime('%Y-%m-%d')
            else:
                news_date = today_str
            # Check if already stored
            if not any(n.get('headline') == headline for n in news_list):
                new_news.append({
                    'date': news_date,
                    'headline': headline,
                    'source': item.get('publisher', ''),
                    'impact': 'neutral',  # will classify below
                    'url': item.get('link', '')
                })

        # Classify new news via Claude Haiku if available
        if new_news:
            try:
                client = get_anthropic_client()
                headlines_text = '\n'.join([f"- {n['headline']}" for n in new_news])
                resp = client.messages.create(
                    model='claude-haiku-4-5-20251001',
                    max_tokens=200,
                    messages=[{
                        'role': 'user',
                        'content': f'Classify each headline as bullish, neutral, or bearish for {ticker} stock. Reply with ONLY a JSON array of strings like ["bullish","neutral","bearish"]. Headlines:\n{headlines_text}'
                    }]
                )
                classifications = json.loads(resp.content[0].text.strip())
                for i, n in enumerate(new_news):
                    if i < len(classifications):
                        n['impact'] = classifications[i]
            except Exception:
                pass

        # Prepend new news, keep last 10
        news_list = new_news + news_list
        news_list = news_list[:10]
    except Exception:
        pass

    # --- Build / update research entry ---
    entry = {
        **existing,
        'name': name,
        'ticker': ticker.upper(),
        'sector': sector,
        'currency': currency,
        'current_price': float(price) if price else None,
        'analyst_target': analyst_target,
        'analyst_high': analyst_high,
        'analyst_low': analyst_low,
        'analyst_rec_mean': analyst_rec,
        'analyst_strong_buy': sb,
        'analyst_buy': b,
        'analyst_hold': h,
        'analyst_sell': s,
        'analyst_strong_sell': ss,
        'beta': beta,
        'w52_high': w52_high,
        'w52_low': w52_low,
        'pe': pe,
        'fwd_pe': fwd_pe,
        'peg': peg,
        'ps': ps,
        'pb': pb,
        'mkt_cap': mkt_cap,
        'div_yield': round(div_yield * 100, 2) if div_yield else 0,
        'rev_growth': rev_growth,
        'eps_growth': eps_growth,
        'margin': margin,
        'roe': roe,
        'roic': roic,
        'debt_eq': debt_eq,
        'current_ratio': current_ratio,
        'cagr_1yr': cagr_1yr,
        'cagr_3yr': cagr_3yr,
        'cagr_5yr': cagr_5yr,
        'cagr_10yr': cagr_10yr,
        'alpha_1yr': alpha_1yr,
        'alpha_5yr': alpha_5yr,
        'ret_1m': ret_1m,
        'ret_3m': ret_3m,
        'ret_ytd': ret_ytd,
        'next_earnings': existing.get('next_earnings') if not next_earnings else next_earnings,
        'earnings_volatility': earnings_volatility,
        'eps_estimate': eps_estimate,
        'prev_eps': prev_eps,
        'news': news_list,
        'updated': today_str,
    }
    # Preserve user-entered fields
    for key in ['notes', 'catalysts', 'risks', 'profit_target_pct', 'full_target_price',
                'stop_loss', 'reentry_low', 'reentry_high', 'eps_surprise_pct']:
        if key not in entry and key in existing:
            entry[key] = existing[key]

    rd[ticker.upper()] = entry
    save_data(data)
    return entry


def batch_refresh_all_tickers(data):
    """Background batch refresh — fetch yfinance data for all tickers in research_data."""
    rd = data.get('research_data', {})
    today_str = date.today().isoformat()
    for ticker, rec in list(rd.items()):
        if rec.get('updated') != today_str:
            try:
                fetch_and_cache_ticker(ticker, force=False)
            except Exception as e:
                print(f'[batch_refresh] {ticker}: {e}')


def compute_holding_cagr(holding):
    """Annualised CAGR from a holding's avg_price, current_price, purchase_date."""
    try:
        avg = float(holding.get('avg_price') or holding.get('vest_price') or 0)
        cur = float(holding.get('current_price') or 0)
        pd_str = holding.get('purchase_date') or holding.get('vest_date') or ''
        if not avg or not cur or not pd_str:
            return None
        purchase_dt = datetime.strptime(pd_str[:10], '%Y-%m-%d')
        years = (datetime.now() - purchase_dt).days / 365.25
        if years < 0.01:
            return None
        return round(((cur / avg) ** (1 / years) - 1) * 100, 1)
    except Exception:
        return None


def calculate_stock_score(ticker, research, portfolio_holdings=None, total_portfolio_value=0):
    """
    Score a ticker 0-100 from available research data + portfolio context.
    Returns dict with composite, fundamental, technical, risk, momentum scores + verdict.
    """
    r = research
    scores = {}
    breakdown = {}

    # ── Fundamental score (40%) ───────────────────────────────────────────────
    f_points = 0
    f_max = 0

    # Upside to analyst target
    price = r.get('current_price') or 0
    target = r.get('analyst_target') or 0
    if price > 0 and target > 0:
        upside_pct = (target - price) / price * 100
        if upside_pct >= 30:
            f_points += 20
        elif upside_pct >= 15:
            f_points += 14
        elif upside_pct >= 5:
            f_points += 8
        elif upside_pct < 0:
            f_points += 0
        else:
            f_points += 4
        f_max += 20
        breakdown['upside'] = round(upside_pct, 1)

    # Analyst consensus
    sb = r.get('analyst_strong_buy', 0) or 0
    b = r.get('analyst_buy', 0) or 0
    h = r.get('analyst_hold', 0) or 0
    s = r.get('analyst_sell', 0) or 0
    ss = r.get('analyst_strong_sell', 0) or 0
    total_analysts = sb + b + h + s + ss
    if total_analysts > 0:
        bull_pct = (sb + b) / total_analysts * 100
        if bull_pct >= 75:
            f_points += 15
        elif bull_pct >= 50:
            f_points += 10
        elif bull_pct >= 30:
            f_points += 5
        f_max += 15

    # PE relative to growth (PEG)
    peg = r.get('peg')
    if peg is not None:
        if peg < 1:
            f_points += 12
        elif peg < 1.5:
            f_points += 8
        elif peg < 2.5:
            f_points += 4
        elif peg > 4:
            f_points += 0
        else:
            f_points += 2
        f_max += 12

    # Revenue growth
    rev_g = r.get('rev_growth')
    if rev_g is not None:
        if rev_g >= 30:
            f_points += 10
        elif rev_g >= 15:
            f_points += 7
        elif rev_g >= 5:
            f_points += 4
        elif rev_g < 0:
            f_points += 0
        else:
            f_points += 2
        f_max += 10

    # Profit margin
    margin = r.get('margin')
    if margin is not None:
        if margin >= 30:
            f_points += 8
        elif margin >= 15:
            f_points += 5
        elif margin >= 5:
            f_points += 2
        elif margin < 0:
            f_points += 0
        else:
            f_points += 1
        f_max += 8

    # ROE
    roe = r.get('roe')
    if roe is not None:
        if roe >= 30:
            f_points += 8
        elif roe >= 15:
            f_points += 5
        elif roe >= 5:
            f_points += 2
        elif roe < 0:
            f_points += 0
        f_max += 8

    # Debt/Equity
    de = r.get('debt_eq')
    if de is not None:
        if de < 30:
            f_points += 7
        elif de < 80:
            f_points += 4
        elif de < 150:
            f_points += 2
        else:
            f_points += 0
        f_max += 7

    fundamental = round(f_points / f_max * 100) if f_max > 0 else None

    # ── Technical score (25%) ─────────────────────────────────────────────────
    t_points = 0
    t_max = 0

    # 52-week position (how far from high = potential upside)
    w52h = r.get('w52_high')
    w52l = r.get('w52_low')
    if w52h and w52l and price > 0:
        range_pct = (price - w52l) / (w52h - w52l) * 100 if (w52h - w52l) > 0 else 50
        # Moderate position (30-70% of range) is best
        if 30 <= range_pct <= 70:
            t_points += 15
        elif 20 <= range_pct <= 85:
            t_points += 10
        elif range_pct < 20:
            t_points += 5  # oversold — could recover or falling knife
        else:
            t_points += 3  # near 52w high — extended
        t_max += 15
        breakdown['52w_position'] = round(range_pct, 1)

    # Short-term momentum
    ret_1m = r.get('ret_1m')
    if ret_1m is not None:
        if 0 < ret_1m <= 15:
            t_points += 10
        elif ret_1m > 15:
            t_points += 6  # extended
        elif -10 <= ret_1m < 0:
            t_points += 6  # mild pullback, potential entry
        else:
            t_points += 2  # steep decline
        t_max += 10

    technical = round(t_points / t_max * 100) if t_max > 0 else None

    # ── Risk score (20%) ─────────────────────────────────────────────────────
    risk_points = 0
    risk_max = 0

    # Beta
    beta = r.get('beta')
    if beta is not None:
        if 0.5 <= beta <= 1.2:
            risk_points += 20
        elif 1.2 < beta <= 1.8:
            risk_points += 12
        elif beta > 1.8:
            risk_points += 6
        elif beta < 0.5:
            risk_points += 15  # defensive
        risk_max += 20

    # Earnings proximity (risk flag)
    earnings_days = None
    if r.get('next_earnings'):
        try:
            ne = datetime.strptime(r['next_earnings'][:10], '%Y-%m-%d')
            earnings_days = (ne - datetime.now()).days
            if 0 <= earnings_days <= 7:
                risk_points += 2  # imminent — high risk
            elif 7 < earnings_days <= 21:
                risk_points += 5  # coming up
            else:
                risk_points += 10
            risk_max += 10
        except Exception:
            pass

    # Concentration risk (for held stocks)
    if portfolio_holdings and total_portfolio_value > 0:
        holding_value = 0
        for h in portfolio_holdings:
            if h.get('ticker', '').upper() == ticker.upper():
                holding_value += float(h.get('current_value', 0) or 0)
        conc_pct = holding_value / total_portfolio_value * 100
        if conc_pct >= 30:
            risk_points += 0  # extreme concentration
        elif conc_pct >= 15:
            risk_points += 3
        elif conc_pct >= 5:
            risk_points += 7
        else:
            risk_points += 10
        risk_max += 10

    risk = round(risk_points / risk_max * 100) if risk_max > 0 else None

    # ── Momentum / Track Record score (15%) ──────────────────────────────────
    m_points = 0
    m_max = 0

    # 5yr CAGR
    cagr5 = r.get('cagr_5yr')
    if cagr5 is not None:
        if cagr5 >= 30:
            m_points += 25
        elif cagr5 >= 15:
            m_points += 18
        elif cagr5 >= 7:
            m_points += 10
        elif cagr5 >= 0:
            m_points += 4
        else:
            m_points += 0
        m_max += 25

    # Alpha vs S&P over 5yr
    alpha5 = r.get('alpha_5yr')
    if alpha5 is not None:
        if alpha5 >= 10:
            m_points += 15
        elif alpha5 >= 3:
            m_points += 10
        elif alpha5 >= 0:
            m_points += 6
        else:
            m_points += 2
        m_max += 15

    momentum = round(m_points / m_max * 100) if m_max > 0 else None

    # ── Composite (weighted average of available components) ─────────────────
    weights = {'fundamental': 0.40, 'technical': 0.25, 'risk': 0.20, 'momentum': 0.15}
    component_scores = {
        'fundamental': fundamental,
        'technical': technical,
        'risk': risk,
        'momentum': momentum
    }
    avail = {k: v for k, v in component_scores.items() if v is not None}
    if avail:
        total_weight = sum(weights[k] for k in avail)
        composite = sum(v * weights[k] / total_weight for k, v in avail.items())
        composite = round(min(100, max(0, composite)))
    else:
        composite = None

    # ── Verdict ──────────────────────────────────────────────────────────────
    if composite is None:
        verdict = 'NO DATA'
    elif composite >= 85:
        verdict = 'STRONG BUY'
    elif composite >= 70:
        verdict = 'BUY'
    elif composite >= 55:
        verdict = 'HOLD'
    elif composite >= 40:
        verdict = 'TRIM'
    elif composite >= 25:
        verdict = 'REDUCE'
    else:
        verdict = 'EXIT'

    # ── Warnings ─────────────────────────────────────────────────────────────
    warnings = []
    if beta and beta > 2.0:
        warnings.append(f'High beta ({beta:.1f}) — volatile')
    if earnings_days is not None and 0 <= earnings_days <= 14:
        warnings.append(f'Earnings in {earnings_days}d — expect volatility')
    if portfolio_holdings and total_portfolio_value > 0:
        for h in portfolio_holdings:
            if h.get('ticker', '').upper() == ticker.upper():
                val = float(h.get('current_value', 0) or 0)
                pct = val / total_portfolio_value * 100
                if pct >= 20:
                    warnings.append(f'High concentration: {pct:.0f}% of portfolio')

    upside = breakdown.get('upside')

    return {
        'ticker': ticker.upper(),
        'composite': composite,
        'fundamental': fundamental,
        'technical': technical,
        'risk': risk,
        'momentum': momentum,
        'verdict': verdict,
        'warnings': warnings,
        'upside_pct': upside,
        'cagr_5yr': r.get('cagr_5yr'),
        'next_earnings': r.get('next_earnings'),
        'earnings_days': earnings_days,
    }


def generate_ai_recommendations(portfolio_data, research_data):
    """Generate stock recommendations based on portfolio gaps using Claude."""
    client = get_anthropic_client()

    # Build portfolio summary
    holdings_summary = []
    for bucket, items in portfolio_data.get('investments', {}).items():
        for item in items:
            ticker = item.get('ticker', item.get('symbol', ''))
            if ticker:
                val = item.get('current_value', item.get('value_gbp', 0)) or 0
                holdings_summary.append(f'{ticker} ({bucket.upper()}, £{val:,.0f})')

    owned = set()
    for bucket, items in portfolio_data.get('investments', {}).items():
        for item in items:
            t = item.get('ticker', '')
            if t:
                owned.add(t.upper())

    watched = portfolio_data.get('watchlist', [])
    sectors = set()
    for bucket, items in portfolio_data.get('investments', {}).items():
        for item in items:
            s = item.get('sector', '')
            if s:
                sectors.add(s)

    prompt = f"""You are a portfolio analyst. The user has this UK-based investment portfolio:
Holdings: {', '.join(holdings_summary[:30]) if holdings_summary else 'none'}
Sectors covered: {', '.join(sectors) if sectors else 'unknown'}
Already watching: {', '.join(watched) if watched else 'none'}

Identify 3-5 specific stock/ETF tickers they are MISSING that would improve their portfolio.
Focus on gaps: diversification, sectors, geographies, or specific high-quality names.
Respond ONLY with a JSON array like:
[{{"ticker":"GOOGL","name":"Alphabet","reason":"Missing big-tech AI leader despite holding MSFT/AMZN","gap":"AI/Cloud concentration","score_estimate":82}},...]

Use real, widely-traded tickers. Max 5 items."""

    resp = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=600,
        messages=[{'role': 'user', 'content': prompt}]
    )
    text = resp.content[0].text.strip()
    # Extract JSON array from response
    start = text.find('[')
    end = text.rfind(']') + 1
    if start >= 0 and end > start:
        recs = json.loads(text[start:end])
    else:
        recs = []
    return recs


# ── Stock Intelligence: API Endpoints ─────────────────────────────────────────

@app.route('/api/research-data', methods=['GET'])
def get_all_research():
    data = load_data()
    return jsonify(data.get('research_data', {}))


@app.route('/api/research-data/<ticker>', methods=['POST'])
def upsert_research(ticker):
    data = load_data()
    rd = data.setdefault('research_data', {})
    ticker = ticker.upper()
    body = request.get_json(force=True) or {}
    existing = rd.get(ticker, {})
    existing.update(body)
    existing['ticker'] = ticker
    if 'updated' not in existing:
        existing['updated'] = date.today().isoformat()
    rd[ticker] = existing
    save_data(data)
    return jsonify(rd[ticker])


@app.route('/api/research-data/<ticker>', methods=['DELETE'])
def delete_research(ticker):
    data = load_data()
    rd = data.setdefault('research_data', {})
    ticker = ticker.upper()
    rd.pop(ticker, None)
    # Also remove from watchlist
    data['watchlist'] = [w for w in data.get('watchlist', []) if w.upper() != ticker]
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/research-data/<ticker>/news', methods=['POST'])
def add_news_event(ticker):
    data = load_data()
    rd = data.setdefault('research_data', {})
    ticker = ticker.upper()
    body = request.get_json(force=True) or {}
    entry = rd.setdefault(ticker, {'ticker': ticker})
    news = entry.setdefault('news', [])
    news.insert(0, {
        'date': body.get('date', date.today().isoformat()),
        'headline': body.get('headline', ''),
        'impact': body.get('impact', 'neutral'),
        'source': body.get('source', ''),
    })
    entry['news'] = news[:10]
    save_data(data)
    return jsonify(entry)


@app.route('/api/research-data/<ticker>/fetch', methods=['POST'])
def fetch_ticker_route(ticker):
    ticker = ticker.upper()
    force = request.args.get('force', 'false').lower() == 'true'
    try:
        entry = fetch_and_cache_ticker(ticker, force=force)
        data = load_data()
        # Compute score
        all_holdings = []
        total_val = 0
        for bucket, items in data.get('investments', {}).items():
            for h in items:
                all_holdings.append(h)
                total_val += float(h.get('current_value', h.get('value_gbp', 0)) or 0)
        score = calculate_stock_score(ticker, entry, all_holdings, total_val)
        return jsonify({**entry, 'score': score})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/scores', methods=['GET'])
def get_scores():
    data = load_data()
    rd = data.get('research_data', {})
    all_holdings = []
    total_val = 0
    for bucket, items in data.get('investments', {}).items():
        for h in items:
            all_holdings.append(h)
            total_val += float(h.get('current_value', h.get('value_gbp', 0)) or 0)

    results = []
    for ticker, research in rd.items():
        score = calculate_stock_score(ticker, research, all_holdings, total_val)
        # Holding CAGR
        for h in all_holdings:
            if h.get('ticker', '').upper() == ticker:
                score['holding_cagr'] = compute_holding_cagr(h)
                score['holding_value'] = float(h.get('current_value', 0) or 0)
                score['holding_gain_pct'] = float(h.get('gain_pct', 0) or 0)
                break
        score['name'] = research.get('name', ticker)
        score['current_price'] = research.get('current_price')
        score['analyst_target'] = research.get('analyst_target')
        score['cagr_5yr'] = research.get('cagr_5yr')
        score['updated'] = research.get('updated')
        results.append(score)

    results.sort(key=lambda x: (x.get('composite') or -1), reverse=True)
    return jsonify(results)


@app.route('/api/ai-recommendations', methods=['GET'])
def ai_recommendations():
    try:
        data = load_data()
        recs = generate_ai_recommendations(data, data.get('research_data', {}))
        return jsonify(recs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/watchlist', methods=['GET'])
def get_watchlist():
    data = load_data()
    return jsonify(data.get('watchlist', []))


@app.route('/api/watchlist/<ticker>', methods=['POST'])
def add_to_watchlist(ticker):
    data = load_data()
    ticker = ticker.upper()
    wl = data.setdefault('watchlist', [])
    if ticker not in wl:
        wl.append(ticker)
    save_data(data)
    return jsonify({'watchlist': wl})


@app.route('/api/watchlist/<ticker>', methods=['DELETE'])
def remove_from_watchlist(ticker):
    data = load_data()
    ticker = ticker.upper()
    wl = data.setdefault('watchlist', [])
    data['watchlist'] = [w for w in wl if w.upper() != ticker]
    save_data(data)
    return jsonify({'watchlist': data['watchlist']})


# ── Background startup refresh ────────────────────────────────────────────────
def _startup_refresh():
    try:
        data = load_data()
        batch_refresh_all_tickers(data)
    except Exception as e:
        print(f'[startup_refresh] {e}')

_t = threading.Thread(target=_startup_refresh, daemon=True)
_t.start()


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
