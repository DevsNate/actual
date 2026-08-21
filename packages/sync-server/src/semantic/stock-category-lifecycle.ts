import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalCategoryMutation,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';

export type StockCategoryMutation = {
  mutation: CanonicalCategoryMutation;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number;
  serverKnowledgeAdvance: 1 | 2;
};

export function parseStockCategoryMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockCategoryMutation | null {
  return (
    parseCreate(changedEntities, snapshot) ??
    parseUpdateOrDelete(changedEntities, snapshot)
  );
}

function parseCreate(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockCategoryMutation | null {
  if (
    !hasExactKeys(changedEntities, [
      'be_monthly_subcategory_budgets',
      'be_subcategories',
    ])
  ) {
    return null;
  }
  const categoryRows = changedEntities.be_subcategories;
  const monthlyRows = changedEntities.be_monthly_subcategory_budgets;
  if (
    !oneRecord(categoryRows) ||
    !oneRecord(monthlyRows) ||
    !isUntargetedCategoryRow(categoryRows[0], false) ||
    !isNewMonthlyRow(monthlyRows[0])
  ) {
    return null;
  }
  const categoryRow = categoryRows[0];
  const monthlyRow = monthlyRows[0];
  if (
    snapshot.entities.some(
      entity =>
        entity.entityId === categoryRow.id || entity.entityId === monthlyRow.id,
    ) ||
    monthlyCategoryId(monthlyRow) !== categoryRow.id
  ) {
    return null;
  }
  const group = liveEntity(
    snapshot,
    'be_master_categories',
    categoryGroupId(categoryRow),
  );
  const currentMonth = liveEntity(
    snapshot,
    'be_monthly_budgets',
    monthlyBudgetId(monthlyRow),
  );
  const currentMonthValue = requireMonth(currentMonth?.payload.month);
  const nextMonthValue = addMonth(currentMonthValue);
  const nextMonth = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_monthly_budgets' &&
      !entity.isTombstone &&
      entity.payload.month === nextMonthValue,
  );
  if (!group || !currentMonth || !nextMonth) {
    return null;
  }

  const category = categoryEntity(snapshot, categoryRow);
  const current = monthlyEntity(
    snapshot,
    String(monthlyRow.id),
    category.entityId,
    currentMonth.entityId,
    currentMonthValue,
  );
  const nextId = `mcb/${nextMonthValue.slice(0, 7)}/${category.entityId}`;
  if (snapshot.entities.some(entity => entity.entityId === nextId)) {
    return null;
  }
  const next = monthlyEntity(
    snapshot,
    nextId,
    category.entityId,
    nextMonth.entityId,
    nextMonthValue,
  );
  const augmented = {
    ...snapshot,
    entities: [...snapshot.entities, category, current, next],
  };
  const calculationRows = projectStockBudgetCalculations(
    augmented,
  ).be_monthly_subcategory_budget_calculations.filter(row =>
    [current.entityId, next.entityId].includes(
      String(row.entities_monthly_subcategory_budget_id),
    ),
  );
  if (calculationRows.length !== 2) {
    return null;
  }
  const empty = buildStockBudgetEmptyDelta(snapshot);
  return {
    mutation: {
      kind: 'create',
      group: {
        id: group.entityId,
        budgetId: snapshot.budgetId,
        name: requireString(group.payload.name),
        sortOrder: requireInteger(group.payload.sortableIndex),
        isHidden: requireBoolean(group.payload.isHidden),
      },
      category: canonicalCategory(snapshot.budgetId, category),
      months: [
        canonicalMonth(snapshot.budgetId, current),
        canonicalMonth(snapshot.budgetId, next),
      ],
    },
    changes: [category, current, next],
    changedEntities: {
      ...empty,
      be_monthly_subcategory_budgets: [projectStockRequestEntity(next)],
      be_monthly_subcategory_budget_calculations: calculationRows,
    },
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 2,
  };
}

