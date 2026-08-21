/**
 * Project-owned projection for the exact monthly-category cash states proven
 * by the controlled stock captures. Credit-card payment categories use the
 * separately captured payment carry fields. Target states remain a separate
 * admission phase.
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
  paymentCashOutflows: ReadonlyMap<string, number>;
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
  for (const [categoryId, amount] of input.paymentCashOutflows) {
    requireSafeInteger(amount);
    if (input.categorizedCashOutflows.has(categoryId)) {
      throw new Error(
        'A monthly category cannot be both spending and payment cash flow',
      );
    }
  }

  const sourceById = new Map(
    input.sourceRows.map(source => [source.entityId, source]),
  );
  if (sourceById.size !== input.sourceRows.length) {
    throw new Error(
      'Captured monthly-category source identities must be unique',
    );
  }

  const outflowRows = input.baseRows.map(row => {
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

    const paymentOutflow = input.paymentCashOutflows.get(categoryId) ?? 0;
    if (paymentOutflow !== 0) {
      if (monthlyBudgetId === input.currentMonthlyBudgetId) {
        return currentCashOutflowRow(row, paymentOutflow);
      }
      if (monthlyBudgetId === input.nextMonthlyBudgetId) {
        return nextPaymentCashOutflowRow(row, paymentOutflow);
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

  const rowIndexById = new Map(
    outflowRows.map((row, index) => [
      String(row.entities_monthly_subcategory_budget_id),
      index,
    ]),
  );
  const assignedRows = [...outflowRows];
  const sourcesByCategory = new Map<string, BudgetEntity[]>();
  for (const source of input.sourceRows) {
    const categoryId = requireString(source.payload.subCategoryId);
    const rows = sourcesByCategory.get(categoryId) ?? [];
    rows.push(source);
    sourcesByCategory.set(categoryId, rows);
  }
  for (const sources of sourcesByCategory.values()) {
    const currentSource = sources.find(
      source => source.payload.monthlyBudgetId === input.currentMonthlyBudgetId,
    );
    const nextSource = sources.find(
      source => source.payload.monthlyBudgetId === input.nextMonthlyBudgetId,
    );
    if (!currentSource || !nextSource) {
      throw new Error('Assignment projection requires current and next rows');
    }
    const currentBudgeted = requireNonnegativeInteger(
      currentSource.payload.budgeted,
    );
    const nextBudgeted = requireNonnegativeInteger(nextSource.payload.budgeted);
    if (nextBudgeted !== 0) {
      throw new Error('Future-month assignment is not admitted');
    }
    if (currentBudgeted === 0) {
      continue;
    }
    const currentIndex = rowIndexById.get(currentSource.entityId);
    const nextIndex = rowIndexById.get(nextSource.entityId);
    if (currentIndex === undefined || nextIndex === undefined) {
      throw new Error('Assignment calculation row is unavailable');
    }
    const current = assignedRows[currentIndex];
    const currentBalance = current.balance + currentBudgeted;
    requireSafeInteger(currentBalance);
    assignedRows[currentIndex] = { ...current, balance: currentBalance };
    const next = assignedRows[nextIndex];
    assignedRows[nextIndex] = {
      ...next,
      balance: next.balance + Math.max(0, currentBalance),
      budgeted_previous_month: currentBudgeted,
      spent_previous_month: current.cash_outflows,
      balance_previous_month: currentBalance,
      budgeted_average: currentBudgeted,
      spent_average: current.cash_outflows,
      payment_average: 0,
    };
  }
  return assignedRows;
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

function nextPaymentCashOutflowRow(
  row: StockMonthlySubcategoryBudgetCalculation,
  amount: number,
): StockMonthlySubcategoryBudgetCalculation {
  return {
    ...row,
    payment_previous_month: amount,
    balance_previous_month: amount,
    budgeted_average: 0,
    spent_average: 0,
    payment_average: amount,
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

function requireNonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('Captured assignment amount must be nonnegative');
  }
  return Number(value);
}
