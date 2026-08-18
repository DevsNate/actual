import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';

import { getAccountDb } from '#account-db';

import { createPostgresSemanticCatalogHandlers } from './postgres-runtime';

const databaseUrl = process.env.SEMANTIC_POSTGRES_TEST_URL;
const integrationTest = databaseUrl ? describe : describe.skip;

integrationTest('semantic catalog runtime integration', () => {
  const userId = 'semantic-integration-user';
  const token = 'semantic-integration-session';
  const planId = 'semantic-integration-plan';
  let createdPlanId = '';
  let createdVersionId = '';
  let createdCurrentMonth = '';
  let closeRuntime: (() => Promise<void>) | undefined;
  let seedPool: Pool | undefined;

  beforeAll(async () => {
    const accountDatabase = getAccountDb();
    accountDatabase.mutate(
      `INSERT INTO users
         (id, user_name, display_name, enabled, owner, role)
       VALUES (?, ?, ?, 1, 0, ?)`,
      [userId, 'semantic@example.com', 'Semantic User', 'BASIC'],
    );
    accountDatabase.mutate(
      `INSERT INTO sessions
         (token, user_id, expires_at, auth_method)
       VALUES (?, ?, ?, ?)`,
      [token, userId, Math.floor(Date.now() / 1000) + 60, 'password'],
    );

    seedPool = new Pool({ connectionString: databaseUrl });
    const runtime = await createPostgresSemanticCatalogHandlers(databaseUrl!);
    closeRuntime = runtime.close;
    await seedPool.query(
      `INSERT INTO semantic_plans
         (plan_id, budget_version_id, name)
       VALUES ($1, $2, $3)`,
      [planId, 'semantic-integration-version', 'Semantic Integration Plan'],
    );
    await seedPool.query(
      `INSERT INTO semantic_plan_memberships
         (membership_id, plan_id, principal_id, permissions)
       VALUES ($1, $2, $3, $4)`,
      ['semantic-integration-membership', planId, userId, 7],
    );
    await seedPool.query(
      `INSERT INTO semantic_catalog_knowledge
         (principal_id, server_knowledge)
       VALUES ($1, $2)`,
      [userId, 1],
    );

    const migrations = await seedPool.query<{ count: string }>(
      'SELECT count(*) FROM semantic_schema_migrations',
    );
    expect(migrations.rows[0]?.count).toBe('4');

    const app = express();
    app.use('/semantic/v1', runtime.handlers);
    app.use('/api/v1', runtime.stockHandlers);
    testApp = app;
  });

  afterAll(async () => {
    await seedPool?.end();
    await closeRuntime?.();
    const accountDatabase = getAccountDb();
    accountDatabase.mutate('DELETE FROM sessions WHERE token = ?', [token]);
    accountDatabase.mutate('DELETE FROM users WHERE id = ?', [userId]);
  });

  let testApp: express.Express;

  test('uses the retained Actual session to scope the PostgreSQL catalog', async () => {
    await request(testApp).get('/semantic/v1/catalog').expect(401);

    const response = await request(testApp)
      .get('/semantic/v1/catalog')
      .set('x-actual-token', token)
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      data: {
        knowledge: {
          principalId: userId,
          currentServerKnowledge: 1,
        },
        memberships: [
          {
            id: 'semantic-integration-membership',
            planId,
            budgetVersionId: 'semantic-integration-version',
            principalId: userId,
            name: 'Semantic Integration Plan',
            permissions: 7,
            lastModifiedAt: expect.any(String),
            source: null,
            isTombstone: false,
          },
        ],
      },
    });
  });

  test('projects the same catalog through the stock sync envelope', async () => {
    const response = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-catalog-request')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncCatalogData',
        request_data: JSON.stringify({
          user_id: userId,
          schema_version: 16,
          schema_version_of_knowledge: 16,
          starting_device_knowledge: 0,
          ending_device_knowledge: 0,
          device_knowledge_of_server: 0,
          changed_entities: {},
        }),
      })
      .expect(200);

    expect(response.headers['x-ynab-client-request-id']).toBe(
      'stock-catalog-request',
    );
    expect(response.body).toMatchObject({
      error: null,
      schema_version_of_response: 16,
      server_knowledge_of_device: 0,
      current_server_knowledge: 1,
      changed_entities: {
        ce_user_budgets: [
          {
            id: 'semantic-integration-membership',
            budget_id: planId,
            budget_version_id: 'semantic-integration-version',
            user_id: userId,
            budget_name: 'Semantic Integration Plan',
            permissions: 7,
            source: null,
            is_tombstone: false,
            last_modified_at: expect.any(String),
          },
        ],
      },
    });
  });

  test('creates a complete plan through the retained Actual session', async () => {
    const response = await request(testApp)
      .post('/semantic/v1/plans')
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-create-request')
      .send({
        name: 'Semantic Created Plan',
        currency_format: {
          iso_code: 'USD',
          decimal_digits: 2,
          currency_symbol: '$',
        },
        date_format: { format: 'MM/DD/YYYY' },
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'ok',
      data: {
        catalog_server_knowledge: 2,
        budget_server_knowledge: 1,
        replayed: false,
      },
    });
    createdPlanId = response.body.data.budget_id as string;
    createdVersionId = response.body.data.budget_version_id as string;
    expect(createdPlanId).toBeTruthy();
    expect(createdVersionId).toBeTruthy();

    const counts = await seedPool!.query<{
      entity_count: string;
      catalog_receipts: string;
      budget_receipts: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_plan_entities WHERE plan_id = $1) AS entity_count,
         (SELECT count(*) FROM semantic_catalog_command_receipts WHERE principal_id = $2) AS catalog_receipts,
         (SELECT count(*) FROM semantic_device_receipts WHERE plan_id = $1) AS budget_receipts`,
      [createdPlanId, userId],
    );
    expect(counts.rows[0]).toEqual({
      entity_count: '58',
      catalog_receipts: '1',
      budget_receipts: '1',
    });

    const stockBootstrap = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-budget-bootstrap')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: createdVersionId,
          sync_type: 'bootstrap',
          calculated_entities_included: false,
          schema_version: 44,
          schema_version_of_knowledge: 44,
          starting_device_knowledge: 0,
          ending_device_knowledge: 0,
          device_knowledge_of_server: 0,
          changed_entities: {},
        }),
      })
      .expect(200);
    expect(stockBootstrap.body).toMatchObject({
      error: null,
      schema_version_of_response: 44,
      schema_version_of_server: 44,
      current_server_knowledge: 1,
      changed_entities: {
        be_budget: {
          id: createdVersionId,
          budget_name: 'Semantic Created Plan',
        },
        first_month: expect.any(String),
        last_month: expect.any(String),
      },
    });
    expect(
      stockBootstrap.body.changed_entities.be_monthly_budget_calculations,
    ).toHaveLength(2);
    expect(
      stockBootstrap.body.changed_entities
        .be_monthly_subcategory_budget_calculations,
    ).toHaveLength(28);
    createdCurrentMonth = stockBootstrap.body.changed_entities
      .first_month as string;

    const replay = await request(testApp)
      .post('/semantic/v1/plans')
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-create-request')
      .send({
        name: 'Semantic Created Plan',
        currency_format: {
          iso_code: 'USD',
          decimal_digits: 2,
          currency_symbol: '$',
        },
        date_format: { format: 'MM/DD/YYYY' },
      })
      .expect(200);
    expect(replay.body.data).toMatchObject({
      budget_id: createdPlanId,
      budget_version_id: createdVersionId,
      catalog_server_knowledge: 2,
      budget_server_knowledge: 1,
      replayed: true,
    });
  });

  test('atomically ingests and replays the admitted opened-budget delta', async () => {
    const priorMonth = new Date(
      `${createdCurrentMonth.slice(0, 7)}-01T00:00:00.000Z`,
    );
    priorMonth.setUTCMonth(priorMonth.getUTCMonth() - 1);
    const priorMonthString = priorMonth.toISOString().slice(0, 10);
    const requestData = JSON.stringify({
      budget_version_id: createdVersionId,
      sync_type: 'delta',
      calculated_entities_included: false,
      schema_version: 44,
      schema_version_of_knowledge: 44,
      starting_device_knowledge: 0,
      ending_device_knowledge: 2,
      device_knowledge_of_server: 1,
      changed_entities: {
        be_monthly_budgets: [
          {
            id: `mb/${priorMonthString.slice(0, 7)}/${createdVersionId}`,
            is_tombstone: false,
            month: priorMonthString,
            note: '',
          },
        ],
        be_onboarding_events: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            is_tombstone: false,
            event_name: 'opened_budget',
            user_id: userId,
            created_at: '2026-08-17T01:02:03.456Z',
            updated_at: '2026-08-17T01:02:03.456Z',
          },
        ],
      },
    });
    const sendDelta = () =>
      request(testApp)
        .post('/api/v1/catalog')
        .set('x-session-token', token)
        .set('x-ynab-api-version', '2026-01-01')
        .set('x-ynab-client-request-id', 'stock-opened-budget-delta')
        .set('x-ynab-device-id', 'stock-web-device')
        .type('form')
        .send({ operation_name: 'syncBudgetData', request_data: requestData });

    const first = await sendDelta().expect(200);
    expect(first.body).toMatchObject({
      current_server_knowledge: 2,
      server_knowledge_of_device: 2,
      changed_entities: {
        be_budget: null,
        be_expected_income: null,
        first_month: createdCurrentMonth,
        last_month: createdCurrentMonth,
      },
    });
    const replay = await sendDelta().expect(200);
    expect(replay.body).toEqual(first.body);

    const counts = await seedPool!.query<{
      entity_count: string;
      change_sets: string;
      receipts: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_plan_entities WHERE plan_id = $1) AS entity_count,
         (SELECT count(*) FROM semantic_change_sets WHERE plan_id = $1) AS change_sets,
         (SELECT count(*) FROM semantic_device_receipts WHERE plan_id = $1) AS receipts`,
      [createdPlanId],
    );
    expect(counts.rows[0]).toEqual({
      entity_count: '60',
      change_sets: '2',
      receipts: '2',
    });

    const emptyDelta = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-empty-budget-delta')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: createdVersionId,
          sync_type: 'delta',
          calculated_entities_included: false,
          schema_version: 44,
          schema_version_of_knowledge: 44,
          starting_device_knowledge: 2,
          ending_device_knowledge: 2,
          device_knowledge_of_server: 2,
          changed_entities: {},
        }),
      })
      .expect(200);
    expect(emptyDelta.body).toMatchObject({
      current_server_knowledge: 2,
      server_knowledge_of_device: 2,
      changed_entities: {
        first_month: createdCurrentMonth,
        last_month: createdCurrentMonth,
      },
    });
  });

  test('renames both projections and tombstones only catalog membership', async () => {
    const rename = await request(testApp)
      .patch(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Semantic Renamed Plan' })
      .expect(200);
    expect(rename.body.data).toMatchObject({
      budget_id: createdPlanId,
      name: 'Semantic Renamed Plan',
      catalog_server_knowledge: 3,
      budget_server_knowledge: 3,
      replayed: false,
    });

    const replay = await request(testApp)
      .patch(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Semantic Renamed Plan' })
      .expect(200);
    expect(replay.body.data).toMatchObject({
      catalog_server_knowledge: 3,
      budget_server_knowledge: 3,
      replayed: true,
    });
    await request(testApp)
      .patch(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Conflicting Name' })
      .expect(409, {
        status: 'error',
        reason: 'IDEMPOTENCY_CONFLICT',
      });

    const renamed = await seedPool!.query<{
      plan_name: string;
      budget_name: string;
      catalog_changes: string;
      budget_changes: string;
    }>(
      `SELECT p.name AS plan_name,
              e.payload->>'budgetName' AS budget_name,
              (SELECT count(*) FROM semantic_catalog_change_sets
               WHERE principal_id = $2) AS catalog_changes,
              (SELECT count(*) FROM semantic_change_sets
               WHERE plan_id = $1) AS budget_changes
       FROM semantic_plans p
       JOIN semantic_plan_entities e
         ON e.plan_id = p.plan_id AND e.entity_kind = 'be_budget'
       WHERE p.plan_id = $1`,
      [createdPlanId, userId],
    );
    expect(renamed.rows[0]).toEqual({
      plan_name: 'Semantic Renamed Plan',
      budget_name: 'Semantic Renamed Plan',
      catalog_changes: '2',
      budget_changes: '3',
    });
    const materialized = await request(testApp)
      .get(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .expect(200);
    expect(materialized.body.data).toMatchObject({
      planId: createdPlanId,
      name: 'Semantic Renamed Plan',
      serverKnowledge: 3,
    });
    expect(materialized.body.data.entities).toHaveLength(60);

    await request(testApp)
      .delete(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-delete-request')
      .expect(200, {
        status: 'ok',
        data: {
          budget_id: createdPlanId,
          deleted: true,
          catalog_server_knowledge: 4,
          budget_server_knowledge: null,
          replayed: false,
        },
      });
    const deleteReplay = await request(testApp)
      .delete(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-delete-request')
      .expect(200);
    expect(deleteReplay.body.data).toMatchObject({
      catalog_server_knowledge: 4,
      budget_server_knowledge: null,
      replayed: true,
    });

    const catalog = await request(testApp)
      .get('/semantic/v1/catalog')
      .set('x-actual-token', token)
      .expect(200);
    expect(
      catalog.body.data.memberships.find(
        (membership: { planId: string }) => membership.planId === createdPlanId,
      ),
    ).toMatchObject({
      name: 'Unknown',
      isTombstone: true,
    });
    const retained = await seedPool!.query<{
      plan_tombstone: boolean;
      entity_count: string;
      budget_knowledge: string;
    }>(
      `SELECT p.is_tombstone AS plan_tombstone,
              (SELECT count(*) FROM semantic_plan_entities WHERE plan_id = $1) AS entity_count,
              p.server_knowledge AS budget_knowledge
       FROM semantic_plans p WHERE p.plan_id = $1`,
      [createdPlanId],
    );
    expect(retained.rows[0]).toEqual({
      plan_tombstone: false,
      entity_count: '60',
      budget_knowledge: '3',
    });
    await request(testApp)
      .get(`/semantic/v1/plans/${createdPlanId}`)
      .set('x-actual-token', token)
      .expect(404, { status: 'error', reason: 'plan-not-found' });
  });
});
