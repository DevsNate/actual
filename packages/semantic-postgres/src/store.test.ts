import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type {
  BudgetDeviceAcknowledgement,
  CatalogCommand,
} from '@actual-app/semantic-core';
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
    budgetId: 'budget-1',
    originDeviceId: 'device-1',
    startingDeviceKnowledge: 0,
    endingDeviceKnowledge: 1,
    expectedServerKnowledge: 0,
    serverKnowledgeAdvance: 1,
    schemaVersion: 1,
    idempotencyKey: 'request-1',
    payloadDigest: digest,
    changes: [
      {
        entityKind: 'budget',
        entityId: 'budget-1',
        isTombstone: false,
        payload: { name: 'My plan' },
      },
    ],
    response: { accepted: true },
    ...overrides,
  };
}

function catalogCommand(
  overrides: Partial<CatalogCommand> = {},
): CatalogCommand {
  return {
    changeSetId: 'catalog-change-1',
    principalId: 'principal-1',
    originDeviceId: 'catalog-device-1',
    startingDeviceKnowledge: 0,
    endingDeviceKnowledge: 1,
    expectedServerKnowledge: 0,
    schemaVersion: 1,
    commandKind: 'create-budget',
    idempotencyKey: 'catalog-request-1',
    payloadDigest: digest,
    changes: [
      {
        entityKind: 'budget-membership',
        entityId: 'membership-1',
        isTombstone: false,
        payload: { name: 'My plan' },
      },
    ],
    response: { accepted: true },
    ...overrides,
  };
}

