import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalCategoryAssignment,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockEntity } from './stock-budget-projection';

export type StockCategoryAssignment = Readonly<{
  assignment: CanonicalCategoryAssignment;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: 2;
  serverKnowledgeAdvance: 2;
}>;

export type StockCategoryAssignmentReplay = Readonly<{
  assignment: CanonicalCategoryAssignment;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: 2;
  serverKnowledgeAdvance: 1;
}>;

export function parseStockCategoryAssignment(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
  principalId: string,
  acceptedAt = serverTimestamp(new Date()),
): StockCategoryAssignment | null {
  const rows = readRows(changedEntities);
  if (!rows) return null;
  const current = findCurrentMonthlyCategory(snapshot, rows.monthly);
  if (
    !current ||
    snapshot.entities.some(entity => entity.entityId === rows.movement.id)
  ) {
    return null;
  }
  const expectedBudgeted = nonnegativeInteger(current.payload.budgeted);
  const budgeted = nonnegativeInteger(rows.monthly.budgeted);
  const amount = positiveInteger(rows.movement.amount);
  if (
    expectedBudgeted === null ||
    budgeted === null ||
    amount === null ||
    budgeted - expectedBudgeted !== amount ||
    rows.movement.performed_by_user_id !== principalId
  ) {
    return null;
  }

  const movement = canonicalMovement(
    rows.movement,
    snapshot.budgetId,
    acceptedAt,
  );
  if (!movement) return null;
  const updated: BudgetEntity = {
    ...current,
    payload: { ...current.payload, budgeted },
  };
  const movementEntity: BudgetEntity = {
    entityKind: 'be_money_movements',
    entityId: movement.id,
    isTombstone: false,
    payload: {
      performedByUserId: movement.performedByPrincipalId,
      toMonthlyCategoryBudgetId: movement.toMonthlyCategoryBudgetId,
      fromMonthlyCategoryBudgetId: null,
      movementGroupId: null,
      source: movement.source,
      note: null,
      moveStartedAt: movement.startedAt,
      moveAcceptedAt: movement.acceptedAt,
      amount: movement.amount,
    },
  };
  const augmented: BudgetSnapshot = {
    ...snapshot,
    entities: snapshot.entities
      .map(entity => (entity === current ? updated : entity))
      .concat(movementEntity),
  };
  return {
    assignment: {
      kind: 'assign',
      budgetId: snapshot.budgetId,
      categoryId: String(current.payload.subCategoryId),
      monthlyBudgetId: String(current.payload.monthlyBudgetId),
      monthlyCategoryBudgetId: current.entityId,
      expectedBudgeted,
      budgeted,
      movement,
    },
    changes: [updated, movementEntity],
    changedEntities: assignmentResponse(augmented, updated, movementEntity),
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 2,
  };
}

export function parseStockCategoryAssignmentReplay(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
  principalId: string,
): StockCategoryAssignmentReplay | null {
  const rows = readRows(changedEntities);
  if (!rows) return null;
  const current = findCurrentMonthlyCategory(snapshot, rows.monthly);
  const existing = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_money_movements' &&
      entity.entityId === rows.movement.id &&
      !entity.isTombstone,
  );
  if (!current || !existing) return null;
  const budgeted = nonnegativeInteger(current.payload.budgeted);
  if (
    budgeted === null ||
    rows.monthly.budgeted !== budgeted ||
    rows.movement.performed_by_user_id !== principalId
  ) {
    return null;
  }
  const movement = canonicalMovement(
    rows.movement,
    snapshot.budgetId,
    String(existing.payload.moveAcceptedAt),
  );
  if (
    !movement ||
    !isDeepStrictEqual(projectStockEntity(existing), {
      ...rows.movement,
      move_started_at: normalizeClientTimestamp(
        String(rows.movement.move_started_at),
      ),
      move_accepted_at: movement.acceptedAt,
    })
  ) {
    return null;
  }
  return {
    assignment: {
      kind: 'captured-replay',
      budgetId: snapshot.budgetId,
      categoryId: String(current.payload.subCategoryId),
      monthlyBudgetId: String(current.payload.monthlyBudgetId),
      monthlyCategoryBudgetId: current.entityId,
      expectedBudgeted: budgeted,
      budgeted,
      movement,
    },
    changes: [current, existing],
    changedEntities: assignmentResponse(snapshot, current, existing),
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 1,
  };
}

