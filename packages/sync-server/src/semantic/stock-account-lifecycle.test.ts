import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { parseStockAccountLifecycleDelta } from './stock-account-lifecycle';
import { projectStockEntity } from './stock-budget-projection';

describe('stock Checking account close and reopen', () => {
  test('admits the captured adjustment close and account-only reopen', () => {
    const open = fixture(false);
    const account = find(open, 'be_accounts', 'account-1');
    const adjustmentPayee = open.entities.find(
      item => item.payload.internalName === 'BalanceAdjustmentPayee',
    )!;
    const immediateIncome = open.entities.find(
      item => item.payload.internalName === 'Category/__ImmediateIncome__',
    )!;
    const adjustment = {
      id: 'adjustment-1',
      is_tombstone: false,
      entities_account_id: 'account-1',
      entities_payee_id: adjustmentPayee.entityId,
      entities_subcategory_id: immediateIncome.entityId,
      entities_scheduled_transaction_id: null,
      date: '2026-08-17',
      date_entered_from_schedule: null,
      amount: -122450,
      cash_amount: 0,
      credit_amount: 0,
      credit_amount_adjusted: 0,
      subcategory_credit_amount_preceding: 0,
      memo: 'Closed Account',
      cleared: 'Cleared',
      accepted: true,
      check_number: null,
      flag: null,
      transfer_account_id: null,
      transfer_transaction_id: null,
      transfer_subtransaction_id: null,
      matched_transaction_id: null,
      ynab_id: null,
      imported_payee: null,
      imported_date: null,
      original_imported_payee: null,
      provider_cleansed_payee: null,
      source: null,
      debt_transaction_type: null,
    };
    const close = parseStockAccountLifecycleDelta(
      {
        be_accounts: [{ ...projectStockEntity(account), is_closed: true }],
        be_transaction_groups: [
          {
            id: adjustment.id,
            be_transaction: adjustment,
            be_subtransactions: null,
          },
        ],
      },
      open,
    );
    expect(close).toMatchObject({
      kind: 'close',
      accountId: 'account-1',
      adjustment: {
        id: 'adjustment-1',
        amount: -122450,
        memo: 'Closed Account',
      },
      changes: [
        { entityKind: 'be_accounts', entityId: 'account-1' },
        {
          entityKind: 'be_transactions',
          entityId: 'adjustment-1',
          payload: { cashAmount: -122450 },
        },
      ],
    });
    expect(close?.changedEntities.be_account_calculations).toEqual([
      expect.objectContaining({
        id: 'ac/account-1',
        cleared_balance: 1000,
        uncleared_balance: -1000,
        transaction_count: 3,
      }),
    ]);
    const partialAdjustment = { ...adjustment } as Record<string, unknown>;
    delete partialAdjustment.original_imported_payee;
    expect(
      parseStockAccountLifecycleDelta(
        {
          be_accounts: [{ ...projectStockEntity(account), is_closed: true }],
          be_transaction_groups: [
            {
              id: adjustment.id,
              be_transaction: partialAdjustment,
              be_subtransactions: null,
            },
          ],
        },
        open,
      ),
    ).toBeNull();
    expect(
      parseStockAccountLifecycleDelta(
        {
          be_accounts: [{ ...projectStockEntity(account), is_closed: true }],
          be_transaction_groups: [
            {
              id: adjustment.id,
              be_transaction: { ...adjustment, amount: -122449 },
              be_subtransactions: null,
            },
          ],
        },
        open,
      ),
    ).toBeNull();

    const closed = fixture(true);
    const closedAccount = find(closed, 'be_accounts', 'account-1');
    const reopen = parseStockAccountLifecycleDelta(
      {
        be_accounts: [
          { ...projectStockEntity(closedAccount), is_closed: false },
        ],
      },
      closed,
    );
    expect(reopen).toMatchObject({
      kind: 'reopen',
      accountId: 'account-1',
      changedEntities: {},
    });
  });
});

function fixture(closed: boolean): BudgetSnapshot {
  let sequence = 0;
  const entities: BudgetEntity[] = [
    ...buildStockBudgetBootstrap({
      budgetId: 'budget-1',
      budgetVersionId: 'version-1',
      principalId: 'principal-1',
      name: 'Budget',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  ];
  const startingPayee = entities.find(
    item => item.payload.internalName === 'StartingBalancePayee',
  )!;
  const immediateIncome = entities.find(
    item => item.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  entities.push(
    {
      entityKind: 'be_accounts',
      entityId: 'account-1',
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        creationCommandKey: 'create-1',
        accountName: 'Checking 1',
        accountType: 'Checking',
        note: null,
        lastPaymentPayeeId: null,
        isClosed: closed,
        sortableIndex: 0,
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
      entityId: 'transfer-payee-1',
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        accountId: 'account-1',
        enabled: true,
        autoFillSubCategoryId: null,
        autoFillUserDefinedSubcategoryId: null,
        autoFillMemo: null,
        autoFillAmount: 0,
        autoFillSubCategoryEnabled: true,
        autoFillMemoEnabled: false,
        autoFillAmountEnabled: false,
        renameOnImportEnabled: true,
        name: 'Transfer : Checking 1',
        internalName: null,
      },
    },
    transaction(
      'starting-1',
      startingPayee.entityId,
      immediateIncome.entityId,
      123450,
      'Cleared',
    ),
    transaction('ordinary-1', null, null, -1000, 'Uncleared'),
  );
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: closed ? 43 : 41,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
}

function transaction(
  id: string,
  payeeId: string | null,
  categoryId: string | null,
  amount: number,
  cleared: 'Cleared' | 'Uncleared',
): BudgetEntity {
  return {
    entityKind: 'be_transactions',
    entityId: id,
    isTombstone: false,
    payload: {
      budgetVersionId: 'version-1',
      accountId: 'account-1',
      payeeId,
      subCategoryId: categoryId,
      scheduledTransactionId: null,
      date: '2026-08-17',
      dateEnteredFromSchedule: null,
      amount,
      cashAmount: amount,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
      memo: null,
      cleared,
      accepted: true,
      checkNumber: null,
      flag: null,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      matchedTransactionId: null,
      ynabId: null,
      importedPayee: null,
      importedDate: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      source: null,
      debtTransactionType: null,
    },
  };
}

function find(
  snapshot: BudgetSnapshot,
  kind: string,
  id: string,
): BudgetEntity {
  return snapshot.entities.find(
    item => item.entityKind === kind && item.entityId === id,
  )!;
}
