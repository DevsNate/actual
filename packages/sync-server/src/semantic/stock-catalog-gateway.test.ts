import type {
  AuthenticatedPrincipal,
  BudgetVersionPlanReader,
  CatalogReader,
} from '@actual-app/semantic-core';
import { AuthenticationError } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import type { StockBudgetChangeWriter } from './stock-budget-operation';
import { createStockCatalogGateway } from './stock-catalog-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

function app(
  catalogReader: CatalogReader,
  resolvePrincipal: (token: string) => AuthenticatedPrincipal = () => principal,
  planReader: BudgetVersionPlanReader = {
    readPlanByBudgetVersion: vi.fn(),
  },
  changeWriter: StockBudgetChangeWriter = { commitChangeSet: vi.fn() },
) {
  const result = express();
  result.use(
    '/api/v1',
    createStockCatalogGateway({
      catalogReader,
      planReader,
      changeWriter,
      resolvePrincipal,
    }),
  );
  return result;
}

function syncRequest(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    operation_name: 'syncCatalogData',
    request_data: JSON.stringify({
      user_id: 'user-1',
      schema_version: 16,
      schema_version_of_knowledge: 16,
      starting_device_knowledge: 0,
      ending_device_knowledge: 0,
      device_knowledge_of_server: 0,
      changed_entities: {},
      ...overrides,
    }),
  };
}

function stockRequest(application: express.Express, body = syncRequest()) {
  return request(application)
    .post('/api/v1/catalog')
    .set('x-session-token', 'session')
    .set('x-ynab-api-version', '2026-01-01')
    .set('x-ynab-client-request-id', 'request-1')
    .set('x-ynab-device-id', 'device-1')
    .type('form')
    .send(body);
}

describe('stock catalog gateway', () => {
  test('authenticates through the retained Actual session authority', async () => {
    const catalogReader: CatalogReader = { readCatalog: vi.fn() };
    const application = app(catalogReader, token => {
      if (!token) {
        throw new AuthenticationError('invalid-session', 'missing');
      }
      return principal;
    });

    await request(application)
      .post('/api/v1/catalog')
      .type('form')
      .send(syncRequest())
      .expect(401, { error: { id: 'invalid-session' } });
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });

  test('projects a complete stock membership snapshot from canonical state', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn().mockResolvedValue({
        knowledge: { principalId: 'user-1', currentServerKnowledge: 4 },
        memberships: [
          {
            id: 'membership-1',
            planId: 'plan-1',
            budgetVersionId: 'version-1',
            principalId: 'user-1',
            name: 'My Plan',
            permissions: 1,
            lastModifiedAt: '2026-08-17T00:00:00.000Z',
            source: null,
            isTombstone: false,
          },
        ],
      }),
    };

    const response = await stockRequest(app(catalogReader)).expect(200);
    expect(response.headers['x-ynab-client-request-id']).toBe('request-1');
    expect(response.body).toEqual({
      error: null,
      schema_version_of_response: 16,
      server_knowledge_of_device: 0,
      current_server_knowledge: 4,
      changed_entities: {
        ce_user_budgets: [
          {
            id: 'membership-1',
            budget_id: 'plan-1',
            budget_version_id: 'version-1',
            user_id: 'user-1',
            budget_name: 'My Plan',
            permissions: 1,
            source: null,
            is_tombstone: false,
            last_modified_at: '2026-08-17T00:00:00.000Z',
          },
        ],
      },
    });
  });

  test('returns an empty delta when the client already has current knowledge', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn().mockResolvedValue({
        knowledge: { principalId: 'user-1', currentServerKnowledge: 4 },
        memberships: [],
      }),
    };

    await stockRequest(
      app(catalogReader),
      syncRequest({ device_knowledge_of_server: 4 }),
    ).expect(200, {
      error: null,
      schema_version_of_response: 16,
      server_knowledge_of_device: 0,
      current_server_knowledge: 4,
      changed_entities: { ce_user_budgets: [] },
    });
  });

  test('fails closed for unimplemented writes and operations', async () => {
    const catalogReader: CatalogReader = { readCatalog: vi.fn() };
    const application = app(catalogReader);
    await stockRequest(
      application,
      syncRequest({ changed_entities: { ce_user_budgets: [{}] } }),
    ).expect(400, { error: { id: 'invalid_catalog_request' } });
    await stockRequest(application, {
      operation_name: 'syncFamilyData',
      request_data: '{}',
    }).expect(501, { error: { id: 'unsupported_operation' } });
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });
});
