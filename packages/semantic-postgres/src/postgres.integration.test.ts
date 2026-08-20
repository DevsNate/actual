import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';
import { Pool } from 'pg';

import { semanticBudgetIdentitySchemaMigration } from './budget-identity-schema-migration';
import { PostgresBudgetReader } from './budget-reader';
import { semanticCanonicalBudgetEntityMigration } from './canonical-budget-entity-migration';
import { semanticCatalogCommandMigration } from './catalog-command-migration';
import { semanticCatalogSchemaVersionMigration } from './catalog-schema-version-migration';
import { SemanticStoreError } from './errors';
import { semanticFoundationMigration } from './foundation-migration';
import { migrateSemanticDatabase } from './migrate';
import { PostgresSemanticStore } from './store';

const databaseUrl = process.env.SEMANTIC_POSTGRES_TEST_URL;
const integrationTest = databaseUrl ? describe : describe.skip;

type BudgetIdentityMigrationEvidence = {
  oldTablesRemoved: boolean;
  newTablesPresent: boolean;
  budgetId: string;
  budgetVersionId: string;
  membershipId: string;
  deviceKnowledge: string;
  changeKnowledge: string;
  entityPayload: Readonly<Record<string, unknown>>;
  receiptResponse: Readonly<Record<string, unknown>>;
  canonicalPayload: Readonly<Record<string, unknown>>;
  commandKind: string;
  columns: readonly string[];
};

