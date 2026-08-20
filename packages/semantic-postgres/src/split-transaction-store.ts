import type { CommitCanonicalSplitTransactionMutation } from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

export async function writeCanonicalSplitTransactionMutation(
  client: PoolClient,
  command: CommitCanonicalSplitTransactionMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'create') {
    const { parent, lines } = mutation;
    if (
      lines.length !== 2 ||
      parent.categoryId === null ||
      lines.some(
        (line, index) =>
          line.budgetId !== parent.budgetId ||
          line.transactionId !== parent.id ||
          line.sortOrder !== index,
      ) ||
      lines.reduce((sum, line) => sum + line.amount, 0) !== parent.amount
    ) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Split creation requires one parent and two ordered balancing lines',
      );
    }
    for (const payee of mutation.payees) {
      await client.query(
        `INSERT INTO semantic_payees
           (budget_id, payee_id, account_id, name, is_enabled,
            auto_fill_category_id, auto_fill_user_defined_category_id,
            auto_fill_memo, auto_fill_amount_milliunits,
            auto_fill_category_enabled, auto_fill_memo_enabled,
            auto_fill_amount_enabled, rename_on_import_enabled, internal_name)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          payee.budgetId,
          payee.id,
          payee.name,
          payee.isEnabled,
          payee.autoFillCategoryId,
          payee.autoFillUserDefinedCategoryId,
          payee.autoFillMemo,
          payee.autoFillAmount,
          payee.autoFillCategoryEnabled,
          payee.autoFillMemoEnabled,
          payee.autoFillAmountEnabled,
          payee.renameOnImportEnabled,
          payee.internalName,
        ],
      );
    }
    await client.query(
      `INSERT INTO semantic_transactions
         (budget_id, transaction_id, account_id, payee_id, category_id,
          transaction_date, amount_milliunits, is_cleared, is_approved,
          transaction_kind, memo, cleared_state, check_number, flag)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               ($8 <> 'Uncleared'), $9, 'split_parent', $10, $8, $11, $12)`,
      [
        parent.budgetId,
        parent.id,
        parent.accountId,
        parent.payeeId,
        parent.categoryId,
        parent.date,
        parent.amount,
        parent.cleared,
        parent.accepted,
        parent.memo,
        parent.checkNumber,
        parent.flag,
      ],
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO semantic_split_lines
           (budget_id, split_line_id, transaction_id, payee_id, category_id,
            amount_milliunits, memo, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          line.budgetId,
          line.id,
          line.transactionId,
          line.payeeId,
          line.categoryId,
          line.amount,
          line.memo,
          line.sortOrder,
        ],
      );
    }
    return;
  }

  if (mutation.kind === 'update-parent-payee') {
    const parent = await client.query(
      `UPDATE semantic_transactions
       SET payee_id = $4, updated_at = now()
       WHERE budget_id = $1 AND transaction_id = $2
         AND payee_id IS NOT DISTINCT FROM $3
         AND transaction_kind = 'split_parent' AND is_tombstone = false`,
      [
        mutation.budgetId,
        mutation.transactionId,
        mutation.expectedPayeeId,
        mutation.payeeId,
      ],
    );
    if (parent.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Split parent payee edit did not match one live aggregate',
      );
    }
    return;
  }

  if (mutation.kind === 'update-line-category') {
    const line = await client.query(
      `UPDATE semantic_split_lines
       SET category_id = $5, updated_at = now()
       WHERE budget_id = $1 AND transaction_id = $2 AND split_line_id = $3
         AND category_id = $4 AND is_tombstone = false`,
      [
        mutation.budgetId,
        mutation.transactionId,
        mutation.lineId,
        mutation.expectedCategoryId,
        mutation.categoryId,
      ],
    );
    if (line.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Split line category edit did not match one live line',
      );
    }
    return;
  }

  const parent = await client.query(
    `UPDATE semantic_transactions
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND transaction_id = $2
       AND transaction_kind = 'split_parent' AND is_tombstone = false`,
    [mutation.budgetId, mutation.transactionId],
  );
  const lines = await client.query(
    `UPDATE semantic_split_lines
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND transaction_id = $2
       AND split_line_id = ANY($3::text[]) AND is_tombstone = false`,
    [mutation.budgetId, mutation.transactionId, [...mutation.lineIds]],
  );
  if (parent.rowCount !== 1 || lines.rowCount !== mutation.lineIds.length) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Split deletion did not match one complete live aggregate',
    );
  }
}
