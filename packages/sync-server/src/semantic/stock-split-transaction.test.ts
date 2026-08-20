import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { projectStockEntity } from './stock-budget-projection';
import { parseStockSplitMutation } from './stock-split-transaction';

function fixture() {
  let sequence = 0;
  const entities = buildStockBudgetBootstrap({
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    principalId: 'user-1',
    name: 'Plan',
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
  const group = buildUnlinkedCheckingAccount({
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
    name: 'Plan',
    serverKnowledge: 68,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      ...entities,
      ...stockAccountBudgetEntityAdapter.toBudgetEntities(
        group,
        'version-1',
        'account-create-1',
      ),
    ],
  };
}

function categoryId(
  snapshot: ReturnType<typeof fixture>,
  internalName: string,
) {
  return snapshot.entities.find(
    entity => entity.payload.internalName === internalName,
  )!.entityId;
}

function payee(id: string) {
  return {
    id,
    is_tombstone: false,
    entities_account_id: null,
    enabled: true,
    name: id,
    auto_fill_amount: 0,
    rename_on_import_enabled: true,
  };
}

function capturedCreate(snapshot: ReturnType<typeof fixture>) {
  const split = categoryId(snapshot, 'Category/__Split__');
  const first = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.internalName === null &&
      !entity.isTombstone,
  )!.entityId;
  const second = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.internalName === null &&
      entity.entityId !== first &&
      !entity.isTombstone,
  )!.entityId;
  return {
    be_payees: [
      payee('payee-parent'),
      payee('payee-child-1'),
      payee('payee-child-2'),
    ],
    be_transaction_groups: [
      {
        id: 'split-parent',
        be_transaction: {
          id: 'split-parent',
          is_tombstone: false,
          entities_account_id: 'account-1',
          entities_payee_id: 'payee-parent',
          entities_subcategory_id: split,
          date: '2026-08-16',
          amount: -100000,
          cash_amount: 0,
          credit_amount: 0,
          memo: 'Split Test 2',
          cleared: 'Uncleared',
          accepted: true,
        },
        be_subtransactions: [
          {
            id: 'split-child-1',
            is_tombstone: false,
            entities_transaction_id: 'split-parent',
            entities_payee_id: 'payee-child-1',
            entities_subcategory_id: first,
            amount: -50000,
            cash_amount: 0,
            credit_amount: 0,
            memo: 'Memo 2',
            sortable_index: 0,
          },
          {
            id: 'split-child-2',
            is_tombstone: false,
            entities_transaction_id: 'split-parent',
            entities_payee_id: 'payee-child-2',
            entities_subcategory_id: second,
            amount: -50000,
            cash_amount: 0,
            credit_amount: 0,
            memo: 'Memo 3',
            sortable_index: 1,
          },
        ],
      },
    ],
  };
}

describe('stock split transaction boundary', () => {
  test('admits the captured two-line aggregate and normalizes cash fields', () => {
    const snapshot = fixture();
    const parsed = parseStockSplitMutation(capturedCreate(snapshot), snapshot);
    expect(parsed).toMatchObject({
      mutation: {
        kind: 'create',
        parent: { id: 'split-parent', amount: -100000 },
      },
      expectedDeviceAdvance: 6,
      serverKnowledgeAdvance: 2,
    });
    expect(parsed?.mutation.kind === 'create' && parsed.mutation.lines).toEqual(
      [
        expect.objectContaining({
          id: 'split-child-1',
          sortOrder: 0,
          amount: -50000,
        }),
        expect.objectContaining({
          id: 'split-child-2',
          sortOrder: 1,
          amount: -50000,
        }),
      ],
    );
    expect(parsed?.changedEntities.be_subtransactions).toEqual([
      expect.objectContaining({ id: 'split-child-1', cash_amount: -50000 }),
      expect.objectContaining({ id: 'split-child-2', cash_amount: -50000 }),
    ]);
  });

  test('admits one parent-payee edit, one child-category edit, and exact aggregate deletion', () => {
    const snapshot = fixture();
    const created = parseStockSplitMutation(
      capturedCreate(snapshot),
      snapshot,
    )!;
    const live = {
      ...snapshot,
      entities: [...snapshot.entities, ...created.changes],
    };
    const parent = live.entities.find(
      entity => entity.entityId === 'split-parent',
    )!;
    const lines = ['split-child-1', 'split-child-2'].map(id =>
      live.entities.find(entity => entity.entityId === id)!,
    );
    const group = (
      parentRow: Record<string, unknown>,
      lineRows = lines.map(projectStockEntity),
    ) => ({
      be_transaction_groups: [
        {
          id: 'split-parent',
          be_transaction: parentRow,
          be_subtransactions: lineRows,
        },
      ],
    });
    const payeeEdit = parseStockSplitMutation(
      group({
        ...projectStockEntity(parent),
        entities_payee_id: 'payee-child-1',
      }),
      live,
    );
    expect(payeeEdit?.mutation).toMatchObject({
      kind: 'update-parent-payee',
      payeeId: 'payee-child-1',
    });

    const newCategory = live.entities.find(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.internalName === null &&
        entity.entityId !== lines[0].payload.subCategoryId &&
        entity.entityId !== lines[1].payload.subCategoryId,
    )!.entityId;
    const categoryEdit = parseStockSplitMutation(
      group(projectStockEntity(parent), [
        {
          ...projectStockEntity(lines[0]),
          entities_subcategory_id: newCategory,
        },
        projectStockEntity(lines[1]),
      ]),
      live,
    );
    expect(categoryEdit?.mutation).toMatchObject({
      kind: 'update-line-category',
      lineId: 'split-child-1',
    });

    const deleted = parseStockSplitMutation(
      group(
        { ...projectStockEntity(parent), is_tombstone: true },
        lines.map(line => ({
          ...projectStockEntity(line),
          is_tombstone: true,
        })),
      ),
      live,
    );
    expect(deleted?.mutation).toEqual({
      kind: 'delete',
      budgetId: 'budget-1',
      transactionId: 'split-parent',
      lineIds: ['split-child-1', 'split-child-2'],
    });
  });

  test('fails closed for an unbalanced, reordered, partial, or transfer-shaped aggregate', () => {
    const snapshot = fixture();
    const base = capturedCreate(snapshot);
    const group = base.be_transaction_groups[0];
    expect(
      parseStockSplitMutation(
        {
          ...base,
          be_transaction_groups: [
            {
              ...group,
              be_subtransactions: [
                { ...group.be_subtransactions[0], amount: -40000 },
                group.be_subtransactions[1],
              ],
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockSplitMutation(
        {
          ...base,
          be_transaction_groups: [
            {
              ...group,
              be_subtransactions: [
                group.be_subtransactions[1],
                group.be_subtransactions[0],
              ],
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockSplitMutation(
        {
          ...base,
          be_transaction_groups: [
            { ...group, be_subtransactions: [group.be_subtransactions[0]] },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockSplitMutation(
        {
          ...base,
          be_transaction_groups: [
            {
              ...group,
              be_transaction: {
                ...group.be_transaction,
                transfer_account_id: 'other-account',
              },
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
  });
});
