import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';
import type {
  CanonicalOrdinaryPayee,
  CanonicalOrdinaryTransaction,
} from './transaction';

export type CanonicalSplitLine = {
  id: string;
  budgetId: string;
  transactionId: string;
  payeeId: string | null;
  categoryId: string;
  amount: number;
  memo: string | null;
  sortOrder: number;
};

export type CanonicalSplitTransactionMutation =
  | {
      kind: 'create';
      payees: readonly CanonicalOrdinaryPayee[];
      parent: CanonicalOrdinaryTransaction;
      lines: readonly CanonicalSplitLine[];
    }
  | {
      kind: 'update-parent-payee';
      budgetId: string;
      transactionId: string;
      expectedPayeeId: string | null;
      payeeId: string | null;
    }
  | {
      kind: 'update-line-category';
      budgetId: string;
      transactionId: string;
      lineId: string;
      expectedCategoryId: string;
      categoryId: string;
    }
  | {
      kind: 'delete';
      budgetId: string;
      transactionId: string;
      lineIds: readonly string[];
    };

export type CommitCanonicalSplitTransactionMutation = {
  mutation: CanonicalSplitTransactionMutation;
  delivery: BudgetChangeSetCommand;
};

export type SplitTransactionMutationWriter = {
  commitSplitTransactionMutation(
    command: CommitCanonicalSplitTransactionMutation,
  ): Promise<BudgetChangeSetResult>;
};