function deviceAcknowledgement(
  overrides: Partial<BudgetDeviceAcknowledgement> = {},
): BudgetDeviceAcknowledgement {
  return {
    budgetId: 'plan-1',
    originDeviceId: 'device-1',
    startingDeviceKnowledge: 0,
    endingDeviceKnowledge: 2,
    expectedServerKnowledge: 30,
    idempotencyKey: 'rename-budget-request-1',
    payloadDigest: digest,
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
        budget_id: 'plan-1',
        budget_version_id: 'version-1',
        principal_id: 'principal-1',
        name: 'My plan',
        permissions: '7',
        last_modified_at: '2026-08-17T00:00:00.000Z',
        source: null,
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
          budgetId: 'plan-1',
          budgetVersionId: 'version-1',
          principalId: 'principal-1',
          name: 'My plan',
          permissions: 7,
          lastModifiedAt: '2026-08-17T00:00:00.000Z',
          source: null,
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
        expect.stringContaining('INSERT INTO semantic_budget_change_sets'),
        expect.stringContaining('INSERT INTO semantic_budget_entity_changes'),
        expect.stringContaining('UPDATE semantic_budgets'),
        expect.stringContaining('INSERT INTO semantic_budget_device_receipts'),
      ]),
    );
    expect(statements.at(-1)).toBe('COMMIT');
    expect(database.released).toBe(true);
  });

  test('admits the captured source plus derived-calculation knowledge advance', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([]); // no receipt
    database.enqueue([{ server_knowledge: '37' }]);
    database.enqueue([]); // ensure device
    database.enqueue([{ server_knowledge_of_device: '0' }]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(
      store.commitChangeSet(
        changeSet({
          expectedServerKnowledge: 37,
          serverKnowledgeAdvance: 2,
        }),
      ),
    ).resolves.toEqual({
      replayed: false,
      serverKnowledge: 39,
      endingDeviceKnowledge: 1,
      response: { accepted: true },
    });
    expect(
      database.queries.find(query =>
        query.text.includes('UPDATE semantic_budgets'),
      )?.values,
    ).toEqual(['budget-1', 39]);
  });

  test('acknowledges coalesced device knowledge without another server mutation', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([]); // no receipt
    database.enqueue([{ server_knowledge: '30' }]);
    database.enqueue([]); // ensure device
    database.enqueue([{ server_knowledge_of_device: '0' }]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(
      store.acknowledgeDevice(deviceAcknowledgement()),
    ).resolves.toEqual({
      replayed: false,
      serverKnowledge: 30,
      endingDeviceKnowledge: 2,
      response: { accepted: true },
    });

    const statements = database.queries.map(query => query.text);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('UPDATE semantic_budget_devices'),
        expect.stringContaining('INSERT INTO semantic_budget_device_receipts'),
      ]),
    );
    expect(statements).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('UPDATE semantic_budgets'),
        expect.stringContaining('INSERT INTO semantic_budget_change_sets'),
        expect.stringContaining('INSERT INTO semantic_budget_entity_changes'),
      ]),
    );
    expect(statements.at(-1)).toBe('COMMIT');
  });

  test('commits an ordered catalog command and receipt atomically', async () => {
    const database = new ScriptedDatabase();
    database.enqueue([]); // BEGIN
    database.enqueue([]); // idempotency lock
    database.enqueue([]); // no receipt
    database.enqueue([]); // ensure catalog knowledge
    database.enqueue([{ server_knowledge: '0' }]);
    database.enqueue([]); // ensure catalog device
    database.enqueue([{ server_knowledge_of_device: '0' }]);

    const store = new PostgresSemanticStore(database.pool);
    await expect(store.commitCatalogCommand(catalogCommand())).resolves.toEqual(
      {
        replayed: false,
        serverKnowledge: 1,
        endingDeviceKnowledge: 1,
        response: { accepted: true },
      },
    );

    const statements = database.queries.map(query => query.text);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO semantic_catalog_change_sets'),
        expect.stringContaining('INSERT INTO semantic_catalog_entity_changes'),
        expect.stringContaining('UPDATE semantic_catalog_knowledge'),
        expect.stringContaining(
          'INSERT INTO semantic_catalog_command_receipts',
        ),
      ]),
    );
    expect(statements.at(-1)).toBe('COMMIT');
    expect(database.released).toBe(true);
  });

  test('replays an identical catalog receipt without a second change set', async () => {
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
    await expect(store.commitCatalogCommand(catalogCommand())).resolves.toEqual(
      {
        replayed: true,
        serverKnowledge: 8,
        endingDeviceKnowledge: 1,
        response: { accepted: true },
      },
    );
    expect(
      database.queries.some(query =>
        query.text.includes('INSERT INTO semantic_catalog_change_sets'),
      ),
    ).toBe(false);
    expect(database.queries.at(-1)?.text).toBe('COMMIT');
  });

  test('rolls back a conflicting catalog idempotency key', async () => {
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
    await expect(
      store.commitCatalogCommand(catalogCommand()),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    } satisfies Partial<SemanticStoreError>);
    expect(database.queries.at(-1)?.text).toBe('ROLLBACK');
    expect(database.released).toBe(true);
  });

  test('rejects a malformed catalog command before database access', async () => {
    const database = new ScriptedDatabase();
    const store = new PostgresSemanticStore(database.pool);

    await expect(
      store.commitCatalogCommand(catalogCommand({ changes: [] })),
    ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(database.queries).toHaveLength(0);
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
        query.text.includes('INSERT INTO semantic_budget_change_sets'),
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

  test('introduces complete canonical entity payload storage', async () => {
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

  test('versions catalog commands without changing an applied migration', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0004_catalog_command_schema_version.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('ALTER TABLE semantic_catalog_change_sets');
    expect(migration).toContain('schema_version INTEGER NOT NULL');
    expect(migration).toContain('CHECK (schema_version > 0)');
  });

  test('renames every budget-owned table and key without collapsing version identity', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0005_budget_identity_schema.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain(
      'ALTER TABLE semantic_plans RENAME TO semantic_budgets',
    );
    expect(migration).toContain(
      'ALTER TABLE semantic_budgets RENAME COLUMN plan_id TO budget_id',
    );
    expect(migration).toContain(
      'ALTER TABLE semantic_plan_memberships RENAME TO semantic_budget_memberships',
    );
    expect(migration).toContain(
      'ALTER TABLE semantic_plan_entities RENAME TO semantic_budget_entities',
    );
    expect(migration).toContain('budget_version_id');
    expect(migration).not.toContain(
      'RENAME COLUMN budget_version_id TO budget_id',
    );
  });

  test('separates typed account authority from stock compatibility projections', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0006_canonical_account_domain.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE semantic_accounts');
    expect(migration).toContain('CREATE TABLE semantic_payees');
    expect(migration).toContain('CREATE TABLE semantic_transactions');
    expect(migration).toContain('amount_milliunits BIGINT NOT NULL');
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toContain('be_accounts');
    expect(migration).not.toContain('be_payees');
    expect(migration).not.toContain('be_transactions');
  });

  test('extends canonical transactions for the captured account lifecycle', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL('../migrations/0007_account_lifecycle.sql', import.meta.url),
      ),
      'utf8',
    );

    expect(migration).toContain("'starting_balance'");
    expect(migration).toContain("'manual_balance_adjustment'");
    expect(migration).toContain('ADD COLUMN memo TEXT');
    expect(migration).not.toContain('be_transactions');
  });

  test('separates canonical categories from monthly budgeting state', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0008_canonical_category_domain.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE semantic_category_groups');
    expect(migration).toContain('CREATE TABLE semantic_categories');
    expect(migration).toContain(
      'CREATE TABLE semantic_monthly_category_budgets',
    );
    expect(migration).toContain('UNIQUE (budget_id, category_id, month)');
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toContain('be_subcategories');
    expect(migration).not.toContain('be_monthly_subcategory_budgets');
  });

  test('stores activated targets separately from category identity', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0012_canonical_target_definition.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE semantic_category_targets');
    expect(migration).toContain('target_type TEXT NOT NULL');
    expect(migration).toContain('target_amount_milliunits BIGINT NOT NULL');
    expect(migration).toContain(
      'REFERENCES semantic_categories(budget_id, category_id)',
    );
    expect(migration).not.toContain('be_subcategories');
  });

  test('stores captured assignments as canonical money movements', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0013_canonical_money_movement.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE semantic_money_movements');
    expect(migration).toContain("source = 'manual_assign'");
    expect(migration).toContain('amount_milliunits BIGINT NOT NULL');
    expect(migration).toContain('REFERENCES semantic_monthly_category_budgets');
    expect(migration).not.toContain('be_money_movements');
  });

  test('stores the captured credit-card payment account relationship canonically', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0014_canonical_credit_card_payment.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN last_payment_payee_id TEXT');
    expect(migration).toContain(
      'REFERENCES semantic_payees(budget_id, payee_id)',
    );
    expect(migration).not.toContain('be_accounts');
    expect(migration).not.toContain('be_payees');
  });

  test('stores the captured account-bound DBT payment category canonically', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0015_canonical_credit_card_account.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain("category_type IN ('DFT', 'DBT')");
    expect(migration).toContain('ADD COLUMN account_id TEXT');
    expect(migration).toContain('semantic_categories_payment_account_fk');
    expect(migration).not.toContain('be_subcategories');
  });

  test('repairs legacy monthly payment rows to the canonical budget-version identity', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0018_canonical_monthly_budget_identity.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain(
      "entity.entity_kind = 'be_monthly_subcategory_budgets'",
    );
    expect(migration).toContain("entity.payload->>'budgetVersionId'");
    expect(migration).toContain('budget.budget_version_id');
    expect(migration).toContain("entity.payload->>'monthlyBudgetId'");
    expect(migration).toContain("'/' || budget.budget_id");
  });

  test('assigns one stable opaque short identity to every budget version', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0019_short_budget_version_identity.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain(
      'CREATE SEQUENCE semantic_short_budget_version_id_seq',
    );
    expect(migration).toContain('ADD COLUMN short_budget_version_id BIGINT');
    expect(migration).toContain(
      "DEFAULT nextval('semantic_short_budget_version_id_seq')",
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX semantic_budgets_short_budget_version_id_key',
    );
    expect(migration).not.toContain('be_expected_income');
  });

  test('stores split parents and ordered lines as one canonical aggregate', async () => {
    const migration = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0010_canonical_split_transaction.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(migration).toContain("'split_parent'");
    expect(migration).toContain('CREATE TABLE semantic_split_lines');
    expect(migration).toContain(
      'UNIQUE (budget_id, transaction_id, sort_order)',
    );
    expect(migration).toContain(
      'REFERENCES semantic_transactions(budget_id, transaction_id)',
    );
    expect(migration).not.toContain('be_subtransactions');
  });
});
