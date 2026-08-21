import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

import {
  projectStockRequestEntity,
  projectStockResponseEntity,
} from './stock-budget-projection';
import { parseStockScheduledTransactionMutation } from './stock-scheduled-transaction';

vi.mock('./stock-budget-calculation-projection', () => ({
  projectStockBudgetCalculations: () => ({
    be_account_calculations: [],
    be_monthly_account_calculations: [],
    be_monthly_budget_calculations: [],
    be_monthly_subcategory_budget_calculations: [],
  }),
}));

function entity(
  kind: string,
  id: string,
  payload: Readonly<Record<string, unknown>>,
): BudgetEntity {
  return { entityKind: kind, entityId: id, isTombstone: false, payload };
}

function fixture(): BudgetSnapshot {
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 135,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      entity('be_budget', 'version-1', { budgetName: 'Plan' }),
      entity('be_monthly_budgets', 'mb/current', { month: '2026-08-01' }),
      entity('be_accounts', 'account-1', { accountName: 'Checking' }),
      entity('be_subcategories', 'category-1', { internalName: null }),
      entity('be_payees', 'payee-1', {
        budgetVersionId: 'version-1',
        accountId: null,
        enabled: true,
        autoFillSubCategoryId: null,
        autoFillUserDefinedSubcategoryId: null,
        autoFillMemo: null,
        autoFillAmount: 0,
        autoFillSubCategoryEnabled: true,
        autoFillMemoEnabled: false,
        autoFillAmountEnabled: false,
        renameOnImportEnabled: true,
        name: 'Payee',
        internalName: null,
        deviceKnowledge: null,
      }),
    ],
  };
}

function parent(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'schedule-1',
    is_tombstone: false,
    entities_account_id: 'account-1',
    entities_payee_id: 'payee-1',
    entities_subcategory_id: 'category-1',
    date: '2026-08-17',
    frequency: 'Monthly',
    amount: -10000,
    memo: 'Schedule Test',
    flag: null,
    transfer_account_id: null,
    upcoming_instances: '{2026-08-17}',
    debt_transaction_type: null,
    ...overrides,
  };
}

function scheduleGroup(row: Record<string, unknown>) {
  return {
    id: row.id,
    be_scheduled_transaction: row,
    be_scheduled_subtransactions: null,
  };
}

function occurrence() {
  return {
    id: 'schedule-1_2026-08-16',
    is_tombstone: false,
    entities_account_id: 'account-1',
    entities_payee_id: 'payee-1',
    entities_subcategory_id: 'category-1',
    entities_scheduled_transaction_id: 'schedule-1',
    date: '2026-08-16',
    date_entered_from_schedule: '2026-08-16',
    amount: -15000,
    cash_amount: 0,
    credit_amount: 0,
    credit_amount_adjusted: 0,
    subcategory_credit_amount_preceding: 0,
    memo: 'Schedule Test 2',
    cleared: 'Uncleared',
    accepted: false,
    check_number: null,
    flag: null,
    transfer_account_id: null,
    transfer_transaction_id: null,
    transfer_subtransaction_id: null,
    matched_transaction_id: null,
    ynab_id: null,
    imported_payee: null,
    imported_date: null,
    original_imported_payee: null,
    provider_cleansed_payee: null,
    source: 'Scheduler',
    debt_transaction_type: null,
  };
}

