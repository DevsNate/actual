import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';
import type { CanonicalTransferMutation } from './transfer';

/**
 * The stock client persists a credit-card payment as one reciprocal transfer
 * mutation plus the credit account's last-payment payee selection.
 */
export type CanonicalCreditCardPaymentMutation = {
  transfer: CanonicalTransferMutation;
  budgetId: string;
  creditAccountId: string;
  lastPaymentPayeeId: string;
};

export type CommitCanonicalCreditCardPaymentMutation = {
  mutation: CanonicalCreditCardPaymentMutation;
  delivery: BudgetChangeSetCommand;
};

export type CreditCardPaymentMutationWriter = {
  commitCreditCardPaymentMutation(
    command: CommitCanonicalCreditCardPaymentMutation,
  ): Promise<BudgetChangeSetResult>;
};
