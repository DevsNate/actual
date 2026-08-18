import { buildStockPlanBootstrap } from '@actual-app/semantic-core';

import { projectStockBudgetSource } from './stock-budget-projection';

describe('stock budget source projection', () => {
  test('projects the admitted PLAN-001 bootstrap without losing identities', () => {
    let sequence = 0;
    const entities = buildStockPlanBootstrap({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      currencyFormat: {
        iso_code: 'USD',
        currency_symbol: '$',
        decimal_digits: 2,
      },
      dateFormat: { format: 'MM/DD/YYYY' },
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    });

    const result = projectStockBudgetSource({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      name: 'Plan',
      serverKnowledge: 1,
      currencyFormat: {},
      dateFormat: {},
      entities,
    });

    expect(result.firstMonth).toBe('2026-08-01');
    expect(result.lastMonth).toBe('2026-08-01');
    expect(result.changedEntities.be_budget).toMatchObject({
      id: 'version-1',
      budget_id: 'plan-1',
      budget_name: 'Plan',
      is_tombstone: false,
      currency_format: {
        iso_code: 'USD',
        currency_symbol: '$',
        decimal_digits: 2,
      },
    });
    expect(result.changedEntities.be_master_categories).toHaveLength(6);
    expect(result.changedEntities.be_subcategories).toHaveLength(15);
    expect(result.changedEntities.be_payees).toHaveLength(3);
    expect(result.changedEntities.be_settings).toHaveLength(1);
    expect(result.changedEntities.be_onboarding_events).toHaveLength(2);
    expect(result.changedEntities.be_monthly_budgets).toHaveLength(2);
    expect(result.changedEntities.be_monthly_subcategory_budgets).toHaveLength(
      28,
    );
    expect(
      Object.keys(record(result.changedEntities.be_budget)).sort(),
    ).toEqual([
      'budget_id',
      'budget_name',
      'currency_format',
      'date_format',
      'id',
      'is_tombstone',
      'source',
    ]);
    expect(
      Object.keys(firstRecord(result.changedEntities.be_subcategories)).sort(),
    ).toEqual([
      'entities_account_id',
      'entities_master_category_id',
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
      'sortable_index',
      'type',
    ]);
    expect(
      Object.keys(firstRecord(result.changedEntities.be_payees)).sort(),
    ).toEqual([
      'auto_fill_amount',
      'auto_fill_amount_enabled',
      'auto_fill_memo',
      'auto_fill_memo_enabled',
      'auto_fill_subcategory_enabled',
      'auto_fill_subcategory_id',
      'auto_fill_user_defined_subcategory_id',
      'enabled',
      'entities_account_id',
      'id',
      'internal_name',
      'is_tombstone',
      'name',
      'rename_on_import_enabled',
    ]);
    expect(
      Object.keys(
        firstRecord(result.changedEntities.be_onboarding_events),
      ).sort(),
    ).toEqual([
      'created_at',
      'device_knowledge',
      'event_name',
      'id',
      'is_tombstone',
      'last_updated_by_device_id',
      'server_knowledge',
      'updated_at',
      'user_id',
    ]);
    expect(
      Object.keys(
        firstRecord(result.changedEntities.be_monthly_subcategory_budgets),
      ).sort(),
    ).toEqual([
      'budgeted',
      'entities_monthly_budget_id',
      'entities_subcategory_id',
      'goal_snoozed_at',
      'id',
      'is_tombstone',
      'note',
      'overspending_handling',
    ]);
    expect(entities).toHaveLength(58);
  });

  test('preserves unknown nested fields while converting wire casing', () => {
    const result = projectStockBudgetSource({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      name: 'Plan',
      serverKnowledge: 1,
      currencyFormat: {},
      dateFormat: {},
      entities: [
        {
          entityKind: 'be_budget',
          entityId: 'version-1',
          isTombstone: false,
          payload: {
            budgetId: 'plan-1',
            unknownEnvelope: { futureField: 7 },
          },
        },
      ],
    });
    expect(result.changedEntities.be_budget).toEqual({
      id: 'version-1',
      budget_id: 'plan-1',
      unknown_envelope: { future_field: 7 },
      is_tombstone: false,
    });
  });

  test('retains an opened-budget prior month without moving month boundaries', () => {
    const result = projectStockBudgetSource({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      name: 'Plan',
      serverKnowledge: 2,
      currencyFormat: {},
      dateFormat: {},
      entities: [
        {
          entityKind: 'be_budget',
          entityId: 'version-1',
          isTombstone: false,
          payload: { budgetId: 'plan-1' },
        },
        ...['2026-08-01', '2026-09-01'].map(month => ({
          entityKind: 'be_monthly_budgets',
          entityId: `mb/${month.slice(0, 7)}/version-1`,
          isTombstone: false,
          payload: { budgetVersionId: 'version-1', month, note: '' },
        })),
        {
          entityKind: 'be_monthly_budgets',
          entityId: 'mb/2026-07/version-1',
          isTombstone: false,
          payload: {
            budgetVersionId: 'version-1',
            bootstrapRole: 'opened-budget-prior-month',
            month: '2026-07-01',
            note: '',
          },
        },
      ],
    });

    expect(result.firstMonth).toBe('2026-08-01');
    expect(result.lastMonth).toBe('2026-08-01');
    expect(result.changedEntities.be_monthly_budgets).toContainEqual({
      id: 'mb/2026-07/version-1',
      is_tombstone: false,
      month: '2026-07-01',
      note: '',
    });
  });

  test('fails closed on ambiguous or malformed entity projections', () => {
    expect(() =>
      projectStockBudgetSource({
        planId: 'plan-1',
        budgetVersionId: 'version-1',
        name: 'Plan',
        serverKnowledge: 1,
        currencyFormat: {},
        dateFormat: {},
        entities: [
          {
            entityKind: 'be_budget',
            entityId: 'version-1',
            isTombstone: false,
            payload: { id: 'collision' },
          },
        ],
      }),
    ).toThrow('collides');
  });
});

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected projected record');
  }
  return value as Readonly<Record<string, unknown>>;
}

function firstRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Expected projected record array');
  }
  return record(value[0]);
}
