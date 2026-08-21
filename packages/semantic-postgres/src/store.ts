import type {
  BudgetDeviceAcknowledgement,
  BudgetMembership,
  CatalogCommand,
  CatalogCommandResult,
  CatalogSnapshot,
  CommitCanonicalAccountClose,
  CommitCanonicalAccountRename,
  CommitCanonicalAccountReopen,
  CommitCanonicalCategoryAssignment,
  CommitCanonicalCategoryMutation,
  CommitCanonicalCreditCardPaymentMutation,
  CommitCanonicalOrdinaryPayeeMutation,
  CommitCanonicalOrdinaryTransactionMutation,
  CommitCanonicalPristineAccountDeletion,
  CommitCanonicalScheduledTransactionMutation,
  CommitCanonicalSplitTransactionMutation,
  CommitCanonicalTransferMutation,
  CommitUnlinkedAccountCreation,
  CreateBudgetCommand,
  CreateBudgetResult,
  PrincipalId,
  CanonicalOrdinaryTransaction,
} from '@actual-app/semantic-core';
import type { Pool, PoolClient } from 'pg';

import { writeCanonicalCategoryAssignment } from './assignment-store';
import { writeCanonicalBudgetBootstrap } from './budget-bootstrap-store';
import { writeCanonicalCreditCardPaymentMutation } from './credit-card-payment-store';
import { SemanticStoreError } from './errors';
import { writeCanonicalScheduledTransactionMutation } from './scheduled-transaction-store';
import { writeCanonicalSplitTransactionMutation } from './split-transaction-store';
import { writeCanonicalTargetReplacement } from './target-store';
import { writeCanonicalTransferMutation } from './transfer-store';
import type {
  CommitChangeSetInput,
  CommitChangeSetResult,
  SeedBudgetInput,
} from './types';

type BudgetKnowledgeRow = {
  server_knowledge: string;
};

type DeviceKnowledgeRow = {
  server_knowledge_of_device: string;
};

type ReceiptRow = {
  payload_digest: string;
  ending_device_knowledge: string;
  server_knowledge: string;
  response: Readonly<Record<string, unknown>>;
};

type CatalogKnowledgeCommandRow = {
  server_knowledge: string;
};

type CatalogDeviceKnowledgeRow = {
  server_knowledge_of_device: string;
};

type CatalogReceiptRow = ReceiptRow;

type DeviceCommand = Pick<
  CommitChangeSetInput,
  'budgetId' | 'originDeviceId' | 'idempotencyKey' | 'payloadDigest'
>;

type CatalogRow = {
  catalog_server_knowledge: string;
  membership_id: string | null;
  budget_id: string | null;
  budget_version_id: string | null;
  principal_id: string | null;
  name: string | null;
  permissions: string | null;
  last_modified_at: Date | string | null;
  source: string | null;
  is_tombstone: boolean | null;
};

export class PostgresSemanticStore {
  constructor(private readonly pool: Pool) {}

  async seedBudget(input: SeedBudgetInput): Promise<void> {
    validateSeedBudget(input);
    await this.transact(async client => {
      await client.query(
        `INSERT INTO semantic_budgets
           (budget_id, budget_version_id, name)
         VALUES ($1, $2, $3)`,
        [input.budgetId, input.budgetVersionId, input.name.trim()],
      );
      await client.query(
        `INSERT INTO semantic_budget_memberships
           (membership_id, budget_id, principal_id, permissions)
         VALUES ($1, $2, $3, $4)`,
        [
          input.membershipId,
          input.budgetId,
          input.principalId,
          input.permissions,
        ],
      );
      await client.query(
        `INSERT INTO semantic_catalog_knowledge
           (principal_id, server_knowledge)
         VALUES ($1, 1)
         ON CONFLICT (principal_id) DO UPDATE SET
           server_knowledge = semantic_catalog_knowledge.server_knowledge + 1,
           updated_at = now()`,
        [input.principalId],
      );
    });
  }

  async createBudget(
    command: CreateBudgetCommand,
  ): Promise<CreateBudgetResult> {
    validateCreateBudgetCommand(command);
    return this.transact(async client => {
      await lockCreateBudgetIdempotencyKey(client, command);
      const replay = await findCreateBudgetReceipt(client, command);
      if (replay) {
        return replay;
      }

      const catalogKnowledge = await lockCatalogKnowledge(
        client,
        command.principalId,
      );
      if (catalogKnowledge !== command.expectedCatalogServerKnowledge) {
        throw new SemanticStoreError(
          'SERVER_KNOWLEDGE_MISMATCH',
          `Expected catalog server knowledge ${command.expectedCatalogServerKnowledge}, received ${catalogKnowledge}`,
        );
      }
      const catalogDeviceKnowledge = await lockCreateBudgetCatalogDevice(
        client,
        command,
      );

      const nextCatalogKnowledge = catalogKnowledge + 1;
      const budgetKnowledge = 1;
      await client.query(
        `INSERT INTO semantic_budgets
           (budget_id, budget_version_id, name, server_knowledge,
            currency_format, date_format)
         VALUES ($1, $2, $3, 0, $4, $5)`,
        [
          command.budgetId,
          command.budgetVersionId,
          command.name.trim(),
          command.currencyFormat,
          command.dateFormat,
        ],
      );
      await client.query(
        `INSERT INTO semantic_budget_memberships
           (membership_id, budget_id, principal_id, permissions)
         VALUES ($1, $2, $3, $4)`,
        [
          command.membershipId,
          command.budgetId,
          command.principalId,
          command.permissions,
        ],
      );

      const membershipPayload = {
        id: command.membershipId,
        budgetId: command.budgetId,
        budgetVersionId: command.budgetVersionId,
        principalId: command.principalId,
        name: command.name.trim(),
        permissions: command.permissions,
      };
      await insertCatalogChangeSet(
        client,
        {
          changeSetId: command.catalogChangeSetId,
          principalId: command.principalId,
          originDeviceId: command.originDeviceId,
          startingDeviceKnowledge: catalogDeviceKnowledge,
          endingDeviceKnowledge: catalogDeviceKnowledge,
          expectedServerKnowledge: command.expectedCatalogServerKnowledge,
          schemaVersion: command.schemaVersion,
          commandKind: 'create-budget',
          idempotencyKey: command.idempotencyKey,
          payloadDigest: command.payloadDigest,
          changes: [
            {
              entityKind: 'ce_user_budgets',
              entityId: command.membershipId,
              isTombstone: false,
              payload: membershipPayload,
            },
          ],
          response: command.receipt,
        },
        nextCatalogKnowledge,
      );
      await client.query(
        `INSERT INTO semantic_catalog_entity_changes
           (change_set_id, ordinal, entity_kind, entity_id,
            is_tombstone, payload)
         VALUES ($1, 0, 'ce_user_budgets', $2, false, $3)`,
        [command.catalogChangeSetId, command.membershipId, membershipPayload],
      );

      const budgetChangeSet: CommitChangeSetInput = {
        changeSetId: command.budgetChangeSetId,
        budgetId: command.budgetId,
        originDeviceId: command.originDeviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        serverKnowledgeAdvance: 1,
        schemaVersion: command.schemaVersion,
        idempotencyKey: command.idempotencyKey,
        payloadDigest: command.payloadDigest,
        changes: command.entities,
        response: command.receipt,
      };
      await insertChangeSet(client, budgetChangeSet, budgetKnowledge);
      await insertEntityChanges(client, budgetChangeSet);
      await upsertBudgetEntities(client, budgetChangeSet, budgetKnowledge);
      await writeCanonicalBudgetBootstrap(client, command.budgetId);

      await client.query(
        `UPDATE semantic_budgets
         SET server_knowledge = $2, updated_at = now()
         WHERE budget_id = $1`,
        [command.budgetId, budgetKnowledge],
      );
      await client.query(
        `UPDATE semantic_catalog_knowledge
         SET server_knowledge = $2, updated_at = now()
         WHERE principal_id = $1`,
        [command.principalId, nextCatalogKnowledge],
      );
      await client.query(
        `INSERT INTO semantic_budget_devices
           (budget_id, device_id, server_knowledge_of_device)
         VALUES ($1, $2, 0)`,
        [command.budgetId, command.originDeviceId],
      );
      await insertCreateBudgetReceipts(
        client,
        command,
        nextCatalogKnowledge,
        budgetKnowledge,
        catalogDeviceKnowledge,
      );

      return {
        replayed: false,
        catalogServerKnowledge: nextCatalogKnowledge,
        budgetServerKnowledge: budgetKnowledge,
        budget: command.receipt,
      };
    });
  }

