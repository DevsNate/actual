import type { BudgetEntity } from '@actual-app/semantic-core';

import { projectCapturedCheckingAccountRows } from './stock-account-calculation-projection';

function account(id: string): BudgetEntity {
  return {
    entityKind: 'be_accounts',
    entityId: id,
    isTombstone: false,
    payload: {},
  };
}

function transaction(
  id: string,
  accountId: string,
  amount: number,
  cleared: 'Cleared' | 'Uncleared',
  isUncategorized = false,
): BudgetEntity {
  return {
    entityKind: 'be_transactions',
    entityId: id,
    isTombstone: false,
    payload: {
      accountId,
      amount,
      cleared,
      subCategoryId: isUncategorized ? null : 'category-1',
      transferAccountId: null,
    },
  };
}

describe('captured stock account calculation projection', () => {
  test('projects captured cleared, uncleared, rolling, count, and warning rows', () => {
    const result = projectCapturedCheckingAccountRows(
      [account('account-1')],
      [
        transaction('starting-balance', 'account-1', 123450, 'Cleared'),
        transaction('ordinary-outflow', 'account-1', -10000, 'Uncleared', true),
      ],
      '2026-08-01',
      '2026-09-01',
    );

    expect(result.accountCalculations).toEqual([
      {
        id: 'ac/account-1',
        entities_account_id: 'account-1',
        is_tombstone: false,
        cleared_balance: 123450,
        uncleared_balance: -10000,
        info_count: 0,
        warning_count: 1,
        error_count: 0,
        transaction_count: 2,
        debt_last_payment_date: null,
        debt_payments: null,
      },
    ]);
    expect(result.monthlyAccountCalculations).toEqual([
      expect.objectContaining({
        id: 'mac/2026-08/account-1',
        month: '2026-08-01',
        cleared_balance: 123450,
        uncleared_balance: -10000,
        rolling_balance: 113450,
        warning_count: 1,
        transaction_count: 2,
      }),
      expect.objectContaining({
        id: 'mac/2026-09/account-1',
        month: '2026-09-01',
        cleared_balance: 0,
        uncleared_balance: 0,
        rolling_balance: 113450,
        warning_count: 0,
        transaction_count: 0,
      }),
    ]);
  });

  test('fails closed for an unadmitted month identity or unsafe balance', () => {
    expect(() =>
      projectCapturedCheckingAccountRows(
        [account('account-1')],
        [],
        '2026-08-02',
        '2026-09-01',
      ),
    ).toThrow('requires a month start');
    expect(() =>
      projectCapturedCheckingAccountRows(
        [account('account-1')],
        [
          transaction(
            'unsafe',
            'account-1',
            Number.MAX_SAFE_INTEGER + 1,
            'Cleared',
          ),
        ],
        '2026-08-01',
        '2026-09-01',
      ),
    ).toThrow('must be a safe integer');
  });
});
