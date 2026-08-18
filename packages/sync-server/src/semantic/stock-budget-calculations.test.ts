import { buildStockPlanBootstrap } from '@actual-app/semantic-core';

import { projectStockFreshPlanCalculations } from './stock-budget-calculations';

function createSnapshot() {
  let sequence = 0;
  const entities = buildStockPlanBootstrap({
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    principalId: 'user-1',
    name: 'Plan',
    currencyFormat: {},
    dateFormat: {},
    createdOn: '2026-08-17',
    createdAtMilliseconds: Date.UTC(2026, 7, 17),
    allocateId: label => `${label}:${sequence++}`,
  });
  return {
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 1,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
}

describe('stock fresh-plan calculations', () => {
  test('projects the exact admitted calculated bootstrap defaults', () => {
    const result = projectStockFreshPlanCalculations(createSnapshot());

    expect(result.be_monthly_budget_calculations).toHaveLength(2);
    expect(result.be_monthly_subcategory_budget_calculations).toHaveLength(28);
    expect(result.be_account_calculations).toEqual([]);
    expect(result.be_monthly_account_calculations).toEqual([]);
    expect(result.be_monthly_budget_calculations[0]).toMatchObject({
      id: expect.stringMatching(/^mbc\//u),
      entities_monthly_budget_id: expect.stringMatching(/^mb\//u),
      available_to_budget: 0,
      balance: 0,
      age_of_money: null,
      is_tombstone: false,
    });
    expect(result.be_monthly_subcategory_budget_calculations[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mcbc\//u),
        entities_monthly_subcategory_budget_id:
          expect.stringMatching(/^mcb\//u),
        balance: 0,
        goal_target: 0,
        goal_under_funded: null,
        overspending_affects_buffer: true,
        is_tombstone: false,
      }),
    );
  });

  test('uses the captured deterministic identity transformations', () => {
    const result = projectStockFreshPlanCalculations(createSnapshot());

    expect(
      result.be_monthly_budget_calculations.every(
        row =>
          String(row.id).replace(/^mbc\//u, 'mb/') ===
          row.entities_monthly_budget_id,
      ),
    ).toBe(true);
    expect(
      result.be_monthly_subcategory_budget_calculations.every(
        row =>
          String(row.id).replace(/^mcbc\//u, 'mcb/') ===
          row.entities_monthly_subcategory_budget_id,
      ),
    ).toBe(true);
  });

  test('fails closed when non-pristine state would require inferred formulas', () => {
    const snapshot = createSnapshot();
    expect(() =>
      projectStockFreshPlanCalculations({
        ...snapshot,
        entities: [
          ...snapshot.entities,
          {
            entityKind: 'be_transactions',
            entityId: 'transaction-1',
            isTombstone: false,
            payload: {},
          },
        ],
      }),
    ).toThrow('do not support be_transactions');
  });
});
