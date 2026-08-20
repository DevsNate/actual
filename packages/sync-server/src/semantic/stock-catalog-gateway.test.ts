import type {
  AuthenticatedPrincipal,
  BudgetVersionPlanReader,
  CatalogCommandWriter,
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
  catalogWriter: CatalogCommandWriter = { commitCatalogCommand: vi.fn() },
) {
  const result = express();
  result.use(
    '/api/v1',
    createStockCatalogGateway({
      catalogReader,
      catalogWriter,
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

function initialUserRequest() {
  return {
    operation_name: 'getInitialUserData',
    request_data: JSON.stringify({
      device_info: { id: 'device-1', device_os: 'web' },
    }),
  };
}

function familyRequest() {
  return {
    operation_name: 'syncFamilyData',
    request_data: JSON.stringify({
      family_id: 'user-1',
      schema_version: 4,
      schema_version_of_knowledge: 4,
      starting_device_knowledge: 0,
      ending_device_knowledge: 0,
      device_knowledge_of_server: 0,
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
        ce_users: [
          expect.objectContaining({
            id: 'user-1',
            email: 'person@example.com',
            first_name: 'Person',
          }),
        ],
        ce_user_settings: [],
        ce_user_privacy_policy_agreements: [
          {
            id: 'privacy-agreement:user-1:4-26',
            version: '4-26',
            source: 'signup',
            client_agreed_at: '1970-01-01T00:00:00.000Z',
            server_received_at: '1970-01-01T00:00:00.000Z',
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

  test('durably acknowledges the captured one-time user setting write', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn().mockResolvedValue({
        knowledge: { principalId: 'user-1', currentServerKnowledge: 4 },
        memberships: [],
      }),
    };
    const catalogWriter: CatalogCommandWriter = {
      commitCatalogCommand: vi.fn().mockImplementation(async command => ({
        replayed: false,
        serverKnowledge: 5,
        endingDeviceKnowledge: 2,
        response: command.response,
      })),
    };
    const response = await stockRequest(
      app(catalogReader, undefined, undefined, undefined, catalogWriter),
      syncRequest({
        starting_device_knowledge: 0,
        ending_device_knowledge: 2,
        device_knowledge_of_server: 4,
        changed_entities: {
          ce_user_settings: [
            {
              id: 'setting-1',
              user_id: 'user-1',
              setting_name: 'one_time_events',
              setting_value: '["event"]',
            },
          ],
        },
      }),
    ).expect(200);

    expect(response.body).toEqual({
      error: null,
      schema_version_of_response: 16,
      server_knowledge_of_device: 2,
      current_server_knowledge: 5,
      changed_entities: {},
    });
    expect(catalogWriter.commitCatalogCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'user-1',
        originDeviceId: 'device-1',
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 4,
        commandKind: 'stock-sync-user-settings',
        changes: [
          {
            entityKind: 'ce_user_settings',
            entityId: 'setting-1',
            isTombstone: false,
            payload: expect.objectContaining({
              setting_name: 'one_time_events',
            }),
          },
        ],
      }),
    );
  });

  test('projects the captured initial-user envelope from Actual authority', async () => {
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
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue({
        planId: 'plan-1',
        budgetVersionId: 'version-1',
        name: 'My Plan',
        serverKnowledge: 2,
        currencyFormat: { iso_code: 'USD' },
        dateFormat: { format: 'MM/DD/YYYY' },
        entities: [],
      }),
    };

    const response = await stockRequest(
      app(catalogReader, undefined, planReader),
      initialUserRequest(),
    ).expect(200);

    expect(response.body).toMatchObject({
      error: null,
      session_token: 'session',
      user: {
        id: 'user-1',
        email: 'person@example.com',
        first_name: 'Person',
      },
      user_budget: {
        id: 'membership-1',
        budget_id: 'plan-1',
        user_id: 'user-1',
        permissions: 1,
      },
      budget_version: {
        id: 'version-1',
        budget_id: 'plan-1',
        budget_name: 'My Plan',
        currency_format: '{"iso_code":"USD"}',
        date_format: '{"format":"MM/DD/YYYY"}',
      },
    });
  });

  test('fails closed when initial-user data has no live readable plan', async () => {
    const catalogReader: CatalogReader = {
      readCatalog: vi.fn().mockResolvedValue({
        knowledge: { principalId: 'user-1', currentServerKnowledge: 4 },
        memberships: [],
      }),
    };

    await stockRequest(app(catalogReader), initialUserRequest()).expect(409, {
      error: { id: 'initial_budget_unavailable' },
    });
  });

  test('projects the captured family envelope from live memberships', async () => {
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

    await stockRequest(app(catalogReader), familyRequest()).expect(200, {
      error: null,
      schema_version_of_response: 4,
      schema_version_of_server: 4,
      server_knowledge_of_device: 0,
      current_server_knowledge: 4,
      changed_entities: {
        fe_family: { id: 'user-1', is_tombstone: false },
        fe_family_members: [
          {
            id: 'user-1',
            user_id: 'user-1',
            family_id: 'user-1',
            family_role: 'plan_manager',
            first_name: 'Person',
            display_initial: 'P',
            email: 'person@example.com',
            owned_budget_ids: ['plan-1'],
            shared_budget_ids: [],
            sort_index: 0,
            is_tombstone: false,
          },
        ],
      },
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
      operation_name: 'unsupportedOperation',
      request_data: '{}',
    }).expect(501, { error: { id: 'unsupported_operation' } });
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });
});
