import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { projectStockEntity } from './stock-budget-projection';
import { parseStockTransferMutation } from './stock-transfer';

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
  const starting = entities.find(
    item => item.payload.internalName === 'StartingBalancePayee',
  )!.entityId;
  const income = entities.find(
    item => item.payload.internalName === 'Category/__ImmediateIncome__',
  )!.entityId;
  const account = (id: string, payee: string, balance: string, sort: number) =>
    stockAccountBudgetEntityAdapter.toBudgetEntities(
      buildUnlinkedCheckingAccount({
        budgetId: 'budget-1',
        accountId: id,
        transferPayeeId: payee,
        startingBalanceId: balance,
        startingBalancePayeeId: starting,
        immediateIncomeCategoryId: income,
        name: id,
        openingBalance: sort === 0 ? 100000 : 10000,
        openingDate: '2026-08-16',
        sortOrder: sort,
      }),
      'version-1',
      `create-${id}`,
    );
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 77,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      ...entities,
      ...account('acct-checking', 'payee-checking', 'balance-checking', 0),
      ...account('acct-savings', 'payee-savings', 'balance-savings', 1),
    ],
  };
}

function leg(
  id: string,
  accountId: string,
  payeeId: string,
  otherAccountId: string,
  otherId: string,
  amount: number,
  cleared: string,
) {
  return {
    id,
    is_tombstone: false,
    entities_account_id: accountId,
    entities_payee_id: payeeId,
    entities_subcategory_id: null,
    entities_scheduled_transaction_id: null,
    date: '2026-08-16',
    amount,
    cash_amount: 0,
    credit_amount: 0,
    memo: 'Transfer 1',
    cleared,
    accepted: true,
    transfer_account_id: otherAccountId,
    transfer_transaction_id: otherId,
    transfer_subtransaction_id: null,
    matched_transaction_id: null,
  };
}

function createRequest() {
  return {
    be_transaction_groups: [
      {
        id: 'leg-out',
        be_transaction: leg(
          'leg-out',
          'acct-checking',
          'payee-savings',
          'acct-savings',
          'leg-in',
          -12340,
          'Uncleared',
        ),
        be_subtransactions: null,
      },
      {
        id: 'leg-in',
        be_transaction: leg(
          'leg-in',
          'acct-savings',
          'payee-checking',
          'acct-checking',
          'leg-out',
          12340,
          'Cleared',
        ),
        be_subtransactions: null,
      },
    ],
  };
}

describe('stock ordinary transfer boundary', () => {
  test('admits captured reciprocal creation and normalizes cash amounts', () => {
    const parsed = parseStockTransferMutation(createRequest(), fixture());
    expect(parsed).toMatchObject({
      mutation: { kind: 'create' },
      expectedDeviceAdvance: 8,
      serverKnowledgeAdvance: 2,
    });
    expect(parsed?.changedEntities.be_transactions).toEqual([
      expect.objectContaining({ id: 'leg-out', cash_amount: -12340 }),
      expect.objectContaining({ id: 'leg-in', cash_amount: 12340 }),
    ]);
  });

  test('admits complete pair amount/memo updates and exact deletion', () => {
    const base = fixture();
    const created = parseStockTransferMutation(createRequest(), base)!;
    const live = { ...base, entities: [...base.entities, ...created.changes] };
    const edit = createRequest();
    for (const group of edit.be_transaction_groups) {
      group.be_transaction.memo = 'Transfer 2';
      group.be_transaction.cash_amount = group.be_transaction.amount;
    }
    const memo = parseStockTransferMutation(edit, live);
    expect(memo?.mutation.kind).toBe('update');
    expect(memo?.expectedDeviceAdvance).toBe(2);
    expect(memo?.serverKnowledgeAdvance).toBe(1);

    const amountEdit = createRequest();
    for (const group of amountEdit.be_transaction_groups) {
      group.be_transaction.amount =
        group.be_transaction.amount < 0 ? -23450 : 23450;
      group.be_transaction.cash_amount = group.be_transaction.amount;
    }
    expect(parseStockTransferMutation(amountEdit, live)).toMatchObject({
      mutation: { kind: 'update' },
      expectedDeviceAdvance: 2,
      serverKnowledgeAdvance: 2,
    });

    const current = {
      ...live,
      entities: live.entities.map(
        item =>
          memo?.changes.find(change => change.entityId === item.entityId) ??
          item,
      ),
    };
    const deletion = {
      be_transaction_groups: current.entities
        .filter(item => ['leg-out', 'leg-in'].includes(item.entityId))
        .map(item => ({
          id: item.entityId,
          be_transaction: {
            ...projectStockEntity(item),
            is_tombstone: true,
            entities_payee_id: null,
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
          be_subtransactions: null,
        })),
    };
    expect(parseStockTransferMutation(deletion, current)).toMatchObject({
      mutation: { kind: 'delete', transactionIds: ['leg-out', 'leg-in'] },
      expectedDeviceAdvance: 8,
    });
  });

  test('rejects one-sided, unbalanced, mislinked, categorized, and mixed operations', () => {
    const snapshot = fixture();
    const oneSided = createRequest();
    oneSided.be_transaction_groups.pop();
    expect(parseStockTransferMutation(oneSided, snapshot)).toBeNull();

    const unbalanced = createRequest();
    unbalanced.be_transaction_groups[1].be_transaction.amount = 12341;
    expect(parseStockTransferMutation(unbalanced, snapshot)).toBeNull();

    const mislinked = createRequest();
    mislinked.be_transaction_groups[0].be_transaction.transfer_transaction_id =
      'unknown';
    expect(parseStockTransferMutation(mislinked, snapshot)).toBeNull();

    const categorized = createRequest();
    (
      categorized.be_transaction_groups[0].be_transaction as Record<
        string,
        unknown
      >
    ).entities_subcategory_id = 'category';
    expect(parseStockTransferMutation(categorized, snapshot)).toBeNull();

    const created = parseStockTransferMutation(createRequest(), snapshot)!;
    const live = {
      ...snapshot,
      entities: [...snapshot.entities, ...created.changes],
    };
    const partialDelete = createRequest();
    partialDelete.be_transaction_groups[0].be_transaction.is_tombstone = true;
    expect(parseStockTransferMutation(partialDelete, live)).toBeNull();
  });
});
