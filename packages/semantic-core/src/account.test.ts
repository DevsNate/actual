import { buildUnlinkedCheckingAccount } from './account';

describe('canonical unlinked account', () => {
  test('builds one account, transfer payee, and Starting Balance relationship', () => {
    expect(
      buildUnlinkedCheckingAccount({
        planId: 'plan-1',
        accountId: 'account-1',
        transferPayeeId: 'payee-1',
        startingBalanceId: 'transaction-1',
        startingBalancePayeeId: 'starting-balance-payee',
        immediateIncomeCategoryId: 'immediate-income',
        name: 'Everyday checking',
        openingBalance: 123450,
        openingDate: '2026-08-20',
        sortOrder: 2,
      }),
    ).toEqual({
      account: {
        id: 'account-1',
        planId: 'plan-1',
        name: 'Everyday checking',
        type: 'checking',
        isOnBudget: true,
        isClosed: false,
        isFavorite: false,
        sortOrder: 2,
      },
      transferPayee: {
        id: 'payee-1',
        planId: 'plan-1',
        accountId: 'account-1',
        name: 'Transfer : Everyday checking',
        isEnabled: true,
      },
      startingBalance: {
        id: 'transaction-1',
        planId: 'plan-1',
        accountId: 'account-1',
        payeeId: 'starting-balance-payee',
        categoryId: 'immediate-income',
        date: '2026-08-20',
        amount: 123450,
        isCleared: true,
        isApproved: true,
      },
    });
  });
});
