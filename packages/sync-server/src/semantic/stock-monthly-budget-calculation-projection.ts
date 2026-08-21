/**
 * Project-owned projection for the exact two-month budget calculation states
 * proven by the controlled Starting Balance and captured cash-outflow fixtures.
 * The assignment inputs are limited to the exact current/next-month behavior
 * admitted by ASSIGNMENT-001.
 */

import type { StockMonthlyBudgetCalculation } from './stock-calculation-entities';

type CapturedMonthlyBudgetInput = Readonly<{
  baseRows: readonly StockMonthlyBudgetCalculation[];
  currentMonthlyBudgetId: string;
  nextMonthlyBudgetId: string;
  immediateIncome: number;
  cashOutflows: number;
  uncategorizedCashOutflows: number;
  currentBudgeted: number;
  currentCategoryBalance: number;
  currentOverspent: number;
  positiveCategoryCarry: number;
}>;

export function projectCapturedMonthlyBudgetRows(
  input: CapturedMonthlyBudgetInput,
): readonly StockMonthlyBudgetCalculation[] {
  requireSafeInteger(input.immediateIncome);
  requireSafeInteger(input.cashOutflows);
  requireSafeInteger(input.uncategorizedCashOutflows);
  requireSafeInteger(input.currentBudgeted);
  requireSafeInteger(input.currentCategoryBalance);
  requireSafeInteger(input.currentOverspent);
  requireSafeInteger(input.positiveCategoryCarry);
  const nextAvailableToBudget = input.immediateIncome + input.cashOutflows;
  requireSafeInteger(nextAvailableToBudget);

  let currentCount = 0;
  let nextCount = 0;
  const rows = input.baseRows.map(row => {
    if (row.entities_monthly_budget_id === input.currentMonthlyBudgetId) {
      currentCount += 1;
      return {
        ...row,
        immediate_income: input.immediateIncome,
        budgeted: input.currentBudgeted,
        cash_outflows: input.cashOutflows,
        balance: input.currentCategoryBalance,
        over_spent: input.currentOverspent,
        available_to_budget: input.immediateIncome - input.currentBudgeted,
        uncategorized_cash_outflows: input.uncategorizedCashOutflows,
        uncategorized_balance: input.uncategorizedCashOutflows,
      };
    }
    if (row.entities_monthly_budget_id === input.nextMonthlyBudgetId) {
      nextCount += 1;
      return {
        ...row,
        immediate_income: 0,
        cash_outflows: 0,
        balance: input.positiveCategoryCarry,
        over_spent: 0,
        available_to_budget:
          nextAvailableToBudget - input.positiveCategoryCarry,
        uncategorized_cash_outflows: 0,
        uncategorized_balance: 0,
      };
    }
    throw new Error('Captured monthly-budget row references another month');
  });
  if (currentCount !== 1 || nextCount !== 1 || rows.length !== 2) {
    throw new Error('Captured monthly-budget projection requires two rows');
  }
  return rows;
}

function requireSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Captured monthly-budget amount must be a safe integer');
  }
}
