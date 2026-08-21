import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalSplitTransactionMutation,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';
import {
  lineEntity,
  optionalString,
  parentEntity,
  payeeEntity,
  payeeFromRow,
  requireCleared,
  requireDate,
  requireInteger,
  requireString,
  semanticChangedKeys,
  validLineShape,
  validNewPayee,
  validParentShape,
} from './stock-split-codec';

type StockSplitMutation = {
  mutation: CanonicalSplitTransactionMutation;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number;
  serverKnowledgeAdvance: 1 | 2;
};

export function parseStockSplitMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockSplitMutation | null {
  const keys = Object.keys(changedEntities).sort();
  if (
    !isDeepStrictEqual(keys, ['be_transaction_groups']) &&
    !isDeepStrictEqual(keys, ['be_payees', 'be_transaction_groups'])
  ) {
    return null;
  }
  const group = exactlyOneRecord(changedEntities.be_transaction_groups);
  if (!group) return null;
  const parent = isRecord(group.be_transaction) ? group.be_transaction : null;
  const lines = Array.isArray(group.be_subtransactions)
    ? group.be_subtransactions.filter(isRecord)
    : [];
  if (
    !parent ||
    lines.length !== 2 ||
    group.id !== parent.id ||
    lines.some((line, index) => !validLineShape(line, parent.id, index))
  ) {
    return null;
  }

  const currentParent = entity(snapshot, 'be_transactions', String(parent.id));
  if (currentParent) {
    return parseExistingAggregate(parent, lines, currentParent, snapshot);
  }
  return parseCreate(changedEntities, parent, lines, snapshot);
}

function parseCreate(
  changedEntities: Record<string, unknown>,
  parentRow: Record<string, unknown>,
  lineRows: readonly Record<string, unknown>[],
  snapshot: BudgetSnapshot,
): StockSplitMutation | null {
  if (
    parentRow.is_tombstone !== false ||
    lineRows.some(line => line.is_tombstone !== false) ||
    !validParentShape(parentRow) ||
    !isSplitCategory(snapshot, parentRow.entities_subcategory_id) ||
    lineRows.reduce((sum, line) => sum + Number(line.amount), 0) !==
      parentRow.amount ||
    [parentRow.id, ...lineRows.map(line => line.id)].some(id =>
      snapshot.entities.some(item => item.entityId === id),
    ) ||
    !live(snapshot, 'be_accounts', parentRow.entities_account_id) ||
    lineRows.some(
      line => !live(snapshot, 'be_subcategories', line.entities_subcategory_id),
    )
  ) {
    return null;
  }

  const rawPayeeRows = changedEntities.be_payees;
  if (rawPayeeRows !== undefined && !Array.isArray(rawPayeeRows)) {
    return null;
  }
  const payeeRows = Array.isArray(rawPayeeRows)
    ? rawPayeeRows.filter(isRecord)
    : [];
  const rawPayeeCount = Array.isArray(rawPayeeRows) ? rawPayeeRows.length : 0;
  if (
    payeeRows.length !== rawPayeeCount ||
    payeeRows.some(row => !validNewPayee(row)) ||
    payeeRows.some(row =>
      snapshot.entities.some(item => item.entityId === row.id),
    )
  ) {
    return null;
  }
  const newPayeeIds = new Set(payeeRows.map(row => String(row.id)));
  const referencedPayees = [
    parentRow.entities_payee_id,
    ...lineRows.map(line => line.entities_payee_id),
  ].filter((id): id is string => typeof id === 'string');
  if (
    referencedPayees.some(
      id => !newPayeeIds.has(id) && !live(snapshot, 'be_payees', id),
    ) ||
    payeeRows.some(row => !referencedPayees.includes(String(row.id)))
  ) {
    return null;
  }

  const payees = payeeRows.map(row => payeeFromRow(snapshot.budgetId, row));
  const payeeEntities = payeeRows.map(row => payeeEntity(snapshot, row));
  const parent = parentEntity(snapshot, parentRow);
  const lines = lineRows.map(row => lineEntity(snapshot, row));
  const changes = [...payeeEntities, parent, ...lines];
  const after = { ...snapshot, entities: [...snapshot.entities, ...changes] };
  return {
    mutation: {
      kind: 'create',
      payees,
      parent: {
        id: parent.entityId,
        budgetId: snapshot.budgetId,
        accountId: requireString(parent.payload.accountId),
        payeeId: optionalString(parent.payload.payeeId),
        categoryId: requireString(parent.payload.subCategoryId),
        date: requireDate(parent.payload.date),
        amount: requireInteger(parent.payload.amount),
        memo: optionalString(parent.payload.memo),
        cleared: requireCleared(parent.payload.cleared),
        accepted: true,
        checkNumber: null,
        flag: null,
      },
      lines: lines.map(line => ({
        id: line.entityId,
        budgetId: snapshot.budgetId,
        transactionId: requireString(line.payload.transactionId),
        payeeId: optionalString(line.payload.payeeId),
        categoryId: requireString(line.payload.subCategoryId),
        amount: requireInteger(line.payload.amount),
        memo: optionalString(line.payload.memo),
        sortOrder: requireInteger(line.payload.sortableIndex),
      })),
    },
    changes,
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, after),
      be_transactions: [projectStockRequestEntity(parent)],
      be_subtransactions: lines.map(projectStockRequestEntity),
    },
    expectedDeviceAdvance: changes.length,
    serverKnowledgeAdvance: 2,
  };
}

