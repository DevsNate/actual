import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { isRecord } from './stock-operation';

export type StockExpectedIncomeMutation = {
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: 1;
  serverKnowledgeAdvance: 1;
};

export function parseStockExpectedIncomeMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockExpectedIncomeMutation | null {
  if (!hasExactKeys(changedEntities, ['be_expected_income'])) return null;
  const row = changedEntities.be_expected_income;
  const existingRows = snapshot.entities.filter(
    entity => entity.entityKind === 'be_expected_income',
  );
  const existing = existingRows[0];
  if (
    !isRecord(row) ||
    !hasExactKeys(row, ['id', 'is_tombstone', 'user_entered_income']) ||
    row.id !== snapshot.budgetVersionId ||
    row.is_tombstone !== false ||
    !Number.isSafeInteger(row.user_entered_income) ||
    (row.user_entered_income as number) < 0 ||
    !Number.isSafeInteger(snapshot.shortBudgetVersionId) ||
    (snapshot.shortBudgetVersionId as number) < 0 ||
    existingRows.length > 1 ||
    (existing !== undefined &&
      (existing.isTombstone ||
        existing.entityId !== snapshot.budgetVersionId ||
        !hasExactKeys(existing.payload, [
          'budgetVersionId',
          'shortBudgetVersionId',
          'userEnteredIncome',
        ]) ||
        existing.payload.budgetVersionId !== snapshot.budgetVersionId ||
        existing.payload.shortBudgetVersionId !==
          snapshot.shortBudgetVersionId ||
        !Number.isSafeInteger(existing.payload.userEnteredIncome) ||
        existing.payload.userEnteredIncome === row.user_entered_income))
  ) {
    return null;
  }

  const expectedIncome: BudgetEntity = {
    ...(existing ?? {
      entityKind: 'be_expected_income',
      entityId: snapshot.budgetVersionId,
      isTombstone: false,
    }),
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      shortBudgetVersionId: snapshot.shortBudgetVersionId,
      userEnteredIncome: row.user_entered_income,
    },
  };
  return {
    changes: [expectedIncome],
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
    expectedDeviceAdvance: 1,
    serverKnowledgeAdvance: 1,
  };
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