  async readCatalog(principalId: PrincipalId): Promise<CatalogSnapshot> {
    const result = await this.pool.query<CatalogRow>(
      `SELECT COALESCE(k.server_knowledge, 0) AS catalog_server_knowledge,
              m.membership_id, m.budget_id, p.budget_version_id,
              m.principal_id,
              CASE WHEN m.is_tombstone OR p.is_tombstone
                   THEN 'Unknown' ELSE p.name END AS name,
              m.permissions,
              m.updated_at AS last_modified_at,
              NULL::text AS source,
              CASE WHEN m.membership_id IS NULL THEN NULL
                   ELSE (m.is_tombstone OR p.is_tombstone)
              END AS is_tombstone
       FROM (SELECT $1::text AS principal_id) requested
       LEFT JOIN semantic_catalog_knowledge k
         ON k.principal_id = requested.principal_id
       LEFT JOIN semantic_budget_memberships m
         ON m.principal_id = requested.principal_id
       LEFT JOIN semantic_budgets p ON p.budget_id = m.budget_id
       ORDER BY p.created_at, p.budget_id`,
      [principalId],
    );

    return {
      knowledge: {
        principalId,
        currentServerKnowledge: toSafeInteger(
          result.rows[0]?.catalog_server_knowledge ?? '0',
          'catalog server knowledge',
        ),
      },
      memberships: result.rows.filter(hasMembership).map(mapMembership),
    };
  }

  async commitCatalogCommand(
    command: CatalogCommand,
  ): Promise<CatalogCommandResult> {
    validateCatalogCommand(command);
    return this.transact(async client => {
      await lockCatalogIdempotencyKey(client, command);
      const replay = await findCatalogReceipt(client, command);
      if (replay) {
        return replay;
      }

      const currentServerKnowledge = await lockCatalogKnowledge(
        client,
        command.principalId,
      );
      if (currentServerKnowledge !== command.expectedServerKnowledge) {
        throw new SemanticStoreError(
          'SERVER_KNOWLEDGE_MISMATCH',
          `Expected catalog server knowledge ${command.expectedServerKnowledge}, received ${currentServerKnowledge}`,
        );
      }

      const deviceKnowledge = await lockCatalogDeviceKnowledge(client, command);
      if (deviceKnowledge !== command.startingDeviceKnowledge) {
        throw new SemanticStoreError(
          'DEVICE_KNOWLEDGE_MISMATCH',
          `Expected catalog device knowledge ${command.startingDeviceKnowledge}, received ${deviceKnowledge}`,
        );
      }

      const nextServerKnowledge = currentServerKnowledge + 1;
      await insertCatalogChangeSet(client, command, nextServerKnowledge);
      await insertCatalogEntityChanges(client, command);
      await client.query(
        `UPDATE semantic_catalog_knowledge
         SET server_knowledge = $2, updated_at = now()
         WHERE principal_id = $1`,
        [command.principalId, nextServerKnowledge],
      );
      await client.query(
        `UPDATE semantic_catalog_devices
         SET server_knowledge_of_device = $3, updated_at = now()
         WHERE principal_id = $1 AND device_id = $2`,
        [
          command.principalId,
          command.originDeviceId,
          command.endingDeviceKnowledge,
        ],
      );
      await client.query(
        `INSERT INTO semantic_catalog_command_receipts
           (principal_id, device_id, idempotency_key, payload_digest,
            starting_device_knowledge, ending_device_knowledge,
            server_knowledge, response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          command.principalId,
          command.originDeviceId,
          command.idempotencyKey,
          command.payloadDigest,
          command.startingDeviceKnowledge,
          command.endingDeviceKnowledge,
          nextServerKnowledge,
          command.response,
        ],
      );

      return {
        replayed: false,
        serverKnowledge: nextServerKnowledge,
        endingDeviceKnowledge: command.endingDeviceKnowledge,
        response: command.response,
      };
    });
  }

  async commitChangeSet(
    input: CommitChangeSetInput,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(input);
    return this.transact(client => commitChangeSetInTransaction(client, input));
  }

  async commitUnlinkedAccountCreation(
    command: CommitUnlinkedAccountCreation,
  ): Promise<CommitChangeSetResult> {
    validateCanonicalAccountCreation(command);
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        insertCanonicalAccountGroup(client, command),
      ),
    );
  }

  async commitAccountRename(
    command: CommitCanonicalAccountRename,
  ): Promise<CommitChangeSetResult> {
    validateCanonicalAccountRename(command);
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        updateCanonicalAccountName(client, command),
      ),
    );
  }

  async commitPristineAccountDeletion(
    command: CommitCanonicalPristineAccountDeletion,
  ): Promise<CommitChangeSetResult> {
    validateCanonicalPristineAccountDeletion(command);
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        tombstoneCanonicalPristineAccount(client, command),
      ),
    );
  }

  async commitAccountClose(
    command: CommitCanonicalAccountClose,
  ): Promise<CommitChangeSetResult> {
    validateCanonicalAccountClose(command);
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        closeCanonicalAccount(client, command),
      ),
    );
  }

  async commitAccountReopen(
    command: CommitCanonicalAccountReopen,
  ): Promise<CommitChangeSetResult> {
    validateCanonicalAccountReopen(command);
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        setCanonicalAccountClosed(
          client,
          command.budgetId,
          command.accountId,
          false,
        ),
      ),
    );
  }

  async commitCategoryMutation(
    command: CommitCanonicalCategoryMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalCategoryMutation(client, command),
      ),
    );
  }

  async commitCategoryAssignment(
    command: CommitCanonicalCategoryAssignment,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalCategoryAssignment(client, command),
      ),
    );
  }

  async commitOrdinaryTransactionMutation(
    command: CommitCanonicalOrdinaryTransactionMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalOrdinaryTransactionMutation(client, command),
      ),
    );
  }

  async commitOrdinaryPayeeMutation(
    command: CommitCanonicalOrdinaryPayeeMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalOrdinaryPayeeMutation(client, command),
      ),
    );
  }

  async commitSplitTransactionMutation(
    command: CommitCanonicalSplitTransactionMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalSplitTransactionMutation(client, command),
      ),
    );
  }

  async commitTransferMutation(
    command: CommitCanonicalTransferMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalTransferMutation(client, command),
      ),
    );
  }

  async commitCreditCardPaymentMutation(
    command: CommitCanonicalCreditCardPaymentMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalCreditCardPaymentMutation(client, command),
      ),
    );
  }

  async commitScheduledTransactionMutation(
    command: CommitCanonicalScheduledTransactionMutation,
  ): Promise<CommitChangeSetResult> {
    validateChangeSet(command.delivery);
    return this.transact(client =>
      commitChangeSetInTransaction(client, command.delivery, () =>
        writeCanonicalScheduledTransactionMutation(client, command),
      ),
    );
  }

  async acknowledgeDevice(
    input: BudgetDeviceAcknowledgement,
  ): Promise<CommitChangeSetResult> {
    validateDeviceAcknowledgement(input);
    return this.transact(async client => {
      await lockIdempotencyKey(client, input);
      const replay = await findReceipt(client, input);
      if (replay) {
        return replay;
      }
      const budget = await client.query<BudgetKnowledgeRow>(
        `SELECT server_knowledge FROM semantic_budgets
         WHERE budget_id = $1 AND is_tombstone = false FOR UPDATE`,
        [input.budgetId],
      );
      if (budget.rowCount !== 1) {
        throw new SemanticStoreError(
          'BUDGET_NOT_FOUND',
          `Active budget ${input.budgetId} was not found`,
        );
      }
      const serverKnowledge = toSafeInteger(
        budget.rows[0].server_knowledge,
        'budget server knowledge',
      );
      if (serverKnowledge !== input.expectedServerKnowledge) {
        throw new SemanticStoreError(
          'SERVER_KNOWLEDGE_MISMATCH',
          `Expected server knowledge ${input.expectedServerKnowledge}, received ${serverKnowledge}`,
        );
      }
      const deviceKnowledge = await lockDeviceKnowledge(client, input);
      if (deviceKnowledge !== input.startingDeviceKnowledge) {
        throw new SemanticStoreError(
          'DEVICE_KNOWLEDGE_MISMATCH',
          `Expected device knowledge ${input.startingDeviceKnowledge}, received ${deviceKnowledge}`,
        );
      }
      await client.query(
        `UPDATE semantic_budget_devices
         SET server_knowledge_of_device = $3, updated_at = now()
         WHERE budget_id = $1 AND device_id = $2`,
        [input.budgetId, input.originDeviceId, input.endingDeviceKnowledge],
      );
      await client.query(
        `INSERT INTO semantic_budget_device_receipts
           (budget_id, device_id, idempotency_key, payload_digest,
            starting_device_knowledge, ending_device_knowledge,
            server_knowledge, response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.budgetId,
          input.originDeviceId,
          input.idempotencyKey,
          input.payloadDigest,
          input.startingDeviceKnowledge,
          input.endingDeviceKnowledge,
          serverKnowledge,
          input.response,
        ],
      );
      return {
        replayed: false,
        serverKnowledge,
        endingDeviceKnowledge: input.endingDeviceKnowledge,
        response: input.response,
      };
    });
  }

