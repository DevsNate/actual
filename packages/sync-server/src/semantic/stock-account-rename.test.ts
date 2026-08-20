import type { BudgetSnapshot } from '@actual-app/semantic-core';

import { parseStockAccountRenameDelta } from './stock-account-rename';
import { projectStockEntity } from './stock-budget-projection';

describe('stock account rename delta', () => {
  test('accepts only the captured complete account plus bound-payee rename', () => {
    const snapshot = fixture();
    const account = snapshot.entities[0];
    const payee = snapshot.entities[1];
    const changedEntities = {
      be_accounts: [
        { ...projectStockEntity(account), account_name: 'Account Renamed 3' },
      ],
      be_payees: [
        {
          ...projectStockEntity(payee),
          name: 'Transfer : Account Renamed 3',
        },
      ],
    };

    const result = parseStockAccountRenameDelta(changedEntities, snapshot);
    expect(result?.rename).toEqual({
      budgetId: 'plan-1',
      accountId: 'account-3',
      transferPayeeId: 'payee-3',
      expectedAccountName: 'Account Capture 3',
      expectedTransferPayeeName: 'Transfer : Account Capture 3',
      name: 'Account Renamed 3',
    });
    expect(result?.changes).toEqual([
      expect.objectContaining({
        entityId: 'account-3',
        payload: expect.objectContaining({
          accountName: 'Account Renamed 3',
          sortableIndex: 2,
        }),
      }),
      expect.objectContaining({
        entityId: 'payee-3',
        payload: expect.objectContaining({
          name: 'Transfer : Account Renamed 3',
          renameOnImportEnabled: true,
        }),
      }),
    ]);

    expect(
      parseStockAccountRenameDelta(
        {
          ...changedEntities,
          be_payees: [
            {
              ...changedEntities.be_payees[0],
              name: 'Unrelated payee name',
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockAccountRenameDelta(
        {
          ...changedEntities,
          be_accounts: [
            {
              ...changedEntities.be_accounts[0],
              note: 'unexpected concurrent edit',
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
  });
});

function fixture(): BudgetSnapshot {
  return {
    budgetId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 36,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      {
        entityKind: 'be_accounts',
        entityId: 'account-3',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          creationCommandKey: 'create-3',
          accountName: 'Account Capture 3',
          accountType: 'Checking',
          note: null,
          lastPaymentPayeeId: null,
          isClosed: false,
          sortableIndex: 2,
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
      },
      {
        entityKind: 'be_payees',
        entityId: 'payee-3',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          accountId: 'account-3',
          enabled: true,
          autoFillSubCategoryId: null,
          autoFillUserDefinedSubCategoryId: null,
          autoFillMemo: null,
          autoFillAmount: 0,
          autoFillSubCategoryEnabled: true,
          autoFillMemoEnabled: false,
          autoFillAmountEnabled: false,
          renameOnImportEnabled: true,
          name: 'Transfer : Account Capture 3',
          internalName: null,
        },
      },
    ],
  };
}
