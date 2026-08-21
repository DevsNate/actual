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
});
