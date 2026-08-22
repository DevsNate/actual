import type { BudgetSnapshot } from '@actual-app/semantic-core';

import { buildStockBudgetBootstrap } from './stock-budget-bootstrap';
import { parseStockExpectedIncomeMutation } from './stock-expected-income';

describe('stock expected income', () => {
  test('admits the captured singleton creation and projects its bootstrap readback', () => {
    const snapshot = fixture();
    const parsed = parseStockExpectedIncomeMutation(
      {
        be_expected_income: {
          id: 'version-1',
          user_entered_income: 1234560,
          is_tombstone: false,
        },
      },
      snapshot,
    );

    expect(parsed).toMatchObject({
      expectedDeviceAdvance: 1,
      serverKnowledgeAdvance: 1,
      changedEntities: { be_expected_income: null },
    });
    const next = {
      ...snapshot,
      entities: [...snapshot.entities, ...(parsed?.changes ?? [])],
    };
    expect(buildStockBudgetBootstrap(next).be_expected_income).toEqual({
      id: 'version-1',
      short_budget_version_id: 3000002030081,
      user_entered_income: 1234560,
      is_tombstone: false,
    });
  });

  test('fails closed for an array, extra fields, missing short identity, or malformed persisted state', () => {
    const snapshot = fixture();
    const row = {
      id: 'version-1',
      user_entered_income: 1234560,
      is_tombstone: false,
    };
    expect(
      parseStockExpectedIncomeMutation({ be_expected_income: [row] }, snapshot),
    ).toBeNull();
    expect(
      parseStockExpectedIncomeMutation(
        { be_expected_income: { ...row, unknown: true } },
        snapshot,
      ),
    ).toBeNull();
    expect(
      parseStockExpectedIncomeMutation(
        { be_expected_income: row },
        { ...snapshot, shortBudgetVersionId: undefined },
      ),
    ).toBeNull();
    expect(
      parseStockExpectedIncomeMutation(
        { be_expected_income: row },
        {
          ...snapshot,
          entities: [
            ...snapshot.entities,
            {
              entityKind: 'be_expected_income',
              entityId: 'version-1',
              isTombstone: false,
              payload: {},
            },
          ],
        },
      ),
    ).toBeNull();
  });

  test('admits the captured edit of the existing singleton', () => {
    const snapshot = fixture();
    const existing = {
      entityKind: 'be_expected_income',
      entityId: 'version-1',
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        shortBudgetVersionId: 3000002030081,
        userEnteredIncome: 1234560,
      },
    };
    const parsed = parseStockExpectedIncomeMutation(
      {
        be_expected_income: {
          id: 'version-1',
          user_entered_income: 2345670,
          is_tombstone: false,
        },
      },
      {
        ...snapshot,
        serverKnowledge: 83,
        entities: [...snapshot.entities, existing],
      },
    );

    expect(parsed?.changes).toEqual([
      {
        ...existing,
        payload: { ...existing.payload, userEnteredIncome: 2345670 },
      },
    ]);
  });
});

function fixture(): BudgetSnapshot {
  return {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    shortBudgetVersionId: 3000002030081,
    name: 'Budget',
    serverKnowledge: 82,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      {
        entityKind: 'be_budget',
        entityId: 'version-1',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          budgetId: 'budget-1',
          budgetName: 'Budget',
          currencyFormat: {},
          dateFormat: {},
          source: null,
        },
      },
      {
        entityKind: 'be_monthly_budgets',
        entityId: 'mb/2026-08/version-1',
        isTombstone: false,
        payload: {
          budgetVersionId: 'version-1',
          month: '2026-08-01',
          bootstrapRole: 'current',
        },
      },
    ],
  };
}
