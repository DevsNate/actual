import type {
  CanonicalTransferLeg,
  CommitCanonicalTransferMutation,
} from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

export async function writeCanonicalTransferMutation(
  client: PoolClient,
  command: CommitCanonicalTransferMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'delete') {
    if (new Set(mutation.transactionIds).size !== 2) throw invalidPair();
    const pair = await client.query<{
      transaction_id: string;
      reciprocal_transaction_id: string;
    }>(
      `SELECT transaction_id, reciprocal_transaction_id
       FROM semantic_transactions
       WHERE budget_id = $1 AND transaction_id = ANY($2::text[])
         AND transaction_kind = 'transfer' AND is_tombstone = false
       FOR UPDATE`,
      [mutation.budgetId, [...mutation.transactionIds]],
    );
    if (
      pair.rowCount !== 2 ||
      pair.rows.some(
        row => !mutation.transactionIds.includes(row.reciprocal_transaction_id),
      )
    ) {
      throw invalidPair();
    }
    const result = await client.query(
      `UPDATE semantic_transactions
       SET is_tombstone = true, payee_id = NULL,
           transfer_account_id = NULL, reciprocal_transaction_id = NULL,
           updated_at = now()
       WHERE budget_id = $1 AND transaction_id = ANY($2::text[])
         AND transaction_kind = 'transfer' AND is_tombstone = false`,
      [mutation.budgetId, [...mutation.transactionIds]],
    );
    if (result.rowCount !== 2) throw invalidPair();
    return;
  }

  const [left, right] = mutation.legs;
  validatePair(left, right);
  await validateBoundPayees(client, left, right);
  if (mutation.kind === 'create') {
    await insertLeg(client, left);
    await insertLeg(client, right);
    return;
  }

  const existing = await client.query<{
    transaction_id: string;
    reciprocal_transaction_id: string;
  }>(
    `SELECT transaction_id, reciprocal_transaction_id FROM semantic_transactions
     WHERE budget_id = $1 AND transaction_id = ANY($2::text[])
       AND transaction_kind = 'transfer' AND is_tombstone = false
     FOR UPDATE`,
    [mutation.budgetId, [left.id, right.id]],
  );
  if (
    existing.rowCount !== 2 ||
    existing.rows.some(
      row => ![left.id, right.id].includes(row.reciprocal_transaction_id),
    )
  ) {
    throw invalidPair();
  }
  await updateLeg(client, left);
  await updateLeg(client, right);
}

async function validateBoundPayees(
  client: PoolClient,
  left: CanonicalTransferLeg,
  right: CanonicalTransferLeg,
) {
  const result = await client.query(
    `SELECT payee_id FROM semantic_payees
     WHERE budget_id = $1 AND is_tombstone = false AND is_enabled = true
       AND ((payee_id = $2 AND account_id = $3)
         OR (payee_id = $4 AND account_id = $5))`,
    [
      left.budgetId,
      left.payeeId,
      left.reciprocalAccountId,
      right.payeeId,
      right.reciprocalAccountId,
    ],
  );
  if (result.rowCount !== 2) throw invalidPair();
}

function validatePair(left: CanonicalTransferLeg, right: CanonicalTransferLeg) {
  if (
    left.id === right.id ||
    left.budgetId !== right.budgetId ||
    left.accountId === right.accountId ||
    left.reciprocalAccountId !== right.accountId ||
    right.reciprocalAccountId !== left.accountId ||
    left.reciprocalTransactionId !== right.id ||
    right.reciprocalTransactionId !== left.id ||
    left.date !== right.date ||
    left.memo !== right.memo ||
    left.amount === 0 ||
    left.amount !== -right.amount
  ) {
    throw invalidPair();
  }
}

async function insertLeg(client: PoolClient, leg: CanonicalTransferLeg) {
  await client.query(
    `INSERT INTO semantic_transactions
       (budget_id, transaction_id, account_id, payee_id, category_id,
        transaction_date, amount_milliunits, is_cleared, is_approved,
        transaction_kind, memo, cleared_state, transfer_account_id,
        reciprocal_transaction_id)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, ($7 <> 'Uncleared'), $8,
             'transfer', $9, $7, $10, $11)`,
    [
      leg.budgetId,
      leg.id,
      leg.accountId,
      leg.payeeId,
      leg.date,
      leg.amount,
      leg.cleared,
      leg.accepted,
      leg.memo,
      leg.reciprocalAccountId,
      leg.reciprocalTransactionId,
    ],
  );
}

async function updateLeg(client: PoolClient, leg: CanonicalTransferLeg) {
  const result = await client.query(
    `UPDATE semantic_transactions
     SET account_id = $3, payee_id = $4, transaction_date = $5,
         amount_milliunits = $6, is_cleared = ($7 <> 'Uncleared'),
         is_approved = $8, memo = $9, cleared_state = $7,
         transfer_account_id = $10, reciprocal_transaction_id = $11,
         updated_at = now()
     WHERE budget_id = $1 AND transaction_id = $2
       AND transaction_kind = 'transfer' AND is_tombstone = false`,
    [
      leg.budgetId,
      leg.id,
      leg.accountId,
      leg.payeeId,
      leg.date,
      leg.amount,
      leg.cleared,
      leg.accepted,
      leg.memo,
      leg.reciprocalAccountId,
      leg.reciprocalTransactionId,
    ],
  );
  if (result.rowCount !== 1) throw invalidPair();
}

function invalidPair() {
  return new SemanticStoreError(
    'INVALID_OPERATION',
    'Transfer mutation requires one exact reciprocal pair',
  );
}
