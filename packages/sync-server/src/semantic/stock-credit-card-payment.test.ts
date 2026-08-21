import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

import { projectStockRequestEntity } from './stock-budget-projection';
import { parseStockCreditCardPaymentMutation } from './stock-credit-card-payment';
import { parseStockTransferMutation } from './stock-transfer';

vi.mock('./stock-budget-calculation-projection', () => ({
  projectStockBudgetCalculations: () => ({
    be_account_calculations: [],
    be_monthly_account_calculations: [],
    be_monthly_budget_calculations: [],
    be_monthly_subcategory_budget_calculations: [],
  }),
}));

function account(id: string, type: 'Cash' | 'CreditCard'): BudgetEntity {
  return {
    entityKind: 'be_accounts',
    entityId: id,
    isTombstone: false,
    payload: {
      accountName: id,
      accountType: type,
      isClosed: false,
      onBudget: true,
      lastPaymentPayeeId: type === 'CreditCard' ? null : null,
    },
  };
}

function fixture(): BudgetSnapshot {
  const checking = account('acct-checking', 'Cash');
  const credit = account('acct-credit', 'CreditCard');
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 62,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      {
        entityKind: 'be_budget',
        entityId: 'version-1',
        isTombstone: false,
        payload: { budgetName: 'Plan' },
      },
      {
        entityKind: 'be_monthly_budgets',
        entityId: 'mb/current',
        isTombstone: false,
        payload: { month: '2026-08-01' },
      },
      checking,
      credit,
      payee('payee-to-credit', 'acct-credit'),
      payee('payee-to-checking', 'acct-checking'),
    ],
  };
}

function payee(id: string, accountId: string): BudgetEntity {
  return {
    entityKind: 'be_payees',
    entityId: id,
    isTombstone: false,
    payload: { accountId, enabled: true, name: id },
  };
}

function paymentGroups(amount = 12340) {
  const leg = (
    id: string,
    accountId: string,
    payeeId: string,
    otherAccountId: string,
    otherId: string,
    value: number,
  ) => ({
    id,
    is_tombstone: false,
    entities_account_id: accountId,
    entities_payee_id: payeeId,
    entities_subcategory_id: null,
    date: '2026-08-21',
    amount: value,
    cash_amount: 0,
    credit_amount: 0,
    memo: 'Calc payment capture',
    cleared: accountId === 'acct-checking' ? 'Cleared' : 'Uncleared',
    accepted: true,
    transfer_account_id: otherAccountId,
    transfer_transaction_id: otherId,
  });
  return [
    {
      id: 'payment-out',
      be_transaction: leg(
        'payment-out',
        'acct-checking',
        'payee-to-credit',
        'acct-credit',
        'payment-in',
        -amount,
      ),
      be_subtransactions: null,
    },
    {
      id: 'payment-in',
      be_transaction: leg(
        'payment-in',
        'acct-credit',
        'payee-to-checking',
        'acct-checking',
        'payment-out',
        amount,
      ),
      be_subtransactions: null,
    },
  ];
}

