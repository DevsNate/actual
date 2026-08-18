import { buildStockPlanBootstrap } from '@actual-app/semantic-core';

import { projectStockFreshPlanCalculations } from './stock-budget-calculations';
import { projectStockCheckingAccountCalculations } from './stock-checking-account-calculations';

function createSnapshot() {
  let sequence = 0;
  const entities = [
    ...buildStockPlanBootstrap({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  ];
  return {
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 1,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
}

describe('stock fresh-plan calculations', () => {
  test('projects the exact admitted calculated bootstrap defaults', () => {
    const result = projectStockFreshPlanCalculations(createSnapshot());

    expect(result.be_monthly_budget_calculations).toHaveLength(2);
    expect(result.be_monthly_subcategory_budget_calculations).toHaveLength(28);
    expect(result.be_account_calculations).toEqual([]);
    expect(result.be_monthly_account_calculations).toEqual([]);
    expect(result.be_monthly_budget_calculations[0]).toMatchObject({
      id: expect.stringMatching(/^mbc\//u),
      entities_monthly_budget_id: expect.stringMatching(/^mb\//u),
      available_to_budget: 0,
      balance: 0,
      age_of_money: null,
      is_tombstone: false,
    });
    expect(result.be_monthly_subcategory_budget_calculations[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mcbc\//u),
        entities_monthly_subcategory_budget_id:
          expect.stringMatching(/^mcb\//u),
        balance: 0,
        goal_target: 0,
        goal_under_funded: null,
        overspending_affects_buffer: true,
        is_tombstone: false,
      }),
    );
  });

  test('uses the captured deterministic identity transformations', () => {
    const result = projectStockFreshPlanCalculations(createSnapshot());

    expect(
      result.be_monthly_budget_calculations.every(
        row =>
          String(row.id).replace(/^mbc\//u, 'mb/') ===
          row.entities_monthly_budget_id,
      ),
    ).toBe(true);
    expect(
      result.be_monthly_subcategory_budget_calculations.every(
        row =>
          String(row.id).replace(/^mcbc\//u, 'mcb/') ===
          row.entities_monthly_subcategory_budget_id,
      ),
    ).toBe(true);
  });

  test('fails closed when non-pristine state would require inferred formulas', () => {
    const snapshot = createSnapshot();
    expect(() =>
      projectStockFreshPlanCalculations({
        ...snapshot,
        entities: [
          ...snapshot.entities,
          {
            entityKind: 'be_transactions',
            entityId: 'transaction-1',
            isTombstone: false,
            payload: {},
          },
        ],
      }),
    ).toThrow('do not support be_transactions');
  });
});

describe('stock checking-account calculations', () => {
  test('projects the admitted starting-balance and rolling-balance rows', () => {
    const snapshot = createSnapshot();
    const startingPayee = snapshot.entities.find(
      entity => entity.payload.internalName === 'StartingBalancePayee',
    )!;
    const immediateIncome = snapshot.entities.find(
      entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
    )!;
    snapshot.entities.push(
      {
        entityKind: 'be_accounts',
        entityId: 'account-1',
        isTombstone: false,
        payload: {
          accountName: 'Account Capture 1',
          accountType: 'Checking',
          onBudget: true,
          isClosed: false,
        },
      },
      {
        entityKind: 'be_payees',
        entityId: 'transfer-payee-1',
        isTombstone: false,
        payload: {
          accountId: 'account-1',
          name: 'Transfer : Account Capture 1',
          enabled: true,
          autoFillSubCategoryEnabled: true,
          autoFillAmount: 0,
          autoFillAmountEnabled: false,
          autoFillMemoEnabled: false,
          renameOnImportEnabled: true,
        },
      },
      {
        entityKind: 'be_transactions',
        entityId: 'starting-balance-1',
        isTombstone: false,
        payload: {
          accountId: 'account-1',
          payeeId: startingPayee.entityId,
          subCategoryId: immediateIncome.entityId,
          date: '2026-08-17',
          amount: 123450,
          cashAmount: 123450,
          creditAmount: 0,
          memo: null,
          cleared: 'Cleared',
          accepted: true,
          transferAccountId: null,
          transferTransactionId: null,
          transferSubtransactionId: null,
        },
      },
    );

    const result = projectStockCheckingAccountCalculations(snapshot);
    expect(result.be_account_calculations).toEqual([
      expect.objectContaining({
        id: 'ac/account-1',
        cleared_balance: 123450,
        uncleared_balance: 0,
        transaction_count: 1,
      }),
    ]);
    expect(result.be_monthly_account_calculations).toHaveLength(2);
    expect(result.be_monthly_account_calculations[0]).toMatchObject({
      cleared_balance: 123450,
      rolling_balance: 123450,
      transaction_count: 1,
    });
    expect(result.be_monthly_account_calculations[1]).toMatchObject({
      cleared_balance: 0,
      rolling_balance: 123450,
      transaction_count: 0,
    });
    expect(result.be_monthly_budget_calculations).toEqual([
      expect.objectContaining({
        immediate_income: 123450,
        available_to_budget: 123450,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 123450,
      }),
    ]);
    expect(
      result.be_monthly_subcategory_budget_calculations.filter(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          immediateIncome.entityId,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        cash_outflows: 123450,
        positive_cash_outflows: 123450,
        balance: 123450,
        budgeted_cash_outflows: 123450,
        goal_overall_outflows: 123450,
      }),
      expect.objectContaining({
        cash_outflows: 0,
        balance: 123450,
        spent_previous_month: 123450,
        balance_previous_month: 123450,
        spent_average: 123450,
      }),
    ]);

    for (const [suffix, amount] of [
      ['2', 234560],
      ['3', 345670],
    ] as const) {
      snapshot.entities.push(
        {
          entityKind: 'be_accounts',
          entityId: `account-${suffix}`,
          isTombstone: false,
          payload: {
            accountName: `Account Capture ${suffix}`,
            accountType: 'Checking',
            onBudget: true,
            isClosed: false,
          },
        },
        {
          entityKind: 'be_payees',
          entityId: `transfer-payee-${suffix}`,
          isTombstone: false,
          payload: {
            accountId: `account-${suffix}`,
            name: `Transfer : Account Capture ${suffix}`,
            enabled: true,
            autoFillSubCategoryEnabled: true,
            autoFillAmount: 0,
            autoFillAmountEnabled: false,
            autoFillMemoEnabled: false,
            renameOnImportEnabled: true,
          },
        },
        {
          entityKind: 'be_transactions',
          entityId: `starting-balance-${suffix}`,
          isTombstone: false,
          payload: {
            accountId: `account-${suffix}`,
            payeeId: startingPayee.entityId,
            subCategoryId: immediateIncome.entityId,
            date: '2026-08-17',
            amount,
            cashAmount: amount,
            creditAmount: 0,
            memo: null,
            cleared: 'Cleared',
            accepted: true,
            transferAccountId: null,
            transferTransactionId: null,
            transferSubtransactionId: null,
          },
        },
      );
    }

    const multiple = projectStockCheckingAccountCalculations(snapshot);
    expect(multiple.be_account_calculations).toHaveLength(3);
    expect(multiple.be_monthly_account_calculations).toHaveLength(6);
    expect(
      multiple.be_account_calculations.map(row => row.cleared_balance),
    ).toEqual([123450, 234560, 345670]);
    expect(multiple.be_monthly_budget_calculations).toEqual([
      expect.objectContaining({
        immediate_income: 703680,
        available_to_budget: 703680,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 703680,
      }),
    ]);
    expect(
      multiple.be_monthly_subcategory_budget_calculations.filter(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          immediateIncome.entityId,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        cash_outflows: 703680,
        positive_cash_outflows: 703680,
        balance: 703680,
        budgeted_cash_outflows: 703680,
        goal_overall_outflows: 703680,
      }),
      expect.objectContaining({
        cash_outflows: 0,
        balance: 703680,
        spent_previous_month: 703680,
        balance_previous_month: 703680,
        spent_average: 703680,
      }),
    ]);
  });
});