function parseExistingAggregate(
  parentRow: Record<string, unknown>,
  lineRows: readonly Record<string, unknown>[],
  currentParent: BudgetEntity,
  snapshot: BudgetSnapshot,
): StockSplitMutation | null {
  const currentLines = lineRows.map(row =>
    entity(snapshot, 'be_subtransactions', String(row.id)),
  );
  if (
    currentParent.isTombstone ||
    currentLines.some(line => !line || line.isTombstone) ||
    currentParent.payload.subCategoryId === null ||
    !isSplitCategory(snapshot, currentParent.payload.subCategoryId)
  ) {
    return null;
  }
  const expectedParent = projectStockRequestEntity(currentParent);
  const expectedLines = currentLines.map(line => projectStockRequestEntity(line!));
  const parentDiff = semanticChangedKeys(expectedParent, parentRow);
  const lineDiffs = lineRows.map((row, index) =>
    semanticChangedKeys(expectedLines[index], row),
  );

  if (
    parentRow.is_tombstone === true &&
    lineRows.every(line => line.is_tombstone === true) &&
    parentDiff.every(key => key === 'is_tombstone') &&
    lineDiffs.every(keys => keys.every(key => key === 'is_tombstone'))
  ) {
    const tombstones = [currentParent, ...currentLines.map(line => line!)].map(
      item => ({ ...item, isTombstone: true }),
    );
    const after = replaceEntities(snapshot, tombstones);
    return {
      mutation: {
        kind: 'delete',
        budgetId: snapshot.budgetId,
        transactionId: currentParent.entityId,
        lineIds: currentLines.map(line => line!.entityId),
      },
      changes: tombstones,
      changedEntities: {
        ...buildStockBudgetEmptyDelta(snapshot),
        ...calculationDelta(snapshot, after),
      },
      expectedDeviceAdvance: 3,
      serverKnowledgeAdvance: 2,
    };
  }

  if (
    parentRow.is_tombstone === false &&
    lineRows.every(line => line.is_tombstone === false) &&
    parentDiff.length === 1 &&
    parentDiff[0] === 'entities_payee_id' &&
    lineDiffs.every(keys => keys.length === 0) &&
    nullableReference(snapshot, 'be_payees', parentRow.entities_payee_id)
  ) {
    const updated = parentEntity(snapshot, parentRow);
    return {
      mutation: {
        kind: 'update-parent-payee',
        budgetId: snapshot.budgetId,
        transactionId: currentParent.entityId,
        expectedPayeeId: optionalString(currentParent.payload.payeeId),
        payeeId: optionalString(parentRow.entities_payee_id),
      },
      changes: [updated],
      changedEntities: buildStockBudgetEmptyDelta(snapshot),
      expectedDeviceAdvance: 1,
      serverKnowledgeAdvance: 1,
    };
  }

  const changedLineIndexes = lineDiffs
    .map((keys, index) => ({ keys, index }))
    .filter(item => item.keys.length > 0);
  if (
    parentDiff.length === 0 &&
    changedLineIndexes.length === 1 &&
    changedLineIndexes[0].keys.length === 1 &&
    changedLineIndexes[0].keys[0] === 'entities_subcategory_id' &&
    live(
      snapshot,
      'be_subcategories',
      lineRows[changedLineIndexes[0].index].entities_subcategory_id,
    )
  ) {
    const index = changedLineIndexes[0].index;
    const current = currentLines[index]!;
    const updated = lineEntity(snapshot, lineRows[index]);
    const after = replaceEntities(snapshot, [updated]);
    return {
      mutation: {
        kind: 'update-line-category',
        budgetId: snapshot.budgetId,
        transactionId: currentParent.entityId,
        lineId: current.entityId,
        expectedCategoryId: requireString(current.payload.subCategoryId),
        categoryId: requireString(updated.payload.subCategoryId),
      },
      changes: [updated],
      changedEntities: {
        ...buildStockBudgetEmptyDelta(snapshot),
        ...calculationDelta(snapshot, after),
      },
      expectedDeviceAdvance: 1,
      serverKnowledgeAdvance: 2,
    };
  }
  return null;
}

function isSplitCategory(snapshot: BudgetSnapshot, id: unknown): boolean {
  const category = entity(snapshot, 'be_subcategories', String(id));
  return category?.payload.internalName === 'Category/__Split__';
}

function nullableReference(
  snapshot: BudgetSnapshot,
  kind: string,
  id: unknown,
): boolean {
  return (
    id === null || (typeof id === 'string' && Boolean(live(snapshot, kind, id)))
  );
}

function live(
  snapshot: BudgetSnapshot,
  kind: string,
  id: unknown,
): BudgetEntity | undefined {
  return typeof id === 'string'
    ? snapshot.entities.find(
        item =>
          item.entityKind === kind && item.entityId === id && !item.isTombstone,
      )
    : undefined;
}

function entity(
  snapshot: BudgetSnapshot,
  kind: string,
  id: string,
): BudgetEntity | undefined {
  return snapshot.entities.find(
    item => item.entityKind === kind && item.entityId === id,
  );
}

function replaceEntities(
  snapshot: BudgetSnapshot,
  replacements: readonly BudgetEntity[],
): BudgetSnapshot {
  const byKey = new Map(
    replacements.map(item => [`${item.entityKind}\0${item.entityId}`, item]),
  );
  return {
    ...snapshot,
    entities: snapshot.entities.map(
      item => byKey.get(`${item.entityKind}\0${item.entityId}`) ?? item,
    ),
  };
}

function calculationDelta(before: BudgetSnapshot, after: BudgetSnapshot) {
  const left = projectStockBudgetCalculations(before);
  const right = projectStockBudgetCalculations(after);
  return Object.fromEntries(
    Object.keys(right).map(key => {
      const prior = left[key as keyof typeof left];
      const next = right[key as keyof typeof right];
      return [key, isDeepStrictEqual(prior, next) ? [] : next];
    }),
  );
}

function exactlyOneRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0])
    ? value[0]
    : null;
}