  private async transact<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function commitChangeSetInTransaction(
  client: PoolClient,
  input: CommitChangeSetInput,
  writeCanonical?: () => Promise<void>,
): Promise<CommitChangeSetResult> {
  await lockIdempotencyKey(client, input);
  const replay = await findReceipt(client, input);
  if (replay) {
    return replay;
  }

  const budget = await client.query<BudgetKnowledgeRow>(
    `SELECT server_knowledge
     FROM semantic_budgets
     WHERE budget_id = $1 AND is_tombstone = false
     FOR UPDATE`,
    [input.budgetId],
  );
  if (budget.rowCount !== 1) {
    throw new SemanticStoreError(
      'BUDGET_NOT_FOUND',
      `Active budget ${input.budgetId} was not found`,
    );
  }
  const currentServerKnowledge = toSafeInteger(
    budget.rows[0].server_knowledge,
    'budget server knowledge',
  );
  if (currentServerKnowledge !== input.expectedServerKnowledge) {
    throw new SemanticStoreError(
      'SERVER_KNOWLEDGE_MISMATCH',
      `Expected server knowledge ${input.expectedServerKnowledge}, received ${currentServerKnowledge}`,
    );
  }

  const deviceKnowledge = await lockDeviceKnowledge(client, input);
  if (deviceKnowledge !== input.startingDeviceKnowledge) {
    throw new SemanticStoreError(
      'DEVICE_KNOWLEDGE_MISMATCH',
      `Expected device knowledge ${input.startingDeviceKnowledge}, received ${deviceKnowledge}`,
    );
  }

  const nextServerKnowledge =
    currentServerKnowledge + input.serverKnowledgeAdvance;
  await writeCanonical?.();
  await insertChangeSet(client, input, nextServerKnowledge);
  await insertEntityChanges(client, input);
  await upsertBudgetEntities(client, input, nextServerKnowledge);
  await client.query(
    `UPDATE semantic_budgets
     SET server_knowledge = $2, updated_at = now()
     WHERE budget_id = $1`,
    [input.budgetId, nextServerKnowledge],
  );
  await client.query(
    `INSERT INTO semantic_budget_devices
       (budget_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, $3)
     ON CONFLICT (budget_id, device_id) DO UPDATE SET
       server_knowledge_of_device = EXCLUDED.server_knowledge_of_device,
       updated_at = now()`,
    [input.budgetId, input.originDeviceId, input.endingDeviceKnowledge],
  );
  await client.query(
    `INSERT INTO semantic_budget_device_receipts
       (budget_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.budgetId,
      input.originDeviceId,
      input.idempotencyKey,
      input.payloadDigest,
      input.startingDeviceKnowledge,
      input.endingDeviceKnowledge,
      nextServerKnowledge,
      input.response,
    ],
  );

  return {
    replayed: false,
    serverKnowledge: nextServerKnowledge,
    endingDeviceKnowledge: input.endingDeviceKnowledge,
    response: input.response,
  };
}

async function insertCanonicalAccountGroup(
  client: PoolClient,
  command: CommitUnlinkedAccountCreation,
): Promise<void> {
  const {
    account,
    transferPayee,
    startingBalance,
    paymentCategory,
    monthlyPaymentCategories,
  } = command.accountGroup;
  await client.query(
    `INSERT INTO semantic_accounts
       (budget_id, account_id, name, account_type, on_budget, is_closed,
        is_favorite, sortable_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      account.budgetId,
      account.id,
      account.name,
      account.type,
      account.isOnBudget,
      account.isClosed,
      account.isFavorite,
      account.sortOrder,
    ],
  );
  if (paymentCategory && monthlyPaymentCategories) {
    await client.query(
      `INSERT INTO semantic_category_groups
         (budget_id, category_group_id, name, sortable_index, is_hidden)
       VALUES ($1, $2, 'Credit Card Payments', 10000, false)
       ON CONFLICT (budget_id, category_group_id) DO NOTHING`,
      [paymentCategory.budgetId, paymentCategory.groupId],
    );
    await client.query(
      `INSERT INTO semantic_categories
         (budget_id, category_id, category_group_id, account_id, name,
          sortable_index, category_type, note, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, 'DBT', NULL, false)`,
      [
        paymentCategory.budgetId,
        paymentCategory.id,
        paymentCategory.groupId,
        paymentCategory.accountId,
        paymentCategory.name,
        paymentCategory.sortOrder,
      ],
    );
    for (const month of monthlyPaymentCategories) {
      await client.query(
        `INSERT INTO semantic_monthly_category_budgets
           (budget_id, monthly_category_budget_id, category_id, month,
            budgeted_milliunits, overspending_handling)
         VALUES ($1, $2, $3, $4, 0, 'AffectsBuffer')`,
        [month.budgetId, month.id, month.categoryId, month.month],
      );
    }
  }
  await client.query(
    `INSERT INTO semantic_payees
       (budget_id, payee_id, account_id, name, is_enabled)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      transferPayee.budgetId,
      transferPayee.id,
      transferPayee.accountId,
      transferPayee.name,
      transferPayee.isEnabled,
    ],
  );
  await client.query(
    `INSERT INTO semantic_transactions
       (budget_id, transaction_id, account_id, payee_id, category_id,
        transaction_date, amount_milliunits, is_cleared, is_approved,
        transaction_kind, cleared_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             'starting_balance', 'Cleared')`,
    [
      startingBalance.budgetId,
      startingBalance.id,
      startingBalance.accountId,
      startingBalance.payeeId,
      startingBalance.categoryId,
      startingBalance.date,
      startingBalance.amount,
      startingBalance.isCleared,
      startingBalance.isApproved,
    ],
  );
}

async function writeCanonicalCategoryMutation(
  client: PoolClient,
  command: CommitCanonicalCategoryMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'create') {
    const { group, category, months } = mutation;
    if (
      group.budgetId !== category.budgetId ||
      months.some(
        month =>
          month.budgetId !== category.budgetId ||
          month.categoryId !== category.id,
      )
    ) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Category creation identities do not share one budget and category',
      );
    }
    await client.query(
      `INSERT INTO semantic_category_groups
         (budget_id, category_group_id, name, sortable_index, is_hidden)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (budget_id, category_group_id) DO UPDATE SET
         name = EXCLUDED.name,
         sortable_index = EXCLUDED.sortable_index,
         is_hidden = EXCLUDED.is_hidden,
         updated_at = now()`,
      [group.budgetId, group.id, group.name, group.sortOrder, group.isHidden],
    );
    await client.query(
      `INSERT INTO semantic_categories
         (budget_id, category_id, category_group_id, name, sortable_index,
          category_type, note, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        category.budgetId,
        category.id,
        category.groupId,
        category.name,
        category.sortOrder,
        category.type,
        category.note,
        category.isHidden,
      ],
    );
    for (const month of months) {
      await client.query(
        `INSERT INTO semantic_monthly_category_budgets
           (budget_id, monthly_category_budget_id, category_id, month,
            budgeted_milliunits, goal_snoozed_at, note,
            overspending_handling)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          month.budgetId,
          month.id,
          month.categoryId,
          month.month,
          month.budgeted,
          month.goalSnoozedAt,
          month.note,
          month.overspendingHandling,
        ],
      );
    }
    return;
  }

  if (mutation.kind === 'replace-target') {
    await writeCanonicalTargetReplacement(client, mutation);
    return;
  }

  if (mutation.kind === 'update') {
    const destination = await client.query(
      `SELECT 1 FROM semantic_category_groups
       WHERE budget_id = $1 AND category_group_id = $2`,
      [mutation.budgetId, mutation.groupId],
    );
    if (destination.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Category update destination group is not canonical',
      );
    }
    const result = await client.query(
      `UPDATE semantic_categories
       SET category_group_id = $7, name = $8, sortable_index = $9,
           is_hidden = $10, updated_at = now()
       WHERE budget_id = $1 AND category_id = $2
         AND category_group_id = $3 AND name = $4
         AND sortable_index = $5 AND is_hidden = $6
         AND is_tombstone = false`,
      [
        mutation.budgetId,
        mutation.categoryId,
        mutation.expectedGroupId,
        mutation.expectedName,
        mutation.expectedSortOrder,
        mutation.expectedHidden,
        mutation.groupId,
        mutation.name,
        mutation.sortOrder,
        mutation.isHidden,
      ],
    );
    if (result.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Category update did not match one live canonical category',
      );
    }
    return;
  }

  const references = await client.query(
    `SELECT 1 FROM semantic_transactions
     WHERE budget_id = $1 AND category_id = $2 AND is_tombstone = false
     LIMIT 1 FOR UPDATE`,
    [mutation.budgetId, mutation.categoryId],
  );
  if (references.rowCount !== 0) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Category deletion is not admitted for a referenced category',
    );
  }
  const months = await client.query(
    `UPDATE semantic_monthly_category_budgets
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND category_id = $2
       AND monthly_category_budget_id = ANY($3::text[])
       AND is_tombstone = false`,
    [
      mutation.budgetId,
      mutation.categoryId,
      [...mutation.monthlyCategoryBudgetIds],
    ],
  );
  const category = await client.query(
    `UPDATE semantic_categories
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND category_id = $2 AND is_tombstone = false`,
    [mutation.budgetId, mutation.categoryId],
  );
  if (months.rowCount !== 2 || category.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Category deletion requires one category and exactly two monthly rows',
    );
  }
}

async function writeCanonicalOrdinaryTransactionMutation(
  client: PoolClient,
  command: CommitCanonicalOrdinaryTransactionMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'create-with-payee') {
    const { payee, transaction } = mutation;
    if (
      payee.budgetId !== transaction.budgetId ||
      transaction.payeeId !== payee.id
    ) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Ordinary payee and transaction identities do not share one aggregate',
      );
    }
    await client.query(
      `INSERT INTO semantic_payees
         (budget_id, payee_id, account_id, name, is_enabled,
          auto_fill_category_id, auto_fill_user_defined_category_id,
          auto_fill_memo, auto_fill_amount_milliunits,
          auto_fill_category_enabled, auto_fill_memo_enabled,
          auto_fill_amount_enabled, rename_on_import_enabled, internal_name)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        payee.budgetId,
        payee.id,
        payee.name,
        payee.isEnabled,
        payee.autoFillCategoryId,
        payee.autoFillUserDefinedCategoryId,
        payee.autoFillMemo,
        payee.autoFillAmount,
        payee.autoFillCategoryEnabled,
        payee.autoFillMemoEnabled,
        payee.autoFillAmountEnabled,
        payee.renameOnImportEnabled,
        payee.internalName,
      ],
    );
    await insertCanonicalOrdinaryTransaction(client, transaction);
    return;
  }

