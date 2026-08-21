/**
 * Project-owned projection for the exact two-month budget calculation states
 * proven by the controlled Starting Balance and captured cash-outflow fixtures.
 * Assignments, rollover, and generalized future-month behavior are not admitted
 * here.
 */

import type { StockMonthlyBudgetCalculation } from './stock-calculation-entities';

type CapturedMonthlyBudgetInput = Readonly<{
  baseRows: readonly StockMonthlyBudgetCalculation[];
  currentMonthlyBudgetId: string;
  nextMonthlyBudgetId: string;
  immediateIncome: number;
  cashOutflows: number;
  uncategorizedCashOutflows: number;
}>;

export function projectCapturedMonthlyBudgetRows(
  input: CapturedMonthlyBudgetInput,
): readonly StockMonthlyBudgetCalculation[] {
  requireSafeInteger(input.immediateIncome);
  requireSafeInteger(input.cashOutflows);
  requireSafeInteger(input.uncategorizedCashOutflows);
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
        cash_outflows: input.cashOutflows,
        balance: input.cashOutflows,
        over_spent: Math.min(0, input.cashOutflows),
        available_to_budget: input.immediateIncome,
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
        balance: 0,
        over_spent: 0,
        available_to_budget: nextAvailableToBudget,
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
