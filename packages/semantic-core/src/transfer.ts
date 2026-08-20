import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalTransferLeg = {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string;
  reciprocalAccountId: string;
  reciprocalTransactionId: string;
  date: string;
  amount: number;
  memo: string | null;
  cleared: 'Uncleared' | 'Cleared' | 'Reconciled';
  accepted: boolean;
};

export type CanonicalTransferMutation =
  | {
      kind: 'create';
      legs: readonly [CanonicalTransferLeg, CanonicalTransferLeg];
    }
  | {
      kind: 'update';
      budgetId: string;
      legs: readonly [CanonicalTransferLeg, CanonicalTransferLeg];
    }
  | {
      kind: 'delete';
      budgetId: string;
      transactionIds: readonly [string, string];
    };

export type CommitCanonicalTransferMutation = {
  mutation: CanonicalTransferMutation;
  delivery: BudgetChangeSetCommand;
};

export type TransferMutationWriter = {
  commitTransferMutation(
    command: CommitCanonicalTransferMutation,
  ): Promise<BudgetChangeSetResult>;
};
