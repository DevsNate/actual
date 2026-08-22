import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';

export type StockAccountReorder = {
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: 2;
  serverKnowledgeAdvance: 1;
};

export function parseStockAccountReorder(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockAccountReorder | null {
  if (!hasExactKeys(changedEntities, ['be_accounts'])) return null;
  const rows = changedEntities.be_accounts;
  if (!Array.isArray(rows) || rows.length !== 2 || !rows.every(isRecord)) {
    return null;
  }

  const ids = rows.map(row => row.id);
  if (
    ids.some(id => typeof id !== 'string') ||
    new Set(ids).size !== rows.length
  ) {
    return null;
  }

  const changes: BudgetEntity[] = [];
  for (const row of rows) {
    const sortableIndex = row.sortable_index;
    if (!Number.isSafeInteger(sortableIndex)) return null;
    const current = snapshot.entities.find(
      entity =>
        entity.entityKind === 'be_accounts' && entity.entityId === row.id,
    );
    if (!current || current.isTombstone) return null;
    if (
      !isDeepStrictEqual(row, {
        ...projectStockRequestEntity(current),
        sortable_index: sortableIndex,
      }) ||
      current.payload.sortableIndex === sortableIndex
    ) {
      return null;
    }
    changes.push({
      ...current,
      payload: { ...current.payload, sortableIndex },
    });
  }

  const nextIndexes = new Map(
    snapshot.entities
      .filter(
        entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
      )
      .map(entity => [
        entity.entityId,
        changes.find(change => change.entityId === entity.entityId)?.payload
          .sortableIndex ?? entity.payload.sortableIndex,
      ]),
  );
  const indexes = [...nextIndexes.values()];
  if (
    indexes.some(index => !Number.isSafeInteger(index)) ||
    new Set(indexes).size !== indexes.length
  ) {
    return null;
  }

  return {
    changes,
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
    expectedDeviceAdvance: 2,
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
