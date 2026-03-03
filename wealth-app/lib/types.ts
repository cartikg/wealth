// lib/types.ts — Shared TypeScript interfaces for Wealth app

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  currency: string;
  account_id?: string;
  notes?: string;
  is_future?: boolean;
  is_scheduled?: boolean;
  recurring_id?: string;
  amount_gbp?: number;
  bank?: string;
  is_mortgage_txn?: boolean;
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  bank: string;
  account_type: 'current' | 'savings' | 'credit';
}

export interface AccountSummary {
  name: string;
  bank: string;
  currency: string;
  total_in: number;
  total_out: number;
  txn_count: number;
}

export interface Holding {
  id: string;
  ticker?: string;
  name: string;
  shares?: number;
  amount?: number;
  current_price?: number;
  price_gbp?: number;
  value_gbp: number;
  invested?: number;
  invested_gbp?: number;
  gain_gbp?: number;
  gain_pct?: number;
  asset_class?: string;
  geography?: string;
  sector?: string;
  dividend_yield_pct?: number;
  dividends?: { date: string; amount: number }[];
  purchase_date?: string;
  tax_type?: string;
  coin_id?: string;
  symbol?: string;
  coin_price_gbp?: number;
  buy_price?: number;
  current_value?: number;
  total_contributed?: number;
  vest_price?: number;
  vest_value_gbp?: number;
  gain_since_vest?: number;
  provider?: string;
}

export interface Mortgage {
  id: string;
  property_name: string;
  principal: number;
  current_balance: number;
  interest_rate: number;
  term_years: number;
  start_date: string;
  type: 'repayment' | 'interest_only';
  monthly_overpayment: number;
  fixed_until?: string;
  lender?: string;
  property_value?: number;
  monthly_payment?: number;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: 'instalment' | 'credit_card' | 'loan';
}

export interface RecurringRule {
  id: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_date: string;
  account_id?: string;
  currency?: string;
  active?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  budget_monthly?: number;
  archived?: boolean;
  parent?: string | null;
}

export interface FamilyProfile {
  id: string;
  name: string;
  relationship: 'self' | 'partner' | 'spouse' | 'child' | 'dependent';
  tax_residency: string;
  tax_rate_preference: 'higher' | 'basic';
  annual_income?: number;
  notes?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface WealthIntelligence {
  total_score: number;
  grade: string;
  scores: Record<string, { score: number; max: number; notes: string[] }>;
  actions: { priority: string; action: string; impact: string }[];
  momentum: { monthly_change: number; quarterly_change: number };
  fire_pct: number;
}

export interface TaxRecommendation {
  category: string;
  title: string;
  description: string;
  projected_annual_saving: number;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info';
  action: string;
}

export interface TaxOptimisation {
  recommendations: TaxRecommendation[];
  total_projected_annual_saving: number;
  summary: {
    isa_used: number;
    isa_remaining: number;
    pension_used: number;
    pension_remaining: number;
    cgt_allowance_used: number;
    cgt_allowance_remaining: number;
    marginal_tax_rate: string;
  };
}

export interface EstateProjection {
  current_estate: number;
  projected_estate: number;
  at_age: number;
  nil_rate_band: number;
  taxable_estate: number;
  iht_liability: number;
  effective_rate: number;
  net_to_heirs: number;
  projections: { age: number; estate_value: number; iht_liability: number; net_to_heirs: number }[];
  strategies: { strategy: string; description: string; potential_saving: number }[];
  breakdown: Record<string, number>;
}

export interface MonteCarloResult {
  success_rate: number;
  simulations: number;
  ages: number[];
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  final_value_median: number;
  final_value_p10: number;
  final_value_p90: number;
  worst_case: number;
  best_case: number;
}

export interface FireSettings {
  mode: string;
  lean_multiplier: number;
  fat_multiplier: number;
  safe_withdrawal_rate: number;
  include_state_pension: boolean;
  state_pension_age: number;
  state_pension_annual: number;
}

export interface Disposal {
  id: string;
  investment_id?: string;
  asset_name: string;
  sale_date: string;
  quantity: number;
  sale_price: number;
  cost_basis: number;
  gain_gbp: number;
  tax_year: string;
  notes?: string;
}

export interface NetWorthSnapshot {
  date: string;
  net_worth: number;
  cash: number;
  investments: number;
  isa: number;
  pension: number;
  rsu: number;
  stocks: number;
  crypto: number;
  custom: number;
  property: number;
  other_assets: number;
  debts: number;
  mortgage_total: number;
  debts_detailed_total: number;
}

export interface ForecastMonth {
  month: string;
  balance: number;
  scheduled_in: number;
  scheduled_out: number;
  debt_payments: number;
  mortgage_remaining: number;
  debt_remaining: number;
}

export interface Allowances {
  tax_year: string;
  isa: { used: number; limit: number; remaining: number; pct_used: number };
  pension: { used: number; limit: number; remaining: number; pct_used: number };
  cgt_exempt: { used: number; limit: number; remaining: number; pct_used: number };
}

export interface IncomeTax {
  gross: number;
  tax_free: number;
  total_tax: number;
  ni: number;
  total_deductions: number;
  net: number;
  net_monthly: number;
  effective_rate: number;
  marginal_rate: number;
  bands: { label: string; rate: number; income_in_band: number; tax: number }[];
}

export interface RetirementSettings {
  target_age: number;
  current_age: number;
  monthly_expenses_retirement: number;
  inflation_rate: number;
  expected_return: number;
  post_retirement_return: number;
  life_expectancy: number;
  partner_age?: number;
  partner_life_expectancy?: number;
}

export interface GlobalSettings {
  tax_residency: string;
  home_currency: string;
  secondary_currency: string;
  display_currencies: string[];
  tax_rate_preference: 'higher' | 'basic';
  use_actual_spend_for_retirement: boolean;
  spend_average_months: number;
  privacy_mode: boolean;
  privacy_mask_names: boolean;
  privacy_alias: string;
  privacy_hide_banks: boolean;
  privacy_hide_accounts: boolean;
}

export interface AppData {
  transactions: Transaction[];
  accounts: Account[];
  account_summary: Record<string, AccountSummary>;
  investments: {
    isa: Holding[];
    crypto: Holding[];
    rsu: Holding[];
    stocks: Holding[];
    pension: Holding[];
    custom: Holding[];
  };
  totals: Record<string, number>;
  forecast: ForecastMonth[];
  monthly_contributions: Record<string, number>;
  retirement: RetirementSettings;
  categories: Record<string, number>;
  monthly_trend: Record<string, { income: number; spend: number; key: string }>;
  exchange_rates: Record<string, number>;
  user_categories: Category[];
  category_budgets: Record<string, number>;
  global_settings: GlobalSettings;
  tax_profile: any;
  available_profiles: Record<string, any>;
  family_profiles: FamilyProfile[];
  allocation_targets: Record<string, number>;
  net_worth_history: NetWorthSnapshot[];
  mortgages: Mortgage[];
  debts_detailed: Debt[];
  disposals: Disposal[];
  carried_losses: Record<string, number>;
  income_tax: IncomeTax;
  allowances: Allowances;
  fire_settings: FireSettings;
}