describe('stock scheduled transaction boundary', () => {
  test('keeps request and response schedule date encodings distinct', () => {
    const scheduled = entity('be_scheduled_transactions', 'schedule-1', {
      budgetVersionId: 'version-1',
      accountId: 'account-1',
      payeeId: 'payee-1',
      subCategoryId: 'category-1',
      date: '2026-08-17',
      frequency: 'Monthly',
      amount: -10000,
      memo: 'Schedule Test',
      flag: null,
      transferAccountId: null,
      upcomingInstances: ['2026-08-17'],
      debtTransactionType: null,
    });
    expect(projectStockRequestEntity(scheduled).upcoming_instances).toBe(
      '{2026-08-17}',
    );
    expect(projectStockResponseEntity(scheduled).upcoming_instances).toEqual([
      '2026-08-17',
    ]);
  });

  test('admits the captured create and payee autofill side effect', () => {
    const snapshot = fixture();
    const payee = snapshot.entities.find(item => item.entityId === 'payee-1')!;
    const parsed = parseStockScheduledTransactionMutation(
      {
        be_payees: [
          {
            ...projectStockRequestEntity(payee),
            auto_fill_subcategory_id: 'category-1',
          },
        ],
        be_scheduled_transaction_groups: [scheduleGroup(parent())],
      },
      snapshot,
    );
    expect(parsed).toMatchObject({
      mutation: { kind: 'create', parent: { id: 'schedule-1' } },
      expectedDeviceAdvance: 2,
      serverKnowledgeAdvance: 2,
    });
  });

  test('admits edit, materialization, redate, and parent-only deletion', () => {
    const snapshot = fixture();
    const payee = snapshot.entities.find(item => item.entityId === 'payee-1')!;
    const created = parseStockScheduledTransactionMutation(
      {
        be_payees: [
          {
            ...projectStockRequestEntity(payee),
            auto_fill_subcategory_id: 'category-1',
          },
        ],
        be_scheduled_transaction_groups: [scheduleGroup(parent())],
      },
      snapshot,
    )!;
    const live = {
      ...snapshot,
      entities: [...snapshot.entities, ...created.changes],
    };
    const editRow = parent({ amount: -15000, memo: 'Schedule Test 2' });
    const edited = parseStockScheduledTransactionMutation(
      { be_scheduled_transaction_groups: [scheduleGroup(editRow)] },
      live,
    )!;
    expect(edited).toMatchObject({
      mutation: { kind: 'update' },
      expectedDeviceAdvance: 2,
    });

    const afterEdit = {
      ...live,
      entities: [
        ...live.entities.filter(item => item.entityId !== 'schedule-1'),
        ...edited.changes,
      ],
    };
    const today = parent({
      date: '2026-08-16',
      amount: -15000,
      memo: 'Schedule Test 2',
      upcoming_instances: '{2026-09-16}',
    });
    const materialized = parseStockScheduledTransactionMutation(
      {
        be_scheduled_transaction_groups: [scheduleGroup(today)],
        be_transaction_groups: [
          {
            id: occurrence().id,
            be_transaction: occurrence(),
            be_subtransactions: null,
          },
        ],
      },
      afterEdit,
    )!;
    expect(materialized).toMatchObject({
      mutation: {
        kind: 'materialize',
        occurrence: { id: 'schedule-1_2026-08-16' },
      },
      expectedDeviceAdvance: 5,
    });
    expect(materialized.changedEntities.be_transactions).toEqual([
      expect.objectContaining({ cash_amount: -15000, source: 'Scheduler' }),
    ]);

    const afterMaterialize = {
      ...afterEdit,
      entities: [
        ...afterEdit.entities.filter(item => item.entityId !== 'schedule-1'),
        ...materialized.changes,
      ],
    };
    const future = parent({
      date: '2026-08-18',
      amount: -15000,
      memo: 'Schedule Test 2',
      upcoming_instances: '{2026-08-18}',
    });
    const redated = parseStockScheduledTransactionMutation(
      { be_scheduled_transaction_groups: [scheduleGroup(future)] },
      afterMaterialize,
    )!;
    expect(redated).toMatchObject({
      mutation: { kind: 'update' },
      expectedDeviceAdvance: 3,
    });

    const afterRedate = {
      ...afterMaterialize,
      entities: [
        ...afterMaterialize.entities.filter(
          item => item.entityId !== 'schedule-1',
        ),
        ...redated.changes,
      ],
    };
    const deleted = parseStockScheduledTransactionMutation(
      {
        be_scheduled_transaction_groups: [
          scheduleGroup({ ...future, is_tombstone: true }),
        ],
      },
      afterRedate,
    )!;
    expect(deleted.mutation).toEqual({
      kind: 'delete',
      budgetId: 'budget-1',
      scheduledTransactionId: 'schedule-1',
    });
    expect(deleted.changes).toHaveLength(1);
    expect(deleted.changedEntities.be_transactions).toEqual([]);
  });

  test('fails closed for split, transfer, malformed, or non-deterministic schedules', () => {
    const snapshot = fixture();
    expect(
      parseStockScheduledTransactionMutation(
        {
          be_scheduled_transaction_groups: [
            { ...scheduleGroup(parent()), be_scheduled_subtransactions: [] },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockScheduledTransactionMutation(
        {
          be_scheduled_transaction_groups: [
            scheduleGroup(parent({ transfer_account_id: 'account-2' })),
          ],
        },
        snapshot,
      ),
    ).toBeNull();
  });
});
