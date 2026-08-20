import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { parseStockCategoryMutation } from './stock-category-lifecycle';

function snapshot() {
  let sequence = 0;
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 88,
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

function categoryRow(groupId: string, overrides = {}) {
  return {
    id: 'category-new',
    is_tombstone: false,
    master_category_id: groupId,
    account_id: null,
    internal_name: null,
    sortable_index: 79990,
    name: 'Category 1',
    type: 'DFT',
    note: null,
    goal_type: null,
    goal_created_on: null,
    goal_needs_whole_amount: null,
    goal_target_amount: 0,
    goal_target_date: null,
    goal_cadence: null,
    goal_cadence_frequency: null,
    goal_day: null,
    monthly_funding: 0,
    is_hidden: false,
    pinned_index: null,
    pinned_goal_index: null,
    ...overrides,
  };
}

function createMutation() {
  const initial = snapshot();
  const group = initial.entities.find(
    entity =>
      entity.entityKind === 'be_master_categories' &&
      entity.payload.deletable === true,
  )!;
  const month = initial.entities.find(
    entity =>
      entity.entityKind === 'be_monthly_budgets' &&
      entity.payload.month === '2026-08-01',
  )!;
  const parsed = parseStockCategoryMutation(
    {
      be_monthly_subcategory_budgets: [
        {
          id: 'mcb/2026-08/category-new',
          is_tombstone: false,
          monthly_budget_id: month.entityId,
          subcategory_id: 'category-new',
          budgeted: 0,
          goal_snoozed_at: null,
        },
      ],
      be_subcategories: [categoryRow(group.entityId)],
    },
    initial,
  );
  return { initial, group, parsed };
}

test('parses captured category creation with a server-derived next month', () => {
  const { parsed } = createMutation();
  expect(parsed).not.toBeNull();
  expect(parsed).toMatchObject({
    mutation: { kind: 'create', category: { id: 'category-new' } },
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 2,
  });
  expect(parsed?.changes).toHaveLength(3);
  expect(parsed?.changedEntities.be_monthly_subcategory_budgets).toMatchObject([
    { id: 'mcb/2026-09/category-new' },
  ]);
  expect(
    parsed?.changedEntities.be_monthly_subcategory_budget_calculations,
  ).toHaveLength(2);
});

test('parses exact rename, move, hide, and unused deletion', () => {
  const { initial, parsed } = createMutation();
  expect(parsed).not.toBeNull();
  const created = {
    ...initial,
    entities: [...initial.entities, ...(parsed?.changes ?? [])],
  };
  const category = created.entities.find(
    entity => entity.entityId === 'category-new',
  )!;
  const projected = categoryRow(String(category.payload.masterCategoryId));

  const rename = parseStockCategoryMutation(
    { be_subcategories: [{ ...projected, name: 'Category 2' }] },
    created,
  );
  expect(rename).toMatchObject({
    mutation: { kind: 'update', name: 'Category 2' },
    expectedDeviceAdvance: 1,
    serverKnowledgeAdvance: 1,
  });

  const destination = created.entities.find(
    entity =>
      entity.entityKind === 'be_master_categories' &&
      entity.entityId !== category.payload.masterCategoryId &&
      entity.payload.deletable === true,
  )!;
  const move = parseStockCategoryMutation(
    {
      be_subcategories: [
        {
          ...projected,
          master_category_id: destination.entityId,
          sortable_index: -1073741823,
        },
      ],
    },
    created,
  );
  expect(move).toMatchObject({
    mutation: { kind: 'update', groupId: destination.entityId },
    expectedDeviceAdvance: 2,
  });

  const hidden = parseStockCategoryMutation(
    { be_subcategories: [{ ...projected, is_hidden: true }] },
    created,
  );
  expect(hidden).toMatchObject({ mutation: { isHidden: true } });

  const deletion = parseStockCategoryMutation(
    {
      be_subcategories: [{ ...projected, is_tombstone: true }],
    },
    created,
  );
  expect(deletion).toMatchObject({
    mutation: { kind: 'delete' },
    expectedDeviceAdvance: 3,
    serverKnowledgeAdvance: 2,
  });
  expect(deletion?.changes).toHaveLength(3);
});

test('rejects malformed targets and deletion of a referenced category', () => {
  const { initial, group, parsed } = createMutation();
  expect(
    parseStockCategoryMutation(
      {
        be_monthly_subcategory_budgets: [],
        be_subcategories: [
          categoryRow(group.entityId, { goal_target_amount: 1000 }),
        ],
      },
      initial,
    ),
  ).toBeNull();

  const created = {
    ...initial,
    entities: [
      ...initial.entities,
      ...(parsed?.changes ?? []),
      {
        entityKind: 'be_transactions',
        entityId: 'transaction-1',
        isTombstone: false,
        payload: { subCategoryId: 'category-new' },
      },
    ],
  };
  expect(
    parseStockCategoryMutation(
      {
        be_subcategories: [categoryRow(group.entityId, { is_tombstone: true })],
      },
      created,
    ),
  ).toBeNull();
});
