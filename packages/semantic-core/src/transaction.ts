import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalOrdinaryPayee = {
  id: string;
  budgetId: string;
  name: string;
  isEnabled: boolean;
  autoFillCategoryId: string | null;
  autoFillUserDefinedCategoryId: string | null;
  autoFillMemo: string | null;
  autoFillAmount: number;
  autoFillCategoryEnabled: boolean;
  autoFillMemoEnabled: boolean;
  autoFillAmountEnabled: boolean;
  renameOnImportEnabled: boolean;
  internalName: string | null;
};

export type CanonicalOrdinaryTransaction = {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  date: string;
  amount: number;
  memo: string | null;
  cleared: 'Uncleared' | 'Cleared' | 'Reconciled';
  accepted: boolean;
  checkNumber: string | null;
  flag: string | null;
};

export type CanonicalOrdinaryTransactionMutation =
  | {
      kind: 'create';
      transaction: CanonicalOrdinaryTransaction;
    }
  | {
      kind: 'create-with-payee';
      payee: CanonicalOrdinaryPayee;
      transaction: CanonicalOrdinaryTransaction;
    }
  | {
      kind: 'delete';
      budgetId: string;
      transactionId: string;
    };

export type CanonicalOrdinaryPayeeMutation =
  | {
      kind: 'rename';
      budgetId: string;
      payeeId: string;
      expectedName: string;
      name: string;
    }
  | {
      kind: 'delete';
      budgetId: string;
      payeeId: string;
    };

export type CommitCanonicalOrdinaryTransactionMutation = {
  mutation: CanonicalOrdinaryTransactionMutation;
  delivery: BudgetChangeSetCommand;
};

export type CommitCanonicalOrdinaryPayeeMutation = {
  mutation: CanonicalOrdinaryPayeeMutation;
  delivery: BudgetChangeSetCommand;
};

export type OrdinaryTransactionMutationWriter = {
  commitOrdinaryTransactionMutation(
    command: CommitCanonicalOrdinaryTransactionMutation,
  ): Promise<BudgetChangeSetResult>;
  commitOrdinaryPayeeMutation(
    command: CommitCanonicalOrdinaryPayeeMutation,
  ): Promise<BudgetChangeSetResult>;
};
