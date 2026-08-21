import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalCategoryMutation,
  CanonicalTargetDefinition,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';

export type StockTargetMutation = Readonly<{
  mutation: Extract<CanonicalCategoryMutation, { kind: 'replace-target' }>;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number | readonly number[];
  serverKnowledgeAdvance: 2;
}>;

export function parseStockTargetMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockTargetMutation | null {
  if (
    Object.keys(changedEntities).length !== 1 ||
    !Array.isArray(changedEntities.be_subcategories) ||
    changedEntities.be_subcategories.length !== 1
  ) {
    return null;
  }
  const row = changedEntities.be_subcategories[0];
  if (!isRecord(row) || !isCompleteCategoryRow(row)) return null;
  const current = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.entityId === row.id &&
      !entity.isTombstone,
  );
  if (!current) return null;
  const expectedRow = wireCategoryRow(
    current,
    'entities_master_category_id' in row,
  );
  const changed = changedKeys(expectedRow, row);
  const targetKeys = new Set([
    'goal_type',
    'goal_created_on',
    'goal_needs_whole_amount',
    'goal_target_amount',
    'goal_target_date',
    'goal_cadence',
    'goal_cadence_frequency',
    'goal_day',
    'monthly_funding',
  ]);
  if (changed.some(key => !targetKeys.has(key))) return null;

  const expected = readDefinition(expectedRow);
  const target = readDefinition(row);
  if (target === undefined || expected === undefined) return null;
  const expectedDeviceAdvance = capturedKnowledgeAdvance(expected, target);
  if (expectedDeviceAdvance === null) return null;

  const updated: BudgetEntity = {
    ...current,
    payload: {
      ...current.payload,
      goalType: row.goal_type,
      goalCreatedOn: row.goal_created_on,
      goalNeedsWholeAmount: row.goal_needs_whole_amount,
      goalTargetAmount: row.goal_target_amount,
      goalTargetDate: row.goal_target_date,
      goalCadence: row.goal_cadence,
      goalCadenceFrequency: row.goal_cadence_frequency,
      goalDay: row.goal_day,
      monthlyFunding: row.monthly_funding,
    },
  };
  const augmented = {
    ...snapshot,
    entities: snapshot.entities.map(entity =>
      entity === current ? updated : entity,
    ),
  };
  const monthIds = new Set(
    augmented.entities
      .filter(
        entity =>
          entity.entityKind === 'be_monthly_subcategory_budgets' &&
          !entity.isTombstone &&
          entity.payload.subCategoryId === current.entityId,
      )
      .map(entity => entity.entityId),
  );
  const calculations = projectStockBudgetCalculations(
    augmented,
  ).be_monthly_subcategory_budget_calculations.filter(row =>
    monthIds.has(String(row.entities_monthly_subcategory_budget_id)),
  );
  if (monthIds.size !== 2 || calculations.length !== 2) return null;

  return {
    mutation: {
      kind: 'replace-target',
      budgetId: snapshot.budgetId,
      categoryId: current.entityId,
      expected,
      target,
    },
    changes: [updated],
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      be_monthly_subcategory_budget_calculations: calculations,
    },
    expectedDeviceAdvance,
    serverKnowledgeAdvance: 2,
  };
}

function capturedKnowledgeAdvance(
  previous: CanonicalTargetDefinition | null,
  next: CanonicalTargetDefinition | null,
): number | readonly number[] | null {
  // TARGET-001 observed a seven-step coalesced create. The preserved stock Web
  // runtime independently emitted the same complete monthly definition after
  // five local knowledge steps. Both ranges are client-owned edit histories;
  // the canonical mutation and two-step server acknowledgement are identical.
  if (previous === null && isMonthly(next)) return [5, 7];
  if (isMonthly(previous) && isYearly(next)) return 2;
  if (isYearly(previous) && isWeeklySaturday(next)) return 4;
  if (isWeeklySaturday(previous) && isEveryTwoMonths(next)) return 5;
  if (isEveryTwoMonths(previous) && isMonthly(next)) return 2;
  if (isMonthly(previous) && next === null) return 7;
  if (
    isMonthly(previous) &&
    isMonthly(next) &&
    isDeepStrictEqual(previous, next)
  )
    return 7;
  return null;
}