  if (mutation.kind === 'create') {
    if (mutation.transaction.payeeId !== null) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Ordinary transaction-only creation requires a null payee',
      );
    }
    await insertCanonicalOrdinaryTransaction(client, mutation.transaction);
    return;
  }

  const transaction = await client.query(
    `UPDATE semantic_transactions
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND transaction_id = $2
       AND transaction_kind = 'ordinary' AND is_tombstone = false`,
    [mutation.budgetId, mutation.transactionId],
  );
  if (transaction.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Ordinary transaction deletion did not match one live transaction',
    );
  }
}

async function insertCanonicalOrdinaryTransaction(
  client: PoolClient,
  transaction: CanonicalOrdinaryTransaction,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_transactions
       (budget_id, transaction_id, account_id, payee_id, category_id,
        transaction_date, amount_milliunits, is_cleared, is_approved,
        transaction_kind, memo, cleared_state, check_number, flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             ($8 <> 'Uncleared'), $9, 'ordinary', $10, $8, $11, $12)`,
    [
      transaction.budgetId,
      transaction.id,
      transaction.accountId,
      transaction.payeeId,
      transaction.categoryId,
      transaction.date,
      transaction.amount,
      transaction.cleared,
      transaction.accepted,
      transaction.memo,
      transaction.checkNumber,
      transaction.flag,
    ],
  );
}

async function writeCanonicalOrdinaryPayeeMutation(
  client: PoolClient,
  command: CommitCanonicalOrdinaryPayeeMutation,
): Promise<void> {
  const mutation = command.mutation;
  if (mutation.kind === 'rename') {
    const payee = await client.query(
      `UPDATE semantic_payees
       SET name = $4, updated_at = now()
       WHERE budget_id = $1 AND payee_id = $2 AND account_id IS NULL
         AND name = $3 AND is_tombstone = false`,
      [
        mutation.budgetId,
        mutation.payeeId,
        mutation.expectedName,
        mutation.name,
      ],
    );
    if (payee.rowCount !== 1) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'Ordinary payee rename did not match one live payee',
      );
    }
    return;
  }

  const current = await client.query(
    `SELECT 1 FROM semantic_payees
     WHERE budget_id = $1 AND payee_id = $2 AND account_id IS NULL
       AND is_tombstone = false
     FOR UPDATE`,
    [mutation.budgetId, mutation.payeeId],
  );
  if (current.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Ordinary payee deletion did not match one unused live payee',
    );
  }
  const liveReferences = await client.query(
    `SELECT 1 FROM semantic_transactions
     WHERE budget_id = $1 AND payee_id = $2 AND is_tombstone = false
     LIMIT 1 FOR UPDATE`,
    [mutation.budgetId, mutation.payeeId],
  );
  if (liveReferences.rowCount !== 0) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Ordinary payee deletion is not admitted while live transactions refer to it',
    );
  }
  const payee = await client.query(
    `UPDATE semantic_payees
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND payee_id = $2 AND account_id IS NULL
       AND is_tombstone = false`,
    [mutation.budgetId, mutation.payeeId],
  );
  if (payee.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Ordinary payee deletion did not match one unused live payee',
    );
  }
}

async function updateCanonicalAccountName(
  client: PoolClient,
  command: CommitCanonicalAccountRename,
): Promise<void> {
  const { rename } = command;
  const account = await client.query(
    `UPDATE semantic_accounts
     SET name = $4, updated_at = now()
     WHERE budget_id = $1 AND account_id = $2 AND name = $3
       AND is_tombstone = false`,
    [
      rename.budgetId,
      rename.accountId,
      rename.expectedAccountName,
      rename.name,
    ],
  );
  const payee = await client.query(
    `UPDATE semantic_payees
     SET name = $5, updated_at = now()
     WHERE budget_id = $1 AND payee_id = $2 AND account_id = $3
       AND name = $4 AND is_tombstone = false`,
    [
      rename.budgetId,
      rename.transferPayeeId,
      rename.accountId,
      rename.expectedTransferPayeeName,
      `Transfer : ${rename.name}`,
    ],
  );
  if (account.rowCount !== 1 || payee.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Account rename did not match one live canonical account group',
    );
  }
}

async function tombstoneCanonicalPristineAccount(
  client: PoolClient,
  command: CommitCanonicalPristineAccountDeletion,
): Promise<void> {
  const { deletion } = command;
  const liveTransactions = await client.query<{
    transaction_id: string;
    transaction_kind: string;
  }>(
    `SELECT transaction_id, transaction_kind
     FROM semantic_transactions
     WHERE budget_id = $1 AND account_id = $2 AND is_tombstone = false
     FOR UPDATE`,
    [deletion.budgetId, deletion.accountId],
  );
  if (
    liveTransactions.rowCount !== 1 ||
    liveTransactions.rows[0]?.transaction_id !==
      deletion.startingBalanceTransactionId ||
    liveTransactions.rows[0]?.transaction_kind !== 'starting_balance'
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Pristine deletion requires exactly one live canonical transaction',
    );
  }
  const transaction = await client.query(
    `UPDATE semantic_transactions
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND transaction_id = $2 AND account_id = $3
       AND is_tombstone = false`,
    [
      deletion.budgetId,
      deletion.startingBalanceTransactionId,
      deletion.accountId,
    ],
  );
  const payee = await client.query(
    `UPDATE semantic_payees
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND payee_id = $2 AND account_id = $3
       AND is_tombstone = false`,
    [deletion.budgetId, deletion.transferPayeeId, deletion.accountId],
  );
  const account = await client.query(
    `UPDATE semantic_accounts
     SET is_tombstone = true, updated_at = now()
     WHERE budget_id = $1 AND account_id = $2 AND is_closed = false
       AND is_tombstone = false`,
    [deletion.budgetId, deletion.accountId],
  );
  if (
    transaction.rowCount !== 1 ||
    payee.rowCount !== 1 ||
    account.rowCount !== 1
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Pristine deletion did not match one live canonical account group',
    );
  }
}

async function closeCanonicalAccount(
  client: PoolClient,
  command: CommitCanonicalAccountClose,
): Promise<void> {
  await setCanonicalAccountClosed(
    client,
    command.budgetId,
    command.accountId,
    true,
  );
  const adjustment = command.adjustment;
  await client.query(
    `INSERT INTO semantic_transactions
       (budget_id, transaction_id, account_id, payee_id, category_id,
        transaction_date, amount_milliunits, is_cleared, is_approved,
        transaction_kind, memo, cleared_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, true,
             'manual_balance_adjustment', $8, 'Cleared')`,
    [
      adjustment.budgetId,
      adjustment.id,
      adjustment.accountId,
      adjustment.payeeId,
      adjustment.categoryId,
      adjustment.date,
      adjustment.amount,
      adjustment.memo,
    ],
  );
}

async function setCanonicalAccountClosed(
  client: PoolClient,
  budgetId: string,
  accountId: string,
  closed: boolean,
): Promise<void> {
  const account = await client.query(
    `UPDATE semantic_accounts
     SET is_closed = $3, updated_at = now()
     WHERE budget_id = $1 AND account_id = $2 AND is_closed = $4
       AND is_tombstone = false`,
    [budgetId, accountId, closed, !closed],
  );
  if (account.rowCount !== 1) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      `Account ${closed ? 'close' : 'reopen'} did not match one live canonical account`,
    );
  }
}

async function lockCreateBudgetIdempotencyKey(
  client: PoolClient,
  command: CreateBudgetCommand,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `catalog\u001f${command.principalId}\u001f${command.originDeviceId}\u001f${command.idempotencyKey}`,
  ]);
}

async function findCreateBudgetReceipt(
  client: PoolClient,
  command: CreateBudgetCommand,
): Promise<CreateBudgetResult | null> {
  const receipt = await client.query<CatalogReceiptRow>(
    `SELECT payload_digest, ending_device_knowledge,
            server_knowledge, response
     FROM semantic_catalog_command_receipts
     WHERE principal_id = $1 AND device_id = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [command.principalId, command.originDeviceId, command.idempotencyKey],
  );
  const row = receipt.rows[0];
  if (!row) {
    return null;
  }
  if (row.payload_digest !== command.payloadDigest) {
    throw new SemanticStoreError(
      'IDEMPOTENCY_CONFLICT',
      'The budget creation idempotency key was already used with a different payload',
    );
  }
  return {
    replayed: true,
    catalogServerKnowledge: toSafeInteger(
      row.server_knowledge,
      'catalog server knowledge',
    ),
    budgetServerKnowledge: 1,
    budget: parseCreatedBudgetReceipt(row.response),
  };
}

