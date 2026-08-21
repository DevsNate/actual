import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { parseStockTargetMutation } from './stock-target-definition';

function snapshot(): BudgetSnapshot {
  let sequence = 0;
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 99,
    currencyFormat: {},
    dateFormat: {},
    entities: buildStockBudgetBootstrap({
      budgetId: 'budget-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Budget',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-16',
      createdAtMilliseconds: Date.UTC(2026, 7, 16),
      allocateId: label => `${label}:${sequence++}`,
    }),
  };
}

function row(entity: BudgetEntity, target: Record<string, unknown>) {
  const payload = entity.payload;
  return {
    id: entity.entityId,
    is_tombstone: false,
    entities_master_category_id: payload.masterCategoryId,
    entities_account_id: payload.accountId,
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
    ...target,
  };
}

const monthly = {
  goal_type: 'NEED',
  goal_created_on: '2026-08-01',
  goal_needs_whole_amount: true,
  goal_target_amount: 100000,
  goal_target_date: null,
  goal_cadence: 1,
  goal_cadence_frequency: 1,
  goal_day: null,
  monthly_funding: 0,
};

function advance(
  current: BudgetSnapshot,
  parsed: NonNullable<ReturnType<typeof parseStockTargetMutation>>,
): BudgetSnapshot {
  const replacement = parsed.changes[0];
  return {
    ...current,
    entities: current.entities.map(entity =>
      entity.entityId === replacement.entityId &&
      entity.entityKind === replacement.entityKind
        ? replacement
        : entity,
    ),
  };
}

test('parses the exact TARGET-001 definition lifecycle and knowledge advances', () => {
  let current = snapshot();
  const category = current.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.goalType === null &&
      entity.payload.internalName === null,
  )!;
  const states = [
    [monthly, [5, 7], [100000, 100000]],
    [
      { ...monthly, goal_target_date: '2026-09-01', goal_cadence: 13 },
      2,
      [50000, 100000],
    ],
    [
      {
        ...monthly,
        goal_created_on: '2026-08-16',
        goal_cadence: 2,
        goal_day: 6,
      },
      4,
      [200000, 400000],
    ],
    [
      { ...monthly, goal_target_date: '2026-09-01', goal_cadence_frequency: 2 },
      5,
      [50000, 100000],
    ],
    [monthly, 2, [100000, 100000]],
  ] as const;
  for (const [definition, expectedDeviceAdvance, targets] of states) {
    const live = current.entities.find(
      entity => entity.entityId === category.entityId,
    )!;
    const parsed = parseStockTargetMutation(
      { be_subcategories: [row(live, definition)] },
      current,
    );
    expect(parsed).toMatchObject({
      mutation: { kind: 'replace-target', categoryId: category.entityId },
      expectedDeviceAdvance,
      serverKnowledgeAdvance: 2,
    });
    expect(
      (
        parsed?.changedEntities
          .be_monthly_subcategory_budget_calculations as Array<{
          goal_target: number;
        }>
      ).map(value => value.goal_target),
    ).toEqual(targets);
    current = advance(current, parsed!);
  }
  const live = current.entities.find(
    entity => entity.entityId === category.entityId,
  )!;
  const cleared = parseStockTargetMutation(
    {
      be_subcategories: [
        row(live, {
          goal_type: null,
          goal_created_on: null,
          goal_needs_whole_amount: null,
          goal_target_amount: 0,
          goal_target_date: null,
          goal_cadence: null,
          goal_cadence_frequency: null,
          goal_day: null,
          monthly_funding: 0,
        }),
      ],
    },
    current,
  );
  expect(cleared).toMatchObject({
    mutation: { kind: 'replace-target', target: null },
    expectedDeviceAdvance: 7,
    serverKnowledgeAdvance: 2,
  });
});

test('accepts both observed stock Web monthly-create knowledge histories', () => {
  const current = snapshot();
  const category = current.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.goalType === null &&
      entity.payload.internalName === null,
  )!;
  const parsed = parseStockTargetMutation(
    { be_subcategories: [row(category, monthly)] },
    current,
  );

  expect(parsed?.expectedDeviceAdvance).toEqual([5, 7]);
});

test('treats bootstrap target templates as inactive and rejects uncaptured definitions', () => {
  const current = snapshot();
  const groceries = current.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.goalType === 'NEED' &&
      entity.payload.goalTargetAmount === 0,
  )!;
  expect(
    parseStockTargetMutation(
      { be_subcategories: [row(groceries, monthly)] },
      current,
    ),
  ).toMatchObject({ mutation: { expected: null } });
  expect(
    parseStockTargetMutation(
      {
        be_subcategories: [
          row(groceries, {
            ...monthly,
            goal_cadence: 2,
            goal_cadence_frequency: 2,
            goal_day: 1,
          }),
        ],
      },
      current,
    ),
  ).toBeNull();
});