function readDefinition(
  row: Readonly<Record<string, unknown>>,
): CanonicalTargetDefinition | null | undefined {
  if (
    row.goal_target_amount === 0 &&
    row.goal_created_on === null &&
    row.monthly_funding === 0
  )
    return null;
  if (
    row.goal_type === null &&
    row.goal_created_on === null &&
    row.goal_needs_whole_amount === null &&
    row.goal_target_amount === 0 &&
    row.goal_target_date === null &&
    row.goal_cadence === null &&
    row.goal_cadence_frequency === null &&
    row.goal_day === null &&
    row.monthly_funding === 0
  )
    return null;
  if (
    row.goal_type !== 'NEED' ||
    row.goal_needs_whole_amount !== true ||
    row.monthly_funding !== 0 ||
    !isIsoDate(row.goal_created_on) ||
    !Number.isSafeInteger(row.goal_target_amount) ||
    Number(row.goal_target_amount) <= 0 ||
    !(row.goal_target_date === null || isIsoDate(row.goal_target_date)) ||
    !Number.isSafeInteger(row.goal_cadence) ||
    !Number.isSafeInteger(row.goal_cadence_frequency) ||
    Number(row.goal_cadence_frequency) <= 0 ||
    !(row.goal_day === null || Number.isSafeInteger(row.goal_day))
  )
    return undefined;
  const cadence = row.goal_cadence;
  if (cadence !== 1 && cadence !== 2 && cadence !== 13) return undefined;
  const definition: CanonicalTargetDefinition = {
    type: 'NEED',
    createdOn: String(row.goal_created_on),
    amount: Number(row.goal_target_amount),
    date: row.goal_target_date === null ? null : String(row.goal_target_date),
    cadence,
    cadenceFrequency: Number(row.goal_cadence_frequency),
    day: row.goal_day === null ? null : Number(row.goal_day),
    needsWholeAmount: true,
    monthlyFunding: 0,
  };
  return isCapturedDefinition(definition) ? definition : undefined;
}

function isCapturedDefinition(value: CanonicalTargetDefinition): boolean {
  return (
    isMonthly(value) ||
    isYearly(value) ||
    isWeeklySaturday(value) ||
    isEveryTwoMonths(value)
  );
}
function isMonthly(value: CanonicalTargetDefinition | null): boolean {
  return (
    value !== null &&
    value.cadence === 1 &&
    value.cadenceFrequency === 1 &&
    value.date === null &&
    value.day === null
  );
}
function isYearly(value: CanonicalTargetDefinition | null): boolean {
  return (
    value !== null &&
    value.cadence === 13 &&
    value.cadenceFrequency === 1 &&
    value.date !== null &&
    value.day === null
  );
}
function isWeeklySaturday(value: CanonicalTargetDefinition | null): boolean {
  return (
    value !== null &&
    value.cadence === 2 &&
    value.cadenceFrequency === 1 &&
    value.date === null &&
    value.day === 6
  );
}
function isEveryTwoMonths(value: CanonicalTargetDefinition | null): boolean {
  return (
    value !== null &&
    value.cadence === 1 &&
    value.cadenceFrequency === 2 &&
    value.date !== null &&
    value.day === null
  );
}

function wireCategoryRow(
  entity: BudgetEntity,
  prefixed: boolean,
): Record<string, unknown> {
  const payload = entity.payload;
  return {
    id: entity.entityId,
    is_tombstone: entity.isTombstone,
    ...(prefixed
      ? {
          entities_master_category_id: payload.masterCategoryId,
          entities_account_id: payload.accountId,
        }
      : {
          master_category_id: payload.masterCategoryId,
          account_id: payload.accountId,
        }),
    internal_name: payload.internalName,
    sortable_index: payload.sortableIndex,
    name: payload.name,
    type: payload.type,
    note: payload.note,
    goal_type: payload.goalType,
    goal_created_on: payload.goalCreatedOn,
    goal_needs_whole_amount: payload.goalNeedsWholeAmount,
    goal_target_amount: payload.goalTargetAmount,
    goal_target_date: payload.goalTargetDate,
    goal_cadence: payload.goalCadence,
    goal_cadence_frequency: payload.goalCadenceFrequency,
    goal_day: payload.goalDay,
    monthly_funding: payload.monthlyFunding,
    is_hidden: payload.isHidden,
    pinned_index: payload.pinnedIndex,
    pinned_goal_index: payload.pinnedGoalIndex,
  };
}

function isCompleteCategoryRow(
  row: Readonly<Record<string, unknown>>,
): boolean {
  const expected = new Set([
    'id',
    'is_tombstone',
    'internal_name',
    'sortable_index',
    'name',
    'type',
    'note',
    'goal_type',
    'goal_created_on',
    'goal_needs_whole_amount',
    'goal_target_amount',
    'goal_target_date',
    'goal_cadence',
    'goal_cadence_frequency',
    'goal_day',
    'monthly_funding',
    'is_hidden',
    'pinned_index',
    'pinned_goal_index',
    ...('entities_master_category_id' in row
      ? ['entities_master_category_id', 'entities_account_id']
      : ['master_category_id', 'account_id']),
  ]);
  return (
    Object.keys(row).length === expected.size &&
    Object.keys(row).every(key => expected.has(key)) &&
    typeof row.id === 'string' &&
    row.is_tombstone === false
  );
}
function changedKeys(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(
    key => !isDeepStrictEqual(left[key], right[key]),
  );
}
function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
