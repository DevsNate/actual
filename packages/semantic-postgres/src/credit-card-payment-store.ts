import type { CommitCanonicalCreditCardPaymentMutation } from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';
import { writeCanonicalTransferMutation } from './transfer-store';

export async function writeCanonicalCreditCardPaymentMutation(
  client: PoolClient,
  command: CommitCanonicalCreditCardPaymentMutation,
): Promise<void> {
  const { mutation } = command;
  if (mutation.transfer.kind !== 'create') {
    await writeCanonicalTransferMutation(client, {
      mutation: mutation.transfer,
      delivery: command.delivery,
    });
    return;
  }

  const account = await client.query(
    `UPDATE semantic_accounts
     SET last_payment_payee_id = $3, updated_at = now()
     WHERE budget_id = $1 AND account_id = $2
       AND account_type = 'credit-card' AND is_closed = false
       AND is_tombstone = false`,
    [mutation.budgetId, mutation.creditAccountId, mutation.lastPaymentPayeeId],
  );
  if (account.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Credit-card payment requires one live canonical credit account',
    );
  }
  await writeCanonicalTransferMutation(client, {
    mutation: mutation.transfer,
    delivery: command.delivery,
  });
}
