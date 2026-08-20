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
  const budgetId = 'semantic-integration-plan';
  let createdBudgetId = '';
  let createdVersionId = '';
  let createdCurrentMonth = '';
  let createdAccountId = '';
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
      `INSERT INTO semantic_budgets
         (budget_id, budget_version_id, name)
       VALUES ($1, $2, $3)`,
      [budgetId, 'semantic-integration-version', 'Semantic Integration Plan'],
    );
    await seedPool.query(
      `INSERT INTO semantic_budget_memberships
         (membership_id, budget_id, principal_id, permissions)
       VALUES ($1, $2, $3, $4)`,
      ['semantic-integration-membership', budgetId, userId, 7],
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
    expect(migrations.rows[0]?.count).toBe('8');

    const app = express();
    app.use('/semantic/v1', runtime.handlers);
    app.use('/api/v1', runtime.stockHandlers);
    app.use('/api', runtime.stockBudgetLifecycleHandlers);
    app.use('/api', runtime.stockAccountHandlers);
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
            budgetId,
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
            budget_id: budgetId,
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

  test('creates and replays a complete plan through the captured stock endpoint', async () => {
    const response = await request(testApp)
      .post('/api/budgets')
      .set('authorization', `Token ${token}`)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-device-id', 'stock-web-device')
      .set('x-ynab-client-request-id', 'stock-create-request')
      .send({
        budget: {
          name: 'Stock Created Plan',
          currency_format: JSON.stringify({
            iso_code: 'USD',
            decimal_digits: 2,
            currency_symbol: '$',
          }),
          date_format: JSON.stringify({ format: 'MM/DD/YYYY' }),
        },
      })
      .expect(201);

    expect(response.headers['x-ynab-client-request-id']).toBe(
      'stock-create-request',
    );
    expect(response.body).toEqual({ id: expect.any(String) });
    createdVersionId = response.body.id as string;
    expect(createdVersionId).toBeTruthy();

    const createdBudget = await seedPool!.query<{ budget_id: string }>(
      `SELECT budget_id
         FROM semantic_budgets
        WHERE budget_version_id = $1`,
      [createdVersionId],
    );
    createdBudgetId = createdBudget.rows[0]?.budget_id ?? '';
    expect(createdBudgetId).toBeTruthy();

    const counts = await seedPool!.query<{
      entity_count: string;
      catalog_receipts: string;
      budget_receipts: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_budget_entities WHERE budget_id = $1) AS entity_count,
         (SELECT count(*) FROM semantic_catalog_command_receipts WHERE principal_id = $2) AS catalog_receipts,
         (SELECT count(*) FROM semantic_budget_device_receipts WHERE budget_id = $1) AS budget_receipts`,
      [createdBudgetId, userId],
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
          budget_name: 'Stock Created Plan',
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
      .post('/api/budgets')
      .set('authorization', `Token ${token}`)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-device-id', 'stock-web-device')
      .set('x-ynab-client-request-id', 'stock-create-request')
      .send({
        budget: {
          name: 'Stock Created Plan',
          currency_format: JSON.stringify({
            iso_code: 'USD',
            decimal_digits: 2,
            currency_symbol: '$',
          }),
          date_format: JSON.stringify({ format: 'MM/DD/YYYY' }),
        },
      })
      .expect(200);
    expect(replay.body).toEqual({ id: createdVersionId });
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
         (SELECT count(*) FROM semantic_budget_entities WHERE budget_id = $1) AS entity_count,
         (SELECT count(*) FROM semantic_budget_change_sets WHERE budget_id = $1) AS change_sets,
         (SELECT count(*) FROM semantic_budget_device_receipts WHERE budget_id = $1) AS receipts`,
      [createdBudgetId],
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

  test('creates and replays the admitted unlinked Checking account group', async () => {
    const body = {
      name: 'Account Capture 1',
      type: 'checking',
      openingBalance: 123450,
      openingDate: '2026-08-17',
    };
    const createAccount = () =>
      request(testApp)
        .post(`/semantic/v1/budgets/${createdBudgetId}/accounts`)
        .set('x-actual-token', token)
        .set('x-semantic-device-id', 'semantic-web-device')
        .set('idempotency-key', 'semantic-account-create')
        .send(body);

    const first = await createAccount().expect(201);
    expect(first.body).toMatchObject({
      status: 'ok',
      data: {
        account: {
          accountId: expect.any(String),
          name: 'Account Capture 1',
          type: 'checking',
          openingBalance: 123450,
          budgetId: createdBudgetId,
        },
        budget_server_knowledge: 4,
        replayed: false,
      },
    });
    createdAccountId = first.body.data.account.accountId as string;
    expect(createdAccountId).toMatch(/^[0-9a-f-]{36}$/u);

    const replay = await createAccount().expect(200);
    expect(replay.body.data).toEqual({
      ...first.body.data,
      replayed: true,
    });

    const counts = await seedPool!.query<{
      accounts: string;
      payees: string;
      transactions: string;
      entity_count: string;
      change_sets: string;
      receipts: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_accounts WHERE budget_id = $1) AS accounts,
         (SELECT count(*) FROM semantic_payees WHERE budget_id = $1) AS payees,
         (SELECT count(*) FROM semantic_transactions WHERE budget_id = $1) AS transactions,
         (SELECT count(*) FROM semantic_budget_entities WHERE budget_id = $1) AS entity_count,
         (SELECT count(*) FROM semantic_budget_change_sets WHERE budget_id = $1) AS change_sets,
         (SELECT count(*) FROM semantic_budget_device_receipts WHERE budget_id = $1) AS receipts`,
      [createdBudgetId],
    );
    expect(counts.rows[0]).toEqual({
      accounts: '1',
      payees: '1',
      transactions: '1',
      entity_count: '63',
      change_sets: '3',
      receipts: '3',
    });

    const stockBootstrap = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-account-bootstrap')
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
      current_server_knowledge: 4,
      changed_entities: {
        be_accounts: [
          {
            id: createdAccountId,
            account_name: 'Account Capture 1',
            account_type: 'Checking',
            on_budget: true,
            is_closed: false,
          },
        ],
        be_account_calculations: [
          {
            id: `ac/${createdAccountId}`,
            cleared_balance: 123450,
            transaction_count: 1,
          },
        ],
      },
    });
    expect(stockBootstrap.body.changed_entities.be_transactions).toEqual([
      expect.objectContaining({
        entities_account_id: createdAccountId,
        amount: 123450,
        cash_amount: 123450,
        credit_amount: 0,
        date: '2026-08-17',
        cleared: 'Cleared',
        accepted: true,
      }),
    ]);
    expect(
      stockBootstrap.body.changed_entities.be_monthly_account_calculations,
    ).toHaveLength(2);
    expect(
      stockBootstrap.body.changed_entities.be_monthly_budget_calculations,
    ).toEqual([
      expect.objectContaining({
        immediate_income: 123450,
        available_to_budget: 123450,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 123450,
      }),
    ]);
  });

  test('renames both projections and tombstones only catalog membership', async () => {
    const rename = await request(testApp)
      .patch(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Semantic Renamed Plan' })
      .expect(200);
    expect(rename.body.data).toMatchObject({
      budget_id: createdBudgetId,
      name: 'Semantic Renamed Plan',
      catalog_server_knowledge: 3,
      budget_server_knowledge: 5,
      replayed: false,
    });

    const replay = await request(testApp)
      .patch(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Semantic Renamed Plan' })
      .expect(200);
    expect(replay.body.data).toMatchObject({
      catalog_server_knowledge: 3,
      budget_server_knowledge: 5,
      replayed: true,
    });
    await request(testApp)
      .patch(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-rename-request')
      .send({ name: 'Conflicting Name' })
      .expect(409, {
        status: 'error',
        reason: 'IDEMPOTENCY_CONFLICT',
      });

    const renamed = await seedPool!.query<{
      budget_name_value: string;
      budget_name: string;
      catalog_changes: string;
      budget_changes: string;
    }>(
      `SELECT p.name AS budget_name_value,
              e.payload->>'budgetName' AS budget_name,
              (SELECT count(*) FROM semantic_catalog_change_sets
               WHERE principal_id = $2) AS catalog_changes,
              (SELECT count(*) FROM semantic_budget_change_sets
               WHERE budget_id = $1) AS budget_changes
       FROM semantic_budgets p
       JOIN semantic_budget_entities e
         ON e.budget_id = p.budget_id AND e.entity_kind = 'be_budget'
       WHERE p.budget_id = $1`,
      [createdBudgetId, userId],
    );
    expect(renamed.rows[0]).toEqual({
      budget_name_value: 'Semantic Renamed Plan',
      budget_name: 'Semantic Renamed Plan',
      catalog_changes: '2',
      budget_changes: '4',
    });
    const materialized = await request(testApp)
      .get(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .expect(200);
    expect(materialized.body.data).toMatchObject({
      budgetId: createdBudgetId,
      name: 'Semantic Renamed Plan',
      serverKnowledge: 5,
    });
    expect(materialized.body.data.entities).toHaveLength(63);

    await request(testApp)
      .delete(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'semantic-delete-request')
      .expect(200, {
        status: 'ok',
        data: {
          budget_id: createdBudgetId,
          deleted: true,
          catalog_server_knowledge: 4,
          budget_server_knowledge: null,
          replayed: false,
        },
      });
    const deleteReplay = await request(testApp)
      .delete(`/semantic/v1/budgets/${createdBudgetId}`)
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
        (membership: { budgetId: string }) =>
          membership.budgetId === createdBudgetId,
      ),
    ).toMatchObject({
      name: 'Unknown',
      isTombstone: true,
    });
    const retained = await seedPool!.query<{
      budget_tombstone: boolean;
      entity_count: string;
      budget_knowledge: string;
    }>(
      `SELECT p.is_tombstone AS budget_tombstone,
              (SELECT count(*) FROM semantic_budget_entities WHERE budget_id = $1) AS entity_count,
              p.server_knowledge AS budget_knowledge
       FROM semantic_budgets p WHERE p.budget_id = $1`,
      [createdBudgetId],
    );
    expect(retained.rows[0]).toEqual({
      budget_tombstone: false,
      entity_count: '63',
      budget_knowledge: '5',
    });
    await request(testApp)
      .get(`/semantic/v1/budgets/${createdBudgetId}`)
      .set('x-actual-token', token)
      .expect(404, { status: 'error', reason: 'budget-not-found' });
  });

  test('serves the captured direct-import account route through PostgreSQL', async () => {
    const plan = await request(testApp)
      .post('/semantic/v1/budgets')
      .set('x-actual-token', token)
      .set('x-semantic-device-id', 'semantic-web-device')
      .set('idempotency-key', 'stock-account-plan')
      .send({
        name: 'Stock Account Route Plan',
        currency_format: {
          iso_code: 'USD',
          decimal_digits: 2,
          currency_symbol: '$',
        },
        date_format: { format: 'MM/DD/YYYY' },
      })
      .expect(201);
    const directBudgetId = plan.body.data.budget_id as string;
    const directVersionId = plan.body.data.budget_version_id as string;

    const created = await request(testApp)
      .post(`/api/direct_import/budgets/${directVersionId}/accounts`)
      .set('authorization', `Token token=${token}`)
      .set('x-ynab-api-version', '2026-01-01')
      .send({
        name: 'Account Capture 3',
        type: 'Checking',
        balance: 345670,
        starting_balance_date: '2026-08-17',
        debt_interest_rates: '{"2026-08-01":0}',
        debt_minimum_payments: '{"2026-08-01":0}',
        debt_escrow_amounts: null,
        paired_sub_category: null,
        is_migrating_to_debt_account: false,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      account_name: 'Account Capture 3',
      account_type: 'Checking',
      balance_millicents: 345670,
      budget_id: directVersionId,
    });
    const second = await request(testApp)
      .post(`/api/direct_import/budgets/${directVersionId}/accounts`)
      .set('authorization', `Token token=${token}`)
      .set('x-ynab-api-version', '2026-01-01')
      .send({
        name: 'Account Capture 2',
        type: 'Checking',
        balance: 234560,
        starting_balance_date: '2026-08-17',
        debt_interest_rates: '{"2026-08-01":0}',
        debt_minimum_payments: '{"2026-08-01":0}',
        debt_escrow_amounts: null,
        paired_sub_category: null,
        is_migrating_to_debt_account: false,
      })
      .expect(201);

    const persisted = await seedPool!.query<{ count: string }>(
      `SELECT count(*)
       FROM semantic_budget_entities
       WHERE budget_id = $1
         AND ((entity_kind = 'be_accounts' AND entity_id = ANY($2))
           OR (entity_kind = 'be_payees' AND payload->>'accountId' = ANY($2))
           OR (entity_kind = 'be_transactions' AND payload->>'accountId' = ANY($2)))`,
      [directBudgetId, [created.body.id, second.body.id]],
    );
    expect(persisted.rows[0]?.count).toBe('6');

    const bootstrap = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-multi-account-bootstrap')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: directVersionId,
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
    expect(
      bootstrap.body.changed_entities.be_account_calculations,
    ).toHaveLength(2);
    expect(
      bootstrap.body.changed_entities.be_monthly_account_calculations,
    ).toHaveLength(4);
    expect(
      bootstrap.body.changed_entities.be_monthly_budget_calculations,
    ).toEqual([
      expect.objectContaining({
        immediate_income: 580230,
        available_to_budget: 580230,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 580230,
      }),
    ]);

    const accountRow = bootstrap.body.changed_entities.be_accounts.find(
      (row: { id: string }) => row.id === created.body.id,
    );
    const payeeRow = bootstrap.body.changed_entities.be_payees.find(
      (row: { entities_account_id: string }) =>
        row.entities_account_id === created.body.id,
    );
    expect(accountRow).toBeDefined();
    expect(payeeRow).toBeDefined();
    const renamed = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-account-rename')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: directVersionId,
          sync_type: 'delta',
          calculated_entities_included: false,
          schema_version: 44,
          schema_version_of_knowledge: 44,
          starting_device_knowledge: 0,
          ending_device_knowledge: 2,
          device_knowledge_of_server: bootstrap.body.current_server_knowledge,
          changed_entities: {
            be_accounts: [{ ...accountRow, account_name: 'Account Renamed 3' }],
            be_payees: [{ ...payeeRow, name: 'Transfer : Account Renamed 3' }],
          },
        }),
      })
      .expect(200);
    expect(renamed.body).toMatchObject({
      current_server_knowledge: bootstrap.body.current_server_knowledge + 1,
      server_knowledge_of_device: 2,
    });
    const canonicalRename = await seedPool!.query<{
      account_name: string;
      payee_name: string;
    }>(
      `SELECT a.name AS account_name, p.name AS payee_name
       FROM semantic_accounts a
       JOIN semantic_payees p
         ON p.budget_id = a.budget_id AND p.account_id = a.account_id
       WHERE a.budget_id = $1 AND a.account_id = $2`,
      [directBudgetId, created.body.id],
    );
    expect(canonicalRename.rows).toEqual([
      {
        account_name: 'Account Renamed 3',
        payee_name: 'Transfer : Account Renamed 3',
      },
    ]);

    const renamedBootstrap = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-account-rename-bootstrap')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: directVersionId,
          sync_type: 'bootstrap',
          calculated_entities_included: false,
          schema_version: 44,
          schema_version_of_knowledge: 44,
          starting_device_knowledge: 2,
          ending_device_knowledge: 2,
          device_knowledge_of_server: 0,
          changed_entities: {},
        }),
      })
      .expect(200);
    expect(
      renamedBootstrap.body.changed_entities.be_accounts.find(
        (row: { id: string }) => row.id === created.body.id,
      ),
    ).toMatchObject({ account_name: 'Account Renamed 3' });
    expect(
      renamedBootstrap.body.changed_entities.be_payees.find(
        (row: { entities_account_id: string }) =>
          row.entities_account_id === created.body.id,
      ),
    ).toMatchObject({ name: 'Transfer : Account Renamed 3' });

    const renamedAccountRow =
      renamedBootstrap.body.changed_entities.be_accounts.find(
        (row: { id: string }) => row.id === created.body.id,
      );
    const renamedPayeeRow =
      renamedBootstrap.body.changed_entities.be_payees.find(
        (row: { entities_account_id: string }) =>
          row.entities_account_id === created.body.id,
      );
    const startingBalanceRow =
      renamedBootstrap.body.changed_entities.be_transactions.find(
        (row: { entities_account_id: string }) =>
          row.entities_account_id === created.body.id,
      );
    const deleted = await request(testApp)
      .post('/api/v1/catalog')
      .set('x-session-token', token)
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-client-request-id', 'stock-pristine-account-delete')
      .set('x-ynab-device-id', 'stock-web-device')
      .type('form')
      .send({
        operation_name: 'syncBudgetData',
        request_data: JSON.stringify({
          budget_version_id: directVersionId,
          sync_type: 'delta',
          calculated_entities_included: false,
          schema_version: 44,
          schema_version_of_knowledge: 44,
          starting_device_knowledge: 2,
          ending_device_knowledge: 5,
          device_knowledge_of_server: renamed.body.current_server_knowledge,
          changed_entities: {
            be_accounts: [{ ...renamedAccountRow, is_tombstone: true }],
            be_payees: [{ ...renamedPayeeRow, is_tombstone: true }],
            be_transaction_groups: [
              {
                id: startingBalanceRow.id,
                be_transaction: {
                  ...startingBalanceRow,
                  is_tombstone: true,
                },
                be_subtransactions: null,
              },
            ],
          },
        }),
      })
      .expect(200);
    expect(deleted.body).toMatchObject({
      current_server_knowledge: renamed.body.current_server_knowledge + 2,
      server_knowledge_of_device: 5,
      changed_entities: {
        be_account_calculations: [
          {
            id: `ac/${created.body.id}`,
            is_tombstone: true,
            cleared_balance: 0,
            transaction_count: 0,
          },
        ],
        be_monthly_budget_calculations: [
          expect.objectContaining({
            immediate_income: 234560,
            available_to_budget: 234560,
          }),
          expect.objectContaining({
            immediate_income: 0,
            available_to_budget: 234560,
          }),
        ],
      },
    });
    const canonicalDelete = await seedPool!.query<{
      account_tombstone: boolean;
      payee_tombstone: boolean;
      transaction_tombstone: boolean;
    }>(
      `SELECT a.is_tombstone AS account_tombstone,
              p.is_tombstone AS payee_tombstone,
              t.is_tombstone AS transaction_tombstone
       FROM semantic_accounts a
       JOIN semantic_payees p
         ON p.budget_id = a.budget_id AND p.account_id = a.account_id
       JOIN semantic_transactions t
         ON t.budget_id = a.budget_id AND t.account_id = a.account_id
       WHERE a.budget_id = $1 AND a.account_id = $2`,
      [directBudgetId, created.body.id],
    );
    expect(canonicalDelete.rows).toEqual([
      {
        account_tombstone: true,
        payee_tombstone: true,
        transaction_tombstone: true,
      },
    ]);
  });
});
