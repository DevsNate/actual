import { buildStockPlanBootstrap } from '@actual-app/semantic-core';
import { Pool } from 'pg';

import { SemanticStoreError } from './errors';
import { migrateSemanticDatabase } from './migrate';
import { PostgresSemanticStore } from './store';

const databaseUrl = process.env.SEMANTIC_POSTGRES_TEST_URL;
const integrationTest = databaseUrl ? describe : describe.skip;

integrationTest('PostgresSemanticStore integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresSemanticStore(pool);
  const digest = 'c'.repeat(64);

  beforeAll(async () => {
    await migrateSemanticDatabase(pool);
    await migrateSemanticDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('persists a catalog and replays one atomic tombstone change', async () => {
    await store.seedPlan({
      planId: 'plan-integration',
      budgetVersionId: 'version-integration',
      membershipId: 'membership-integration',
      principalId: 'principal-integration',
      name: 'Integration plan',
      permissions: 7,
    });

    await expect(store.readCatalog('principal-integration')).resolves.toEqual({
      knowledge: {
        principalId: 'principal-integration',
        currentServerKnowledge: 1,
      },
      memberships: [
        {
          id: 'membership-integration',
          planId: 'plan-integration',
          budgetVersionId: 'version-integration',
          principalId: 'principal-integration',
          name: 'Integration plan',
          permissions: 7,
          lastModifiedAt: expect.any(String),
          source: null,
          isTombstone: false,
        },
      ],
    });

    const operation = {
      changeSetId: 'change-integration',
      planId: 'plan-integration',
      originDeviceId: 'device-integration',
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      schemaVersion: 1,
      idempotencyKey: 'request-integration',
      payloadDigest: digest,
      changes: [
        {
          entityKind: 'example',
          entityId: 'entity-integration',
          isTombstone: true,
          payload: { id: 'entity-integration' },
        },
      ],
      response: { accepted: true },
    } as const;

    await expect(store.commitChangeSet(operation)).resolves.toEqual({
      replayed: false,
      serverKnowledge: 1,
      endingDeviceKnowledge: 1,
      response: { accepted: true },
    });
    await expect(store.commitChangeSet(operation)).resolves.toEqual({
      replayed: true,
      serverKnowledge: 1,
      endingDeviceKnowledge: 1,
      response: { accepted: true },
    });

    const counts = await pool.query<{
      change_count: string;
      receipt_count: string;
      tombstone_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_change_sets) AS change_count,
         (SELECT count(*) FROM semantic_device_receipts) AS receipt_count,
         (SELECT count(*) FROM semantic_entity_changes
          WHERE is_tombstone = true) AS tombstone_count`,
    );
    expect(counts.rows[0]).toEqual({
      change_count: '1',
      receipt_count: '1',
      tombstone_count: '1',
    });

    await expect(
      store.commitChangeSet({
        ...operation,
        payloadDigest: 'd'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test('commits and exactly replays an isolated catalog command', async () => {
    const operation = {
      changeSetId: 'catalog-change-integration',
      principalId: 'catalog-principal-integration',
      originDeviceId: 'catalog-device-integration',
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      schemaVersion: 1,
      commandKind: 'create-plan',
      idempotencyKey: 'catalog-request-integration',
      payloadDigest: 'e'.repeat(64),
      changes: [
        {
          entityKind: 'plan-membership',
          entityId: 'catalog-membership-integration',
          isTombstone: false,
          payload: {
            planId: 'catalog-plan-integration',
            name: 'Catalog integration plan',
          },
        },
      ],
      response: {
        planId: 'catalog-plan-integration',
        budgetVersionId: 'catalog-version-integration',
      },
    } as const;

    await expect(store.commitCatalogCommand(operation)).resolves.toEqual({
      replayed: false,
      serverKnowledge: 1,
      endingDeviceKnowledge: 1,
      response: operation.response,
    });
    await expect(store.commitCatalogCommand(operation)).resolves.toEqual({
      replayed: true,
      serverKnowledge: 1,
      endingDeviceKnowledge: 1,
      response: operation.response,
    });

    const counts = await pool.query<{
      change_count: string;
      entity_count: string;
      receipt_count: string;
      schema_version: number;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_catalog_change_sets
          WHERE principal_id = $1) AS change_count,
         (SELECT count(*) FROM semantic_catalog_entity_changes
          WHERE change_set_id = $2) AS entity_count,
         (SELECT count(*) FROM semantic_catalog_command_receipts
          WHERE principal_id = $1) AS receipt_count,
         (SELECT schema_version FROM semantic_catalog_change_sets
          WHERE change_set_id = $2) AS schema_version`,
      [operation.principalId, operation.changeSetId],
    );
    expect(counts.rows[0]).toEqual({
      change_count: '1',
      entity_count: '1',
      receipt_count: '1',
      schema_version: 1,
    });

    await expect(
      store.commitCatalogCommand({
        ...operation,
        payloadDigest: 'f'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test('atomically creates and exactly replays the admitted PLAN-001 bootstrap', async () => {
    const entities = buildStockPlanBootstrap({
      planId: 'created-plan-integration',
      budgetVersionId: 'created-version-integration',
      principalId: 'created-principal-integration',
      name: 'Created integration plan',
      currencyFormat: { iso_code: 'USD' },
      dateFormat: { format: 'MM/DD/YYYY' },
      createdOn: '2026-08-16',
      createdAtMilliseconds: 1786954979513,
      allocateId: label => `created-${label}`,
    });
    const operation = {
      catalogChangeSetId: 'created-catalog-change-integration',
      budgetChangeSetId: 'created-budget-change-integration',
      planId: 'created-plan-integration',
      budgetVersionId: 'created-version-integration',
      membershipId: 'created-membership-integration',
      principalId: 'created-principal-integration',
      originDeviceId: 'created-device-integration',
      expectedCatalogServerKnowledge: 0,
      startingCatalogDeviceKnowledge: 0,
      endingCatalogDeviceKnowledge: 0,
      schemaVersion: 1,
      idempotencyKey: 'created-request-integration',
      payloadDigest: '1'.repeat(64),
      name: 'Created integration plan',
      permissions: 1,
      currencyFormat: { iso_code: 'USD' },
      dateFormat: { format: 'MM/DD/YYYY' },
      entities,
      response: {
        budget_id: 'created-plan-integration',
        budget_version_id: 'created-version-integration',
      },
    } as const;

    await expect(store.createPlan(operation)).resolves.toEqual({
      replayed: false,
      catalogServerKnowledge: 1,
      budgetServerKnowledge: 1,
      response: operation.response,
    });
    await expect(
      store.createPlan({
        ...operation,
        planId: 'ignored-retry-plan',
        budgetVersionId: 'ignored-retry-version',
      }),
    ).resolves.toEqual({
      replayed: true,
      catalogServerKnowledge: 1,
      budgetServerKnowledge: 1,
      response: operation.response,
    });

    const state = await pool.query<{
      plans: string;
      memberships: string;
      catalog_changes: string;
      budget_changes: string;
      entity_changes: string;
      entity_snapshots: string;
      catalog_receipts: string;
      budget_receipts: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_plans WHERE plan_id = $1) AS plans,
         (SELECT count(*) FROM semantic_plan_memberships WHERE plan_id = $1) AS memberships,
         (SELECT count(*) FROM semantic_catalog_change_sets WHERE principal_id = $2) AS catalog_changes,
         (SELECT count(*) FROM semantic_change_sets WHERE plan_id = $1) AS budget_changes,
         (SELECT count(*) FROM semantic_entity_changes WHERE change_set_id = $3) AS entity_changes,
         (SELECT count(*) FROM semantic_plan_entities WHERE plan_id = $1) AS entity_snapshots,
         (SELECT count(*) FROM semantic_catalog_command_receipts WHERE principal_id = $2) AS catalog_receipts,
         (SELECT count(*) FROM semantic_device_receipts WHERE plan_id = $1) AS budget_receipts`,
      [operation.planId, operation.principalId, operation.budgetChangeSetId],
    );
    expect(state.rows[0]).toEqual({
      plans: '1',
      memberships: '1',
      catalog_changes: '1',
      budget_changes: '1',
      entity_changes: '58',
      entity_snapshots: '58',
      catalog_receipts: '1',
      budget_receipts: '1',
    });

    await expect(
      store.createPlan({ ...operation, payloadDigest: '2'.repeat(64) }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });
});
