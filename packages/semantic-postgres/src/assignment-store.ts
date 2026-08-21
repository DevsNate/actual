import type { CommitCanonicalCategoryAssignment } from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

export async function writeCanonicalCategoryAssignment(
  client: PoolClient,
  command: CommitCanonicalCategoryAssignment,
): Promise<void> {
  const assignment = command.assignment;
  const movement = assignment.movement;
  if (
    movement.budgetId !== assignment.budgetId ||
    movement.toMonthlyCategoryBudgetId !== assignment.monthlyCategoryBudgetId
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Category assignment identities or amount do not converge',
    );
  }

  if (assignment.kind === 'captured-replay') {
    await verifyCapturedAssignmentReplay(client, command);
    return;
  }
  if (movement.amount !== assignment.budgeted - assignment.expectedBudgeted) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Category assignment amount does not match the budget delta',
    );
  }

  const updated = await client.query(
    `UPDATE semantic_monthly_category_budgets
     SET budgeted_milliunits = $5, updated_at = now()
     WHERE budget_id = $1 AND monthly_category_budget_id = $2
       AND category_id = $3 AND budgeted_milliunits = $4
       AND is_tombstone = false`,
    [
      assignment.budgetId,
      assignment.monthlyCategoryBudgetId,
      assignment.categoryId,
      assignment.expectedBudgeted,
      assignment.budgeted,
    ],
  );
  if (updated.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Category assignment did not match one live monthly category',
    );
  }

  await client.query(
    `INSERT INTO semantic_money_movements
       (budget_id, movement_id, category_id, monthly_category_budget_id,
        amount_milliunits, performed_by_principal_id, source, note,
        started_at, accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      assignment.budgetId,
      movement.id,
      assignment.categoryId,
      assignment.monthlyCategoryBudgetId,
      movement.amount,
      movement.performedByPrincipalId,
      movement.source,
      movement.note,
      movement.startedAt,
      movement.acceptedAt,
    ],
  );
}

async function verifyCapturedAssignmentReplay(
  client: PoolClient,
  command: CommitCanonicalCategoryAssignment,
): Promise<void> {
  const assignment = command.assignment;
  const movement = assignment.movement;
  if (assignment.expectedBudgeted !== assignment.budgeted) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Captured assignment replay must preserve the assigned amount',
    );
  }
  const result = await client.query(
    `SELECT 1
     FROM semantic_monthly_category_budgets AS monthly
     JOIN semantic_money_movements AS movement
       ON movement.budget_id = monthly.budget_id
      AND movement.monthly_category_budget_id = monthly.monthly_category_budget_id
     WHERE monthly.budget_id = $1
       AND monthly.monthly_category_budget_id = $2
       AND monthly.category_id = $3
       AND monthly.budgeted_milliunits = $4
       AND monthly.is_tombstone = false
       AND movement.movement_id = $5
       AND movement.amount_milliunits = $6
       AND movement.performed_by_principal_id = $7
       AND movement.source = $8
       AND movement.note IS NULL
       AND movement.started_at = $9
       AND movement.accepted_at = $10
       AND movement.is_tombstone = false`,
    [
      assignment.budgetId,
      assignment.monthlyCategoryBudgetId,
      assignment.categoryId,
      assignment.budgeted,
      movement.id,
      movement.amount,
      movement.performedByPrincipalId,
      movement.source,
      movement.startedAt,
      movement.acceptedAt,
    ],
  );
  if (result.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Captured assignment replay did not match canonical state',
    );
  }
}
