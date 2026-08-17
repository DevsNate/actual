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

    const app = express();
    app.use('/semantic/v1', runtime.handlers);
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
            isTombstone: false,
          },
        ],
      },
    });
  });
});
