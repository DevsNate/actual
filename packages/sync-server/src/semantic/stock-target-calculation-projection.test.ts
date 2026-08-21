import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';

function target(
  cadence: 1 | 2 | 13,
  frequency: number,
  date: string | null,
  day: number | null,
  createdOn = '2026-08-01',
) {
  const entities = buildStockBudgetBootstrap({
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    principalId: 'user-1',
    name: 'Budget',
    currencyFormat: {},
    dateFormat: {},
    createdOn: '2026-08-16',
    createdAtMilliseconds: Date.UTC(2026, 7, 16),
    allocateId: label => label,
  });
  const category = entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.internalName === null,
  )!;
  const targeted = {
    ...category,
    payload: {
      ...category.payload,
      goalType: 'NEED',
      goalCreatedOn: createdOn,
      goalNeedsWholeAmount: true,
      goalTargetAmount: 100000,
      goalTargetDate: date,
      goalCadence: cadence,
      goalCadenceFrequency: frequency,
      goalDay: day,
      monthlyFunding: 0,
    },
  };
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 1,
    currencyFormat: {},
    dateFormat: {},
    entities: entities.map(entity => (entity === category ? targeted : entity)),
  };
}

test.each([
  ['monthly', target(1, 1, null, null), [100000, 100000], [1, 1]],
  ['yearly', target(13, 1, '2026-09-01', null), [50000, 100000], [2, 1]],
  [
    'weekly Saturday',
    target(2, 1, null, 6, '2026-08-16'),
    [200000, 400000],
    [1, 1],
  ],
  [
    'every two months',
    target(1, 2, '2026-09-01', null),
    [50000, 100000],
    [2, 1],
  ],
] as const)(
  'projects captured %s definition rows',
  (_name, snapshot, targets, completions) => {
    const entities =
      snapshot.entities as readonly import('@actual-app/semantic-core').BudgetEntity[];
    const categoryId = entities.find(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.goalType === 'NEED',
    )!.entityId;
    const monthIds = entities
      .filter(
        entity =>
          entity.entityKind === 'be_monthly_subcategory_budgets' &&
          entity.payload.subCategoryId === categoryId,
      )
      .map(entity => entity.entityId);
    const rows = projectStockBudgetCalculations(
      snapshot,
    ).be_monthly_subcategory_budget_calculations.filter(row =>
      monthIds.includes(String(row.entities_monthly_subcategory_budget_id)),
    );
    expect(rows.map(row => row.goal_target)).toEqual(targets);
    expect(rows.map(row => row.goal_under_funded)).toEqual(targets);
    expect(rows.map(row => row.goal_expected_completion)).toEqual(completions);
  },
);

test('fails closed for an uncaptured target cadence', () => {
  expect(() => projectStockBudgetCalculations(target(2, 2, null, 1))).toThrow(
    'Unsupported target cadence',
  );
});
