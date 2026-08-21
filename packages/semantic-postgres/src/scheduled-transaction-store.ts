import type {
  CanonicalScheduledOccurrence,
  CanonicalScheduledTransaction,
  CommitCanonicalScheduledTransactionMutation,
} from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

export async function writeCanonicalScheduledTransactionMutation(
  client: PoolClient,
  command: CommitCanonicalScheduledTransactionMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'delete') {
    const result = await client.query(
      `UPDATE semantic_scheduled_transactions
       SET is_tombstone = true, updated_at = now()
       WHERE budget_id = $1 AND scheduled_transaction_id = $2
         AND is_tombstone = false`,
      [mutation.budgetId, mutation.scheduledTransactionId],
    );
    if (result.rowCount !== 1) throw invalidSchedule();
    return;
  }

  validateParent(mutation.parent);
  if (mutation.kind === 'create') {
    const payee = await client.query(
      `UPDATE semantic_payees
       SET auto_fill_category_id = $4, updated_at = now()
       WHERE budget_id = $1 AND payee_id = $2
         AND auto_fill_category_id IS NOT DISTINCT FROM $3
         AND is_tombstone = false AND is_enabled = true`,
      [
        mutation.parent.budgetId,
        mutation.payeeAutofill.payeeId,
        mutation.payeeAutofill.expectedCategoryId,
        mutation.payeeAutofill.categoryId,
      ],
    );
    if (
      mutation.payeeAutofill.payeeId !== mutation.parent.payeeId ||
      mutation.payeeAutofill.categoryId !== mutation.parent.categoryId ||
      payee.rowCount !== 1
    ) {
      throw invalidSchedule();
    }
    await insertParent(client, mutation.parent);
    return;
  }

  await updateParent(client, mutation.parent);
  if (mutation.kind === 'materialize') {
    validateOccurrence(mutation.parent, mutation.occurrence);
    await insertOccurrence(client, mutation.occurrence);
  }
}

function validateParent(parent: CanonicalScheduledTransaction): void {
  if (
    parent.frequency !== 'Monthly' ||
    parent.amount === 0 ||
    !Number.isSafeInteger(parent.amount) ||
    parent.upcomingInstances.length !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(parent.date) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(parent.upcomingInstances[0])
  ) {
    throw invalidSchedule();
  }
}

function validateOccurrence(
  parent: CanonicalScheduledTransaction,
  occurrence: CanonicalScheduledOccurrence,
): void {
  if (
    occurrence.budgetId !== parent.budgetId ||
    occurrence.scheduledTransactionId !== parent.id ||
    occurrence.id !== `${parent.id}_${occurrence.date}` ||
    occurrence.accountId !== parent.accountId ||
    occurrence.payeeId !== parent.payeeId ||
    occurrence.categoryId !== parent.categoryId ||
    occurrence.dateEnteredFromSchedule !== occurrence.date ||
    occurrence.amount !== parent.amount ||
    occurrence.memo !== parent.memo ||
    occurrence.cleared !== 'Uncleared' ||
    occurrence.accepted !== false ||
    occurrence.source !== 'Scheduler'
  ) {
    throw invalidSchedule();
  }
}

async function insertParent(
  client: PoolClient,
  parent: CanonicalScheduledTransaction,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_scheduled_transactions
       (budget_id, scheduled_transaction_id, account_id, payee_id, category_id,
        scheduled_date, frequency, amount_milliunits, memo, upcoming_instances)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date[])`,
    [
      parent.budgetId,
      parent.id,
      parent.accountId,
      parent.payeeId,
      parent.categoryId,
      parent.date,
      parent.frequency,
      parent.amount,
      parent.memo,
      [...parent.upcomingInstances],
    ],
  );
}

async function updateParent(
  client: PoolClient,
  parent: CanonicalScheduledTransaction,
): Promise<void> {
  const result = await client.query(
    `UPDATE semantic_scheduled_transactions
     SET scheduled_date = $6, frequency = $7, amount_milliunits = $8,
         memo = $9, upcoming_instances = $10::date[], updated_at = now()
     WHERE budget_id = $1 AND scheduled_transaction_id = $2
       AND account_id = $3 AND payee_id = $4 AND category_id = $5
       AND is_tombstone = false`,
    [
      parent.budgetId,
      parent.id,
      parent.accountId,
      parent.payeeId,
      parent.categoryId,
      parent.date,
      parent.frequency,
      parent.amount,
      parent.memo,
      [...parent.upcomingInstances],
    ],
  );
  if (result.rowCount !== 1) throw invalidSchedule();
}

async function insertOccurrence(
  client: PoolClient,
  occurrence: CanonicalScheduledOccurrence,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_transactions
       (budget_id, transaction_id, account_id, payee_id, category_id,
        transaction_date, amount_milliunits, is_cleared, is_approved,
        transaction_kind, memo, cleared_state, scheduled_transaction_id,
        date_entered_from_schedule, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, false,
             'scheduled_occurrence', $8, 'Uncleared', $9, $10, 'Scheduler')`,
    [
      occurrence.budgetId,
      occurrence.id,
      occurrence.accountId,
      occurrence.payeeId,
      occurrence.categoryId,
      occurrence.date,
      occurrence.amount,
      occurrence.memo,
      occurrence.scheduledTransactionId,
      occurrence.dateEnteredFromSchedule,
    ],
  );
}

function invalidSchedule(): SemanticStoreError {
  return new SemanticStoreError(
    'INVALID_OPERATION',
    'Scheduled mutation requires one exact captured parent lifecycle',
  );
}
