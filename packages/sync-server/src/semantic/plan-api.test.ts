import type {
  AuthenticatedPrincipal,
  CatalogReader,
  CreatePlanCommand,
  PlanCreator,
  PlanReader,
} from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createSemanticPlanHandlers } from './plan-api';
import { createPlanCreationService } from './plan-creation-service';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

describe('semantic plan API', () => {
  test('reads only an authenticated principal plan snapshot', async () => {
    const planCreator: PlanCreator = { createPlan: vi.fn() };
    const planReader: PlanReader = {
      readPlan: vi.fn().mockResolvedValue({
        planId: 'plan-1',
        budgetVersionId: 'version-1',
        name: 'Plan',
        serverKnowledge: 2,
        currencyFormat: { iso_code: 'USD' },
        dateFormat: { format: 'MM/DD/YYYY' },
        entities: [],
      }),
    };
    const app = createApp(planCreator, undefined, planReader);
    await request(app)
      .get('/semantic/v1/plans/plan-1')
      .set('x-actual-token', 'actual-session')
      .expect(200);
    expect(planReader.readPlan).toHaveBeenCalledWith('principal-1', 'plan-1');
  });

  test('creates the complete PLAN-001 bootstrap for the authenticated principal', async () => {
    let command: CreatePlanCommand | undefined;
    const planCreator: PlanCreator = {
      createPlan: vi.fn(async value => {
        command = value;
        return {
          replayed: false,
          catalogServerKnowledge: 8,
          budgetServerKnowledge: 1,
          response: value.response,
        };
      }),
    };
    const app = createApp(planCreator);

    await request(app)
      .post('/semantic/v1/plans')
      .set('x-actual-token', 'actual-session')
      .set('x-semantic-device-id', 'web-device-1')
      .set('idempotency-key', 'request-1')
      .send({
        name: 'Plan Create Trace',
        currency_format: { iso_code: 'USD' },
        date_format: { format: 'MM/DD/YYYY' },
      })
      .expect(201, {
        status: 'ok',
        data: {
          budget_id: 'id-1',
          budget_version_id: 'id-2',
          catalog_server_knowledge: 8,
          budget_server_knowledge: 1,
          replayed: false,
        },
      });

    expect(command).toMatchObject({
      planId: 'id-1',
      budgetVersionId: 'id-2',
      membershipId: 'id-3',
      principalId: 'principal-1',
      originDeviceId: 'web-device-1',
      expectedCatalogServerKnowledge: 7,
      name: 'Plan Create Trace',
      permissions: 1,
    });
    expect(command?.entities).toHaveLength(58);
    expect(
      command?.entities.some(
        entity => entity.payload.settingName === 'budget_views',
      ),
    ).toBe(false);
    expect(
      command?.entities.find(
        entity => entity.payload.name === '🌳 YNAB subscription',
      )?.payload.goalTargetDate,
    ).toBe('2027-09-19');
  });

  test('requires authentication, device identity, idempotency, and formats', async () => {
    const planCreator: PlanCreator = { createPlan: vi.fn() };
    const app = createApp(planCreator, token => {
      if (!token) {
        throw new Error('unexpected authentication error in fixture');
      }
      return principal;
    });

    await request(app)
      .post('/semantic/v1/plans')
      .set('x-actual-token', 'actual-session')
      .send({ name: 'Plan' })
      .expect(400, {
        status: 'error',
        reason: 'invalid-plan-creation-request',
      });
    expect(planCreator.createPlan).not.toHaveBeenCalled();
  });
});

function createApp(
  planCreator: PlanCreator,
  resolvePrincipal:
    | ((sessionToken: string) => AuthenticatedPrincipal)
    | undefined = () => principal,
  planReader: PlanReader = { readPlan: vi.fn().mockResolvedValue(null) },
): express.Express {
  let nextId = 0;
  const catalogReader: CatalogReader = {
    readCatalog: vi.fn().mockResolvedValue({
      knowledge: {
        principalId: 'principal-1',
        currentServerKnowledge: 7,
      },
      memberships: [],
    }),
  };
  const app = express();
  const planCreationService = createPlanCreationService({
    catalogReader,
    planCreator,
    allocateId: () => `id-${++nextId}`,
    now: () => new Date('2026-08-16T12:00:00.000Z'),
  });
  app.use(
    '/semantic/v1',
    createSemanticPlanHandlers({
      planCreationService,
      planReader,
      resolvePrincipal: resolvePrincipal ?? (() => principal),
    }),
  );
  return app;
}
