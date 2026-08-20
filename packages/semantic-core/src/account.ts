import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalUnlinkedAccount = {
  id: string;
  budgetId: string;
  name: string;
  type: 'checking';
  isOnBudget: true;
  isClosed: false;
  isFavorite: false;
  sortOrder: number;
};

export type CanonicalAccountTransferPayee = {
  id: string;
  budgetId: string;
  accountId: string;
  name: string;
  isEnabled: true;
};

export type CanonicalStartingBalance = {
  id: string;
  budgetId: string;
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

/**
 * Atomic persistence envelope for the first admitted account aggregate.
 * `delivery` is compatibility delivery state; it is not canonical account
 * authority. A writer must commit both parts or neither part.
 */
export type CommitUnlinkedAccountCreation = {
  accountGroup: CanonicalUnlinkedAccountGroup;
  delivery: BudgetChangeSetCommand;
};

export type UnlinkedAccountCreationWriter = {
  commitUnlinkedAccountCreation(
    command: CommitUnlinkedAccountCreation,
  ): Promise<BudgetChangeSetResult>;
};

export type CanonicalAccountRename = {
  budgetId: string;
  accountId: string;
  transferPayeeId: string;
  expectedAccountName: string;
  expectedTransferPayeeName: string;
  name: string;
};

export type CommitCanonicalAccountRename = {
  rename: CanonicalAccountRename;
  delivery: BudgetChangeSetCommand;
};

export type CanonicalPristineAccountDeletion = {
  budgetId: string;
  accountId: string;
  transferPayeeId: string;
  startingBalanceTransactionId: string;
};

export type CommitCanonicalPristineAccountDeletion = {
  deletion: CanonicalPristineAccountDeletion;
  delivery: BudgetChangeSetCommand;
};

export type CanonicalManualBalanceAdjustment = {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string;
  categoryId: string;
  date: string;
  amount: number;
  memo: 'Closed Account';
};

export type CommitCanonicalAccountClose = {
  budgetId: string;
  accountId: string;
  adjustment: CanonicalManualBalanceAdjustment;
  delivery: BudgetChangeSetCommand;
};

export type CommitCanonicalAccountReopen = {
  budgetId: string;
  accountId: string;
  delivery: BudgetChangeSetCommand;
};

export type AccountLifecycleWriter = {
  commitAccountRename(
    command: CommitCanonicalAccountRename,
  ): Promise<BudgetChangeSetResult>;
  commitPristineAccountDeletion(
    command: CommitCanonicalPristineAccountDeletion,
  ): Promise<BudgetChangeSetResult>;
  commitAccountClose(
    command: CommitCanonicalAccountClose,
  ): Promise<BudgetChangeSetResult>;
  commitAccountReopen(
    command: CommitCanonicalAccountReopen,
  ): Promise<BudgetChangeSetResult>;
};

export type BuildUnlinkedCheckingAccountInput = {
  budgetId: string;
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
      budgetId: input.budgetId,
      name: input.name,
      type: 'checking',
      isOnBudget: true,
      isClosed: false,
      isFavorite: false,
      sortOrder: input.sortOrder,
    },
    transferPayee: {
      id: input.transferPayeeId,
      budgetId: input.budgetId,
      accountId: input.accountId,
      name: `Transfer : ${input.name}`,
      isEnabled: true,
    },
    startingBalance: {
      id: input.startingBalanceId,
      budgetId: input.budgetId,
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
