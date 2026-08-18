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
    expect(result.lastMonth).toBe('2026-09-01');
    expect(result.changedEntities.be_budget).toMatchObject({
      id: 'version-1',
      budget_id: 'plan-1',
      budget_version_id: 'version-1',
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