function parseCreatedBudgetReceipt(
  value: Readonly<Record<string, unknown>>,
): CreateBudgetCommand['receipt'] {
  if (
    typeof value.budgetId !== 'string' ||
    !value.budgetId ||
    typeof value.budgetVersionId !== 'string' ||
    !value.budgetVersionId
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'The budget creation replay receipt is malformed',
    );
  }
  return {
    budgetId: value.budgetId,
    budgetVersionId: value.budgetVersionId,
  };
}

async function lockCreateBudgetCatalogDevice(
  client: PoolClient,
  command: CreateBudgetCommand,
): Promise<number> {
  await client.query(
    `INSERT INTO semantic_catalog_devices
       (principal_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0)
     ON CONFLICT (principal_id, device_id) DO NOTHING`,
    [command.principalId, command.originDeviceId],
  );
  const result = await client.query<CatalogDeviceKnowledgeRow>(
    `SELECT server_knowledge_of_device
     FROM semantic_catalog_devices
     WHERE principal_id = $1 AND device_id = $2
     FOR UPDATE`,
    [command.principalId, command.originDeviceId],
  );
  return toSafeInteger(
    result.rows[0].server_knowledge_of_device,
    'catalog device knowledge',
  );
}

async function insertCreateBudgetReceipts(
  client: PoolClient,
  command: CreateBudgetCommand,
  catalogServerKnowledge: number,
  budgetServerKnowledge: number,
  catalogDeviceKnowledge: number,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_catalog_command_receipts
       (principal_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      command.principalId,
      command.originDeviceId,
      command.idempotencyKey,
      command.payloadDigest,
      catalogDeviceKnowledge,
      catalogDeviceKnowledge,
      catalogServerKnowledge,
      command.receipt,
    ],
  );
  await client.query(
    `INSERT INTO semantic_budget_device_receipts
       (budget_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, 0, 0, $5, $6)`,
    [
      command.budgetId,
      command.originDeviceId,
      command.idempotencyKey,
      command.payloadDigest,
      budgetServerKnowledge,
      command.receipt,
    ],
  );
}

