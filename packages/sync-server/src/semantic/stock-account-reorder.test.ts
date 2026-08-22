import type { BudgetSnapshot } from '@actual-app/semantic-core';

import { parseStockAccountReorder } from './stock-account-reorder';
import { projectStockRequestEntity } from './stock-budget-projection';

describe('stock account reorder', () => {
  test('admits the captured two-row reorder and preserves every other field', () => {
    const initial = fixture();
    const cc = initial.entities[3];
    const last = initial.entities[5];
    const parsed = parseStockAccountReorder(
      {
        be_accounts: [
          {
            ...projectStockRequestEntity(cc),
            sortable_index: 357913941,
          },
          {
            ...projectStockRequestEntity(last),
            sortable_index: 715827882,
          },
        ],
      },
      initial,
    );

    expect(parsed).toMatchObject({
      expectedDeviceAdvance: 2,
      serverKnowledgeAdvance: 1,
      changedEntities: { be_accounts: [] },
    });
    expect(parsed?.changes).toEqual([
      {
        ...cc,
        payload: { ...cc.payload, sortableIndex: 357913941 },
      },
      {
        ...last,
        payload: { ...last.payload, sortableIndex: 715827882 },
      },
    ]);
  });

  test('fails closed for unobserved row counts and concurrent field changes', () => {
    const initial = fixture();
    const cc = initial.entities[3];
    const last = initial.entities[5];
    const ccRow = projectStockRequestEntity(cc);
    const lastRow = projectStockRequestEntity(last);

    expect(
      parseStockAccountReorder(
        { be_accounts: [{ ...ccRow, sortable_index: 357913941 }] },
        initial,
      ),
    ).toBeNull();
    expect(
      parseStockAccountReorder(
        {
          be_accounts: [
            {
              ...ccRow,
              account_name: 'Concurrent rename',
              sortable_index: 357913941,
            },
            { ...lastRow, sortable_index: 715827882 },
          ],
        },
        initial,
      ),
    ).toBeNull();
  });

  test('fails closed for duplicate identities or resulting sort indexes', () => {
    const initial = fixture();
    const cc = initial.entities[3];
    const last = initial.entities[5];
    const ccRow = projectStockRequestEntity(cc);
    const lastRow = projectStockRequestEntity(last);

    expect(
      parseStockAccountReorder(
        {
          be_accounts: [
            { ...ccRow, sortable_index: 357913941 },
            { ...ccRow, sortable_index: 715827882 },
          ],
        },
        initial,
      ),
    ).toBeNull();
    expect(
      parseStockAccountReorder(
        {
          be_accounts: [
            { ...ccRow, sortable_index: 2 },
            { ...lastRow, sortable_index: 715827882 },
          ],
        },
        initial,
      ),
    ).toBeNull();
  });
});

function fixture(): BudgetSnapshot {
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 81,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      {
        entityKind: 'be_budget',
        entityId: 'version-1',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          budgetId: 'budget-1',
          budgetName: 'Budget',
          currencyFormat: {},
          dateFormat: {},
          source: null,
        },
      },
      {
        entityKind: 'be_monthly_budgets',
        entityId: 'month-2026-08',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          month: '2026-08-01',
          bootstrapRole: 'current',
        },
      },
      account('account-a', 'AC1', 0),
      account('account-b', 'Cc', 1),
      account('account-c', 'CC Capture 2', 2),
      account('account-d', 'CC Capture 3', 3),
    ],
  };
}

function account(id: string, name: string, sortableIndex: number) {
  return {
    entityKind: 'be_accounts' as const,
    entityId: id,
    isTombstone: false,
    payload: {
      budgetVersionId: 'version-1',
      creationCommandKey: `create-${id}`,
      accountName: name,
      accountType: 'CreditCard',
      note: null,
      lastPaymentPayeeId: null,
      isClosed: false,
      sortableIndex,
      isFavorite: false,
      sortableFavoriteIndex: 0,
      onBudget: true,
      lastReconciledAt: null,
      debtStartDate: null,
      debtOriginalBalance: null,
      debtInterestRates: null,
      debtMinimumPayments: null,
      debtAssetValues: null,
      debtEscrowAmounts: null,
      debtMigratedFromAccountId: null,
    },
  };
}
