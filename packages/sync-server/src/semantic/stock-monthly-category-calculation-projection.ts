/**
 * Project-owned projection for the exact monthly-category cash states proven
 * by the controlled stock captures. Target and credit-card states are outside
 * this boundary and remain separate admission phases.
 */

import type { BudgetEntity } from '@actual-app/semantic-core';

import type { StockMonthlySubcategoryBudgetCalculation } from './stock-calculation-entities';

type CapturedMonthlyCategoryInput = Readonly<{
  baseRows: readonly StockMonthlySubcategoryBudgetCalculation[];
  sourceRows: readonly BudgetEntity[];
  currentMonthlyBudgetId: string;
  nextMonthlyBudgetId: string;
  noneCategoryId: string;
  immediateIncomeCategoryId: string;
  uncategorizedCashOutflows: number;
  categorizedCashOutflows: ReadonlyMap<string, number>;
  immediateIncome: number;
}>;

export function projectCapturedMonthlyCategoryRows(
  input: CapturedMonthlyCategoryInput,
): readonly StockMonthlySubcategoryBudgetCalculation[] {
  requireSafeInteger(input.uncategorizedCashOutflows);
  requireSafeInteger(input.immediateIncome);
  for (const amount of input.categorizedCashOutflows.values()) {
    requireSafeInteger(amount);
  }

  const sourceById = new Map(
    input.sourceRows.map(source => [source.entityId, source]),
  );
  if (sourceById.size !== input.sourceRows.length) {
    throw new Error(
      'Captured monthly-category source identities must be unique',
    );
  }

  return input.baseRows.map(row => {
    const source = sourceById.get(
      String(row.entities_monthly_subcategory_budget_id),
    );
    if (!source || source.entityKind !== 'be_monthly_subcategory_budgets') {
      throw new Error('Captured monthly-category source row is unavailable');
    }
    const categoryId = requireString(source.payload.subCategoryId);
    const monthlyBudgetId = requireString(source.payload.monthlyBudgetId);

    if (categoryId === input.noneCategoryId) {
      if (monthlyBudgetId === input.currentMonthlyBudgetId) {
        return currentCashOutflowRow(row, input.uncategorizedCashOutflows);
      }
      if (monthlyBudgetId === input.nextMonthlyBudgetId) {
        return nextCashOutflowRow(row, input.uncategorizedCashOutflows);
      }
    }

    const categoryOutflow = input.categorizedCashOutflows.get(categoryId) ?? 0;
    if (categoryOutflow !== 0) {
      if (monthlyBudgetId === input.currentMonthlyBudgetId) {
        return currentCashOutflowRow(row, categoryOutflow);
      }
      if (monthlyBudgetId === input.nextMonthlyBudgetId) {
        return nextCashOutflowRow(row, categoryOutflow);
      }
    }

    if (categoryId !== input.immediateIncomeCategoryId) {
      return row;
    }
    if (monthlyBudgetId === input.currentMonthlyBudgetId) {
      return {
        ...row,
        cash_outflows: input.immediateIncome,
        positive_cash_outflows: input.immediateIncome,
        balance: input.immediateIncome,
        budgeted_cash_outflows: input.immediateIncome,
        goal_overall_outflows: input.immediateIncome,
      };
    }
    if (monthlyBudgetId === input.nextMonthlyBudgetId) {
      return {
        ...row,
        balance: input.immediateIncome,
        spent_previous_month: input.immediateIncome,
        balance_previous_month: input.immediateIncome,
        budgeted_average: 0,
        spent_average: input.immediateIncome,
        payment_average: 0,
      };
    }
    throw new Error('Immediate Income calculation references another month');
  });
}

function currentCashOutflowRow(
  row: StockMonthlySubcategoryBudgetCalculation,
  amount: number,
): StockMonthlySubcategoryBudgetCalculation {
  return {
    ...row,
    cash_outflows: amount,
    balance: amount,
    unbudgeted_cash_outflows: amount,
    goal_overall_outflows: amount,
  };
}

function nextCashOutflowRow(
  row: StockMonthlySubcategoryBudgetCalculation,
  amount: number,
): StockMonthlySubcategoryBudgetCalculation {
  return {
    ...row,
    spent_previous_month: amount,
    balance_previous_month: amount,
    budgeted_average: 0,
    spent_average: amount,
    payment_average: 0,
  };
}

function requireSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Captured monthly-category amount must be a safe integer');
  }
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Captured monthly-category identity is unavailable');
  }
  return value;
}