async function lockCatalogIdempotencyKey(
  client: PoolClient,
  command: CatalogCommand,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `catalog\u001f${command.principalId}\u001f${command.originDeviceId}\u001f${command.idempotencyKey}`,
  ]);
}

async function findCatalogReceipt(
  client: PoolClient,
  command: CatalogCommand,
): Promise<CatalogCommandResult | null> {
  const receipt = await client.query<CatalogReceiptRow>(
    `SELECT payload_digest, ending_device_knowledge,
            server_knowledge, response
     FROM semantic_catalog_command_receipts
     WHERE principal_id = $1 AND device_id = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [command.principalId, command.originDeviceId, command.idempotencyKey],
  );
  const row = receipt.rows[0];
  if (!row) {
    return null;
  }
  if (row.payload_digest !== command.payloadDigest) {
    throw new SemanticStoreError(
      'IDEMPOTENCY_CONFLICT',
      'The catalog idempotency key was already used with a different payload',
    );
  }
  return {
    replayed: true,
    serverKnowledge: toSafeInteger(
      row.server_knowledge,
      'catalog server knowledge',
    ),
    endingDeviceKnowledge: toSafeInteger(
      row.ending_device_knowledge,
      'catalog ending device knowledge',
    ),
    response: row.response,
  };
}

async function lockCatalogKnowledge(
  client: PoolClient,
  principalId: PrincipalId,
): Promise<number> {
  await client.query(
    `INSERT INTO semantic_catalog_knowledge (principal_id, server_knowledge)
     VALUES ($1, 0)
     ON CONFLICT (principal_id) DO NOTHING`,
    [principalId],
  );
  const result = await client.query<CatalogKnowledgeCommandRow>(
    `SELECT server_knowledge
     FROM semantic_catalog_knowledge
     WHERE principal_id = $1
     FOR UPDATE`,
    [principalId],
  );
  return toSafeInteger(
    result.rows[0].server_knowledge,
    'catalog server knowledge',
  );
}

async function lockCatalogDeviceKnowledge(
  client: PoolClient,
  command: CatalogCommand,
): Promise<number> {
  await client.query(
    `INSERT INTO semantic_catalog_devices
       (principal_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0)
     ON CONFLICT (principal_id, device_id) DO NOTHING`,
    [command.principalId, command.originDeviceId],
  );
  const result = await client.query<CatalogDeviceKnowledgeRow>(
    `SELECT server_knowledge_of_device
     FROM semantic_catalog_devices
     WHERE principal_id = $1 AND device_id = $2
     FOR UPDATE`,
    [command.principalId, command.originDeviceId],
  );
  return toSafeInteger(
    result.rows[0].server_knowledge_of_device,
    'catalog device knowledge',
  );
}

async function insertCatalogChangeSet(
  client: PoolClient,
  command: CatalogCommand,
  serverKnowledge: number,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_catalog_change_sets
       (change_set_id, principal_id, server_knowledge, origin_device_id,
        starting_device_knowledge, ending_device_knowledge,
        schema_version, command_kind, idempotency_key, payload_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      command.changeSetId,
      command.principalId,
      serverKnowledge,
      command.originDeviceId,
      command.startingDeviceKnowledge,
      command.endingDeviceKnowledge,
      command.schemaVersion,
      command.commandKind,
      command.idempotencyKey,
      command.payloadDigest,
    ],
  );
}

async function insertCatalogEntityChanges(
  client: PoolClient,
  command: CatalogCommand,
): Promise<void> {
  for (const [ordinal, change] of command.changes.entries()) {
    await client.query(
      `INSERT INTO semantic_catalog_entity_changes
         (change_set_id, ordinal, entity_kind, entity_id,
          is_tombstone, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        command.changeSetId,
        ordinal,
        change.entityKind,
        change.entityId,
        change.isTombstone,
        change.payload,
      ],
    );
  }
}

