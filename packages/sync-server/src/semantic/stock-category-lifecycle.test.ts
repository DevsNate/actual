import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { projectStockRequestEntity } from './stock-budget-projection';
import { parseStockCategoryMutation } from './stock-category-lifecycle';

function snapshot() {
  let sequence = 0;
  const entities = buildStockBudgetBootstrap({
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    principalId: 'user-1',
    name: 'Budget',
    currencyFormat: {},
    dateFormat: {},
    createdOn: '2026-08-16',
    createdAtMilliseconds: Date.UTC(2026, 7, 16),
    allocateId: label => `${label}:${sequence++}`,
  });
  const startingBalancePayee = entities.find(
    entity => entity.payload.internalName === 'StartingBalancePayee',
  )!;
  const income = entities.find(
    entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  const account = buildUnlinkedCheckingAccount({
    budgetId: 'budget-1',
    accountId: 'account-1',
    transferPayeeId: 'transfer-payee-1',
    startingBalanceId: 'starting-balance-1',
    startingBalancePayeeId: startingBalancePayee.entityId,
    immediateIncomeCategoryId: income.entityId,
    name: 'Checking',
    openingBalance: 100000,
    openingDate: '2026-08-16',
    sortOrder: 0,
  });
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 88,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      ...entities,
      ...stockAccountBudgetEntityAdapter.toBudgetEntities(
        account,
        'version-1',
        'account-create-1',
      ),
    ],
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

test('rejects malformed targets and an incomplete referenced-category deletion', () => {
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

test('admits the captured referenced-category deletion aggregate', () => {
  const { initial, parsed } = createMutation();
  expect(parsed).not.toBeNull();
  const created = {
    ...initial,
    serverKnowledge: 76,
    entities: [...initial.entities, ...(parsed?.changes ?? [])],
  };
  const category = created.entities.find(
    entity => entity.entityId === 'category-new',
  )!;
  const replacement = created.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      !entity.isTombstone &&
      entity.entityId !== category.entityId &&
      entity.payload.type === 'DFT' &&
      entity.payload.internalName === null,
  )!;
  const account = created.entities.find(
    entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
  )!;
  const payee = {
    entityKind: 'be_payees',
    entityId: 'payee-1',
    isTombstone: false,
    payload: {
      budgetVersionId: created.budgetVersionId,
      accountId: null,
      enabled: true,
      autoFillSubCategoryId: category.entityId,
      autoFillUserDefinedSubcategoryId: null,
      autoFillMemo: null,
      autoFillAmount: 0,
      autoFillSubCategoryEnabled: true,
      autoFillMemoEnabled: false,
      autoFillAmountEnabled: false,
      renameOnImportEnabled: true,
      name: 'Capture Delete Payee',
      internalName: null,
      deviceKnowledge: null,
    },
  };
  const transaction = {
    entityKind: 'be_transactions',
    entityId: 'transaction-1',
    isTombstone: false,
    payload: {
      budgetVersionId: created.budgetVersionId,
      accountId: account.entityId,
      payeeId: payee.entityId,
      subCategoryId: category.entityId,
      scheduledTransactionId: null,
      date: '2026-08-21',
      dateEnteredFromSchedule: null,
      amount: -1230,
      cashAmount: -1230,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
      memo: 'CATEGORY REFERENCED DELETE',
      cleared: 'Uncleared',
      accepted: true,
      checkNumber: null,
      flag: null,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      matchedTransactionId: null,
      ynabId: null,
      importedPayee: null,
      importedDate: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      source: null,
      debtTransactionType: null,
    },
  };
  const referenced = {
    ...created,
    entities: [...created.entities, payee, transaction],
  };
  const {
    master_category_id: groupId,
    account_id: accountId,
    ...categoryFields
  } = categoryRow(String(category.payload.masterCategoryId), {
    id: category.entityId,
  });
  const parsedDelete = parseStockCategoryMutation(
    {
      be_subcategories: [
        {
          ...categoryFields,
          entities_master_category_id: groupId,
          entities_account_id: accountId,
          is_tombstone: true,
        },
      ],
      be_transaction_groups: [
        {
          id: transaction.entityId,
          be_transaction: {
            ...projectStockRequestEntity(transaction),
            entities_subcategory_id: replacement.entityId,
          },
          be_subtransactions: null,
        },
      ],
    },
    referenced,
  );

  expect(parsedDelete).toMatchObject({
    mutation: {
      kind: 'delete-and-reassign-one-transaction',
      budgetId: referenced.budgetId,
      categoryId: category.entityId,
      replacementCategoryId: replacement.entityId,
      transactionId: transaction.entityId,
      payeeId: payee.entityId,
    },
    expectedDeviceAdvance: 4,
    serverKnowledgeAdvance: 2,
  });
  expect(parsedDelete?.changedEntities.be_monthly_subcategory_budgets)
    .toHaveLength(2);
  expect(parsedDelete?.changedEntities.be_monthly_subcategory_budget_calculations)
    .toHaveLength(4);
  expect(parsedDelete?.changedEntities.be_payees).toMatchObject([
    {
      id: payee.entityId,
      is_tombstone: false,
      auto_fill_subcategory_id: null,
    },
  ]);
  expect(parsedDelete?.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityKind: 'be_transactions',
        entityId: transaction.entityId,
        payload: expect.objectContaining({
          subCategoryId: replacement.entityId,
        }),
      }),
    ]),
  );
});