integrationTest('PostgresSemanticStore integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresSemanticStore(pool);
  const budgetReader = new PostgresBudgetReader(pool);
  const digest = 'c'.repeat(64);
  let budgetIdentityMigrationEvidence: BudgetIdentityMigrationEvidence;

  beforeAll(async () => {
    await migrateSemanticDatabase(pool, [
      semanticFoundationMigration,
      semanticCatalogCommandMigration,
      semanticCanonicalBudgetEntityMigration,
      semanticCatalogSchemaVersionMigration,
    ]);

    await pool.query(
      `INSERT INTO semantic_plans (
         plan_id, budget_version_id, name, server_knowledge,
         currency_format, date_format
       ) VALUES ($1, $2, $3, 1, $4::jsonb, $5::jsonb)`,
      [
        'migration-budget',
        'migration-version',
        'Migration budget',
        JSON.stringify({ iso_code: 'USD' }),
        JSON.stringify({ format: 'MM/DD/YYYY' }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_plan_memberships (
         membership_id, plan_id, principal_id, permissions
       ) VALUES ($1, $2, $3, 7)`,
      ['migration-membership', 'migration-budget', 'migration-principal'],
    );
    await pool.query(
      `INSERT INTO semantic_devices (
         plan_id, device_id, server_knowledge_of_device
       ) VALUES ($1, $2, 1)`,
      ['migration-budget', 'migration-device'],
    );
    await pool.query(
      `INSERT INTO semantic_change_sets (
         change_set_id, plan_id, server_knowledge, origin_device_id,
         starting_device_knowledge, ending_device_knowledge, schema_version,
         idempotency_key, payload_digest
       ) VALUES ($1, $2, 1, $3, 0, 1, 1, $4, $5)`,
      [
        'migration-change',
        'migration-budget',
        'migration-device',
        'migration-request',
        '1'.repeat(64),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_entity_changes (
         change_set_id, ordinal, entity_kind, entity_id, is_tombstone, payload
       ) VALUES ($1, 0, 'account', $2, false, $3::jsonb)`,
      [
        'migration-change',
        'migration-account',
        JSON.stringify({ name: 'Preserved account' }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_device_receipts (
         plan_id, device_id, idempotency_key, payload_digest,
         starting_device_knowledge, ending_device_knowledge,
         server_knowledge, response
       ) VALUES ($1, $2, $3, $4, 0, 1, 1, $5::jsonb)`,
      [
        'migration-budget',
        'migration-device',
        'migration-request',
        '1'.repeat(64),
        JSON.stringify({ accepted: true }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_plan_entities (
         plan_id, entity_kind, entity_id, schema_version,
         is_tombstone, payload, last_server_knowledge
       ) VALUES ($1, 'account', $2, 1, false, $3::jsonb, 1)`,
      [
        'migration-budget',
        'migration-account',
        JSON.stringify({ name: 'Current account' }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_catalog_change_sets (
         change_set_id, principal_id, server_knowledge, origin_device_id,
         starting_device_knowledge, ending_device_knowledge, command_kind,
         idempotency_key, payload_digest, schema_version
       ) VALUES ($1, $2, 1, $3, 0, 1, 'create-plan', $4, $5, 1)`,
      [
        'migration-catalog-change',
        'migration-catalog-principal',
        'migration-catalog-device',
        'migration-catalog-request',
        '2'.repeat(64),
      ],
    );

    await migrateSemanticDatabase(pool, [
      semanticBudgetIdentitySchemaMigration,
    ]);

    const migrated = await pool.query<{
      old_tables_removed: boolean;
      new_tables_present: boolean;
      budget_id: string;
      budget_version_id: string;
      membership_id: string;
      device_knowledge: string;
      change_knowledge: string;
      entity_payload: Readonly<Record<string, unknown>>;
      receipt_response: Readonly<Record<string, unknown>>;
      canonical_payload: Readonly<Record<string, unknown>>;
      command_kind: string;
    }>(
      `SELECT
         to_regclass('semantic_plans') IS NULL
           AND to_regclass('semantic_plan_memberships') IS NULL
           AND to_regclass('semantic_devices') IS NULL
           AND to_regclass('semantic_change_sets') IS NULL
           AND to_regclass('semantic_entity_changes') IS NULL
           AND to_regclass('semantic_device_receipts') IS NULL
           AND to_regclass('semantic_plan_entities') IS NULL
           AS old_tables_removed,
         to_regclass('semantic_budgets') IS NOT NULL
           AND to_regclass('semantic_budget_memberships') IS NOT NULL
           AND to_regclass('semantic_budget_devices') IS NOT NULL
           AND to_regclass('semantic_budget_change_sets') IS NOT NULL
           AND to_regclass('semantic_budget_entity_changes') IS NOT NULL
           AND to_regclass('semantic_budget_device_receipts') IS NOT NULL
           AND to_regclass('semantic_budget_entities') IS NOT NULL
           AS new_tables_present,
         budget.budget_id,
         budget.budget_version_id,
         membership.membership_id,
         device.server_knowledge_of_device::text AS device_knowledge,
         change.server_knowledge::text AS change_knowledge,
         entity_change.payload AS entity_payload,
         receipt.response AS receipt_response,
         entity.payload AS canonical_payload,
         catalog_change.command_kind
       FROM semantic_budgets budget
       JOIN semantic_budget_memberships membership
         USING (budget_id)
       JOIN semantic_budget_devices device
         USING (budget_id)
       JOIN semantic_budget_change_sets change
         USING (budget_id)
       JOIN semantic_budget_entity_changes entity_change
         USING (change_set_id)
       JOIN semantic_budget_device_receipts receipt
         USING (budget_id)
       JOIN semantic_budget_entities entity
         USING (budget_id)
       CROSS JOIN semantic_catalog_change_sets catalog_change
       WHERE budget.budget_id = 'migration-budget'
         AND catalog_change.change_set_id = 'migration-catalog-change'`,
    );
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'semantic_budgets'
         AND column_name IN ('budget_id', 'budget_version_id')
       ORDER BY column_name`,
    );
    const migratedRow = migrated.rows[0];
    if (!migratedRow) {
      throw new Error('Budget identity migration evidence row was not found');
    }
    budgetIdentityMigrationEvidence = {
      oldTablesRemoved: migratedRow.old_tables_removed,
      newTablesPresent: migratedRow.new_tables_present,
      budgetId: migratedRow.budget_id,
      budgetVersionId: migratedRow.budget_version_id,
      membershipId: migratedRow.membership_id,
      deviceKnowledge: migratedRow.device_knowledge,
      changeKnowledge: migratedRow.change_knowledge,
      entityPayload: migratedRow.entity_payload,
      receiptResponse: migratedRow.receipt_response,
      canonicalPayload: migratedRow.canonical_payload,
      commandKind: migratedRow.command_kind,
      columns: columns.rows.map(row => row.column_name),
    };

    await pool.query(
      `DELETE FROM semantic_catalog_change_sets
       WHERE change_set_id = 'migration-catalog-change'`,
    );
    await pool.query(
      `DELETE FROM semantic_budgets WHERE budget_id = 'migration-budget'`,
    );

    await migrateSemanticDatabase(pool);
    await migrateSemanticDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('renames a populated legacy schema without changing identity or ledger data', () => {
    expect(budgetIdentityMigrationEvidence).toEqual({
      oldTablesRemoved: true,
      newTablesPresent: true,
      budgetId: 'migration-budget',
      budgetVersionId: 'migration-version',
      membershipId: 'migration-membership',
      deviceKnowledge: '1',
      changeKnowledge: '1',
      entityPayload: { name: 'Preserved account' },
      receiptResponse: { accepted: true },
      canonicalPayload: { name: 'Current account' },
      commandKind: 'create-budget',
      columns: ['budget_id', 'budget_version_id'],
    });
  });

  test('persists a catalog and replays one atomic tombstone change', async () => {
    await store.seedBudget({
      budgetId: 'budget-integration',
      budgetVersionId: 'version-integration',
      membershipId: 'membership-integration',
      principalId: 'principal-integration',
      name: 'Integration budget',
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
          budgetId: 'budget-integration',
          budgetVersionId: 'version-integration',
          principalId: 'principal-integration',
          name: 'Integration budget',
          permissions: 7,
          lastModifiedAt: expect.any(String),
          source: null,
          isTombstone: false,
        },
      ],
    });

    const operation = {
      changeSetId: 'change-integration',
      budgetId: 'budget-integration',
      originDeviceId: 'device-integration',
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
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
         (SELECT count(*) FROM semantic_budget_change_sets) AS change_count,
         (SELECT count(*) FROM semantic_budget_device_receipts) AS receipt_count,
         (SELECT count(*) FROM semantic_budget_entity_changes
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

  test('atomically commits canonical account authority and delivery projections', async () => {
    await store.seedBudget({
      budgetId: 'canonical-account-budget',
      budgetVersionId: 'canonical-account-version',
      membershipId: 'canonical-account-membership',
      principalId: 'canonical-account-principal',
      name: 'Canonical account budget',
      permissions: 7,
    });
    const accountGroup = buildUnlinkedCheckingAccount({
      budgetId: 'canonical-account-budget',
      accountId: 'canonical-account',
      transferPayeeId: 'canonical-transfer-payee',
      startingBalanceId: 'canonical-starting-balance',
      startingBalancePayeeId: 'canonical-system-starting-balance-payee',
      immediateIncomeCategoryId: 'canonical-immediate-income',
      name: 'Canonical checking',
      openingBalance: 123450,
      openingDate: '2026-08-20',
      sortOrder: 0,
    });
    const command = {
      accountGroup,
      delivery: {
        changeSetId: 'canonical-account-change',
        budgetId: 'canonical-account-budget',
        originDeviceId: 'canonical-account-device',
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 1,
        idempotencyKey: 'canonical-account-request',
        payloadDigest: 'a'.repeat(64),
        changes: [
          {
            entityKind: 'be_accounts',
            entityId: 'canonical-account',
            isTombstone: false,
            payload: { id: 'canonical-account' },
          },
          {
            entityKind: 'be_payees',
            entityId: 'canonical-transfer-payee',
            isTombstone: false,
            payload: { id: 'canonical-transfer-payee' },
          },
          {
            entityKind: 'be_transactions',
            entityId: 'canonical-starting-balance',
            isTombstone: false,
            payload: { id: 'canonical-starting-balance' },
          },
        ],
        response: { accountId: 'canonical-account' },
      },
    };

    await expect(store.commitUnlinkedAccountCreation(command)).resolves.toEqual(
      {
        replayed: false,
        serverKnowledge: 2,
        endingDeviceKnowledge: 0,
        response: { accountId: 'canonical-account' },
      },
    );
    await expect(store.commitUnlinkedAccountCreation(command)).resolves.toEqual(
      {
        replayed: true,
        serverKnowledge: 2,
        endingDeviceKnowledge: 0,
        response: { accountId: 'canonical-account' },
      },
    );

    const state = await pool.query<{
      accounts: string;
      payees: string;
      transactions: string;
      projections: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_accounts
          WHERE budget_id = $1) AS accounts,
         (SELECT count(*) FROM semantic_payees
          WHERE budget_id = $1) AS payees,
         (SELECT count(*) FROM semantic_transactions
          WHERE budget_id = $1) AS transactions,
         (SELECT count(*) FROM semantic_budget_entities
          WHERE budget_id = $1) AS projections`,
      ['canonical-account-budget'],
    );
    expect(state.rows[0]).toEqual({
      accounts: '1',
      payees: '1',
      transactions: '1',
      projections: '3',
    });

    await store.commitAccountRename({
      rename: {
        budgetId: 'canonical-account-budget',
        accountId: 'canonical-account',
        transferPayeeId: 'canonical-transfer-payee',
        expectedAccountName: 'Canonical checking',
        expectedTransferPayeeName: 'Transfer : Canonical checking',
        name: 'Renamed checking',
      },
      delivery: {
        ...command.delivery,
        changeSetId: 'canonical-account-rename-change',
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 2,
        serverKnowledgeAdvance: 1,
        idempotencyKey: 'canonical-account-rename-request',
        payloadDigest: 'b'.repeat(64),
        response: { renamed: true },
      },
    });

    await store.commitAccountClose({
      budgetId: 'canonical-account-budget',
      accountId: 'canonical-account',
      adjustment: {
        id: 'canonical-close-adjustment',
        budgetId: 'canonical-account-budget',
        accountId: 'canonical-account',
        payeeId: 'canonical-balance-adjustment-payee',
        categoryId: 'canonical-immediate-income',
        date: '2026-08-20',
        amount: -123450,
        memo: 'Closed Account',
      },
      delivery: {
        ...command.delivery,
        changeSetId: 'canonical-account-close-change',
        startingDeviceKnowledge: 2,
        endingDeviceKnowledge: 4,
        expectedServerKnowledge: 3,
        serverKnowledgeAdvance: 2,
        idempotencyKey: 'canonical-account-close-request',
        payloadDigest: 'c'.repeat(64),
        response: { closed: true },
      },
    });

    const reopen = {
      budgetId: 'canonical-account-budget',
      accountId: 'canonical-account',
      delivery: {
        ...command.delivery,
        changeSetId: 'canonical-account-reopen-change',
        startingDeviceKnowledge: 4,
        endingDeviceKnowledge: 5,
        expectedServerKnowledge: 5,
        serverKnowledgeAdvance: 2 as const,
        idempotencyKey: 'canonical-account-reopen-request',
        payloadDigest: 'd'.repeat(64),
        response: { reopened: true },
      },
    };
    await expect(store.commitAccountReopen(reopen)).resolves.toMatchObject({
      replayed: false,
      serverKnowledge: 7,
      response: { reopened: true },
    });
    await expect(store.commitAccountReopen(reopen)).resolves.toMatchObject({
      replayed: true,
      serverKnowledge: 7,
      response: { reopened: true },
    });

    const lifecycle = await pool.query<{
      account_name: string;
      payee_name: string;
      is_closed: boolean;
      adjustment_count: string;
      adjustment_amount: string;
      adjustment_memo: string;
    }>(
      `SELECT a.name AS account_name, p.name AS payee_name, a.is_closed,
              count(t.*)::text AS adjustment_count,
              min(t.amount_milliunits)::text AS adjustment_amount,
              min(t.memo) AS adjustment_memo
       FROM semantic_accounts a
       JOIN semantic_payees p
         ON p.budget_id = a.budget_id AND p.account_id = a.account_id
       LEFT JOIN semantic_transactions t
         ON t.budget_id = a.budget_id
        AND t.account_id = a.account_id
        AND t.transaction_kind = 'manual_balance_adjustment'
       WHERE a.budget_id = $1 AND a.account_id = $2
       GROUP BY a.name, p.name, a.is_closed`,
      ['canonical-account-budget', 'canonical-account'],
    );
    expect(lifecycle.rows).toEqual([
      {
        account_name: 'Renamed checking',
        payee_name: 'Transfer : Renamed checking',
        is_closed: false,
        adjustment_count: '1',
        adjustment_amount: '-123450',
        adjustment_memo: 'Closed Account',
      },
    ]);
  });

  test('commits and exactly replays an isolated catalog command', async () => {
    const operation = {
      changeSetId: 'catalog-change-integration',
      principalId: 'catalog-principal-integration',
      originDeviceId: 'catalog-device-integration',
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
      schemaVersion: 1,
      commandKind: 'create-budget',
      idempotencyKey: 'catalog-request-integration',
      payloadDigest: 'e'.repeat(64),
      changes: [
        {
          entityKind: 'budget-membership',
          entityId: 'catalog-membership-integration',
          isTombstone: false,
          payload: {
            budgetId: 'catalog-budget-integration',
            name: 'Catalog integration budget',
          },
        },
      ],
      response: {
        budgetId: 'catalog-budget-integration',
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

  test('records a coalesced device acknowledgement without a second change set', async () => {
    await store.seedBudget({
      budgetId: 'ack-budget-integration',
      budgetVersionId: 'ack-version-integration',
      membershipId: 'ack-membership-integration',
      principalId: 'ack-principal-integration',
      name: 'Acknowledgement budget',
      permissions: 7,
    });
    await store.commitChangeSet({
      changeSetId: 'ack-source-change-integration',
      budgetId: 'ack-budget-integration',
      originDeviceId: 'ack-device-integration',
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
      schemaVersion: 1,
      idempotencyKey: 'ack-source-request-integration',
      payloadDigest: 'f'.repeat(64),
      changes: [
        {
          entityKind: 'example',
          entityId: 'ack-source-entity-integration',
          isTombstone: false,
          payload: { name: 'already committed rename' },
        },
      ],
      response: { accepted: true },
    });

    const acknowledgement = {
      budgetId: 'ack-budget-integration',
      originDeviceId: 'ack-device-integration',
      startingDeviceKnowledge: 1,
      endingDeviceKnowledge: 3,
      expectedServerKnowledge: 1,
      idempotencyKey: 'ack-budget-request-integration',
      payloadDigest: '1'.repeat(64),
      response: { acknowledged: true },
    } as const;
    await expect(store.acknowledgeDevice(acknowledgement)).resolves.toEqual({
      replayed: false,
      serverKnowledge: 1,
      endingDeviceKnowledge: 3,
      response: { acknowledged: true },
    });
    await expect(store.acknowledgeDevice(acknowledgement)).resolves.toEqual({
      replayed: true,
      serverKnowledge: 1,
      endingDeviceKnowledge: 3,
      response: { acknowledged: true },
    });

    const state = await pool.query<{
      server_knowledge: string;
      server_knowledge_of_device: string;
      change_count: string;
      receipt_count: string;
    }>(
      `SELECT p.server_knowledge,
              d.server_knowledge_of_device,
              (SELECT count(*) FROM semantic_budget_change_sets
               WHERE budget_id = p.budget_id) AS change_count,
              (SELECT count(*) FROM semantic_budget_device_receipts
               WHERE budget_id = p.budget_id) AS receipt_count
       FROM semantic_budgets p
       JOIN semantic_budget_devices d ON d.budget_id = p.budget_id
       WHERE p.budget_id = $1 AND d.device_id = $2`,
      ['ack-budget-integration', 'ack-device-integration'],
    );
    expect(state.rows[0]).toEqual({
      server_knowledge: '1',
      server_knowledge_of_device: '3',
      change_count: '1',
      receipt_count: '2',
    });

    await expect(
      store.acknowledgeDevice({
        ...acknowledgement,
        payloadDigest: '2'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test('atomically creates and exactly replays the admitted PLAN-001 bootstrap', async () => {
    const entities = buildStockBudgetBootstrap({
      budgetId: 'created-budget-integration',
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
      budgetId: 'created-budget-integration',
      budgetVersionId: 'created-version-integration',
      membershipId: 'created-membership-integration',
      principalId: 'created-principal-integration',
      originDeviceId: 'created-device-integration',
      expectedCatalogServerKnowledge: 0,
      schemaVersion: 1,
      idempotencyKey: 'created-request-integration',
      payloadDigest: '1'.repeat(64),
      name: 'Created integration plan',
      permissions: 1,
      currencyFormat: { iso_code: 'USD' },
      dateFormat: { format: 'MM/DD/YYYY' },
      entities,
      receipt: {
        budgetId: 'created-budget-integration',
        budgetVersionId: 'created-version-integration',
      },
    } as const;

    await pool.query(
      `INSERT INTO semantic_catalog_devices
         (principal_id, device_id, server_knowledge_of_device)
       VALUES ($1, $2, 7)`,
      [operation.principalId, operation.originDeviceId],
    );

    await expect(store.createBudget(operation)).resolves.toEqual({
      replayed: false,
      catalogServerKnowledge: 1,
      budgetServerKnowledge: 1,
      budget: operation.receipt,
    });
    await expect(
      store.createBudget({
        ...operation,
        budgetId: 'ignored-retry-plan',
        budgetVersionId: 'ignored-retry-version',
      }),
    ).resolves.toEqual({
      replayed: true,
      catalogServerKnowledge: 1,
      budgetServerKnowledge: 1,
      budget: operation.receipt,
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
      catalog_device_knowledge: string;
      receipt_starting_knowledge: string;
      receipt_ending_knowledge: string;
    }>(
      `SELECT
         (SELECT count(*) FROM semantic_budgets WHERE budget_id = $1) AS plans,
         (SELECT count(*) FROM semantic_budget_memberships WHERE budget_id = $1) AS memberships,
         (SELECT count(*) FROM semantic_catalog_change_sets WHERE principal_id = $2) AS catalog_changes,
         (SELECT count(*) FROM semantic_budget_change_sets WHERE budget_id = $1) AS budget_changes,
         (SELECT count(*) FROM semantic_budget_entity_changes WHERE change_set_id = $3) AS entity_changes,
         (SELECT count(*) FROM semantic_budget_entities WHERE budget_id = $1) AS entity_snapshots,
         (SELECT count(*) FROM semantic_catalog_command_receipts WHERE principal_id = $2) AS catalog_receipts,
         (SELECT count(*) FROM semantic_budget_device_receipts WHERE budget_id = $1) AS budget_receipts,
         (SELECT server_knowledge_of_device FROM semantic_catalog_devices
          WHERE principal_id = $2 AND device_id = $4) AS catalog_device_knowledge,
         (SELECT starting_device_knowledge FROM semantic_catalog_command_receipts
          WHERE principal_id = $2 AND device_id = $4) AS receipt_starting_knowledge,
         (SELECT ending_device_knowledge FROM semantic_catalog_command_receipts
          WHERE principal_id = $2 AND device_id = $4) AS receipt_ending_knowledge`,
      [
        operation.budgetId,
        operation.principalId,
        operation.budgetChangeSetId,
        operation.originDeviceId,
      ],
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
      catalog_device_knowledge: '7',
      receipt_starting_knowledge: '7',
      receipt_ending_knowledge: '7',
    });

    const byVersion = await budgetReader.readBudgetByVersion(
      operation.principalId,
      operation.budgetVersionId,
    );
    expect(byVersion).toMatchObject({
      budgetId: operation.budgetId,
      budgetVersionId: operation.budgetVersionId,
      serverKnowledge: 1,
    });
    expect(byVersion?.entities).toHaveLength(58);
    await expect(
      budgetReader.readBudgetByVersion(
        'different-principal',
        operation.budgetVersionId,
      ),
    ).resolves.toBeNull();

    await expect(
      store.createBudget({ ...operation, payloadDigest: '2'.repeat(64) }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });
});
