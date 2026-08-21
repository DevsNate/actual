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
  currentMonth?: string;
  nextMonth?: string;
  noneCategoryId: string;
  immediateIncomeCategoryId: string;
  uncategorizedCashOutflows: number;
  categorizedCashOutflows: ReadonlyMap<string, number>;
  paymentCashOutflows: ReadonlyMap<string, number>;
  immediateIncome: number;
  scheduledTransactions?: ReadonlyMap<
    string,
    readonly Readonly<{ amount: number; firstDate: string }>[]
  >;
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
  if (!input.scheduledTransactions) return assignedRows;
  if (!input.currentMonth || !input.nextMonth) {
    throw new Error('Scheduled calculation months are unavailable');
  }
  const scheduledTransactions = input.scheduledTransactions;
  const currentMonth = input.currentMonth;
  const nextMonth = input.nextMonth;
  return assignedRows.map(row => {
    const source = sourceById.get(
      String(row.entities_monthly_subcategory_budget_id),
    );
    if (!source) {
      throw new Error('Scheduled calculation source row is unavailable');
    }
    const categoryId = requireString(source.payload.subCategoryId);
    const monthlyBudgetId = requireString(source.payload.monthlyBudgetId);
    const month =
      monthlyBudgetId === input.currentMonthlyBudgetId
        ? currentMonth
        : monthlyBudgetId === input.nextMonthlyBudgetId
          ? nextMonth
          : null;
    if (!month) throw new Error('Scheduled calculation month is unavailable');
    const schedules = scheduledTransactions.get(categoryId) ?? [];
    const active = schedules.filter(schedule =>
      occursInMonth(schedule.firstDate, month),
    );
    const upcoming = active.reduce((sum, schedule) => sum + schedule.amount, 0);
    requireSafeInteger(upcoming);
    return {
      ...row,
      upcoming_transactions: upcoming,
      upcoming_transactions_count: active.length,
      upcoming_transactions_first_date:
        active
          .map(schedule => occurrenceDate(schedule.firstDate, month))
          .sort()[0] ?? null,
    };
  });
}

function occursInMonth(firstDate: string, month: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(firstDate) ||
    !/^\d{4}-\d{2}-01$/u.test(month)
  ) {
    throw new Error('Scheduled calculation date is unavailable');
  }
  return month.slice(0, 7) >= firstDate.slice(0, 7);
}

function occurrenceDate(firstDate: string, month: string): string {
  const day = Number(firstDate.slice(8, 10));
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
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
