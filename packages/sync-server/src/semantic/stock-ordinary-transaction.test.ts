import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { projectStockEntity } from './stock-budget-projection';
import { parseStockOrdinaryMutation } from './stock-ordinary-transaction';

function fixture() {
  let sequence = 0;
  const entities = buildStockBudgetBootstrap({
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    principalId: 'user-1',
    name: 'Plan',
    currencyFormat: {},
    dateFormat: {},
    createdOn: '2026-08-16',
    createdAtMilliseconds: Date.UTC(2026, 7, 16),
    allocateId: label => `${label}:${sequence++}`,
  });
  const startingBalancePayee = entities.find(
    entity => entity.payload.internalName === 'StartingBalancePayee',
  )!;
  const income = entities.find(
    entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  const group = buildUnlinkedCheckingAccount({
    budgetId: 'budget-1',
    accountId: 'account-1',
    transferPayeeId: 'transfer-payee-1',
    startingBalanceId: 'starting-balance-1',
    startingBalancePayeeId: startingBalancePayee.entityId,
    immediateIncomeCategoryId: income.entityId,
    name: 'Checking',
    openingBalance: 100000,
    openingDate: '2026-08-16',
    sortOrder: 0,
  });
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 82,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      ...entities,
      ...stockAccountBudgetEntityAdapter.toBudgetEntities(
        group,
        'version-1',
        'account-create-1',
      ),
    ],
  };
}

function payeeRow(name = 'Payee 4', tombstone = false) {
  return {
    id: 'payee-4',
    is_tombstone: tombstone,
    entities_account_id: null,
    enabled: true,
    auto_fill_subcategory_id: null,
    auto_fill_user_defined_subcategory_id: null,
    auto_fill_memo: null,
    auto_fill_amount: 0,
    auto_fill_subcategory_enabled: true,
    auto_fill_memo_enabled: false,
    auto_fill_amount_enabled: false,
    rename_on_import_enabled: true,
    name,
    internal_name: null,
  };
}

function transactionRow(tombstone = false, cashAmount = 0) {
  return {
    id: 'transaction-1',
    is_tombstone: tombstone,
    entities_account_id: 'account-1',
    entities_payee_id: 'payee-4',
    entities_subcategory_id: null,
    entities_scheduled_transaction_id: null,
    date: '2026-08-16',
    date_entered_from_schedule: null,
    amount: -1000,
    cash_amount: cashAmount,
    credit_amount: 0,
    credit_amount_adjusted: 0,
    subcategory_credit_amount_preceding: 0,
    memo: 'Payee Test 1',
    cleared: 'Uncleared',
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
}

describe('stock ordinary transaction and payee boundary', () => {
  test('admits captured transaction-coupled payee creation and normalizes cash amount', () => {
    const snapshot = fixture();
    const parsed = parseStockOrdinaryMutation(
      {
        be_payees: [payeeRow()],
        be_transaction_groups: [
          {
            id: 'transaction-1',
            be_transaction: transactionRow(),
            be_subtransactions: null,
          },
        ],
      },
      snapshot,
    );

    expect(parsed).toMatchObject({
      mutationDomain: 'transaction',
      mutation: {
        kind: 'create-with-payee',
        payee: { id: 'payee-4', name: 'Payee 4' },
        transaction: {
          id: 'transaction-1',
          accountId: 'account-1',
          payeeId: 'payee-4',
          amount: -1000,
        },
      },
      expectedDeviceAdvance: 2,
      serverKnowledgeAdvance: 2,
    });
    expect(parsed?.changes[1]?.payload.cashAmount).toBe(-1000);
    expect(parsed?.changedEntities.be_transactions).toEqual([
      expect.objectContaining({ id: 'transaction-1', cash_amount: -1000 }),
    ]);
  });

  test('admits exact transaction tombstone, payee rename, and unused payee tombstone', () => {
    const base = fixture();
    const created = parseStockOrdinaryMutation(
      {
        be_payees: [payeeRow()],
        be_transaction_groups: [
          {
            id: 'transaction-1',
            be_transaction: transactionRow(),
            be_subtransactions: null,
          },
        ],
      },
      base,
    )!;
    const live = { ...base, entities: [...base.entities, ...created.changes] };
    const transaction = live.entities.find(
      entity =>
        entity.entityKind === 'be_transactions' &&
        entity.entityId === 'transaction-1',
    )!;
    const deleted = parseStockOrdinaryMutation(
      {
        be_transaction_groups: [
          {
            id: transaction.entityId,
            be_transaction: {
              ...projectStockEntity(transaction),
              is_tombstone: true,
            },
            be_subtransactions: null,
          },
        ],
      },
      live,
    )!;
    expect(deleted.mutation).toEqual({
      kind: 'delete',
      budgetId: 'budget-1',
      transactionId: 'transaction-1',
    });

    const terminal = {
      ...live,
      entities: live.entities.map(entity =>
        entity.entityId === 'transaction-1'
          ? { ...entity, isTombstone: true }
          : entity,
      ),
    };
    const payee = terminal.entities.find(
      entity => entity.entityId === 'payee-4',
    )!;
    const renamed = parseStockOrdinaryMutation(
      { be_payees: [{ ...projectStockEntity(payee), name: 'Payee 5' }] },
      terminal,
    )!;
    expect(renamed.mutation).toMatchObject({ kind: 'rename', name: 'Payee 5' });
    const renamedPayee = renamed.changes[0]!;
    const renamedSnapshot = {
      ...terminal,
      entities: terminal.entities.map(entity =>
        entity.entityId === renamedPayee.entityId ? renamedPayee : entity,
      ),
    };
    const tombstoned = parseStockOrdinaryMutation(
      {
        be_payees: [
          { ...projectStockEntity(renamedPayee), is_tombstone: true },
        ],
      },
      renamedSnapshot,
    );
    expect(tombstoned?.mutation).toEqual({
      kind: 'delete',
      budgetId: 'budget-1',
      payeeId: 'payee-4',
    });
  });

  test('fails closed for malformed groups and payee deletion with a live reference', () => {
    const snapshot = fixture();
    expect(
      parseStockOrdinaryMutation(
        {
          be_payees: [payeeRow()],
          be_transaction_groups: [
            {
              id: 'transaction-1',
              be_transaction: {
                ...transactionRow(),
                transfer_account_id: 'account-2',
              },
              be_subtransactions: null,
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();

    const created = parseStockOrdinaryMutation(
      {
        be_payees: [payeeRow()],
        be_transaction_groups: [
          {
            id: 'transaction-1',
            be_transaction: transactionRow(),
            be_subtransactions: null,
          },
        ],
      },
      snapshot,
    )!;
    const live = {
      ...snapshot,
      entities: [...snapshot.entities, ...created.changes],
    };
    const payee = live.entities.find(entity => entity.entityId === 'payee-4')!;
    expect(
      parseStockOrdinaryMutation(
        {
          be_payees: [{ ...projectStockEntity(payee), is_tombstone: true }],
        },
        live,
      ),
    ).toBeNull();
  });
});
