import type { StockMonthlyBudgetCalculation } from './stock-calculation-entities';
import { projectCapturedMonthlyBudgetRows } from './stock-monthly-budget-calculation-projection';

function base(id: string): StockMonthlyBudgetCalculation {
  return {
    id: `calculation-${id}`,
    entities_monthly_budget_id: id,
    is_tombstone: false,
    immediate_income: 0,
    budgeted: 0,
    cash_outflows: 0,
    credit_outflows: 0,
    balance: 0,
    over_spent: 0,
    available_to_budget: 0,
    uncategorized_cash_outflows: 0,
    uncategorized_credit_outflows: 0,
    uncategorized_balance: 0,
    additional_to_be_budgeted: 0,
    age_of_money: null,
    previous_income: 0,
    deferred_income: 0,
    hidden_budgeted: 0,
    hidden_cash_outflows: 0,
    hidden_credit_outflows: 0,
    hidden_balance: 0,
  };
}

describe('captured stock monthly-budget calculation projection', () => {
  test('projects captured current income/outflows and next available amount', () => {
    const result = projectCapturedMonthlyBudgetRows({
      baseRows: [base('month-current'), base('month-next')],
      currentMonthlyBudgetId: 'month-current',
      nextMonthlyBudgetId: 'month-next',
      immediateIncome: 123450,
      cashOutflows: -10000,
      uncategorizedCashOutflows: -10000,
    });

    expect(result).toEqual([
      expect.objectContaining({
        entities_monthly_budget_id: 'month-current',
        immediate_income: 123450,
        cash_outflows: -10000,
        balance: -10000,
        over_spent: -10000,
        available_to_budget: 123450,
        uncategorized_cash_outflows: -10000,
        uncategorized_balance: -10000,
      }),
      expect.objectContaining({
        entities_monthly_budget_id: 'month-next',
        immediate_income: 0,
        cash_outflows: 0,
        balance: 0,
        over_spent: 0,
        available_to_budget: 113450,
        uncategorized_cash_outflows: 0,
        uncategorized_balance: 0,
      }),
    ]);
  });

  test('fails closed for extra months or unsafe arithmetic', () => {
    expect(() =>
      projectCapturedMonthlyBudgetRows({
        baseRows: [
          base('month-current'),
          base('month-next'),
          base('month-extra'),
        ],
        currentMonthlyBudgetId: 'month-current',
        nextMonthlyBudgetId: 'month-next',
        immediateIncome: 0,
        cashOutflows: 0,
        uncategorizedCashOutflows: 0,
      }),
    ).toThrow('references another month');
    expect(() =>
      projectCapturedMonthlyBudgetRows({
        baseRows: [base('month-current'), base('month-next')],
        currentMonthlyBudgetId: 'month-current',
        nextMonthlyBudgetId: 'month-next',
        immediateIncome: Number.MAX_SAFE_INTEGER,
        cashOutflows: 1,
        uncategorizedCashOutflows: 0,
      }),
    ).toThrow('must be a safe integer');
  });
});
