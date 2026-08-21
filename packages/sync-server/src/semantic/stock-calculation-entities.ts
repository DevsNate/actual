/**
 * Schema-44 calculated entity shapes consumed by the preserved stock Web
 * runtime. Field names are taken from BUDGET-001 and recovered serializer
 * module 93724. This file defines the wire boundary; it does not define how
 * the private stock server calculates the values.
 */

export type StockAccountCalculation = Readonly<{
  id: string;
  entities_account_id: string;
  is_tombstone: boolean;
  cleared_balance: number;
  uncleared_balance: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  transaction_count: number;
  debt_last_payment_date: string | null;
  debt_payments: number | null;
}>;

export type StockMonthlyAccountCalculation = Readonly<{
  id: string;
  entities_account_id: string;
  is_tombstone: boolean;
  month: string;
  cleared_balance: number;
  uncleared_balance: number;
  rolling_balance: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  transaction_count: number;
  debt_interest_due: number | null;
  debt_interest_paid: number | null;
  debt_escrow_paid: number | null;
  debt_estimated_interest_paid: number | null;
  debt_estimated_escrow_paid: number | null;
  debt_last_payment_date: string | null;
  debt_payments: number | null;
}>;

export type StockMonthlyBudgetCalculation = Readonly<{
  id: string;
  entities_monthly_budget_id: string;
  is_tombstone: boolean;
  immediate_income: number;
  budgeted: number;
  cash_outflows: number;
  credit_outflows: number;
  balance: number;
  over_spent: number;
  available_to_budget: number;
  uncategorized_cash_outflows: number;
  uncategorized_credit_outflows: number;
  uncategorized_balance: number;
  additional_to_be_budgeted: number;
  age_of_money: number | null;
  previous_income: number;
  deferred_income: number;
  hidden_budgeted: number;
  hidden_cash_outflows: number;
  hidden_credit_outflows: number;
  hidden_balance: number;
}>;

export type StockMonthlySubcategoryBudgetCalculation = Readonly<{
  id: string;
  entities_monthly_subcategory_budget_id: string;
  is_tombstone: boolean;
  cash_outflows: number;
  positive_cash_outflows: number;
  credit_outflows: number;
  balance: number;
  budgeted_cash_outflows: number;
  budgeted_credit_outflows: number;
  unbudgeted_cash_outflows: number;
  unbudgeted_credit_outflows: number;
  budgeted_previous_month: number;
  spent_previous_month: number;
  payment_previous_month: number;
  balance_previous_month: number;
  budgeted_average: number | null;
  spent_average: number | null;
  payment_average: number | null;
  budgeted_spending: number | null;
  all_spending: number | null;
  all_spending_since_last_payment: number | null;
  additional_to_be_budgeted: number | null;
  upcoming_transactions: number;
  upcoming_transactions_count: number;
  upcoming_transactions_first_date: string | null;
  goal_overall_funded: number | null;
  goal_overall_outflows: number;
  goal_under_funded: number | null;
  goal_target: number;
  goal_overall_left: number | null;
  goal_expected_completion: number | null;
  goal_percentage_complete: number | null;
  overspending_affects_buffer: boolean;
}>;

export type StockBudgetCalculationEntities = Readonly<{
  be_monthly_budget_calculations: readonly StockMonthlyBudgetCalculation[];
  be_monthly_subcategory_budget_calculations: readonly StockMonthlySubcategoryBudgetCalculation[];
  be_account_calculations: readonly StockAccountCalculation[];
  be_monthly_account_calculations: readonly StockMonthlyAccountCalculation[];
}>;
