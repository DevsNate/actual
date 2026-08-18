import type {
  AuthenticatedPrincipal,
  BudgetVersionPlanReader,
  CatalogReader,
} from '@actual-app/semantic-core';
import { buildStockPlanBootstrap } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createStockCatalogGateway } from './stock-catalog-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

function createSnapshot() {
  let sequence = 0;
  return {
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 29,
    currencyFormat: {},
    dateFormat: {},
    entities: buildStockPlanBootstrap({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  };
}

function application(planReader: BudgetVersionPlanReader) {
  const result = express();
  const catalogReader: CatalogReader = { readCatalog: vi.fn() };
  result.use(
    '/api/v1',
    createStockCatalogGateway({
      catalogReader,
      planReader,
      resolvePrincipal: () => principal,
    }),
  );
  return result;
}

function budgetRequest(syncType: string, overrides = {}) {
  return {
    operation_name: 'syncBudgetData',
    request_data: JSON.stringify({
      budget_version_id: 'version-1',
      sync_type: syncType,
      calculated_entities_included: false,
      schema_version: 44,
      schema_version_of_knowledge: 44,
      starting_device_knowledge: 0,
      ending_device_knowledge: 0,
      device_knowledge_of_server: 0,
      changed_entities: {},
      ...overrides,
    }),
  };
}

function stockRequest(
  planReader: BudgetVersionPlanReader,
  syncType: string,
  overrides = {},
) {
  return request(application(planReader))
    .post('/api/v1/catalog')
    .set('x-session-token', 'session')
    .set('x-ynab-api-version', '2026-01-01')
    .set('x-ynab-client-request-id', 'request-1')
    .set('x-ynab-device-id', 'device-1')
    .type('form')
    .send(budgetRequest(syncType, overrides));
}

describe('stock budget gateway', () => {
  test('returns the exact fresh-plan bootstrap table surface', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };

    const response = await stockRequest(planReader, 'bootstrap').expect(200);
    expect(response.headers['x-ynab-client-request-id']).toBe('request-1');
    expect(response.body).toMatchObject({
      error: null,
      schema_version_of_response: 44,
      schema_version_of_server: 44,
      server_knowledge_of_device: 0,
      current_server_knowledge: 29,
      changed_entities: {
        first_month: '2026-08-01',
        last_month: '2026-08-01',
        be_budget: { id: 'version-1', budget_name: 'Plan' },
      },
    });
    expect(Object.keys(response.body.changed_entities).sort()).toEqual([
      'be_account_calculations',
      'be_account_mappings',
      'be_accounts',
      'be_budget',
      'be_expected_income',
      'be_master_categories',
      'be_monthly_account_calculations',
      'be_monthly_budget_calculations',
      'be_monthly_budgets',
      'be_monthly_subcategory_budget_calculations',
      'be_monthly_subcategory_budgets',
      'be_onboarding_events',
      'be_onboarding_targets',
      'be_payee_rename_conditions',
      'be_payees',
      'be_scheduled_subtransactions',
      'be_scheduled_transactions',
      'be_settings',
      'be_subcategories',
      'be_subtransactions',
      'be_transaction_images',
      'be_transactions',
      'first_month',
      'last_month',
    ]);
    expect(
      response.body.changed_entities.be_monthly_budget_calculations,
    ).toHaveLength(2);
    expect(
      response.body.changed_entities.be_monthly_subcategory_budget_calculations,
    ).toHaveLength(28);
    expect(planReader.readPlanByBudgetVersion).toHaveBeenCalledWith(
      'user-1',
      'version-1',
    );
  });

  test('returns the admitted empty backfill surface', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };

    const response = await stockRequest(planReader, 'backfill').expect(200);
    expect(response.body.changed_entities).toMatchObject({
      first_month: '2026-08-01',
      last_month: '2026-08-01',
      be_money_movements: [],
      be_monthly_budgets: [],
      be_transactions: [],
    });
    expect(Object.keys(response.body.changed_entities)).toHaveLength(13);
  });

  test('fails closed for writes, deltas, and unauthorized versions', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(null),
    };
    await stockRequest(planReader, 'bootstrap').expect(403, {
      error: { id: 'user_does_not_have_read_permissions' },
    });
    await stockRequest(planReader, 'delta').expect(501, {
      error: { id: 'unsupported_budget_sync_type' },
    });
    await stockRequest(planReader, 'bootstrap', {
      changed_entities: { be_transactions: [{}] },
    }).expect(400, { error: { id: 'invalid_budget_request' } });
  });
});