function parseUpdateOrDelete(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockCategoryMutation | null {
  if (!hasExactKeys(changedEntities, ['be_subcategories'])) {
    return null;
  }
  const rows = changedEntities.be_subcategories;
  if (
    !oneRecord(rows) ||
    !isUntargetedCategoryRow(rows[0], rows[0].is_tombstone)
  ) {
    return null;
  }
  const row = rows[0];
  const current = liveEntity(snapshot, 'be_subcategories', String(row.id));
  if (!current) {
    return null;
  }
  const prefixedRelationships = 'entities_master_category_id' in row;
  const expected = wireCategoryRow(current, prefixedRelationships);
  if (row.is_tombstone === true) {
    if (!isDeepStrictEqual(row, { ...expected, is_tombstone: true })) {
      return null;
    }
    if (hasLiveCategoryReferences(snapshot, current.entityId)) {
      return null;
    }
    const months = snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_monthly_subcategory_budgets' &&
        !entity.isTombstone &&
        entity.payload.subCategoryId === current.entityId,
    );
    if (months.length !== 2) {
      return null;
    }
    const categoryTombstone = { ...current, isTombstone: true };
    const monthTombstones = months.map(entity => ({
      ...entity,
      isTombstone: true,
    }));
    const calculations = projectStockBudgetCalculations(snapshot)
      .be_monthly_subcategory_budget_calculations.filter(calculation =>
        months.some(
          month =>
            calculation.entities_monthly_subcategory_budget_id ===
            month.entityId,
        ),
      )
      .map(calculation => ({ ...calculation, is_tombstone: true }));
    if (calculations.length !== 2) {
      return null;
    }
    return {
      mutation: {
        kind: 'delete',
        budgetId: snapshot.budgetId,
        categoryId: current.entityId,
        monthlyCategoryBudgetIds: [months[0].entityId, months[1].entityId],
      },
      changes: [categoryTombstone, ...monthTombstones],
      changedEntities: {
        ...buildStockBudgetEmptyDelta(snapshot),
        be_monthly_subcategory_budgets: monthTombstones.map(projectStockRequestEntity),
        be_monthly_subcategory_budget_calculations: calculations,
      },
      expectedDeviceAdvance: 3,
      serverKnowledgeAdvance: 2,
    };
  }

  const destinationGroup = liveEntity(
    snapshot,
    'be_master_categories',
    categoryGroupId(row),
  );
  if (!destinationGroup) {
    return null;
  }
  const changed = changedKeys(expected, row);
  if (
    changed.length === 0 ||
    changed.some(
      key =>
        ![
          'master_category_id',
          'entities_master_category_id',
          'name',
          'sortable_index',
          'is_hidden',
        ].includes(key),
    )
  ) {
    return null;
  }
  const moved =
    changed.includes('master_category_id') ||
    changed.includes('entities_master_category_id');
  if (
    (moved && !changed.includes('sortable_index')) ||
    typeof row.name !== 'string' ||
    !row.name.trim() ||
    !Number.isSafeInteger(row.sortable_index) ||
    typeof row.is_hidden !== 'boolean'
  ) {
    return null;
  }
  const updated: BudgetEntity = {
    ...current,
    payload: {
      ...current.payload,
      masterCategoryId: categoryGroupId(row),
      name: row.name.trim(),
      sortableIndex: row.sortable_index,
      isHidden: row.is_hidden,
    },
  };
  return {
    mutation: {
      kind: 'update',
      budgetId: snapshot.budgetId,
      categoryId: current.entityId,
      expectedGroupId: requireString(current.payload.masterCategoryId),
      expectedName: requireString(current.payload.name),
      expectedSortOrder: requireInteger(current.payload.sortableIndex),
      expectedHidden: requireBoolean(current.payload.isHidden),
      groupId: categoryGroupId(row),
      name: row.name.trim(),
      sortOrder: Number(row.sortable_index),
      isHidden: row.is_hidden,
    },
    changes: [updated],
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
    expectedDeviceAdvance: moved ? 2 : 1,
    serverKnowledgeAdvance: 1,
  };
}

function categoryEntity(
  snapshot: BudgetSnapshot,
  row: Readonly<Record<string, unknown>>,
): BudgetEntity {
  return {
    entityKind: 'be_subcategories',
    entityId: String(row.id),
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      masterCategoryId: categoryGroupId(row),
      accountId: null,
      internalName: null,
      sortableIndex: row.sortable_index,
      name: String(row.name).trim(),
      type: 'DFT',
      note: null,
      goalType: null,
      goalCreatedOn: null,
      goalNeedsWholeAmount: null,
      goalTargetAmount: 0,
      goalTargetDate: null,
      goalCadence: null,
      goalCadenceFrequency: null,
      goalDay: null,
      monthlyFunding: 0,
      isHidden: row.is_hidden,
      pinnedIndex: null,
      pinnedGoalIndex: null,
      deviceKnowledge: null,
    },
  };
}

