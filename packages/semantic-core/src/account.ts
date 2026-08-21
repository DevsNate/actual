import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalUnlinkedAccount = {
  id: string;
  budgetId: string;
  name: string;
  type: 'checking' | 'credit-card';
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
  paymentCategory?: CanonicalCreditCardPaymentCategory;
  monthlyPaymentCategories?: readonly [
    CanonicalMonthlyCreditCardPaymentCategory,
    CanonicalMonthlyCreditCardPaymentCategory,
  ];
};

export type CanonicalCreditCardPaymentCategory = {
  id: string;
  budgetId: string;
  accountId: string;
  groupId: string;
  name: string;
  sortOrder: number;
  type: 'DBT';
};

export type CanonicalMonthlyCreditCardPaymentCategory = {
  id: string;
  budgetId: string;
  categoryId: string;
  month: string;
  budgeted: 0;
  overspendingHandling: 'AffectsBuffer';
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

export type BuildUnlinkedCreditCardAccountInput =
  BuildUnlinkedCheckingAccountInput & {
    paymentCategoryId: string;
    debtPaymentCategoryGroupId: string;
    paymentCategorySortOrder: number;
    currentMonth: string;
    nextMonth: string;
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

export function buildUnlinkedCreditCardAccount(
  input: BuildUnlinkedCreditCardAccountInput,
): CanonicalUnlinkedAccountGroup {
  const checkingShape = buildUnlinkedCheckingAccount(input);
  return {
    ...checkingShape,
    account: { ...checkingShape.account, type: 'credit-card' },
    paymentCategory: {
      id: input.paymentCategoryId,
      budgetId: input.budgetId,
      accountId: input.accountId,
      groupId: input.debtPaymentCategoryGroupId,
      name: input.name,
      sortOrder: input.paymentCategorySortOrder,
      type: 'DBT',
    },
    monthlyPaymentCategories: [input.currentMonth, input.nextMonth].map(
      month => ({
        id: `mcb/${month.slice(0, 7)}/${input.paymentCategoryId}`,
        budgetId: input.budgetId,
        categoryId: input.paymentCategoryId,
        month,
        budgeted: 0 as const,
        overspendingHandling: 'AffectsBuffer' as const,
      }),
    ) as [
      CanonicalMonthlyCreditCardPaymentCategory,
      CanonicalMonthlyCreditCardPaymentCategory,
    ],
  };
}
