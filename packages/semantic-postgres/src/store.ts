import type {
  CatalogCommand,
  CatalogCommandResult,
  CatalogSnapshot,
  CreatePlanCommand,
  CreatePlanResult,
  PlanMembership,
  PrincipalId,
} from '@actual-app/semantic-core';
import type { Pool, PoolClient } from 'pg';

import { SemanticStoreError } from './errors';
import type {
  CommitChangeSetInput,
  CommitChangeSetResult,
  SeedPlanInput,
} from './types';

type PlanKnowledgeRow = {
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

type CatalogRow = {
  catalog_server_knowledge: string;
  membership_id: string | null;
  plan_id: string | null;
  budget_version_id: string | null;
  principal_id: string | null;
  name: string | null;
  permissions: string | null;
  is_tombstone: boolean | null;
};

export class PostgresSemanticStore {
  constructor(private readonly pool: Pool) {}

  async seedPlan(input: SeedPlanInput): Promise<void> {
    validateSeedPlan(input);
    await this.transact(async client => {
      await client.query(
        `INSERT INTO semantic_plans
           (plan_id, budget_version_id, name)
         VALUES ($1, $2, $3)`,
        [input.planId, input.budgetVersionId, input.name.trim()],
      );
      await client.query(
        `INSERT INTO semantic_plan_memberships
           (membership_id, plan_id, principal_id, permissions)
         VALUES ($1, $2, $3, $4)`,
        [
          input.membershipId,
          input.planId,
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

  async createPlan(command: CreatePlanCommand): Promise<CreatePlanResult> {
    validateCreatePlanCommand(command);
    return this.transact(async client => {
      await lockCreatePlanIdempotencyKey(client, command);
      const replay = await findCreatePlanReceipt(client, command);
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
      const catalogDeviceKnowledge = await lockCreatePlanCatalogDevice(
        client,
        command,
      );
      if (catalogDeviceKnowledge !== command.startingCatalogDeviceKnowledge) {
        throw new SemanticStoreError(
          'DEVICE_KNOWLEDGE_MISMATCH',
          `Expected catalog device knowledge ${command.startingCatalogDeviceKnowledge}, received ${catalogDeviceKnowledge}`,
        );
      }

      const nextCatalogKnowledge = catalogKnowledge + 1;
      const budgetKnowledge = 1;
      await client.query(
        `INSERT INTO semantic_plans
           (plan_id, budget_version_id, name, server_knowledge,
            currency_format, date_format)
         VALUES ($1, $2, $3, 0, $4, $5)`,
        [
          command.planId,
          command.budgetVersionId,
          command.name.trim(),
          command.currencyFormat,
          command.dateFormat,
        ],
      );
      await client.query(
        `INSERT INTO semantic_plan_memberships
           (membership_id, plan_id, principal_id, permissions)
         VALUES ($1, $2, $3, $4)`,
        [
          command.membershipId,
          command.planId,
          command.principalId,
          command.permissions,
        ],
      );

      const membershipPayload = {
        id: command.membershipId,
        planId: command.planId,
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
          startingDeviceKnowledge: command.startingCatalogDeviceKnowledge,
          endingDeviceKnowledge: command.endingCatalogDeviceKnowledge,
          expectedServerKnowledge: command.expectedCatalogServerKnowledge,
          schemaVersion: command.schemaVersion,
          commandKind: 'create-plan',
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
          response: command.response,
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
        planId: command.planId,
        originDeviceId: command.originDeviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: 0,
        schemaVersion: command.schemaVersion,
        idempotencyKey: command.idempotencyKey,
        payloadDigest: command.payloadDigest,
        changes: command.entities,
        response: command.response,
      };
      await insertChangeSet(client, budgetChangeSet, budgetKnowledge);
      await insertEntityChanges(client, budgetChangeSet);
      await upsertPlanEntities(client, budgetChangeSet, budgetKnowledge);

      await client.query(
        `UPDATE semantic_plans
         SET server_knowledge = $2, updated_at = now()
         WHERE plan_id = $1`,
        [command.planId, budgetKnowledge],
      );
      await client.query(
        `UPDATE semantic_catalog_knowledge
         SET server_knowledge = $2, updated_at = now()
         WHERE principal_id = $1`,
        [command.principalId, nextCatalogKnowledge],
      );
      await client.query(
        `UPDATE semantic_catalog_devices
         SET server_knowledge_of_device = $3, updated_at = now()
         WHERE principal_id = $1 AND device_id = $2`,
        [
          command.principalId,
          command.originDeviceId,
          command.endingCatalogDeviceKnowledge,
        ],
      );
      await client.query(
        `INSERT INTO semantic_devices
           (plan_id, device_id, server_knowledge_of_device)
         VALUES ($1, $2, 0)`,
        [command.planId, command.originDeviceId],
      );
      await insertCreatePlanReceipts(
        client,
        command,
        nextCatalogKnowledge,
        budgetKnowledge,
      );

      return {
        replayed: false,
        catalogServerKnowledge: nextCatalogKnowledge,
        budgetServerKnowledge: budgetKnowledge,
        response: command.response,
      };
    });
  }

  async readCatalog(principalId: PrincipalId): Promise<CatalogSnapshot> {
    const result = await this.pool.query<CatalogRow>(
      `SELECT COALESCE(k.server_knowledge, 0) AS catalog_server_knowledge,
              m.membership_id, m.plan_id, p.budget_version_id,
              m.principal_id,
              CASE WHEN m.is_tombstone OR p.is_tombstone
                   THEN 'Unknown' ELSE p.name END AS name,
              m.permissions,
              CASE WHEN m.membership_id IS NULL THEN NULL
                   ELSE (m.is_tombstone OR p.is_tombstone)
              END AS is_tombstone
       FROM (SELECT $1::text AS principal_id) requested
       LEFT JOIN semantic_catalog_knowledge k
         ON k.principal_id = requested.principal_id
       LEFT JOIN semantic_plan_memberships m
         ON m.principal_id = requested.principal_id
       LEFT JOIN semantic_plans p ON p.plan_id = m.plan_id
       ORDER BY p.created_at, p.plan_id`,
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
    return this.transact(async client => {
      await lockIdempotencyKey(client, input);
      const replay = await findReceipt(client, input);
      if (replay) {
        return replay;
      }

      const plan = await client.query<PlanKnowledgeRow>(
        `SELECT server_knowledge
         FROM semantic_plans
         WHERE plan_id = $1 AND is_tombstone = false
         FOR UPDATE`,
        [input.planId],
      );
      if (plan.rowCount !== 1) {
        throw new SemanticStoreError(
          'PLAN_NOT_FOUND',
          `Active plan ${input.planId} was not found`,
        );
      }
      const currentServerKnowledge = toSafeInteger(
        plan.rows[0].server_knowledge,
        'plan server knowledge',
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

      const nextServerKnowledge = currentServerKnowledge + 1;
      await insertChangeSet(client, input, nextServerKnowledge);
      await insertEntityChanges(client, input);
      await upsertPlanEntities(client, input, nextServerKnowledge);
      await client.query(
        `UPDATE semantic_plans
         SET server_knowledge = $2, updated_at = now()
         WHERE plan_id = $1`,
        [input.planId, nextServerKnowledge],
      );
      await client.query(
        `INSERT INTO semantic_devices
           (plan_id, device_id, server_knowledge_of_device)
         VALUES ($1, $2, $3)
         ON CONFLICT (plan_id, device_id) DO UPDATE SET
           server_knowledge_of_device = EXCLUDED.server_knowledge_of_device,
           updated_at = now()`,
        [input.planId, input.originDeviceId, input.endingDeviceKnowledge],
      );
      await client.query(
        `INSERT INTO semantic_device_receipts
           (plan_id, device_id, idempotency_key, payload_digest,
            starting_device_knowledge, ending_device_knowledge,
            server_knowledge, response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.planId,
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

async function lockCreatePlanIdempotencyKey(
  client: PoolClient,
  command: CreatePlanCommand,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `catalog\u001f${command.principalId}\u001f${command.originDeviceId}\u001f${command.idempotencyKey}`,
  ]);
}

async function findCreatePlanReceipt(
  client: PoolClient,
  command: CreatePlanCommand,
): Promise<CreatePlanResult | null> {
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
      'The plan creation idempotency key was already used with a different payload',
    );
  }
  return {
    replayed: true,
    catalogServerKnowledge: toSafeInteger(
      row.server_knowledge,
      'catalog server knowledge',
    ),
    budgetServerKnowledge: 1,
    response: row.response,
  };
}

async function lockCreatePlanCatalogDevice(
  client: PoolClient,
  command: CreatePlanCommand,
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

async function insertCreatePlanReceipts(
  client: PoolClient,
  command: CreatePlanCommand,
  catalogServerKnowledge: number,
  budgetServerKnowledge: number,
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
      command.startingCatalogDeviceKnowledge,
      command.endingCatalogDeviceKnowledge,
      catalogServerKnowledge,
      command.response,
    ],
  );
  await client.query(
    `INSERT INTO semantic_device_receipts
       (plan_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, 0, 0, $5, $6)`,
    [
      command.planId,
      command.originDeviceId,
      command.idempotencyKey,
      command.payloadDigest,
      budgetServerKnowledge,
      command.response,
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
  input: CommitChangeSetInput,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${input.planId}\u001f${input.originDeviceId}\u001f${input.idempotencyKey}`,
  ]);
}

async function findReceipt(
  client: PoolClient,
  input: CommitChangeSetInput,
): Promise<CommitChangeSetResult | null> {
  const receipt = await client.query<ReceiptRow>(
    `SELECT payload_digest, ending_device_knowledge,
            server_knowledge, response
     FROM semantic_device_receipts
     WHERE plan_id = $1 AND device_id = $2 AND idempotency_key = $3
     FOR UPDATE`,
    [input.planId, input.originDeviceId, input.idempotencyKey],
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
  input: CommitChangeSetInput,
): Promise<number> {
  await client.query(
    `INSERT INTO semantic_devices
       (plan_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0)
     ON CONFLICT (plan_id, device_id) DO NOTHING`,
    [input.planId, input.originDeviceId],
  );
  const result = await client.query<DeviceKnowledgeRow>(
    `SELECT server_knowledge_of_device
     FROM semantic_devices
     WHERE plan_id = $1 AND device_id = $2
     FOR UPDATE`,
    [input.planId, input.originDeviceId],
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
    `INSERT INTO semantic_change_sets
       (change_set_id, plan_id, server_knowledge, origin_device_id,
        starting_device_knowledge, ending_device_knowledge,
        schema_version, idempotency_key, payload_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.changeSetId,
      input.planId,
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
      `INSERT INTO semantic_entity_changes
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

async function upsertPlanEntities(
  client: PoolClient,
  input: CommitChangeSetInput,
  serverKnowledge: number,
): Promise<void> {
  for (const change of input.changes) {
    await client.query(
      `INSERT INTO semantic_plan_entities
         (plan_id, entity_kind, entity_id, schema_version,
          is_tombstone, payload, last_server_knowledge)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (plan_id, entity_kind, entity_id) DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         is_tombstone = EXCLUDED.is_tombstone,
         payload = EXCLUDED.payload,
         last_server_knowledge = EXCLUDED.last_server_knowledge,
         updated_at = now()`,
      [
        input.planId,
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
  plan_id: string;
  budget_version_id: string;
  principal_id: string;
  name: string;
  permissions: string;
  is_tombstone: boolean;
};

function hasMembership(row: CatalogRow): row is CatalogMembershipRow {
  return (
    row.membership_id !== null &&
    row.plan_id !== null &&
    row.budget_version_id !== null &&
    row.principal_id !== null &&
    row.name !== null &&
    row.permissions !== null &&
    row.is_tombstone !== null
  );
}

function mapMembership(row: CatalogMembershipRow): PlanMembership {
  return {
    id: row.membership_id,
    planId: row.plan_id,
    budgetVersionId: row.budget_version_id,
    principalId: row.principal_id,
    name: row.name,
    permissions: toSafeInteger(row.permissions, 'permissions'),
    isTombstone: row.is_tombstone,
  };
}

function validateSeedPlan(input: SeedPlanInput): void {
  if (
    !input.planId ||
    !input.budgetVersionId ||
    !input.membershipId ||
    !input.principalId ||
    !input.name.trim() ||
    !Number.isSafeInteger(input.permissions) ||
    input.permissions < 0
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Plan creation contains invalid identity, name, or permissions',
    );
  }
}

function validateCreatePlanCommand(command: CreatePlanCommand): void {
  const validKnowledge = [
    command.expectedCatalogServerKnowledge,
    command.startingCatalogDeviceKnowledge,
    command.endingCatalogDeviceKnowledge,
  ].every(value => Number.isSafeInteger(value) && value >= 0);
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
    !command.planId ||
    !command.budgetVersionId ||
    !command.membershipId ||
    !command.principalId ||
    !command.originDeviceId ||
    !command.idempotencyKey ||
    !command.name.trim() ||
    !validKnowledge ||
    command.endingCatalogDeviceKnowledge <
      command.startingCatalogDeviceKnowledge ||
    !Number.isSafeInteger(command.permissions) ||
    command.permissions < 0 ||
    !Number.isSafeInteger(command.schemaVersion) ||
    command.schemaVersion <= 0 ||
    !/^[0-9a-f]{64}$/u.test(command.payloadDigest) ||
    !validEntities
  ) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Plan creation failed semantic storage validation',
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
    !input.planId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !validKnowledge ||
    input.endingDeviceKnowledge < input.startingDeviceKnowledge ||
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
