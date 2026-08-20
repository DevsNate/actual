import { buildStockBudgetBootstrap } from './stock-budget-bootstrap';

describe('PLAN-001 stock plan bootstrap', () => {
  test('reproduces the admitted server bootstrap cardinalities and defaults', () => {
    const entities = buildStockBudgetBootstrap({
      budgetId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'principal-1',
      name: 'Plan Create Trace',
      currencyFormat: { iso_code: 'USD' },
      dateFormat: { format: 'MM/DD/YYYY' },
      createdOn: '2026-08-16',
      createdAtMilliseconds: 1786954979513,
      allocateId: label => `id:${label}`,
    });

    expect(countByKind(entities)).toEqual({
      be_budget: 1,
      be_master_categories: 6,
      be_monthly_budgets: 2,
      be_monthly_subcategory_budgets: 28,
      be_onboarding_events: 2,
      be_payees: 3,
      be_settings: 1,
      be_subcategories: 15,
    });

    const subscription = entities.find(
      value => value.payload.name === '🌳 YNAB subscription',
    );
    expect(subscription?.payload).toMatchObject({
      goalCadence: 13,
      goalCadenceFrequency: 1,
      goalTargetDate: '2027-09-19',
      goalTargetAmount: 0,
    });

    const monthlyBudgets = entities
      .filter(value => value.entityKind === 'be_monthly_budgets')
      .map(value => value.payload.month);
    expect(monthlyBudgets).toEqual(['2026-08-01', '2026-09-01']);
    expect(
      entities.some(value => value.payload.settingName === 'budget_views'),
    ).toBe(false);
    expect(
      entities.some(value => value.payload.eventName === 'opened_budget'),
    ).toBe(false);
  });

  test('rejects malformed or impossible creation dates', () => {
    const create = (createdOn: string) =>
      buildStockBudgetBootstrap({
        budgetId: 'plan-1',
        budgetVersionId: 'version-1',
        principalId: 'principal-1',
        name: 'Plan',
        currencyFormat: {},
        dateFormat: {},
        createdOn,
        createdAtMilliseconds: 0,
        allocateId: label => label,
      });

    expect(() => create('2026-02-30')).toThrow(
      'createdOn must be a valid ISO calendar date',
    );
    expect(() => create('20260816')).toThrow(
      'createdOn must be an ISO calendar date',
    );
  });
});

function countByKind(
  entities: readonly { entityKind: string }[],
): Record<string, number> {
  return Object.fromEntries(
    [...new Set(entities.map(value => value.entityKind))]
      .sort()
      .map(kind => [
        kind,
        entities.filter(value => value.entityKind === kind).length,
      ]),
  );
}
