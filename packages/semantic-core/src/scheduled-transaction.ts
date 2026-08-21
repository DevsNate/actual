import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalScheduledTransaction = {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string;
  categoryId: string;
  date: string;
  frequency: 'Monthly';
  amount: number;
  memo: string | null;
  upcomingInstances: readonly [string];
};

export type CanonicalScheduledOccurrence = {
  id: string;
  budgetId: string;
  scheduledTransactionId: string;
  accountId: string;
  payeeId: string;
  categoryId: string;
  date: string;
  dateEnteredFromSchedule: string;
  amount: number;
  memo: string | null;
  cleared: 'Uncleared';
  accepted: false;
  source: 'Scheduler';
};

export type CanonicalScheduledPayeeAutofill = {
  payeeId: string;
  expectedCategoryId: string | null;
  categoryId: string;
};

export type CanonicalScheduledTransactionMutation =
  | {
      kind: 'create';
      parent: CanonicalScheduledTransaction;
      payeeAutofill: CanonicalScheduledPayeeAutofill;
    }
  | { kind: 'update'; parent: CanonicalScheduledTransaction }
  | {
      kind: 'materialize';
      parent: CanonicalScheduledTransaction;
      occurrence: CanonicalScheduledOccurrence;
    }
  | { kind: 'delete'; budgetId: string; scheduledTransactionId: string };

export type CommitCanonicalScheduledTransactionMutation = {
  mutation: CanonicalScheduledTransactionMutation;
  delivery: BudgetChangeSetCommand;
};

export type ScheduledTransactionMutationWriter = {
  commitScheduledTransactionMutation(
    command: CommitCanonicalScheduledTransactionMutation,
  ): Promise<BudgetChangeSetResult>;
};
