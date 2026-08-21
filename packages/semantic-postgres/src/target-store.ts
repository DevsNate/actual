import { isDeepStrictEqual } from 'node:util';

import type {
  CanonicalTargetDefinition,
  CommitCanonicalCategoryMutation,
} from '@actual-app/semantic-core';
import type { PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

type TargetReplacement = Extract<
  CommitCanonicalCategoryMutation['mutation'],
  { kind: 'replace-target' }
>;

export async function writeCanonicalTargetReplacement(
  client: PoolClient,
  mutation: TargetReplacement,
): Promise<void> {
  const category = await client.query(
    `SELECT 1 FROM semantic_categories
     WHERE budget_id = $1 AND category_id = $2 AND is_tombstone = false
     FOR UPDATE`,
    [mutation.budgetId, mutation.categoryId],
  );
  if (category.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Target replacement requires one live canonical category',
    );
  }
  const existing = await client.query<TargetRow>(
    `SELECT target_type, created_on, target_amount_milliunits, target_date,
            cadence, cadence_frequency, target_day, needs_whole_amount,
            monthly_funding_milliunits
     FROM semantic_category_targets
     WHERE budget_id = $1 AND category_id = $2
     FOR UPDATE`,
    [mutation.budgetId, mutation.categoryId],
  );
  const actual = existing.rows[0] ? mapCanonicalTarget(existing.rows[0]) : null;
  if (!isDeepStrictEqual(actual, mutation.expected)) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Target replacement did not match the canonical definition',
    );
  }
  if (!mutation.target) {
    const deleted = await client.query(
      `DELETE FROM semantic_category_targets
       WHERE budget_id = $1 AND category_id = $2`,
      [mutation.budgetId, mutation.categoryId],
    );
    if (deleted.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Target clear requires one canonical definition',
      );
    }
    return;
  }
  const target = mutation.target;
  await client.query(
    `INSERT INTO semantic_category_targets
       (budget_id, category_id, target_type, created_on,
        target_amount_milliunits, target_date, cadence, cadence_frequency,
        target_day, needs_whole_amount, monthly_funding_milliunits)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (budget_id, category_id) DO UPDATE SET
       target_type = EXCLUDED.target_type,
       created_on = EXCLUDED.created_on,
       target_amount_milliunits = EXCLUDED.target_amount_milliunits,
       target_date = EXCLUDED.target_date,
       cadence = EXCLUDED.cadence,
       cadence_frequency = EXCLUDED.cadence_frequency,
       target_day = EXCLUDED.target_day,
       needs_whole_amount = EXCLUDED.needs_whole_amount,
       monthly_funding_milliunits = EXCLUDED.monthly_funding_milliunits,
       updated_at = now()`,
    [
      mutation.budgetId,
      mutation.categoryId,
      target.type,
      target.createdOn,
      target.amount,
      target.date,
      target.cadence,
      target.cadenceFrequency,
      target.day,
      target.needsWholeAmount,
      target.monthlyFunding,
    ],
  );
}

type TargetRow = {
  target_type: string;
  created_on: Date | string;
  target_amount_milliunits: string;
  target_date: Date | string | null;
  cadence: number;
  cadence_frequency: number;
  target_day: number | null;
  needs_whole_amount: boolean;
  monthly_funding_milliunits: string;
};

function mapCanonicalTarget(row: TargetRow): CanonicalTargetDefinition {
  return {
    type: requireTargetType(row.target_type),
    createdOn: sqlDate(row.created_on),
    amount: safeInteger(row.target_amount_milliunits, 'target amount'),
    date: row.target_date === null ? null : sqlDate(row.target_date),
    cadence: requireTargetCadence(row.cadence),
    cadenceFrequency: safeInteger(
      String(row.cadence_frequency),
      'target cadence frequency',
    ),
    day: row.target_day,
    needsWholeAmount: requireTrue(row.needs_whole_amount),
    monthlyFunding: requireZero(row.monthly_funding_milliunits),
  };
}

function safeInteger(value: string, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      `${field} is outside the supported integer range`,
    );
  }
  return number;
}

function sqlDate(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function requireTargetType(value: string): 'NEED' {
  if (value !== 'NEED') throw new Error('Unsupported canonical target type');
  return value;
}

function requireTargetCadence(value: number): 1 | 2 | 13 {
  if (value !== 1 && value !== 2 && value !== 13) {
    throw new Error('Unsupported canonical target cadence');
  }
  return value;
}

function requireTrue(value: boolean): true {
  if (value !== true) throw new Error('Canonical target flag must be true');
  return true;
}

function requireZero(value: string): 0 {
  if (value !== '0') throw new Error('Canonical monthly funding must be zero');
  return 0;
}
