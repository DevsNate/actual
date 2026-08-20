export type CanonicalUnlinkedAccount = {
  id: string;
  planId: string;
  name: string;
  type: 'checking';
  isOnBudget: true;
  isClosed: false;
  isFavorite: false;
  sortOrder: number;
};

export type CanonicalAccountTransferPayee = {
  id: string;
  planId: string;
  accountId: string;
  name: string;
  isEnabled: true;
};

export type CanonicalStartingBalance = {
  id: string;
  planId: string;
  accountId: string;
  payeeId: string;
  categoryId: string;
  date: string;
  amount: number;
  isCleared: true;
  isApproved: true;
};

export type CanonicalUnlinkedAccountGroup = {
  account: CanonicalUnlinkedAccount;
  transferPayee: CanonicalAccountTransferPayee;
  startingBalance: CanonicalStartingBalance;
};

export type BuildUnlinkedCheckingAccountInput = {
  planId: string;
  accountId: string;
  transferPayeeId: string;
  startingBalanceId: string;
  startingBalancePayeeId: string;
  immediateIncomeCategoryId: string;
  name: string;
  openingBalance: number;
  openingDate: string;
  sortOrder: number;
};

export function buildUnlinkedCheckingAccount(
  input: BuildUnlinkedCheckingAccountInput,
): CanonicalUnlinkedAccountGroup {
  return {
    account: {
      id: input.accountId,
      planId: input.planId,
      name: input.name,
      type: 'checking',
      isOnBudget: true,
      isClosed: false,
      isFavorite: false,
      sortOrder: input.sortOrder,
    },
    transferPayee: {
      id: input.transferPayeeId,
      planId: input.planId,
      accountId: input.accountId,
      name: `Transfer : ${input.name}`,
      isEnabled: true,
    },
    startingBalance: {
      id: input.startingBalanceId,
      planId: input.planId,
      accountId: input.accountId,
      payeeId: input.startingBalancePayeeId,
      categoryId: input.immediateIncomeCategoryId,
      date: input.openingDate,
      amount: input.openingBalance,
      isCleared: true,
      isApproved: true,
    },
  };
}