async function lockIdempotencyKey(
  client: PoolClient,
  input: DeviceCommand,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${input.budgetId}\u001f${input.originDeviceId}\u001f${input.idempotencyKey}`,
  ]);
}

async function findReceipt(
  client: PoolClient,
  input: DeviceCommand,
): Promise<CommitChangeSetResult | null> {
  const receipt = await client.query<ReceiptRow>(
    `SELECT payload_digest, ending_device_knowledge,
            server_knowledge, response
     FROM semantic_budget_device_receipts
     WHERE budget_id = $1 AND device_id = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [input.budgetId, input.originDeviceId, input.idempotencyKey],
  );
  const row = receipt.rows[0];
  if (!row) {
    return null;
  }
  if (row.payload_digest !== input.payloadDigest) {
    throw new SemanticStoreError(
      'IDEMPOTENCY_CONFLICT',
      'The idempotency key was already used with a different payload',
    );
  }
  return {
    replayed: true,
    serverKnowledge: toSafeInteger(row.server_knowledge, 'server knowledge'),
    endingDeviceKnowledge: toSafeInteger(
      row.ending_device_knowledge,
      'ending device knowledge',
    ),
    response: row.response,
  };
}

async function lockDeviceKnowledge(
  client: PoolClient,
  input: DeviceCommand,
): Promise<number> {
  await client.query(
    `INSERT INTO semantic_budget_devices
       (budget_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0)
     ON CONFLICT (budget_id, device_id) DO NOTHING`,
    [input.budgetId, input.originDeviceId],
  );
  const result = await client.query<DeviceKnowledgeRow>(
    `SELECT server_knowledge_of_device
     FROM semantic_budget_devices
     WHERE budget_id = $1 AND device_id = $2
     FOR UPDATE`,
    [input.budgetId, input.originDeviceId],
  );
  return toSafeInteger(
    result.rows[0].server_knowledge_of_device,
    'device knowledge',
  );
}

async function insertChangeSet(
  client: PoolClient,
  input: CommitChangeSetInput,
  serverKnowledge: number,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_budget_change_sets
       (change_set_id, budget_id, server_knowledge, origin_device_id,
        starting_device_knowledge, ending_device_knowledge,
        schema_version, idempotency_key, payload_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.changeSetId,
      input.budgetId,
      serverKnowledge,
      input.originDeviceId,
      input.startingDeviceKnowledge,
      input.endingDeviceKnowledge,
      input.schemaVersion,
      input.idempotencyKey,
      input.payloadDigest,
    ],
  );
}

