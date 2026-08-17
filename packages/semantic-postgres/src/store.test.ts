import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

import type { SemanticStoreError } from './errors';
import { PostgresSemanticStore } from './store';
import type { CommitChangeSetInput } from './types';

type QueryRecord = {
  text: string;
  values: readonly unknown[];
};

type QueryResponse = {
  rowCount: number;
  rows: readonly Readonly<Record<string, unknown>>[];
};

class ScriptedDatabase {
  readonly queries: QueryRecord[] = [];
  readonly responses: QueryResponse[] = [];
  released = false;

  readonly pool = {
    connect: async () => this.client,
    query: async (text: string, values: readonly unknown[] = []) =>
      this.record(text, values),
  } as unknown as Pool;

  private readonly client = {
    query: async (text: string, values: readonly unknown[] = []) =>
      this.record(text, values),
    release: () => {
      this.released = true;
    },
  };

  enqueue(rows: readonly Readonly<Record<string, unknown>>[]): void {
    this.responses.push({ rowCount: rows.length, rows });
  }

  private record(text: string, values: readonly unknown[]): QueryResponse {
    this.queries.push({ text: text.replace(/\s+/gu, ' ').trim(), values });
    return this.responses.shift() ?? { rowCount: 0, rows: [] };
  }
}

const digest = 'a'.repeat(64);

function changeSet(
  overrides: Partial<CommitChangeSetInput> = {},
): CommitChangeSetInput {
  return {
    changeSetId: 'change-1',
    planId: 'plan-1',
    originDeviceId: 'device-1',
    startingDeviceKnowledge: 0,
    endingDeviceKnowledge: 1,
    expectedServerKnowledge: 0,
    schemaVersion: 1,
    idempotencyKey: 'request-1',
    payloadDigest: digest,
    changes: [
      {
        entityKind: 'plan',
        entityId: 'plan-1',
        isTombstone: false,
        payload: { name: 'My plan' },
      },
    ],
    response: { accepted: true },
    ...overrides,
  };
}

describe('PostgresSemanticStore', () => {
  test('reads a principal catalog without exposing another principal', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([
      {
        catalog_server_knowledge: '4',
        membership_id: 'membership-1',
        plan_id: 'plan-1',
        budget_version_id: 'version-1',
        principal_id: 'principal-1',
        name: 'My plan',
        permissions: '7',
        is_tombstone: false,
      },
    ]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(store.readCatalog('principal-1')).resolves.toEqual({
      knowledge: {
        principalId: 'principal-1',
        currentServerKnowledge: 4,
      },
      memberships: [
        {
          id: 'membership-1',
          planId: 'plan-1',
          budgetVersionId: 'version-1',
          principalId: 'principal-1',
          name: 'My plan',
          permissions: 7,
          isTombstone: false,
        },
      ],
    });
    expect(database.queries).toHaveLength(1);
    expect(database.queries[0].values[0]).toBe('principal-1');
  });

  test('commits knowledge, changes, and a receipt in one transaction', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([]); // no receipt
    database.enqueue([{ server_knowledge: '0' }]);
    database.enqueue([]); // ensure device
    database.enqueue([{ server_knowledge_of_device: '0' }]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(store.commitChangeSet(changeSet())).resolves.toEqual({
      replayed: false,
      serverKnowledge: 1,
      endingDeviceKnowledge: 1,
      response: { accepted: true },
    });

    const statements = database.queries.map(query => query.text);
    expect(statements[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(statements[1]).toContain('pg_advisory_xact_lock');
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO semantic_change_sets'),
        expect.stringContaining('INSERT INTO semantic_entity_changes'),
        expect.stringContaining('UPDATE semantic_plans'),
        expect.stringContaining('INSERT INTO semantic_device_receipts'),
      ]),
    );
    expect(statements.at(-1)).toBe('COMMIT');
    expect(database.released).toBe(true);
  });

  test('replays an identical receipt without creating a second change set', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([
      {
        payload_digest: digest,
        ending_device_knowledge: '1',
        server_knowledge: '8',
        response: { accepted: true },
      },
    ]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(store.commitChangeSet(changeSet())).resolves.toEqual({
      replayed: true,
      serverKnowledge: 8,
      endingDeviceKnowledge: 1,
      response: { accepted: true },
    });
    expect(
      database.queries.some(query =>
        query.text.includes('INSERT INTO semantic_change_sets'),
      ),
    ).toBe(false);
    expect(database.queries.at(-1)?.text).toBe('COMMIT');
  });

  test('rolls back when an idempotency key is reused for another payload', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([
      {
        payload_digest: 'b'.repeat(64),
        ending_device_knowledge: '1',
        server_knowledge: '8',
        response: { accepted: true },
      },
    ]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(store.commitChangeSet(changeSet())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    } satisfies Partial<SemanticStoreError>);
    expect(database.queries.at(-1)?.text).toBe('ROLLBACK');
    expect(database.released).toBe(true);
  });

  test('rejects malformed operations before acquiring a connection', async () => {
    const database = new ScriptedDatabase();
    const store = new PostgresSemanticStore(database.pool);

    await expect(
      store.commitChangeSet(changeSet({ payloadDigest: 'not-a-digest' })),
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(database.queries).toHaveLength(0);
  });
});

describe('semantic foundation migration', () => {
  test('defines atomic knowledge, tombstone, and receipt constraints', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL('../migrations/0001_semantic_foundation.sql', import.meta.url),
      ),
      'utf8',
    );

    expect(migration).toContain('semantic_change_sets');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS semantic_schema_migrations',
    );
    expect(migration).toContain('UNIQUE (plan_id, server_knowledge)');
    expect(migration).toContain('is_tombstone BOOLEAN NOT NULL');
    expect(migration).toContain(
      'PRIMARY KEY (plan_id, device_id, idempotency_key)',
    );
    expect(migration).toContain('REFERENCES semantic_change_sets');
  });

  test('defines a separate ordered catalog command ledger', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0002_catalog_command_ledger.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('semantic_catalog_devices');
    expect(migration).toContain('semantic_catalog_change_sets');
    expect(migration).toContain('semantic_catalog_entity_changes');
    expect(migration).toContain('semantic_catalog_command_receipts');
    expect(migration).toContain('UNIQUE (principal_id, server_knowledge)');
    expect(migration).toContain(
      'PRIMARY KEY (principal_id, device_id, idempotency_key)',
    );
    expect(migration).toContain(
      'REFERENCES semantic_catalog_change_sets(principal_id, server_knowledge)',
    );
  });

  test('preserves complete canonical plan entity payloads', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0003_canonical_plan_entities.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN currency_format JSONB');
    expect(migration).toContain('ADD COLUMN date_format JSONB');
    expect(migration).toContain('CREATE TABLE semantic_plan_entities');
    expect(migration).toContain('payload JSONB NOT NULL');
    expect(migration).toContain('is_tombstone BOOLEAN NOT NULL');
    expect(migration).toContain(
      'PRIMARY KEY (plan_id, entity_kind, entity_id)',
    );
  });
});