describe('stock credit-card payment boundary', () => {
  test('admits the captured account update and reciprocal creation atomically', () => {
    const snapshot = fixture();
    const credit = snapshot.entities.find(
      entity => entity.entityId === 'acct-credit',
    )!;
    const parsed = parseStockCreditCardPaymentMutation(
      {
        be_accounts: [
          {
            ...projectStockRequestEntity(credit),
            last_payment_payee_id: 'payee-to-checking',
          },
        ],
        be_transaction_groups: paymentGroups(),
      },
      snapshot,
    );
    expect(parsed).toMatchObject({
      mutation: {
        transfer: { kind: 'create' },
        creditAccountId: 'acct-credit',
        lastPaymentPayeeId: 'payee-to-checking',
      },
      expectedDeviceAdvance: [7, 8],
      serverKnowledgeAdvance: 2,
    });
    expect(parsed?.changes.map(change => change.entityId)).toEqual([
      'acct-credit',
      'payment-out',
      'payment-in',
    ]);
  });

  test('keeps an account update mismatch and an ordinary transfer fail-closed', () => {
    const snapshot = fixture();
    expect(
      parseStockTransferMutation(
        { be_transaction_groups: paymentGroups() },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockCreditCardPaymentMutation(
        { be_transaction_groups: paymentGroups() },
        snapshot,
      ),
    ).toBeNull();
    const credit = snapshot.entities.find(
      entity => entity.entityId === 'acct-credit',
    )!;
    expect(
      parseStockCreditCardPaymentMutation(
        {
          be_accounts: [
            {
              ...projectStockRequestEntity(credit),
              account_name: 'changed-too',
              last_payment_payee_id: 'payee-to-checking',
            },
          ],
          be_transaction_groups: paymentGroups(),
        },
        snapshot,
      ),
    ).toBeNull();
  });

  test('normalizes the captured create, amount edit, and terminal deletion lifecycle', () => {
    const initial = fixture();
    const credit = initial.entities.find(
      entity => entity.entityId === 'acct-credit',
    )!;
    const created = parseStockCreditCardPaymentMutation(
      {
        be_accounts: [
          {
            ...projectStockRequestEntity(credit),
            last_payment_payee_id: 'payee-to-checking',
          },
        ],
        be_transaction_groups: paymentGroups(),
      },
      initial,
    )!;

    expect(created.changedEntities.be_transactions).toEqual([
      expect.objectContaining({
        id: 'payment-out',
        amount: -12340,
        cash_amount: -12340,
        credit_amount: 0,
        credit_amount_adjusted: 0,
      }),
      expect.objectContaining({
        id: 'payment-in',
        amount: 12340,
        cash_amount: 0,
        credit_amount: 12340,
        credit_amount_adjusted: 12340,
      }),
    ]);
    const afterCreate = applyChanges(initial, created.changes);

    const edited = parseStockCreditCardPaymentMutation(
      {
        be_transaction_groups: amountEditGroups(afterCreate, 23450),
      },
      afterCreate,
    )!;
    expect(edited).toMatchObject({
      mutation: { transfer: { kind: 'update' } },
      expectedDeviceAdvance: 2,
      serverKnowledgeAdvance: 2,
    });
    expect(edited.changedEntities.be_transactions).toEqual([
      expect.objectContaining({
        id: 'payment-out',
        amount: -23450,
        cash_amount: -23450,
        credit_amount: 0,
        credit_amount_adjusted: 0,
      }),
      expect.objectContaining({
        id: 'payment-in',
        amount: 23450,
        cash_amount: 0,
        credit_amount: 23450,
        credit_amount_adjusted: 23450,
      }),
    ]);
    const afterEdit = applyChanges(afterCreate, edited.changes);

    const deleted = parseStockCreditCardPaymentMutation(
      {
        be_transaction_groups: deletionGroups(afterEdit),
      },
      afterEdit,
    )!;
    expect(deleted).toMatchObject({
      mutation: { transfer: { kind: 'delete' } },
      expectedDeviceAdvance: 8,
      serverKnowledgeAdvance: 2,
    });
    expect(deleted.changedEntities.be_transactions).toEqual([]);
    expect(deleted.changes).toEqual([
      expect.objectContaining({ entityId: 'payment-out', isTombstone: true }),
      expect.objectContaining({ entityId: 'payment-in', isTombstone: true }),
    ]);
  });
});

function applyChanges(
  snapshot: BudgetSnapshot,
  changes: readonly BudgetEntity[],
): BudgetSnapshot {
  const replacements = new Map(
    changes.map(entity => [entity.entityId, entity]),
  );
  const existingIds = new Set(snapshot.entities.map(entity => entity.entityId));
  return {
    ...snapshot,
    entities: [
      ...snapshot.entities.map(
        entity => replacements.get(entity.entityId) ?? entity,
      ),
      ...changes.filter(entity => !existingIds.has(entity.entityId)),
    ],
  };
}

function paymentEntities(snapshot: BudgetSnapshot): readonly BudgetEntity[] {
  return ['payment-out', 'payment-in'].map(id =>
    snapshot.entities.find(
      entity =>
        entity.entityKind === 'be_transactions' && entity.entityId === id,
    )!,
  );
}

function amountEditGroups(snapshot: BudgetSnapshot, amount: number) {
  return paymentEntities(snapshot).map((entity, index) => {
    const row = projectStockRequestEntity(entity);
    return {
      id: entity.entityId,
      be_transaction: { ...row, amount: index === 0 ? -amount : amount },
      be_subtransactions: null,
    };
  });
}

function deletionGroups(snapshot: BudgetSnapshot) {
  return paymentEntities(snapshot).map(entity => {
    const row = projectStockRequestEntity(entity);
    return {
      id: entity.entityId,
      be_transaction: {
        ...row,
        is_tombstone: true,
        entities_payee_id: null,
        transfer_account_id: null,
        transfer_transaction_id: null,
      },
      be_subtransactions: null,
    };
  });
}