async function insertEntityChanges(
  client: PoolClient,
  input: CommitChangeSetInput,
): Promise<void> {
  for (const [ordinal, change] of input.changes.entries()) {
    await client.query(
      `INSERT INTO semantic_budget_entity_changes
         (change_set_id, ordinal, entity_kind, entity_id,
          is_tombstone, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.changeSetId,
        ordinal,
        change.entityKind,
        change.entityId,
        change.isTombstone,
        change.payload,
      ],
    );
  }
}

async function upsertBudgetEntities(
  client: PoolClient,
  input: CommitChangeSetInput,
  serverKnowledge: number,
): Promise<void> {
  for (const change of input.changes) {
    await client.query(
      `INSERT INTO semantic_budget_entities
         (budget_id, entity_kind, entity_id, schema_version,
          is_tombstone, payload, last_server_knowledge)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (budget_id, entity_kind, entity_id) DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         is_tombstone = EXCLUDED.is_tombstone,
         payload = EXCLUDED.payload,
         last_server_knowledge = EXCLUDED.last_server_knowledge,
         updated_at = now()`,
      [
        input.budgetId,
        change.entityKind,
        change.entityId,
        input.schemaVersion,
        change.isTombstone,
        change.payload,
        serverKnowledge,
      ],
    );
  }
}

type CatalogMembershipRow = CatalogRow & {
  membership_id: string;
  budget_id: string;
  budget_version_id: string;
  principal_id: string;
  name: string;
  permissions: string;
  last_modified_at: Date | string;
  is_tombstone: boolean;
};

function hasMembership(row: CatalogRow): row is CatalogMembershipRow {
  return (
    row.membership_id !== null &&
    row.budget_id !== null &&
    row.budget_version_id !== null &&
    row.principal_id !== null &&
    row.name !== null &&
    row.permissions !== null &&
    row.last_modified_at !== null &&
    row.is_tombstone !== null
  );
}

function mapMembership(row: CatalogMembershipRow): BudgetMembership {
  return {
    id: row.membership_id,
    budgetId: row.budget_id,
    budgetVersionId: row.budget_version_id,
    principalId: row.principal_id,
    name: row.name,
    permissions: toSafeInteger(row.permissions, 'permissions'),
    lastModifiedAt: timestamp(row.last_modified_at, 'last modified at'),
    source: row.source,
    isTombstone: row.is_tombstone,
  };
}

function timestamp(value: Date | string, label: string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SemanticStoreError('INVALID_OPERATION', `${label} is invalid`);
  }
  return parsed.toISOString();
}

function validateSeedBudget(input: SeedBudgetInput): void {
  if (
    !input.budgetId ||
    !input.budgetVersionId ||
    !input.membershipId ||
    !input.principalId ||
    !input.name.trim() ||
    !Number.isSafeInteger(input.permissions) ||
    input.permissions < 0
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Budget creation contains invalid identity, name, or permissions',
    );
  }
}

function validateCanonicalAccountCreation(
  command: CommitUnlinkedAccountCreation,
): void {
  const {
    account,
    transferPayee,
    startingBalance,
    paymentCategory,
    monthlyPaymentCategories,
  } = command.accountGroup;
  const budgetId = command.delivery.budgetId;
  const validIdentity = (value: string) => Boolean(value.trim());
  if (
    !validIdentity(budgetId) ||
    account.budgetId !== budgetId ||
    transferPayee.budgetId !== budgetId ||
    startingBalance.budgetId !== budgetId ||
    !validIdentity(account.id) ||
    !validIdentity(transferPayee.id) ||
    !validIdentity(startingBalance.id) ||
    transferPayee.accountId !== account.id ||
    startingBalance.accountId !== account.id ||
    !validIdentity(startingBalance.payeeId) ||
    !validIdentity(startingBalance.categoryId) ||
    !account.name.trim() ||
    !transferPayee.name.trim() ||
    !['checking', 'credit-card'].includes(account.type) ||
    account.isOnBudget !== true ||
    account.isClosed !== false ||
    !Number.isSafeInteger(account.sortOrder) ||
    !Number.isSafeInteger(startingBalance.amount) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(startingBalance.date)
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Account creation failed canonical storage validation',
    );
  }
  const isCredit = account.type === 'credit-card';
  if (
    isCredit !== Boolean(paymentCategory) ||
    isCredit !== Boolean(monthlyPaymentCategories) ||
    (paymentCategory &&
      (paymentCategory.budgetId !== budgetId ||
        paymentCategory.accountId !== account.id ||
        paymentCategory.type !== 'DBT' ||
        !paymentCategory.id.trim() ||
        !paymentCategory.groupId.trim() ||
        !paymentCategory.name.trim())) ||
    (monthlyPaymentCategories &&
      monthlyPaymentCategories.some(
        month =>
          month.budgetId !== budgetId ||
          month.categoryId !== paymentCategory?.id ||
          !/^\d{4}-\d{2}-01$/u.test(month.month),
      ))
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Credit-card account creation failed canonical payment-category validation',
    );
  }
}

function validateCanonicalAccountRename(
  command: CommitCanonicalAccountRename,
): void {
  const { rename, delivery } = command;
  if (
    rename.budgetId !== delivery.budgetId ||
    !rename.accountId.trim() ||
    !rename.transferPayeeId.trim() ||
    !rename.expectedAccountName.trim() ||
    !rename.expectedTransferPayeeName.trim() ||
    !rename.name.trim() ||
    rename.name !== rename.name.trim() ||
    rename.expectedTransferPayeeName !==
      `Transfer : ${rename.expectedAccountName}`
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Account rename failed canonical storage validation',
    );
  }
}

function validateCanonicalPristineAccountDeletion(
  command: CommitCanonicalPristineAccountDeletion,
): void {
  const { deletion, delivery } = command;
  if (
    deletion.budgetId !== delivery.budgetId ||
    !deletion.accountId.trim() ||
    !deletion.transferPayeeId.trim() ||
    !deletion.startingBalanceTransactionId.trim()
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Pristine account deletion failed canonical storage validation',
    );
  }
}

function validateCanonicalAccountClose(
  command: CommitCanonicalAccountClose,
): void {
  const { adjustment } = command;
  if (
    command.budgetId !== command.delivery.budgetId ||
    adjustment.budgetId !== command.budgetId ||
    adjustment.accountId !== command.accountId ||
    !command.accountId.trim() ||
    !adjustment.id.trim() ||
    !adjustment.payeeId.trim() ||
    !adjustment.categoryId.trim() ||
    !Number.isSafeInteger(adjustment.amount) ||
    adjustment.amount === 0 ||
    adjustment.memo !== 'Closed Account' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(adjustment.date)
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Account close failed canonical storage validation',
    );
  }
}

function validateCanonicalAccountReopen(
  command: CommitCanonicalAccountReopen,
): void {
  if (
    command.budgetId !== command.delivery.budgetId ||
    !command.accountId.trim()
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Account reopen failed canonical storage validation',
    );
  }
}

function validateCreateBudgetCommand(command: CreateBudgetCommand): void {
  const validKnowledge =
    Number.isSafeInteger(command.expectedCatalogServerKnowledge) &&
    command.expectedCatalogServerKnowledge >= 0;
  const identities = command.entities.map(
    entity => `${entity.entityKind}\u001f${entity.entityId}`,
  );
  const validEntities =
    command.entities.length > 0 &&
    command.entities.every(
      entity => entity.entityKind.trim() && entity.entityId.trim(),
    ) &&
    new Set(identities).size === identities.length;
  if (
    !command.catalogChangeSetId ||
    !command.budgetChangeSetId ||
    !command.budgetId ||
    !command.budgetVersionId ||
    !command.membershipId ||
    !command.principalId ||
    !command.originDeviceId ||
    !command.idempotencyKey ||
    !command.name.trim() ||
    !validKnowledge ||
    !Number.isSafeInteger(command.permissions) ||
    command.permissions < 0 ||
    !Number.isSafeInteger(command.schemaVersion) ||
    command.schemaVersion <= 0 ||
    !/^[0-9a-f]{64}$/u.test(command.payloadDigest) ||
    !validEntities
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Budget creation failed semantic storage validation',
    );
  }
}

function validateCatalogCommand(command: CatalogCommand): void {
  const validKnowledge = [
    command.startingDeviceKnowledge,
    command.endingDeviceKnowledge,
    command.expectedServerKnowledge,
  ].every(value => Number.isSafeInteger(value) && value >= 0);
  const validDigest = /^[0-9a-f]{64}$/u.test(command.payloadDigest);
  const validChanges =
    command.changes.length > 0 &&
    command.changes.every(
      change => change.entityKind.trim() && change.entityId.trim(),
    );
  if (
    !command.changeSetId ||
    !command.principalId ||
    !command.originDeviceId ||
    !command.commandKind.trim() ||
    !command.idempotencyKey ||
    !validKnowledge ||
    command.endingDeviceKnowledge < command.startingDeviceKnowledge ||
    !Number.isSafeInteger(command.schemaVersion) ||
    command.schemaVersion <= 0 ||
    !validDigest ||
    !validChanges
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Catalog command failed semantic storage validation',
    );
  }
}

function validateChangeSet(input: CommitChangeSetInput): void {
  const validKnowledge = [
    input.startingDeviceKnowledge,
    input.endingDeviceKnowledge,
    input.expectedServerKnowledge,
  ].every(value => Number.isSafeInteger(value) && value >= 0);
  const validDigest = /^[0-9a-f]{64}$/u.test(input.payloadDigest);
  const validChanges = input.changes.every(
    change => change.entityKind.trim() && change.entityId.trim(),
  );
  if (
    !input.changeSetId ||
    !input.budgetId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !validKnowledge ||
    input.endingDeviceKnowledge < input.startingDeviceKnowledge ||
    (input.serverKnowledgeAdvance !== 1 &&
      input.serverKnowledgeAdvance !== 2) ||
    !Number.isSafeInteger(input.schemaVersion) ||
    input.schemaVersion <= 0 ||
    !validDigest ||
    !validChanges
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Change set failed semantic storage validation',
    );
  }
}

function validateDeviceAcknowledgement(
  input: BudgetDeviceAcknowledgement,
): void {
  if (
    !input.budgetId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !Number.isSafeInteger(input.startingDeviceKnowledge) ||
    !Number.isSafeInteger(input.endingDeviceKnowledge) ||
    !Number.isSafeInteger(input.expectedServerKnowledge) ||
    input.startingDeviceKnowledge < 0 ||
    input.endingDeviceKnowledge <= input.startingDeviceKnowledge ||
    input.expectedServerKnowledge <= 0 ||
    !/^[0-9a-f]{64}$/u.test(input.payloadDigest)
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Device acknowledgement failed semantic storage validation',
    );
  }
}

function toSafeInteger(value: string, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      `${field} is outside the supported integer range`,
    );
  }
  return number;
}
