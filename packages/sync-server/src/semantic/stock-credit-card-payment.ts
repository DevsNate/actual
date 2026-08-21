import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalCreditCardPaymentMutation,
} from '@actual-app/semantic-core';

import { projectStockEntity } from './stock-budget-projection';
import { parseStockTransferMutation } from './stock-transfer';

export type StockCreditCardPaymentMutation = {
  mutation: CanonicalCreditCardPaymentMutation;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number | readonly number[];
  serverKnowledgeAdvance: 2;
};

export function parseStockCreditCardPaymentMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockCreditCardPaymentMutation | null {
  const keys = Object.keys(changedEntities);
  if (
    !isDeepStrictEqual(keys, ['be_transaction_groups']) &&
    !isDeepStrictEqual(keys, ['be_accounts', 'be_transaction_groups'])
  ) {
    return null;
  }

  const transfer = parseStockTransferMutation(
    { be_transaction_groups: changedEntities.be_transaction_groups },
    snapshot,
    { creditCardPayment: true },
  );
  if (!transfer) return null;

  const creditAccount = creditAccountForMutation(transfer.mutation, snapshot);
  if (!creditAccount) return null;
  const creditPayeeId = paymentPayeeId(
    transfer.mutation,
    creditAccount.entityId,
    snapshot,
  );
  if (!creditPayeeId) return null;

  let changedAccount: BudgetEntity | null = null;
  if (transfer.mutation.kind === 'create') {
    const accounts = changedEntities.be_accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1) return null;
    const requested = accounts[0];
    if (!requested || typeof requested !== 'object') return null;
    const expected = {
      ...projectStockEntity(creditAccount),
      last_payment_payee_id: creditPayeeId,
    };
    if (!isDeepStrictEqual(requested, expected)) return null;
    changedAccount = {
      ...creditAccount,
      payload: {
        ...creditAccount.payload,
        lastPaymentPayeeId: creditPayeeId,
      },
    };
  } else {
    if ('be_accounts' in changedEntities) return null;
    if (creditAccount.payload.lastPaymentPayeeId !== creditPayeeId) return null;
  }

  return {
    mutation: {
      transfer: transfer.mutation,
      budgetId: snapshot.budgetId,
      creditAccountId: creditAccount.entityId,
      lastPaymentPayeeId: creditPayeeId,
    },
    changes: changedAccount
      ? [changedAccount, ...transfer.changes]
      : transfer.changes,
    changedEntities: transfer.changedEntities,
    expectedDeviceAdvance:
      transfer.mutation.kind === 'create'
        ? [7, 8]
        : transfer.expectedDeviceAdvance,
    serverKnowledgeAdvance: 2,
  };
}

function creditAccountForMutation(
  mutation: CanonicalCreditCardPaymentMutation['transfer'],
  snapshot: BudgetSnapshot,
): BudgetEntity | null {
  const accountIds =
    mutation.kind === 'delete'
      ? mutation.transactionIds
          .map(id =>
            snapshot.entities.find(
              entity =>
                entity.entityKind === 'be_transactions' &&
                entity.entityId === id,
            ),
          )
          .map(entity => entity?.payload.accountId)
      : mutation.legs.map(leg => leg.accountId);
  const matches = snapshot.entities.filter(
    entity =>
      entity.entityKind === 'be_accounts' &&
      !entity.isTombstone &&
      entity.payload.accountType === 'CreditCard' &&
      accountIds.includes(entity.entityId),
  );
  return matches.length === 1 ? matches[0] : null;
}

function paymentPayeeId(
  mutation: CanonicalCreditCardPaymentMutation['transfer'],
  creditAccountId: string,
  snapshot: BudgetSnapshot,
): string | null {
  if (mutation.kind === 'delete') {
    const creditLeg = snapshot.entities.find(
      entity =>
        entity.entityKind === 'be_transactions' &&
        mutation.transactionIds.includes(entity.entityId) &&
        entity.payload.accountId === creditAccountId,
    );
    return typeof creditLeg?.payload.payeeId === 'string'
      ? creditLeg.payload.payeeId
      : null;
  }
  return (
    mutation.legs.find(leg => leg.accountId === creditAccountId)?.payeeId ??
    null
  );
}
