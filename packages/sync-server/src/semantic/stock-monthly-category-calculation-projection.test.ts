import type { BudgetEntity } from '@actual-app/semantic-core';

import type { StockMonthlySubcategoryBudgetCalculation } from './stock-calculation-entities';
import { projectCapturedMonthlyCategoryRows } from './stock-monthly-category-calculation-projection';

function source(
  id: string,
  monthlyBudgetId: string,
  subCategoryId: string,
): BudgetEntity {
  return {
    entityKind: 'be_monthly_subcategory_budgets',
    entityId: id,
    isTombstone: false,
    payload: { monthlyBudgetId, subCategoryId },
  };
}

function base(id: string): StockMonthlySubcategoryBudgetCalculation {
  return {
    id: `calculation-${id}`,
    entities_monthly_subcategory_budget_id: id,
    is_tombstone: false,
    cash_outflows: 0,
    positive_cash_outflows: 0,
    credit_outflows: 0,
    balance: 0,
    budgeted_cash_outflows: 0,
    budgeted_credit_outflows: 0,
    unbudgeted_cash_outflows: 0,
    unbudgeted_credit_outflows: 0,
    budgeted_previous_month: 0,
    spent_previous_month: 0,
    payment_previous_month: 0,
    balance_previous_month: 0,
    budgeted_average: null,
    spent_average: null,
    payment_average: null,
    budgeted_spending: null,
    all_spending: null,
    all_spending_since_last_payment: null,
    additional_to_be_budgeted: null,
    upcoming_transactions: 0,
    upcoming_transactions_count: 0,
    upcoming_transactions_first_date: null,
    goal_overall_funded: null,
    goal_overall_outflows: 0,
    goal_under_funded: null,
    goal_target: 0,
    goal_overall_left: null,
    goal_expected_completion: null,
    goal_percentage_complete: null,
    overspending_affects_buffer: true,
  };
}

describe('captured stock monthly-category calculation projection', () => {
  test('projects exact uncategorized, categorized, and immediate-income cash rows', () => {
    const sourceRows = [
      source('none-current', 'month-current', 'category-none'),
      source('none-next', 'month-next', 'category-none'),
      source('split-current', 'month-current', 'category-split-line'),
      source('split-next', 'month-next', 'category-split-line'),
      source('income-current', 'month-current', 'category-income'),
      source('income-next', 'month-next', 'category-income'),
    ];
    const result = projectCapturedMonthlyCategoryRows({
      baseRows: sourceRows.map(row => base(row.entityId)),
      sourceRows,
      currentMonthlyBudgetId: 'month-current',
      nextMonthlyBudgetId: 'month-next',
      noneCategoryId: 'category-none',
      immediateIncomeCategoryId: 'category-income',
      uncategorizedCashOutflows: -10000,
      categorizedCashOutflows: new Map([['category-split-line', -5000]]),
      immediateIncome: 123450,
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        cash_outflows: -10000,
        balance: -10000,
        unbudgeted_cash_outflows: -10000,
        goal_overall_outflows: -10000,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        spent_previous_month: -10000,
        balance_previous_month: -10000,
        spent_average: -10000,
      }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        cash_outflows: -5000,
        balance: -5000,
        unbudgeted_cash_outflows: -5000,
      }),
    );
    expect(result[4]).toEqual(
      expect.objectContaining({
        cash_outflows: 123450,
        positive_cash_outflows: 123450,
        balance: 123450,
        budgeted_cash_outflows: 123450,
      }),
    );
    expect(result[5]).toEqual(
      expect.objectContaining({
        balance: 123450,
        spent_previous_month: 123450,
        balance_previous_month: 123450,
        spent_average: 123450,
      }),
    );
  });

  test('fails closed for unsafe amounts or incomplete source identities', () => {
    const row = source('none-current', 'month-current', 'category-none');
    expect(() =>
      projectCapturedMonthlyCategoryRows({
        baseRows: [base(row.entityId)],
        sourceRows: [row],
        currentMonthlyBudgetId: 'month-current',
        nextMonthlyBudgetId: 'month-next',
        noneCategoryId: 'category-none',
        immediateIncomeCategoryId: 'category-income',
        uncategorizedCashOutflows: Number.MAX_SAFE_INTEGER + 1,
        categorizedCashOutflows: new Map(),
        immediateIncome: 0,
      }),
    ).toThrow('must be a safe integer');
    expect(() =>
      projectCapturedMonthlyCategoryRows({
        baseRows: [base('missing')],
        sourceRows: [row],
        currentMonthlyBudgetId: 'month-current',
        nextMonthlyBudgetId: 'month-next',
        noneCategoryId: 'category-none',
        immediateIncomeCategoryId: 'category-income',
        uncategorizedCashOutflows: 0,
        categorizedCashOutflows: new Map(),
        immediateIncome: 0,
      }),
    ).toThrow('source row is unavailable');
  });
});
