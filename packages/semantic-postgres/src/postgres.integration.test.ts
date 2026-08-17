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
    await store.createPlan({
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
});
