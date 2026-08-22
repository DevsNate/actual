import { buildUnlinkedCheckingAccount } from "@actual-app/semantic-core";
import { buildStockBudgetBootstrap } from "@actual-app/semantic-core/ynab-budget-bootstrap";
import { Pool } from "pg";

import { semanticBudgetIdentitySchemaMigration } from "./budget-identity-schema-migration";
import { PostgresBudgetReader } from "./budget-reader";
import { semanticCanonicalBudgetEntityMigration } from "./canonical-budget-entity-migration";
import { semanticCatalogCommandMigration } from "./catalog-command-migration";
import { semanticCatalogSchemaVersionMigration } from "./catalog-schema-version-migration";
import { SemanticStoreError } from "./errors";
import { semanticFoundationMigration } from "./foundation-migration";
import { migrateSemanticDatabase } from "./migrate";
import { PostgresSemanticStore } from "./store";

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

integrationTest("PostgresSemanticStore integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresSemanticStore(pool);
  const budgetReader = new PostgresBudgetReader(pool);
  const digest = "c".repeat(64);
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
        "migration-budget",
        "migration-version",
        "Migration budget",
        JSON.stringify({ iso_code: "USD" }),
        JSON.stringify({ format: "MM/DD/YYYY" }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_plan_memberships (
         membership_id, plan_id, principal_id, permissions
       ) VALUES ($1, $2, $3, 7)`,
      ["migration-membership", "migration-budget", "migration-principal"],
    );
    await pool.query(
      `INSERT INTO semantic_devices (
         plan_id, device_id, server_knowledge_of_device
       ) VALUES ($1, $2, 1)`,
      ["migration-budget", "migration-device"],
    );
    await pool.query(
      `INSERT INTO semantic_change_sets (
         change_set_id, plan_id, server_knowledge, origin_device_id,
         starting_device_knowledge, ending_device_knowledge, schema_version,
         idempotency_key, payload_digest
       ) VALUES ($1, $2, 1, $3, 0, 1, 1, $4, $5)`,
      [
        "migration-change",
        "migration-budget",
        "migration-device",
        "migration-request",
        "1".repeat(64),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_entity_changes (
         change_set_id, ordinal, entity_kind, entity_id, is_tombstone, payload
       ) VALUES ($1, 0, 'account', $2, false, $3::jsonb)`,
      [
        "migration-change",
        "migration-account",
        JSON.stringify({ name: "Preserved account" }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_device_receipts (
         plan_id, device_id, idempotency_key, payload_digest,
         starting_device_knowledge, ending_device_knowledge,
         server_knowledge, response
       ) VALUES ($1, $2, $3, $4, 0, 1, 1, $5::jsonb)`,
      [
        "migration-budget",
        "migration-device",
        "migration-request",
        "1".repeat(64),
        JSON.stringify({ accepted: true }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_plan_entities (
         plan_id, entity_kind, entity_id, schema_version,
         is_tombstone, payload, last_server_knowledge
       ) VALUES ($1, 'account', $2, 1, false, $3::jsonb, 1)`,
      [
        "migration-budget",
        "migration-account",
        JSON.stringify({ name: "Current account" }),
      ],
    );
    await pool.query(
      `INSERT INTO semantic_catalog_change_sets (
         change_set_id, principal_id, server_knowledge, origin_device_id,
         starting_device_knowledge, ending_device_knowledge, command_kind,
         idempotency_key, payload_digest, schema_version
       ) VALUES ($1, $2, 1, $3, 0, 1, 'create-plan', $4, $5, 1)`,
      [
        "migration-catalog-change",
        "migration-catalog-principal",
        "migration-catalog-device",
        "migration-catalog-request",
        "2".repeat(64),
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
      throw new Error("Budget identity migration evidence row was not found");
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
      columns: columns.rows.map((row) => row.column_name),
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

  test("renames a populated legacy schema without changing identity or ledger data", () => {
    expect(budgetIdentityMigrationEvidence).toEqual({
      oldTablesRemoved: true,
      newTablesPresent: true,
      budgetId: "migration-budget",
      budgetVersionId: "migration-version",
      membershipId: "migration-membership",
      deviceKnowledge: "1",
      changeKnowledge: "1",
      entityPayload: { name: "Preserved account" },
      receiptResponse: { accepted: true },
      canonicalPayload: { name: "Current account" },
      commandKind: "create-budget",
      columns: ["budget_id", "budget_version_id"],
    });
  });

  test("persists a catalog and replays one atomic tombstone change", async () => {
    await store.seedBudget({
      budgetId: "budget-integration",
      budgetVersionId: "version-integration",
      membershipId: "membership-integration",
      principalId: "principal-integration",
      name: "Integration budget",
      permissions: 7,
    });

    await expect(store.readCatalog("principal-integration")).resolves.toEqual({
      knowledge: {
        principalId: "principal-integration",
        currentServerKnowledge: 1,
      },
      memberships: [
        {
          id: "membership-integration",
          budgetId: "budget-integration",
          budgetVersionId: "version-integration",
          principalId: "principal-integration",
          name: "Integration budget",
          permissions: 7,
          lastModifiedAt: expect.any(String),
          source: null,
          isTombstone: false,
        },
      ],
    });

    const operation = {
      changeSetId: "change-integration",
      budgetId: "budget-integration",
      originDeviceId: "device-integration",
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
      schemaVersion: 1,
      idempotencyKey: "request-integration",
      payloadDigest: digest,
      changes: [
        {
          entityKind: "example",
          entityId: "entity-integration",
          isTombstone: true,
          payload: { id: "entity-integration" },
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
      change_count: "1",
      receipt_count: "1",
      tombstone_count: "1",
    });

    await expect(
      store.commitChangeSet({
        ...operation,
        payloadDigest: "d".repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test("atomically commits canonical account authority and delivery projections", async () => {
    await store.seedBudget({
      budgetId: "canonical-account-budget",
      budgetVersionId: "canonical-account-version",
      membershipId: "canonical-account-membership",
      principalId: "canonical-account-principal",
      name: "Canonical account budget",
      permissions: 7,
    });
    const accountGroup = buildUnlinkedCheckingAccount({
      budgetId: "canonical-account-budget",
      accountId: "canonical-account",
      transferPayeeId: "canonical-transfer-payee",
      startingBalanceId: "canonical-starting-balance",
      startingBalancePayeeId: "canonical-system-starting-balance-payee",
      immediateIncomeCategoryId: "canonical-immediate-income",
      name: "Canonical checking",
      openingBalance: 123450,
      openingDate: "2026-08-20",
      sortOrder: 0,
    });
    const command = {
      accountGroup,
      delivery: {
        changeSetId: "canonical-account-change",
        budgetId: "canonical-account-budget",
        originDeviceId: "canonical-account-device",
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 1,
        idempotencyKey: "canonical-account-request",
        payloadDigest: "a".repeat(64),
        changes: [
          {
            entityKind: "be_accounts",
            entityId: "canonical-account",
            isTombstone: false,
            payload: { id: "canonical-account" },
          },
          {
            entityKind: "be_payees",
            entityId: "canonical-transfer-payee",
            isTombstone: false,
            payload: { id: "canonical-transfer-payee" },
          },
          {
            entityKind: "be_transactions",
            entityId: "canonical-starting-balance",
            isTombstone: false,
            payload: { id: "canonical-starting-balance" },
          },
        ],
        response: { accountId: "canonical-account" },
      },
    };

    await expect(store.commitUnlinkedAccountCreation(command)).resolves.toEqual(
      {
        replayed: false,
        serverKnowledge: 2,
        endingDeviceKnowledge: 0,
        response: { accountId: "canonical-account" },
      },
    );
    await expect(store.commitUnlinkedAccountCreation(command)).resolves.toEqual(
      {
        replayed: true,
        serverKnowledge: 2,
        endingDeviceKnowledge: 0,
        response: { accountId: "canonical-account" },
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
      ["canonical-account-budget"],
    );
    expect(state.rows[0]).toEqual({
      accounts: "1",
      payees: "1",
      transactions: "1",
      projections: "3",
    });

    await store.commitAccountRename({
      rename: {
        budgetId: "canonical-account-budget",
        accountId: "canonical-account",
        transferPayeeId: "canonical-transfer-payee",
        expectedAccountName: "Canonical checking",
        expectedTransferPayeeName: "Transfer : Canonical checking",
        name: "Renamed checking",
      },
      delivery: {
        ...command.delivery,
        changeSetId: "canonical-account-rename-change",
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 2,
        serverKnowledgeAdvance: 1,
        idempotencyKey: "canonical-account-rename-request",
        payloadDigest: "b".repeat(64),
        response: { renamed: true },
      },
    });

    await store.commitAccountClose({
      budgetId: "canonical-account-budget",
      accountId: "canonical-account",
      adjustment: {
        id: "canonical-close-adjustment",
        budgetId: "canonical-account-budget",
        accountId: "canonical-account",
        payeeId: "canonical-balance-adjustment-payee",
        categoryId: "canonical-immediate-income",
        date: "2026-08-20",
        amount: -123450,
        memo: "Closed Account",
      },
      delivery: {
        ...command.delivery,
        changeSetId: "canonical-account-close-change",
        startingDeviceKnowledge: 2,
        endingDeviceKnowledge: 4,
        expectedServerKnowledge: 3,
        serverKnowledgeAdvance: 2,
        idempotencyKey: "canonical-account-close-request",
        payloadDigest: "c".repeat(64),
        response: { closed: true },
      },
    });

    const reopen = {
      budgetId: "canonical-account-budget",
      accountId: "canonical-account",
      delivery: {
        ...command.delivery,
        changeSetId: "canonical-account-reopen-change",
        startingDeviceKnowledge: 4,
        endingDeviceKnowledge: 5,
        expectedServerKnowledge: 5,
        serverKnowledgeAdvance: 2 as const,
        idempotencyKey: "canonical-account-reopen-request",
        payloadDigest: "d".repeat(64),
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
      ["canonical-account-budget", "canonical-account"],
    );
    expect(lifecycle.rows).toEqual([
      {
        account_name: "Renamed checking",
        payee_name: "Transfer : Renamed checking",
        is_closed: false,
        adjustment_count: "1",
        adjustment_amount: "-123450",
        adjustment_memo: "Closed Account",
      },
    ]);
  });

  test("atomically commits a canonical category and its monthly rows", async () => {
    await store.seedBudget({
      budgetId: "canonical-category-budget",
      budgetVersionId: "canonical-category-version",
      membershipId: "canonical-category-membership",
      principalId: "canonical-category-principal",
      name: "Canonical category budget",
      permissions: 7,
    });
    const command = {
      mutation: {
        kind: "create" as const,
        group: {
          id: "category-group",
          budgetId: "canonical-category-budget",
          name: "Group",
          sortOrder: 100,
          isHidden: false,
        },
        category: {
          id: "category",
          budgetId: "canonical-category-budget",
          groupId: "category-group",
          name: "Category",
          sortOrder: 200,
          type: "DFT" as const,
          note: null,
          isHidden: false,
        },
        months: [
          {
            id: "category-august",
            budgetId: "canonical-category-budget",
            categoryId: "category",
            month: "2026-08-01",
            budgeted: 0 as const,
            goalSnoozedAt: null,
            note: null,
            overspendingHandling: "AffectsBuffer" as const,
          },
          {
            id: "category-september",
            budgetId: "canonical-category-budget",
            categoryId: "category",
            month: "2026-09-01",
            budgeted: 0 as const,
            goalSnoozedAt: null,
            note: null,
            overspendingHandling: "AffectsBuffer" as const,
          },
        ] as const,
      },
      delivery: {
        changeSetId: "canonical-category-change",
        budgetId: "canonical-category-budget",
        originDeviceId: "canonical-category-device",
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 44,
        idempotencyKey: "canonical-category-request",
        payloadDigest: "8".repeat(64),
        changes: [
          {
            entityKind: "be_subcategories",
            entityId: "category",
            isTombstone: false,
            payload: { name: "Category" },
          },
          {
            entityKind: "be_monthly_subcategory_budgets",
            entityId: "category-august",
            isTombstone: false,
            payload: { budgeted: 0 },
          },
          {
            entityKind: "be_monthly_subcategory_budgets",
            entityId: "category-september",
            isTombstone: false,
            payload: { budgeted: 0 },
          },
        ],
        response: { accepted: true },
      },
    };

    await expect(store.commitCategoryMutation(command)).resolves.toEqual({
      replayed: false,
      serverKnowledge: 2,
      endingDeviceKnowledge: 2,
      response: { accepted: true },
    });
    await expect(store.commitCategoryMutation(command)).resolves.toEqual({
      replayed: true,
      serverKnowledge: 2,
      endingDeviceKnowledge: 2,
      response: { accepted: true },
    });
    const state = await pool.query(
      `SELECT
         (SELECT count(*) FROM semantic_category_groups WHERE budget_id = $1) AS groups,
         (SELECT count(*) FROM semantic_categories WHERE budget_id = $1) AS categories,
         (SELECT count(*) FROM semantic_monthly_category_budgets WHERE budget_id = $1) AS months`,
      ["canonical-category-budget"],
    );
    expect(state.rows[0]).toEqual({
      groups: "1",
      categories: "1",
      months: "2",
    });

    await expect(
      store.commitCategoryMutation({
        mutation: {
          kind: "update",
          budgetId: "canonical-category-budget",
          categoryId: "category",
          expectedGroupId: "category-group",
          expectedName: "Category",
          expectedSortOrder: 200,
          expectedHidden: false,
          groupId: "category-group",
          name: "Renamed category",
          sortOrder: 200,
          isHidden: true,
        },
        delivery: {
          ...command.delivery,
          changeSetId: "canonical-category-update-change",
          startingDeviceKnowledge: 2,
          endingDeviceKnowledge: 3,
          expectedServerKnowledge: 2,
          serverKnowledgeAdvance: 1,
          idempotencyKey: "canonical-category-update",
          payloadDigest: "9".repeat(64),
          changes: [
            {
              entityKind: "be_subcategories",
              entityId: "category",
              isTombstone: false,
              payload: { name: "Renamed category", isHidden: true },
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ serverKnowledge: 3 });

    const monthlyTarget = {
      type: "NEED" as const,
      createdOn: "2026-08-01",
      amount: 100000,
      date: null,
      cadence: 1 as const,
      cadenceFrequency: 1,
      day: null,
      needsWholeAmount: true as const,
      monthlyFunding: 0 as const,
    };
    await expect(
      store.commitCategoryMutation({
        mutation: {
          kind: "replace-target",
          budgetId: "canonical-category-budget",
          categoryId: "category",
          expected: null,
          target: monthlyTarget,
        },
        delivery: {
          ...command.delivery,
          changeSetId: "canonical-target-create-change",
          startingDeviceKnowledge: 3,
          endingDeviceKnowledge: 10,
          expectedServerKnowledge: 3,
          idempotencyKey: "canonical-target-create",
          payloadDigest: "b".repeat(64),
          changes: [
            {
              entityKind: "be_subcategories",
              entityId: "category",
              isTombstone: false,
              payload: { goalType: "NEED", goalTargetAmount: 100000 },
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ serverKnowledge: 5 });
    const targetState = await pool.query(
      `SELECT target_type, target_amount_milliunits::text AS amount,
              cadence, cadence_frequency
       FROM semantic_category_targets
       WHERE budget_id = $1 AND category_id = $2`,
      ["canonical-category-budget", "category"],
    );
    expect(targetState.rows).toEqual([
      {
        target_type: "NEED",
        amount: "100000",
        cadence: 1,
        cadence_frequency: 1,
      },
    ]);
    await expect(
      store.commitCategoryMutation({
        mutation: {
          kind: "replace-target",
          budgetId: "canonical-category-budget",
          categoryId: "category",
          expected: monthlyTarget,
          target: null,
        },
        delivery: {
          ...command.delivery,
          changeSetId: "canonical-target-clear-change",
          startingDeviceKnowledge: 10,
          endingDeviceKnowledge: 17,
          expectedServerKnowledge: 5,
          idempotencyKey: "canonical-target-clear",
          payloadDigest: "c".repeat(64),
          changes: [
            {
              entityKind: "be_subcategories",
              entityId: "category",
              isTombstone: false,
              payload: { goalType: null, goalTargetAmount: 0 },
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ serverKnowledge: 7 });
    expect(
      await pool.query(
        `SELECT 1 FROM semantic_category_targets
         WHERE budget_id = $1 AND category_id = $2`,
        ["canonical-category-budget", "category"],
      ),
    ).toMatchObject({ rowCount: 0 });

    await pool.query(
      `INSERT INTO semantic_categories (
         budget_id, category_id, category_group_id, name, sortable_index,
         category_type, is_hidden, is_tombstone
       ) VALUES ($1, $2, $3, $4, 300, 'DFT', false, false)`,
      [
        "canonical-category-budget",
        "replacement-category",
        "category-group",
        "Replacement category",
      ],
    );
    await pool.query(
      `INSERT INTO semantic_accounts (
         budget_id, account_id, name, account_type, on_budget,
         is_closed, is_favorite, sortable_index, is_tombstone
       ) VALUES ($1, $2, 'Checking', 'checking', true, false, false, 0, false)`,
      ["canonical-category-budget", "category-account"],
    );
    await pool.query(
      `INSERT INTO semantic_payees (
         budget_id, payee_id, name, auto_fill_category_id
       ) VALUES ($1, $2, 'Category payee', $3)`,
      ["canonical-category-budget", "category-payee", "category"],
    );
    await pool.query(
      `INSERT INTO semantic_transactions (
         budget_id, transaction_id, account_id, payee_id, category_id,
         transaction_date, amount_milliunits, is_cleared, is_approved,
         is_tombstone, transaction_kind, cleared_state
       ) VALUES (
         $1, $2, $3, $4, $5, DATE '2026-08-16', -1230,
         false, true, false, 'ordinary', 'Uncleared'
       )`,
      [
        "canonical-category-budget",
        "category-transaction",
        "category-account",
        "category-payee",
        "category",
      ],
    );

    const referencedDelete = {
      mutation: {
        kind: "delete-and-reassign-one-transaction" as const,
        budgetId: "canonical-category-budget",
        categoryId: "category",
        replacementCategoryId: "replacement-category",
        monthlyCategoryBudgetIds: [
          "category-august",
          "category-september",
        ] as const,
        transactionId: "category-transaction",
        payeeId: "category-payee",
      },
      delivery: {
        ...command.delivery,
        changeSetId: "canonical-category-referenced-delete-change",
        startingDeviceKnowledge: 17,
        endingDeviceKnowledge: 21,
        expectedServerKnowledge: 7,
        serverKnowledgeAdvance: 2 as const,
        idempotencyKey: "canonical-category-referenced-delete",
        payloadDigest: "a".repeat(64),
        changes: command.delivery.changes.map((change) => ({
          ...change,
          isTombstone: true,
        })),
      },
    };
    await expect(
      store.commitCategoryMutation(referencedDelete),
    ).resolves.toEqual({
      replayed: false,
      serverKnowledge: 9,
      endingDeviceKnowledge: 21,
      response: { accepted: true },
    });
    await expect(
      store.commitCategoryMutation(referencedDelete),
    ).resolves.toEqual({
      replayed: true,
      serverKnowledge: 9,
      endingDeviceKnowledge: 21,
      response: { accepted: true },
    });

    const terminal = await pool.query(
      `SELECT
         (SELECT name FROM semantic_categories
          WHERE budget_id = $1 AND category_id = 'category') AS name,
         (SELECT is_hidden FROM semantic_categories
          WHERE budget_id = $1 AND category_id = 'category') AS hidden,
         (SELECT is_tombstone FROM semantic_categories
          WHERE budget_id = $1 AND category_id = 'category') AS category_tombstone,
         (SELECT count(*) FROM semantic_monthly_category_budgets
          WHERE budget_id = $1 AND is_tombstone = true) AS month_tombstones,
         (SELECT category_id FROM semantic_transactions
          WHERE budget_id = $1 AND transaction_id = 'category-transaction') AS transaction_category,
         (SELECT auto_fill_category_id FROM semantic_payees
          WHERE budget_id = $1 AND payee_id = 'category-payee') AS payee_autofill_category`,
      ["canonical-category-budget"],
    );
    expect(terminal.rows[0]).toEqual({
      name: "Renamed category",
      hidden: true,
      category_tombstone: true,
      month_tombstones: "2",
      transaction_category: "replacement-category",
      payee_autofill_category: null,
    });
  });

  test("atomically commits and replays the admitted ordinary transaction and payee lifecycle", async () => {
    const budgetId = "ordinary-budget";
    const deviceId = "ordinary-device";
    await store.seedBudget({
      budgetId,
      budgetVersionId: "ordinary-version",
      membershipId: "ordinary-membership",
      principalId: "ordinary-principal",
      name: "Ordinary budget",
      permissions: 7,
    });
    const accountGroup = buildUnlinkedCheckingAccount({
      budgetId,
      accountId: "ordinary-account",
      transferPayeeId: "ordinary-transfer-payee",
      startingBalanceId: "ordinary-starting-balance",
      startingBalancePayeeId: "ordinary-starting-balance-payee",
      immediateIncomeCategoryId: "ordinary-immediate-income",
      name: "Checking",
      openingBalance: 100000,
      openingDate: "2026-08-16",
      sortOrder: 0,
    });
    await store.commitUnlinkedAccountCreation({
      accountGroup,
      delivery: {
        changeSetId: "ordinary-account-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2,
        schemaVersion: 44,
        idempotencyKey: "ordinary-account-request",
        payloadDigest: "1".repeat(64),
        changes: [
          {
            entityKind: "be_accounts",
            entityId: "ordinary-account",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_payees",
            entityId: "ordinary-transfer-payee",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_transactions",
            entityId: "ordinary-starting-balance",
            isTombstone: false,
            payload: {},
          },
        ],
        response: { created: true },
      },
    });

    const create = {
      mutation: {
        kind: "create-with-payee" as const,
        payee: {
          id: "ordinary-payee",
          budgetId,
          name: "Payee 4",
          isEnabled: true,
          autoFillCategoryId: null,
          autoFillUserDefinedCategoryId: null,
          autoFillMemo: null,
          autoFillAmount: 0,
          autoFillCategoryEnabled: true,
          autoFillMemoEnabled: false,
          autoFillAmountEnabled: false,
          renameOnImportEnabled: true,
          internalName: null,
        },
        transaction: {
          id: "ordinary-transaction",
          budgetId,
          accountId: "ordinary-account",
          payeeId: "ordinary-payee",
          categoryId: null,
          date: "2026-08-16",
          amount: -1000,
          memo: "Payee Test 1",
          cleared: "Uncleared" as const,
          accepted: true,
          checkNumber: null,
          flag: null,
        },
      },
      delivery: {
        changeSetId: "ordinary-create-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 2,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 44,
        idempotencyKey: "ordinary-create-request",
        payloadDigest: "2".repeat(64),
        changes: [
          {
            entityKind: "be_payees",
            entityId: "ordinary-payee",
            isTombstone: false,
            payload: { name: "Payee 4" },
          },
          {
            entityKind: "be_transactions",
            entityId: "ordinary-transaction",
            isTombstone: false,
            payload: { amount: -1000 },
          },
        ],
        response: { accepted: true },
      },
    };
    await expect(
      store.commitOrdinaryTransactionMutation(create),
    ).resolves.toMatchObject({
      replayed: false,
      serverKnowledge: 4,
    });
    await expect(
      store.commitOrdinaryTransactionMutation(create),
    ).resolves.toMatchObject({
      replayed: true,
      serverKnowledge: 4,
    });

    const originalTransaction = create.mutation.transaction;
    await store.commitOrdinaryTransactionMutation({
      mutation: {
        kind: "edit",
        expected: originalTransaction,
        transaction: {
          ...originalTransaction,
          amount: -5670,
          memo: "Phase Four Edited",
        },
      },
      delivery: {
        ...create.delivery,
        changeSetId: "ordinary-edit-change",
        startingDeviceKnowledge: 2,
        endingDeviceKnowledge: 4,
        expectedServerKnowledge: 4,
        serverKnowledgeAdvance: 2,
        idempotencyKey: "ordinary-edit-request",
        payloadDigest: "8".repeat(64),
        changes: [
          {
            entityKind: "be_transactions",
            entityId: "ordinary-transaction",
            isTombstone: false,
            payload: { amount: -5670, memo: "Phase Four Edited" },
          },
        ],
      },
    });

    await expect(
      store.commitOrdinaryPayeeMutation({
        mutation: {
          kind: "delete",
          budgetId,
          payeeId: "ordinary-payee",
        },
        delivery: {
          ...create.delivery,
          changeSetId: "ordinary-live-payee-delete-change",
          startingDeviceKnowledge: 4,
          endingDeviceKnowledge: 5,
          expectedServerKnowledge: 6,
          serverKnowledgeAdvance: 1,
          idempotencyKey: "ordinary-live-payee-delete-request",
          payloadDigest: "6".repeat(64),
          changes: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });

    await store.commitOrdinaryTransactionMutation({
      mutation: {
        kind: "delete",
        budgetId,
        transactionId: "ordinary-transaction",
      },
      delivery: {
        ...create.delivery,
        changeSetId: "ordinary-delete-change",
        startingDeviceKnowledge: 4,
        endingDeviceKnowledge: 5,
        expectedServerKnowledge: 6,
        idempotencyKey: "ordinary-delete-request",
        payloadDigest: "3".repeat(64),
        changes: [
          {
            entityKind: "be_transactions",
            entityId: "ordinary-transaction",
            isTombstone: true,
            payload: { amount: -1000 },
          },
        ],
      },
    });
    await store.commitOrdinaryPayeeMutation({
      mutation: {
        kind: "rename",
        budgetId,
        payeeId: "ordinary-payee",
        expectedName: "Payee 4",
        name: "Payee 5",
      },
      delivery: {
        ...create.delivery,
        changeSetId: "ordinary-payee-rename-change",
        startingDeviceKnowledge: 5,
        endingDeviceKnowledge: 6,
        expectedServerKnowledge: 8,
        serverKnowledgeAdvance: 1,
        idempotencyKey: "ordinary-payee-rename-request",
        payloadDigest: "4".repeat(64),
        changes: [
          {
            entityKind: "be_payees",
            entityId: "ordinary-payee",
            isTombstone: false,
            payload: { name: "Payee 5" },
          },
        ],
      },
    });
    await store.commitOrdinaryPayeeMutation({
      mutation: { kind: "delete", budgetId, payeeId: "ordinary-payee" },
      delivery: {
        ...create.delivery,
        changeSetId: "ordinary-payee-delete-change",
        startingDeviceKnowledge: 6,
        endingDeviceKnowledge: 7,
        expectedServerKnowledge: 9,
        serverKnowledgeAdvance: 1,
        idempotencyKey: "ordinary-payee-delete-request",
        payloadDigest: "5".repeat(64),
        changes: [
          {
            entityKind: "be_payees",
            entityId: "ordinary-payee",
            isTombstone: true,
            payload: { name: "Payee 5" },
          },
        ],
      },
    });
    await store.commitOrdinaryTransactionMutation({
      mutation: {
        kind: "create",
        transaction: {
          id: "ordinary-no-payee-transaction",
          budgetId,
          accountId: "ordinary-account",
          payeeId: null,
          categoryId: null,
          date: "2026-08-16",
          amount: -1230,
          memo: "Stock Runtime Ordinary",
          cleared: "Uncleared",
          accepted: true,
          checkNumber: null,
          flag: null,
        },
      },
      delivery: {
        ...create.delivery,
        changeSetId: "ordinary-no-payee-create-change",
        startingDeviceKnowledge: 7,
        endingDeviceKnowledge: 8,
        expectedServerKnowledge: 10,
        serverKnowledgeAdvance: 1,
        idempotencyKey: "ordinary-no-payee-create-request",
        payloadDigest: "7".repeat(64),
        changes: [
          {
            entityKind: "be_transactions",
            entityId: "ordinary-no-payee-transaction",
            isTombstone: false,
            payload: { amount: -1230 },
          },
        ],
      },
    });

    const referencedCreate = {
      mutation: {
        kind: "create-with-payee" as const,
        payee: {
          ...create.mutation.payee,
          id: "referenced-delete-payee",
          name: "Capture Delete Payee",
        },
        transaction: {
          ...create.mutation.transaction,
          id: "referenced-delete-transaction",
          payeeId: "referenced-delete-payee",
          amount: -1230,
          memo: "CATEGORY REFERENCED DELETE",
          cleared: "Cleared" as const,
        },
      },
      delivery: {
        ...create.delivery,
        changeSetId: "referenced-delete-create-change",
        startingDeviceKnowledge: 8,
        endingDeviceKnowledge: 10,
        expectedServerKnowledge: 11,
        serverKnowledgeAdvance: 2 as const,
        idempotencyKey: "referenced-delete-create-request",
        payloadDigest: "9".repeat(64),
        changes: [
          {
            entityKind: "be_payees" as const,
            entityId: "referenced-delete-payee",
            isTombstone: false,
            payload: { name: "Capture Delete Payee" },
          },
          {
            entityKind: "be_transactions" as const,
            entityId: "referenced-delete-transaction",
            isTombstone: false,
            payload: { amount: -1230 },
          },
        ],
      },
    };
    await store.commitOrdinaryTransactionMutation(referencedCreate);

    const expectedReferencedTransaction = referencedCreate.mutation.transaction;
    const referencedDelete = {
      mutation: {
        kind: "delete-and-clear-transaction-payee" as const,
        budgetId,
        payeeId: "referenced-delete-payee",
        expectedTransaction: expectedReferencedTransaction,
        transaction: { ...expectedReferencedTransaction, payeeId: null },
      },
      delivery: {
        ...create.delivery,
        changeSetId: "referenced-delete-change",
        startingDeviceKnowledge: 10,
        endingDeviceKnowledge: 12,
        expectedServerKnowledge: 13,
        serverKnowledgeAdvance: 1 as const,
        idempotencyKey: "referenced-delete-request",
        payloadDigest: "a".repeat(64),
        changes: [
          {
            entityKind: "be_payees" as const,
            entityId: "referenced-delete-payee",
            isTombstone: true,
            payload: { name: "Capture Delete Payee" },
          },
          {
            entityKind: "be_transactions" as const,
            entityId: "referenced-delete-transaction",
            isTombstone: false,
            payload: { payeeId: null },
          },
        ],
      },
    };
    await expect(
      store.commitOrdinaryPayeeMutation(referencedDelete),
    ).resolves.toMatchObject({ replayed: false, serverKnowledge: 14 });
    await expect(
      store.commitOrdinaryPayeeMutation(referencedDelete),
    ).resolves.toMatchObject({ replayed: true, serverKnowledge: 14 });

    const terminal = await pool.query(
      `SELECT p.name, p.is_tombstone AS payee_tombstone,
              t.amount_milliunits::text AS amount,
              t.memo, t.cleared_state,
              t.is_tombstone AS transaction_tombstone,
              b.server_knowledge::text AS server_knowledge,
              d.server_knowledge_of_device::text AS device_knowledge,
              (SELECT count(*) FROM semantic_budget_device_receipts
               WHERE budget_id = $1 AND idempotency_key = 'ordinary-create-request')::text AS create_receipts,
              (SELECT amount_milliunits::text FROM semantic_transactions
               WHERE budget_id = $1 AND transaction_id = 'ordinary-no-payee-transaction') AS no_payee_amount,
              (SELECT payee_id FROM semantic_transactions
               WHERE budget_id = $1 AND transaction_id = 'ordinary-no-payee-transaction') AS no_payee_id,
              (SELECT is_tombstone FROM semantic_payees
               WHERE budget_id = $1 AND payee_id = 'referenced-delete-payee') AS referenced_payee_tombstone,
              (SELECT payee_id FROM semantic_transactions
               WHERE budget_id = $1 AND transaction_id = 'referenced-delete-transaction') AS referenced_transaction_payee,
              (SELECT memo FROM semantic_transactions
               WHERE budget_id = $1 AND transaction_id = 'referenced-delete-transaction') AS referenced_transaction_memo,
              (SELECT amount_milliunits::text FROM semantic_transactions
               WHERE budget_id = $1 AND transaction_id = 'referenced-delete-transaction') AS referenced_transaction_amount,
              (SELECT count(*) FROM semantic_budget_device_receipts
               WHERE budget_id = $1 AND idempotency_key = 'referenced-delete-request')::text AS referenced_delete_receipts
       FROM semantic_payees p
       JOIN semantic_transactions t
         ON t.budget_id = p.budget_id AND t.payee_id = p.payee_id
       JOIN semantic_budgets b ON b.budget_id = p.budget_id
       JOIN semantic_budget_devices d ON d.budget_id = p.budget_id
       WHERE p.budget_id = $1 AND p.payee_id = 'ordinary-payee'
         AND t.transaction_id = 'ordinary-transaction'
         AND d.device_id = $2`,
      [budgetId, deviceId],
    );
    expect(terminal.rows[0]).toEqual({
      name: "Payee 5",
      payee_tombstone: true,
      amount: "-5670",
      memo: "Phase Four Edited",
      cleared_state: "Uncleared",
      transaction_tombstone: true,
      server_knowledge: "14",
      device_knowledge: "12",
      create_receipts: "1",
      no_payee_amount: "-1230",
      no_payee_id: null,
      referenced_payee_tombstone: true,
      referenced_transaction_payee: null,
      referenced_transaction_memo: "CATEGORY REFERENCED DELETE",
      referenced_transaction_amount: "-1230",
      referenced_delete_receipts: "1",
    });
  });

  test("atomically commits, edits, deletes, and replays a split aggregate", async () => {
    const budgetId = "split-budget";
    const deviceId = "split-device";
    await store.seedBudget({
      budgetId,
      budgetVersionId: "split-version",
      membershipId: "split-membership",
      principalId: "split-principal",
      name: "Split budget",
      permissions: 7,
    });
    const accountGroup = buildUnlinkedCheckingAccount({
      budgetId,
      accountId: "split-account",
      transferPayeeId: "split-transfer-payee",
      startingBalanceId: "split-starting-balance",
      startingBalancePayeeId: "split-starting-balance-payee",
      immediateIncomeCategoryId: "split-immediate-income",
      name: "Checking",
      openingBalance: 100000,
      openingDate: "2026-08-16",
      sortOrder: 0,
    });
    await store.commitUnlinkedAccountCreation({
      accountGroup,
      delivery: {
        changeSetId: "split-account-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2,
        schemaVersion: 44,
        idempotencyKey: "split-account-request",
        payloadDigest: "7".repeat(64),
        changes: [
          {
            entityKind: "be_accounts",
            entityId: "split-account",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_payees",
            entityId: "split-transfer-payee",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_transactions",
            entityId: "split-starting-balance",
            isTombstone: false,
            payload: {},
          },
        ],
        response: { created: true },
      },
    });
    const canonicalPayee = (id: string) => ({
      id,
      budgetId,
      name: id,
      isEnabled: true,
      autoFillCategoryId: null,
      autoFillUserDefinedCategoryId: null,
      autoFillMemo: null,
      autoFillAmount: 0,
      autoFillCategoryEnabled: true,
      autoFillMemoEnabled: false,
      autoFillAmountEnabled: false,
      renameOnImportEnabled: true,
      internalName: null,
    });
    const create = {
      mutation: {
        kind: "create" as const,
        payees: [
          canonicalPayee("split-parent-payee"),
          canonicalPayee("split-line-payee"),
        ],
        parent: {
          id: "split-parent",
          budgetId,
          accountId: "split-account",
          payeeId: "split-parent-payee",
          categoryId: "split-category",
          date: "2026-08-16",
          amount: -100000,
          memo: "Split",
          cleared: "Uncleared" as const,
          accepted: true,
          checkNumber: null,
          flag: null,
        },
        lines: [
          {
            id: "split-line-1",
            budgetId,
            transactionId: "split-parent",
            payeeId: "split-line-payee",
            categoryId: "category-1",
            amount: -40000,
            memo: null,
            sortOrder: 0,
          },
          {
            id: "split-line-2",
            budgetId,
            transactionId: "split-parent",
            payeeId: null,
            categoryId: "category-2",
            amount: -60000,
            memo: null,
            sortOrder: 1,
          },
        ],
      },
      delivery: {
        changeSetId: "split-create-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 5,
        expectedServerKnowledge: 2,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 44,
        idempotencyKey: "split-create-request",
        payloadDigest: "8".repeat(64),
        changes: [
          {
            entityKind: "be_payees",
            entityId: "split-parent-payee",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_payees",
            entityId: "split-line-payee",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_transactions",
            entityId: "split-parent",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_subtransactions",
            entityId: "split-line-1",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_subtransactions",
            entityId: "split-line-2",
            isTombstone: false,
            payload: {},
          },
        ],
        response: { accepted: true },
      },
    };
    await expect(
      store.commitSplitTransactionMutation(create),
    ).resolves.toMatchObject({ replayed: false, serverKnowledge: 4 });
    await expect(
      store.commitSplitTransactionMutation(create),
    ).resolves.toMatchObject({ replayed: true, serverKnowledge: 4 });
    await store.commitSplitTransactionMutation({
      mutation: {
        kind: "update-parent-payee",
        budgetId,
        transactionId: "split-parent",
        expectedPayeeId: "split-parent-payee",
        payeeId: "split-line-payee",
      },
      delivery: {
        ...create.delivery,
        changeSetId: "split-payee-change",
        startingDeviceKnowledge: 5,
        endingDeviceKnowledge: 6,
        expectedServerKnowledge: 4,
        serverKnowledgeAdvance: 1,
        idempotencyKey: "split-payee-request",
        payloadDigest: "9".repeat(64),
        changes: [],
      },
    });
    await store.commitSplitTransactionMutation({
      mutation: {
        kind: "update-line-category",
        budgetId,
        transactionId: "split-parent",
        lineId: "split-line-1",
        expectedCategoryId: "category-1",
        categoryId: "category-3",
      },
      delivery: {
        ...create.delivery,
        changeSetId: "split-category-change",
        startingDeviceKnowledge: 6,
        endingDeviceKnowledge: 7,
        expectedServerKnowledge: 5,
        serverKnowledgeAdvance: 2,
        idempotencyKey: "split-category-request",
        payloadDigest: "a".repeat(64),
        changes: [],
      },
    });
    await store.commitSplitTransactionMutation({
      mutation: {
        kind: "delete",
        budgetId,
        transactionId: "split-parent",
        lineIds: ["split-line-1", "split-line-2"],
      },
      delivery: {
        ...create.delivery,
        changeSetId: "split-delete-change",
        startingDeviceKnowledge: 7,
        endingDeviceKnowledge: 10,
        expectedServerKnowledge: 7,
        serverKnowledgeAdvance: 2,
        idempotencyKey: "split-delete-request",
        payloadDigest: "b".repeat(64),
        changes: [],
      },
    });
    const terminal = await pool.query(
      `SELECT t.payee_id, t.transaction_kind, t.is_tombstone AS parent_tombstone,
              array_agg(l.category_id ORDER BY l.sort_order) AS categories,
              bool_and(l.is_tombstone) AS lines_tombstoned,
              b.server_knowledge::text AS server_knowledge,
              d.server_knowledge_of_device::text AS device_knowledge
       FROM semantic_transactions t
       JOIN semantic_split_lines l ON l.budget_id = t.budget_id AND l.transaction_id = t.transaction_id
       JOIN semantic_budgets b ON b.budget_id = t.budget_id
       JOIN semantic_budget_devices d ON d.budget_id = t.budget_id AND d.device_id = $2
       WHERE t.budget_id = $1 AND t.transaction_id = 'split-parent'
       GROUP BY t.payee_id, t.transaction_kind, t.is_tombstone, b.server_knowledge,
                d.server_knowledge_of_device`,
      [budgetId, deviceId],
    );
    expect(terminal.rows[0]).toEqual({
      payee_id: "split-line-payee",
      transaction_kind: "split_parent",
      parent_tombstone: true,
      categories: ["category-3", "category-2"],
      lines_tombstoned: true,
      server_knowledge: "9",
      device_knowledge: "10",
    });
  });

  test("atomically commits, materializes, deletes, and replays a scheduled transaction", async () => {
    const budgetId = "schedule-budget";
    const deviceId = "schedule-device";
    await store.seedBudget({
      budgetId,
      budgetVersionId: "schedule-version",
      membershipId: "schedule-membership",
      principalId: "schedule-principal",
      name: "Schedule budget",
      permissions: 7,
    });
    const accountGroup = buildUnlinkedCheckingAccount({
      budgetId,
      accountId: "schedule-account",
      transferPayeeId: "schedule-payee",
      startingBalanceId: "schedule-starting-balance",
      startingBalancePayeeId: "schedule-starting-balance-payee",
      immediateIncomeCategoryId: "schedule-immediate-income",
      name: "Checking",
      openingBalance: 100000,
      openingDate: "2026-08-16",
      sortOrder: 0,
    });
    await store.commitUnlinkedAccountCreation({
      accountGroup,
      delivery: {
        changeSetId: "schedule-account-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 2,
        schemaVersion: 44,
        idempotencyKey: "schedule-account-request",
        payloadDigest: "1".repeat(64),
        changes: [
          {
            entityKind: "be_accounts",
            entityId: "schedule-account",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_payees",
            entityId: "schedule-payee",
            isTombstone: false,
            payload: {},
          },
          {
            entityKind: "be_transactions",
            entityId: "schedule-starting-balance",
            isTombstone: false,
            payload: {},
          },
        ],
        response: { created: true },
      },
    });
    await pool.query(
      `INSERT INTO semantic_category_groups
         (budget_id, category_group_id, name, sortable_index, is_hidden)
       VALUES ($1, 'schedule-group', 'Schedule group', 0, false)`,
      [budgetId],
    );
    await pool.query(
      `INSERT INTO semantic_categories
         (budget_id, category_id, category_group_id, name, sortable_index,
          category_type, is_hidden)
       VALUES ($1, 'schedule-category', 'schedule-group',
               'Schedule category', 0, 'DFT', false)`,
      [budgetId],
    );

    const parent = {
      id: "schedule-parent",
      budgetId,
      accountId: "schedule-account",
      payeeId: "schedule-payee",
      categoryId: "schedule-category",
      date: "2026-08-17",
      frequency: "Monthly" as const,
      amount: -10000,
      memo: "Schedule Test",
      upcomingInstances: ["2026-08-17"] as const,
    };
    const create = {
      mutation: {
        kind: "create" as const,
        parent,
        payeeAutofill: {
          payeeId: "schedule-payee",
          expectedCategoryId: null,
          categoryId: "schedule-category",
        },
      },
      delivery: {
        changeSetId: "schedule-create-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 2,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 44,
        idempotencyKey: "schedule-create-request",
        payloadDigest: "2".repeat(64),
        changes: [
          {
            entityKind: "be_payees",
            entityId: "schedule-payee",
            isTombstone: false,
            payload: { autoFillSubCategoryId: "schedule-category" },
          },
          {
            entityKind: "be_scheduled_transactions",
            entityId: "schedule-parent",
            isTombstone: false,
            payload: { date: "2026-08-17" },
          },
        ],
        response: { accepted: true },
      },
    };
    await expect(
      store.commitScheduledTransactionMutation(create),
    ).resolves.toMatchObject({ replayed: false, serverKnowledge: 4 });
    await expect(
      store.commitScheduledTransactionMutation(create),
    ).resolves.toMatchObject({ replayed: true, serverKnowledge: 4 });

    const editedParent = {
      ...parent,
      amount: -15000,
      memo: "Schedule Test 2",
    };
    await store.commitScheduledTransactionMutation({
      mutation: { kind: "update", parent: editedParent },
      delivery: {
        ...create.delivery,
        changeSetId: "schedule-update-change",
        startingDeviceKnowledge: 2,
        endingDeviceKnowledge: 4,
        expectedServerKnowledge: 4,
        idempotencyKey: "schedule-update-request",
        payloadDigest: "3".repeat(64),
        changes: [
          {
            entityKind: "be_scheduled_transactions",
            entityId: "schedule-parent",
            isTombstone: false,
            payload: { amount: -15000 },
          },
        ],
      },
    });
    const materializedParent = {
      ...editedParent,
      date: "2026-09-16",
      upcomingInstances: ["2026-09-16"] as const,
    };
    await store.commitScheduledTransactionMutation({
      mutation: {
        kind: "materialize",
        parent: materializedParent,
        occurrence: {
          id: "schedule-parent_2026-08-16",
          budgetId,
          scheduledTransactionId: "schedule-parent",
          accountId: "schedule-account",
          payeeId: "schedule-payee",
          categoryId: "schedule-category",
          date: "2026-08-16",
          dateEnteredFromSchedule: "2026-08-16",
          amount: -15000,
          memo: "Schedule Test 2",
          cleared: "Uncleared",
          accepted: false,
          source: "Scheduler",
        },
      },
      delivery: {
        ...create.delivery,
        changeSetId: "schedule-materialize-change",
        startingDeviceKnowledge: 4,
        endingDeviceKnowledge: 9,
        expectedServerKnowledge: 6,
        idempotencyKey: "schedule-materialize-request",
        payloadDigest: "4".repeat(64),
        changes: [
          {
            entityKind: "be_scheduled_transactions",
            entityId: "schedule-parent",
            isTombstone: false,
            payload: { date: "2026-09-16" },
          },
          {
            entityKind: "be_transactions",
            entityId: "schedule-parent_2026-08-16",
            isTombstone: false,
            payload: { source: "Scheduler" },
          },
        ],
      },
    });
    await store.commitScheduledTransactionMutation({
      mutation: {
        kind: "delete",
        budgetId,
        scheduledTransactionId: "schedule-parent",
      },
      delivery: {
        ...create.delivery,
        changeSetId: "schedule-delete-change",
        startingDeviceKnowledge: 9,
        endingDeviceKnowledge: 10,
        expectedServerKnowledge: 8,
        idempotencyKey: "schedule-delete-request",
        payloadDigest: "5".repeat(64),
        changes: [
          {
            entityKind: "be_scheduled_transactions",
            entityId: "schedule-parent",
            isTombstone: true,
            payload: { date: "2026-09-16" },
          },
        ],
      },
    });

    const terminal = await pool.query(
      `SELECT s.amount_milliunits::text AS amount, s.memo,
              s.is_tombstone AS schedule_tombstone,
              t.amount_milliunits::text AS occurrence_amount,
              t.scheduled_transaction_id,
              t.is_tombstone AS occurrence_tombstone,
              b.server_knowledge::text AS server_knowledge,
              d.server_knowledge_of_device::text AS device_knowledge,
              (SELECT count(*) FROM semantic_budget_device_receipts
               WHERE budget_id = $1
                 AND idempotency_key = 'schedule-create-request')::text AS create_receipts
       FROM semantic_scheduled_transactions s
       JOIN semantic_transactions t
         ON t.budget_id = s.budget_id
        AND t.scheduled_transaction_id = s.scheduled_transaction_id
       JOIN semantic_budgets b ON b.budget_id = s.budget_id
       JOIN semantic_budget_devices d ON d.budget_id = s.budget_id
       WHERE s.budget_id = $1 AND s.scheduled_transaction_id = 'schedule-parent'
         AND t.transaction_id = 'schedule-parent_2026-08-16'
         AND d.device_id = $2`,
      [budgetId, deviceId],
    );
    expect(terminal.rows[0]).toEqual({
      amount: "-15000",
      memo: "Schedule Test 2",
      schedule_tombstone: true,
      occurrence_amount: "-15000",
      scheduled_transaction_id: "schedule-parent",
      occurrence_tombstone: false,
      server_knowledge: "10",
      device_knowledge: "10",
      create_receipts: "1",
    });
  });

  test("persists a reciprocal transfer with replay, pair edit, and deletion", async () => {
    const budgetId = "transfer-budget";
    const deviceId = "transfer-device";
    await store.seedBudget({
      budgetId,
      budgetVersionId: "transfer-version",
      membershipId: "transfer-membership",
      principalId: "transfer-principal",
      name: "Transfer budget",
      permissions: 7,
    });
    const createAccount = async (
      accountId: string,
      payeeId: string,
      balanceId: string,
      expectedServerKnowledge: number,
      sortOrder: number,
    ) => {
      await store.commitUnlinkedAccountCreation({
        accountGroup: buildUnlinkedCheckingAccount({
          budgetId,
          accountId,
          transferPayeeId: payeeId,
          startingBalanceId: balanceId,
          startingBalancePayeeId: "transfer-starting-payee",
          immediateIncomeCategoryId: "transfer-income",
          name: accountId,
          openingBalance: 10000,
          openingDate: "2026-08-16",
          sortOrder,
        }),
        delivery: {
          changeSetId: `change-${accountId}`,
          budgetId,
          originDeviceId: deviceId,
          startingDeviceKnowledge: 0,
          endingDeviceKnowledge: 0,
          expectedServerKnowledge,
          serverKnowledgeAdvance: 2,
          schemaVersion: 44,
          idempotencyKey: `request-${accountId}`,
          payloadDigest: String(sortOrder + 1).repeat(64),
          changes: [],
          response: {},
        },
      });
    };
    await createAccount(
      "transfer-checking",
      "payee-checking",
      "balance-checking",
      0,
      0,
    );
    await createAccount(
      "transfer-savings",
      "payee-savings",
      "balance-savings",
      2,
      1,
    );

    const legs = (amount: number, memo: string) =>
      [
        {
          id: "transfer-out",
          budgetId,
          accountId: "transfer-checking",
          payeeId: "payee-savings",
          reciprocalAccountId: "transfer-savings",
          reciprocalTransactionId: "transfer-in",
          date: "2026-08-16",
          amount: -amount,
          memo,
          cleared: "Uncleared" as const,
          accepted: true,
        },
        {
          id: "transfer-in",
          budgetId,
          accountId: "transfer-savings",
          payeeId: "payee-checking",
          reciprocalAccountId: "transfer-checking",
          reciprocalTransactionId: "transfer-out",
          date: "2026-08-16",
          amount,
          memo,
          cleared: "Cleared" as const,
          accepted: true,
        },
      ] as const;
    const create = {
      mutation: { kind: "create" as const, legs: legs(12340, "Transfer 1") },
      delivery: {
        changeSetId: "transfer-create-change",
        budgetId,
        originDeviceId: deviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 8,
        expectedServerKnowledge: 4,
        serverKnowledgeAdvance: 2 as const,
        schemaVersion: 44,
        idempotencyKey: "transfer-create-request",
        payloadDigest: "3".repeat(64),
        changes: [],
        response: { accepted: true },
      },
    };
    await expect(store.commitTransferMutation(create)).resolves.toMatchObject({
      replayed: false,
      serverKnowledge: 6,
    });
    await expect(store.commitTransferMutation(create)).resolves.toMatchObject({
      replayed: true,
      serverKnowledge: 6,
    });
    await store.commitTransferMutation({
      mutation: {
        kind: "update",
        budgetId,
        legs: legs(23450, "Transfer 2"),
      },
      delivery: {
        ...create.delivery,
        changeSetId: "transfer-update-change",
        startingDeviceKnowledge: 8,
        endingDeviceKnowledge: 10,
        expectedServerKnowledge: 6,
        idempotencyKey: "transfer-update-request",
        payloadDigest: "4".repeat(64),
      },
    });
    await store.commitTransferMutation({
      mutation: {
        kind: "delete",
        budgetId,
        transactionIds: ["transfer-out", "transfer-in"],
      },
      delivery: {
        ...create.delivery,
        changeSetId: "transfer-delete-change",
        startingDeviceKnowledge: 10,
        endingDeviceKnowledge: 18,
        expectedServerKnowledge: 8,
        idempotencyKey: "transfer-delete-request",
        payloadDigest: "5".repeat(64),
      },
    });
    const terminal = await pool.query(
      `SELECT transaction_id, amount_milliunits::text AS amount, memo,
              is_tombstone, payee_id, transfer_account_id,
              reciprocal_transaction_id, transaction_kind
       FROM semantic_transactions
       WHERE budget_id = $1 AND transaction_id IN ('transfer-out', 'transfer-in')
       ORDER BY transaction_id`,
      [budgetId],
    );
    expect(terminal.rows).toEqual([
      {
        transaction_id: "transfer-in",
        amount: "23450",
        memo: "Transfer 2",
        is_tombstone: true,
        payee_id: null,
        transfer_account_id: null,
        reciprocal_transaction_id: null,
        transaction_kind: "transfer",
      },
      {
        transaction_id: "transfer-out",
        amount: "-23450",
        memo: "Transfer 2",
        is_tombstone: true,
        payee_id: null,
        transfer_account_id: null,
        reciprocal_transaction_id: null,
        transaction_kind: "transfer",
      },
    ]);
  });

  test("commits and exactly replays an isolated catalog command", async () => {
    const operation = {
      changeSetId: "catalog-change-integration",
      principalId: "catalog-principal-integration",
      originDeviceId: "catalog-device-integration",
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
      schemaVersion: 1,
      commandKind: "create-budget",
      idempotencyKey: "catalog-request-integration",
      payloadDigest: "e".repeat(64),
      changes: [
        {
          entityKind: "budget-membership",
          entityId: "catalog-membership-integration",
          isTombstone: false,
          payload: {
            budgetId: "catalog-budget-integration",
            name: "Catalog integration budget",
          },
        },
      ],
      response: {
        budgetId: "catalog-budget-integration",
        budgetVersionId: "catalog-version-integration",
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
      change_count: "1",
      entity_count: "1",
      receipt_count: "1",
      schema_version: 1,
    });

    await expect(
      store.commitCatalogCommand({
        ...operation,
        payloadDigest: "f".repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test("records a coalesced device acknowledgement without a second change set", async () => {
    await store.seedBudget({
      budgetId: "ack-budget-integration",
      budgetVersionId: "ack-version-integration",
      membershipId: "ack-membership-integration",
      principalId: "ack-principal-integration",
      name: "Acknowledgement budget",
      permissions: 7,
    });
    await store.commitChangeSet({
      changeSetId: "ack-source-change-integration",
      budgetId: "ack-budget-integration",
      originDeviceId: "ack-device-integration",
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 1,
      expectedServerKnowledge: 0,
      serverKnowledgeAdvance: 1,
      schemaVersion: 1,
      idempotencyKey: "ack-source-request-integration",
      payloadDigest: "f".repeat(64),
      changes: [
        {
          entityKind: "example",
          entityId: "ack-source-entity-integration",
          isTombstone: false,
          payload: { name: "already committed rename" },
        },
      ],
      response: { accepted: true },
    });

    const acknowledgement = {
      budgetId: "ack-budget-integration",
      originDeviceId: "ack-device-integration",
      startingDeviceKnowledge: 1,
      endingDeviceKnowledge: 3,
      expectedServerKnowledge: 1,
      idempotencyKey: "ack-budget-request-integration",
      payloadDigest: "1".repeat(64),
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
      ["ack-budget-integration", "ack-device-integration"],
    );
    expect(state.rows[0]).toEqual({
      server_knowledge: "1",
      server_knowledge_of_device: "3",
      change_count: "1",
      receipt_count: "2",
    });

    await expect(
      store.acknowledgeDevice({
        ...acknowledgement,
        payloadDigest: "2".repeat(64),
      }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });

  test("atomically creates and exactly replays the admitted PLAN-001 bootstrap", async () => {
    const entities = buildStockBudgetBootstrap({
      budgetId: "created-budget-integration",
      budgetVersionId: "created-version-integration",
      principalId: "created-principal-integration",
      name: "Created integration plan",
      currencyFormat: { iso_code: "USD" },
      dateFormat: { format: "MM/DD/YYYY" },
      createdOn: "2026-08-16",
      createdAtMilliseconds: 1786954979513,
      allocateId: (label) => `created-${label}`,
    });
    const operation = {
      catalogChangeSetId: "created-catalog-change-integration",
      budgetChangeSetId: "created-budget-change-integration",
      budgetId: "created-budget-integration",
      budgetVersionId: "created-version-integration",
      membershipId: "created-membership-integration",
      principalId: "created-principal-integration",
      originDeviceId: "created-device-integration",
      expectedCatalogServerKnowledge: 0,
      schemaVersion: 1,
      idempotencyKey: "created-request-integration",
      payloadDigest: "1".repeat(64),
      name: "Created integration plan",
      permissions: 1,
      currencyFormat: { iso_code: "USD" },
      dateFormat: { format: "MM/DD/YYYY" },
      entities,
      receipt: {
        budgetId: "created-budget-integration",
        budgetVersionId: "created-version-integration",
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
        budgetId: "ignored-retry-plan",
        budgetVersionId: "ignored-retry-version",
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
      category_groups: string;
      categories: string;
      monthly_category_budgets: string;
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
          WHERE principal_id = $2 AND device_id = $4) AS receipt_ending_knowledge,
         (SELECT count(*) FROM semantic_category_groups
          WHERE budget_id = $1) AS category_groups,
         (SELECT count(*) FROM semantic_categories
          WHERE budget_id = $1) AS categories,
         (SELECT count(*) FROM semantic_monthly_category_budgets
          WHERE budget_id = $1) AS monthly_category_budgets`,
      [
        operation.budgetId,
        operation.principalId,
        operation.budgetChangeSetId,
        operation.originDeviceId,
      ],
    );
    expect(state.rows[0]).toEqual({
      plans: "1",
      memberships: "1",
      catalog_changes: "1",
      budget_changes: "1",
      entity_changes: "58",
      entity_snapshots: "58",
      catalog_receipts: "1",
      budget_receipts: "1",
      catalog_device_knowledge: "7",
      receipt_starting_knowledge: "7",
      receipt_ending_knowledge: "7",
      category_groups: "6",
      categories: "12",
      monthly_category_budgets: "24",
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
        "different-principal",
        operation.budgetVersionId,
      ),
    ).resolves.toBeNull();

    await expect(
      store.createBudget({ ...operation, payloadDigest: "2".repeat(64) }),
    ).rejects.toBeInstanceOf(SemanticStoreError);
  });
});