function assignmentResponse(
  snapshot: BudgetSnapshot,
  monthly: BudgetEntity,
  movement: BudgetEntity,
): Readonly<Record<string, unknown>> {
  const calculations = projectStockBudgetCalculations(snapshot);
  const monthIds = new Set(
    snapshot.entities
      .filter(
        entity =>
          entity.entityKind === 'be_monthly_budgets' && !entity.isTombstone,
      )
      .map(entity => entity.entityId),
  );
  const categoryId = String(monthly.payload.subCategoryId);
  const categoryRows =
    calculations.be_monthly_subcategory_budget_calculations.filter(row => {
      const source = snapshot.entities.find(
        entity =>
          entity.entityId === row.entities_monthly_subcategory_budget_id,
      );
      return source?.payload.subCategoryId === categoryId;
    });
  if (monthIds.size < 2 || categoryRows.length !== 2) {
    throw new Error('Assignment calculation projection is incomplete');
  }
  return {
    ...buildStockBudgetEmptyDelta(snapshot),
    be_money_movements: [projectStockEntity(movement)],
    be_monthly_subcategory_budgets: [projectStockEntity(monthly)],
    be_monthly_budget_calculations: calculations.be_monthly_budget_calculations,
    be_monthly_subcategory_budget_calculations: categoryRows,
  };
}

function readRows(changedEntities: Record<string, unknown>) {
  if (
    !hasExactKeys(changedEntities, [
      'be_monthly_subcategory_budgets',
      'be_money_movements',
    ])
  ) {
    return null;
  }
  const monthlyRows = changedEntities.be_monthly_subcategory_budgets;
  const movementRows = changedEntities.be_money_movements;
  if (
    !Array.isArray(monthlyRows) ||
    monthlyRows.length !== 1 ||
    !Array.isArray(movementRows) ||
    movementRows.length !== 1 ||
    !isRecord(monthlyRows[0]) ||
    !isRecord(movementRows[0]) ||
    !hasExactKeys(monthlyRows[0], [
      'id',
      'is_tombstone',
      'entities_monthly_budget_id',
      'entities_subcategory_id',
      'budgeted',
      'goal_snoozed_at',
    ]) ||
    !hasExactKeys(movementRows[0], [
      'id',
      'is_tombstone',
      'to_entities_monthly_subcategory_budget_id',
      'from_entities_monthly_subcategory_budget_id',
      'entities_money_movement_group_id',
      'amount',
      'performed_by_user_id',
      'note',
      'source',
      'move_started_at',
      'move_accepted_at',
    ])
  ) {
    return null;
  }
  const monthly = monthlyRows[0];
  const movement = movementRows[0];
  if (
    typeof monthly.id !== 'string' ||
    monthly.is_tombstone !== false ||
    typeof monthly.entities_monthly_budget_id !== 'string' ||
    typeof monthly.entities_subcategory_id !== 'string' ||
    monthly.goal_snoozed_at !== null ||
    typeof movement.id !== 'string' ||
    movement.is_tombstone !== false ||
    movement.to_entities_monthly_subcategory_budget_id !== monthly.id ||
    movement.from_entities_monthly_subcategory_budget_id !== null ||
    movement.entities_money_movement_group_id !== null ||
    movement.note !== null ||
    movement.source !== 'manual_assign' ||
    movement.move_accepted_at !== null ||
    !clientTimestamp(movement.move_started_at)
  ) {
    return null;
  }
  return { monthly, movement };
}

function findCurrentMonthlyCategory(
  snapshot: BudgetSnapshot,
  row: Readonly<Record<string, unknown>>,
) {
  const months = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_budgets' && !entity.isTombstone,
    )
    .sort((left, right) =>
      String(left.payload.month).localeCompare(String(right.payload.month)),
    );
  if (
    months.length < 2 ||
    row.entities_monthly_budget_id !== months[0].entityId
  ) {
    return null;
  }
  const monthly = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_monthly_subcategory_budgets' &&
      entity.entityId === row.id &&
      !entity.isTombstone &&
      entity.payload.monthlyBudgetId === row.entities_monthly_budget_id &&
      entity.payload.subCategoryId === row.entities_subcategory_id,
  );
  const category = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.entityId === row.entities_subcategory_id &&
      !entity.isTombstone,
  );
  return monthly && category?.payload.internalName === null ? monthly : null;
}

function canonicalMovement(
  row: Readonly<Record<string, unknown>>,
  budgetId: string,
  acceptedAt: string,
) {
  const amount = positiveInteger(row.amount);
  if (
    amount === null ||
    typeof row.id !== 'string' ||
    typeof row.to_entities_monthly_subcategory_budget_id !== 'string' ||
    typeof row.performed_by_user_id !== 'string' ||
    !serverTimestampValue(acceptedAt)
  ) {
    return null;
  }
  return {
    id: row.id,
    budgetId,
    toMonthlyCategoryBudgetId: row.to_entities_monthly_subcategory_budget_id,
    fromMonthlyCategoryBudgetId: null,
    movementGroupId: null,
    amount,
    performedByPrincipalId: row.performed_by_user_id,
    note: null,
    source: 'manual_assign' as const,
    startedAt: normalizeClientTimestamp(String(row.move_started_at)),
    acceptedAt,
  };
}

function serverTimestamp(value: Date): string {
  return `${value.toISOString().slice(0, -1)}000`;
}
function normalizeClientTimestamp(value: string): string {
  return value
    .slice(0, -1)
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');
}
function clientTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
function serverTimestampValue(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}Z`))
  );
}
function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}
function nonnegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