function wireCategoryRow(entity: BudgetEntity, prefixedRelationships: boolean) {
  const payload = entity.payload;
  return {
    id: entity.entityId,
    is_tombstone: entity.isTombstone,
    ...(prefixedRelationships
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

function monthlyEntity(
  snapshot: BudgetSnapshot,
  id: string,
  categoryId: string,
  monthlyBudgetId: string,
  month: string,
): BudgetEntity {
  return {
    entityKind: 'be_monthly_subcategory_budgets',
    entityId: id,
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      monthlyBudgetId,
      month,
      subCategoryId: categoryId,
      budgeted: 0,
      goalSnoozedAt: null,
      note: null,
      overspendingHandling: 'AffectsBuffer',
      deviceKnowledge: null,
    },
  };
}

function canonicalCategory(budgetId: string, entity: BudgetEntity) {
  return {
    id: entity.entityId,
    budgetId,
    groupId: requireString(entity.payload.masterCategoryId),
    name: requireString(entity.payload.name),
    sortOrder: requireInteger(entity.payload.sortableIndex),
    type: 'DFT' as const,
    note: null,
    isHidden: requireBoolean(entity.payload.isHidden),
  };
}

function canonicalMonth(budgetId: string, entity: BudgetEntity) {
  return {
    id: entity.entityId,
    budgetId,
    categoryId: requireString(entity.payload.subCategoryId),
    month: requireMonth(entity.payload.month),
    budgeted: 0 as const,
    goalSnoozedAt: null,
    note: null,
    overspendingHandling: 'AffectsBuffer' as const,
  };
}

function isUntargetedCategoryRow(
  value: Readonly<Record<string, unknown>>,
  tombstone: unknown,
): boolean {
  const relationshipKeys =
    'entities_master_category_id' in value
      ? ['entities_account_id', 'entities_master_category_id']
      : ['account_id', 'master_category_id'];
  return (
    hasExactKeys(value, [
      ...relationshipKeys,
      'goal_cadence',
      'goal_cadence_frequency',
      'goal_created_on',
      'goal_day',
      'goal_needs_whole_amount',
      'goal_target_amount',
      'goal_target_date',
      'goal_type',
      'id',
      'internal_name',
      'is_hidden',
      'is_tombstone',
      'monthly_funding',
      'name',
      'note',
      'pinned_goal_index',
      'pinned_index',
      'sortable_index',
      'type',
    ]) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    categoryGroupId(value).length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    Number.isSafeInteger(value.sortable_index) &&
    typeof value.is_hidden === 'boolean' &&
    typeof value.is_tombstone === 'boolean' &&
    value.is_tombstone === tombstone &&
    value.type === 'DFT' &&
    categoryAccountId(value) === null &&
    value.internal_name === null &&
    value.note === null &&
    value.goal_type === null &&
    value.goal_created_on === null &&
    value.goal_needs_whole_amount === null &&
    value.goal_target_amount === 0 &&
    value.goal_target_date === null &&
    value.goal_cadence === null &&
    value.goal_cadence_frequency === null &&
    value.goal_day === null &&
    value.monthly_funding === 0 &&
    value.pinned_index === null &&
    value.pinned_goal_index === null
  );
}

function isNewMonthlyRow(value: Readonly<Record<string, unknown>>): boolean {
  const relationshipKeys =
    'entities_monthly_budget_id' in value
      ? ['entities_monthly_budget_id', 'entities_subcategory_id']
      : ['monthly_budget_id', 'subcategory_id'];
  return (
    hasExactKeys(value, [
      'budgeted',
      'goal_snoozed_at',
      'id',
      'is_tombstone',
      ...relationshipKeys,
    ]) &&
    typeof value.id === 'string' &&
    monthlyBudgetId(value).length > 0 &&
    monthlyCategoryId(value).length > 0 &&
    value.is_tombstone === false &&
    value.budgeted === 0 &&
    value.goal_snoozed_at === null
  );
}

function categoryGroupId(value: Readonly<Record<string, unknown>>): string {
  const candidate =
    value.entities_master_category_id ?? value.master_category_id;
  return typeof candidate === 'string' ? candidate : '';
}

function categoryAccountId(value: Readonly<Record<string, unknown>>): unknown {
  return 'entities_account_id' in value
    ? value.entities_account_id
    : value.account_id;
}

function monthlyBudgetId(value: Readonly<Record<string, unknown>>): string {
  const candidate = value.entities_monthly_budget_id ?? value.monthly_budget_id;
  return typeof candidate === 'string' ? candidate : '';
}

function monthlyCategoryId(value: Readonly<Record<string, unknown>>): string {
  const candidate = value.entities_subcategory_id ?? value.subcategory_id;
  return typeof candidate === 'string' ? candidate : '';
}

function hasLiveCategoryReferences(
  snapshot: BudgetSnapshot,
  categoryId: string,
) {
  return snapshot.entities.some(
    entity =>
      !entity.isTombstone &&
      [
        'be_transactions',
        'be_subtransactions',
        'be_scheduled_transactions',
        'be_scheduled_subtransactions',
      ].includes(entity.entityKind) &&
      (entity.payload.subCategoryId === categoryId ||
        entity.payload.categoryId === categoryId),
  );
}

function liveEntity(snapshot: BudgetSnapshot, kind: string, id: string) {
  return snapshot.entities.find(
    entity =>
      entity.entityKind === kind &&
      entity.entityId === id &&
      !entity.isTombstone,
  );
}

function changedKeys(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter(key => !isDeepStrictEqual(left[key], right[key]));
}

function oneRecord(value: unknown): value is [Record<string, unknown>] {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0]);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Category projection requires a string');
  return value;
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value))
    throw new Error('Category projection requires an integer');
  return Number(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw new Error('Category projection requires a boolean');
  return value;
}

function requireMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-01$/u.test(value))
    throw new Error('Category projection requires an ISO month');
  return value;
}

function addMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}
