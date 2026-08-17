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
});
