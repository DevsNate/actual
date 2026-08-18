import type {
  DeletePlanCommand,
  PlanLifecycleResult,
  PlanLifecycleWriter,
  RenamePlanCommand,
} from '@actual-app/semantic-core';
import type { Pool, PoolClient } from 'pg';

import { SemanticStoreError } from './errors';

type LifecycleState = {
  membership_id: string;
  budget_version_id: string;
  name: string;
  permissions: string;
  membership_tombstone: boolean;
  budget_server_knowledge: string;
  catalog_server_knowledge: string;
  currency_format: Readonly<Record<string, unknown>> | null;
  date_format: Readonly<Record<string, unknown>> | null;
};

type ReceiptRow = {
  payload_digest: string;
  server_knowledge: string;
  response: Readonly<Record<string, unknown>>;
  command_kind: string;
};

export class PostgresPlanLifecycleStore implements PlanLifecycleWriter {
  constructor(private readonly pool: Pool) {}

  async renamePlan(command: RenamePlanCommand): Promise<PlanLifecycleResult> {
    validateBase(command);
    if (!command.budgetChangeSetId || !command.newName.trim()) {
      throw invalidOperation();
    }
    return this.transact(async client => {
      await lockIdempotency(client, command);
      const replay = await findReplay(client, command, 'rename-plan', true);
      if (replay) {
        return replay;
      }
      const state = await lockLifecycleState(client, command);
      assertLiveMembership(state);
      const catalogKnowledge = integer(state.catalog_server_knowledge);
      const budgetKnowledge = integer(state.budget_server_knowledge);
      const catalogDeviceKnowledge = await lockCatalogDevice(client, command);
      const budgetDeviceKnowledge = await lockBudgetDevice(client, command);
      const nextCatalogKnowledge = catalogKnowledge + 1;
      const nextBudgetKnowledge = budgetKnowledge + 1;
      const name = command.newName.trim();
      const catalogPayload = membershipPayload(command, state, name, false);
      const budgetPayload = await renamedBudgetPayload(
        client,
        command,
        state,
        name,
      );

      await client.query(
        `UPDATE semantic_plans SET name = $2, updated_at = now()
         WHERE plan_id = $1`,
        [command.planId, name],
      );
      await insertCatalogMutation(
        client,
        command,
        'rename-plan',
        catalogDeviceKnowledge,
        nextCatalogKnowledge,
        false,
        catalogPayload,
      );
      await insertBudgetMutation(
        client,
        command,
        budgetDeviceKnowledge,
        nextBudgetKnowledge,
        budgetPayload,
      );
      await client.query(
        `UPDATE semantic_catalog_knowledge
         SET server_knowledge = $2, updated_at = now()
         WHERE principal_id = $1`,
        [command.principalId, nextCatalogKnowledge],
      );
      await client.query(
        `UPDATE semantic_plans
         SET server_knowledge = $2, updated_at = now()
         WHERE plan_id = $1`,
        [command.planId, nextBudgetKnowledge],
      );
      await insertReceipts(
        client,
        command,
        catalogDeviceKnowledge,
        nextCatalogKnowledge,
        nextBudgetKnowledge,
      );
      return result(
        false,
        nextCatalogKnowledge,
        nextBudgetKnowledge,
        command.response,
      );
    });
  }

  async deletePlan(command: DeletePlanCommand): Promise<PlanLifecycleResult> {
    validateBase(command);
    return this.transact(async client => {
      await lockIdempotency(client, command);
      const replay = await findReplay(client, command, 'delete-plan', false);
      if (replay) {
        return replay;
      }
      const state = await lockLifecycleState(client, command);
      assertLiveMembership(state);
      const catalogKnowledge = integer(state.catalog_server_knowledge);
      const catalogDeviceKnowledge = await lockCatalogDevice(client, command);
      const nextCatalogKnowledge = catalogKnowledge + 1;
      const catalogPayload = membershipPayload(command, state, 'Unknown', true);

      await client.query(
        `UPDATE semantic_plan_memberships
         SET is_tombstone = true, updated_at = now()
         WHERE membership_id = $1`,
        [state.membership_id],
      );
      await insertCatalogMutation(
        client,
        command,
        'delete-plan',
        catalogDeviceKnowledge,
        nextCatalogKnowledge,
        true,
        catalogPayload,
      );
      await client.query(
        `UPDATE semantic_catalog_knowledge
         SET server_knowledge = $2, updated_at = now()
         WHERE principal_id = $1`,
        [command.principalId, nextCatalogKnowledge],
      );
      await insertCatalogReceipt(
        client,
        command,
        catalogDeviceKnowledge,
        nextCatalogKnowledge,
      );
      return result(false, nextCatalogKnowledge, null, command.response);
    });
  }

  private async transact<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockIdempotency(client: PoolClient, command: DeletePlanCommand) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `catalog\u001f${command.principalId}\u001f${command.originDeviceId}\u001f${command.idempotencyKey}`,
  ]);
}

async function findReplay(
  client: PoolClient,
  command: DeletePlanCommand,
  commandKind: string,
  hasBudgetReceipt: boolean,
): Promise<PlanLifecycleResult | null> {
  const receipt = await client.query<ReceiptRow>(
    `SELECT r.payload_digest, r.server_knowledge, r.response, c.command_kind
     FROM semantic_catalog_command_receipts r
     JOIN semantic_catalog_change_sets c
       ON c.principal_id = r.principal_id
      AND c.server_knowledge = r.server_knowledge
     WHERE r.principal_id = $1 AND r.device_id = $2
       AND r.idempotency_key = $3
     FOR UPDATE OF r`,
    [command.principalId, command.originDeviceId, command.idempotencyKey],
  );
  const row = receipt.rows[0];
  if (!row) {
    return null;
  }
  if (
    row.payload_digest !== command.payloadDigest ||
    row.command_kind !== commandKind
  ) {
    throw new SemanticStoreError(
      'IDEMPOTENCY_CONFLICT',
      'The plan lifecycle idempotency key was already used by another command',
    );
  }
  let budgetKnowledge: number | null = null;
  if (hasBudgetReceipt) {
    const budget = await client.query<{ server_knowledge: string }>(
      `SELECT server_knowledge FROM semantic_device_receipts
       WHERE plan_id = $1 AND device_id = $2 AND idempotency_key = $3`,
      [command.planId, command.originDeviceId, command.idempotencyKey],
    );
    if (!budget.rows[0]) {
      throw new SemanticStoreError(
        'INVALID_OPERATION',
        'The plan lifecycle replay receipt is incomplete',
      );
    }
    budgetKnowledge = integer(budget.rows[0].server_knowledge);
  }
  return result(
    true,
    integer(row.server_knowledge),
    budgetKnowledge,
    row.response,
  );
}

async function lockLifecycleState(
  client: PoolClient,
  command: DeletePlanCommand,
): Promise<LifecycleState> {
  await client.query(
    `INSERT INTO semantic_catalog_knowledge (principal_id, server_knowledge)
     VALUES ($1, 0) ON CONFLICT (principal_id) DO NOTHING`,
    [command.principalId],
  );
  const state = await client.query<LifecycleState>(
    `SELECT m.membership_id, p.budget_version_id, p.name,
            m.permissions, m.is_tombstone AS membership_tombstone,
            p.server_knowledge AS budget_server_knowledge,
            k.server_knowledge AS catalog_server_knowledge,
            p.currency_format, p.date_format
     FROM semantic_plan_memberships m
     JOIN semantic_plans p ON p.plan_id = m.plan_id
     JOIN semantic_catalog_knowledge k ON k.principal_id = m.principal_id
     WHERE m.principal_id = $1 AND m.plan_id = $2
     FOR UPDATE OF m, p, k`,
    [command.principalId, command.planId],
  );
  if (!state.rows[0]) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'The authenticated principal does not own this plan membership',
    );
  }
  return state.rows[0];
}

function assertLiveMembership(state: LifecycleState) {
  if (state.membership_tombstone) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'The plan membership is already tombstoned',
    );
  }
}

async function lockCatalogDevice(
  client: PoolClient,
  command: DeletePlanCommand,
) {
  await client.query(
    `INSERT INTO semantic_catalog_devices
       (principal_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0) ON CONFLICT (principal_id, device_id) DO NOTHING`,
    [command.principalId, command.originDeviceId],
  );
  const row = await client.query<{ server_knowledge_of_device: string }>(
    `SELECT server_knowledge_of_device FROM semantic_catalog_devices
     WHERE principal_id = $1 AND device_id = $2 FOR UPDATE`,
    [command.principalId, command.originDeviceId],
  );
  return integer(row.rows[0].server_knowledge_of_device);
}

async function lockBudgetDevice(
  client: PoolClient,
  command: RenamePlanCommand,
) {
  await client.query(
    `INSERT INTO semantic_devices
       (plan_id, device_id, server_knowledge_of_device)
     VALUES ($1, $2, 0) ON CONFLICT (plan_id, device_id) DO NOTHING`,
    [command.planId, command.originDeviceId],
  );
  const row = await client.query<{ server_knowledge_of_device: string }>(
    `SELECT server_knowledge_of_device FROM semantic_devices
     WHERE plan_id = $1 AND device_id = $2 FOR UPDATE`,
    [command.planId, command.originDeviceId],
  );
  return integer(row.rows[0].server_knowledge_of_device);
}

function membershipPayload(
  command: DeletePlanCommand,
  state: LifecycleState,
  name: string,
  isTombstone: boolean,
) {
  return {
    id: state.membership_id,
    planId: command.planId,
    budgetVersionId: state.budget_version_id,
    principalId: command.principalId,
    name,
    permissions: integer(state.permissions),
    source: null,
    isTombstone,
  };
}

async function renamedBudgetPayload(
  client: PoolClient,
  command: RenamePlanCommand,
  state: LifecycleState,
  name: string,
) {
  const snapshot = await client.query<{
    payload: Readonly<Record<string, unknown>>;
  }>(
    `SELECT payload FROM semantic_plan_entities
     WHERE plan_id = $1 AND entity_kind = 'be_budget' AND entity_id = $2
       AND is_tombstone = false
     FOR UPDATE`,
    [command.planId, state.budget_version_id],
  );
  if (!snapshot.rows[0]) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'The plan budget metadata snapshot is unavailable',
    );
  }
  return { ...snapshot.rows[0].payload, budgetName: name };
}

async function insertCatalogMutation(
  client: PoolClient,
  command: DeletePlanCommand,
  commandKind: string,
  deviceKnowledge: number,
  serverKnowledge: number,
  isTombstone: boolean,
  payload: Readonly<Record<string, unknown>>,
) {
  await client.query(
    `INSERT INTO semantic_catalog_change_sets
       (change_set_id, principal_id, server_knowledge, origin_device_id,
        starting_device_knowledge, ending_device_knowledge, schema_version,
        command_kind, idempotency_key, payload_digest)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)`,
    [
      command.catalogChangeSetId,
      command.principalId,
      serverKnowledge,
      command.originDeviceId,
      deviceKnowledge,
      command.schemaVersion,
      commandKind,
      command.idempotencyKey,
      command.payloadDigest,
    ],
  );
  await client.query(
    `INSERT INTO semantic_catalog_entity_changes
       (change_set_id, ordinal, entity_kind, entity_id, is_tombstone, payload)
     VALUES ($1, 0, 'ce_user_budgets', $2, $3, $4)`,
    [command.catalogChangeSetId, payload.id, isTombstone, payload],
  );
}

async function insertBudgetMutation(
  client: PoolClient,
  command: RenamePlanCommand,
  deviceKnowledge: number,
  serverKnowledge: number,
  payload: Readonly<Record<string, unknown>>,
) {
  await client.query(
    `INSERT INTO semantic_change_sets
       (change_set_id, plan_id, server_knowledge, origin_device_id,
        starting_device_knowledge, ending_device_knowledge, schema_version,
        idempotency_key, payload_digest)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)`,
    [
      command.budgetChangeSetId,
      command.planId,
      serverKnowledge,
      command.originDeviceId,
      deviceKnowledge,
      command.schemaVersion,
      command.idempotencyKey,
      command.payloadDigest,
    ],
  );
  await client.query(
    `INSERT INTO semantic_entity_changes
       (change_set_id, ordinal, entity_kind, entity_id, is_tombstone, payload)
     SELECT $1, 0, 'be_budget', budget_version_id, false, $2
     FROM semantic_plans WHERE plan_id = $3`,
    [command.budgetChangeSetId, payload, command.planId],
  );
  await client.query(
    `UPDATE semantic_plan_entities
     SET payload = $3, last_server_knowledge = $4, updated_at = now()
     WHERE plan_id = $1 AND entity_kind = 'be_budget' AND entity_id = $2`,
    [command.planId, payload.budgetVersionId, payload, serverKnowledge],
  );
}

async function insertReceipts(
  client: PoolClient,
  command: RenamePlanCommand,
  deviceKnowledge: number,
  catalogKnowledge: number,
  budgetKnowledge: number,
) {
  await insertCatalogReceipt(
    client,
    command,
    deviceKnowledge,
    catalogKnowledge,
  );
  await client.query(
    `INSERT INTO semantic_device_receipts
       (plan_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
    [
      command.planId,
      command.originDeviceId,
      command.idempotencyKey,
      command.payloadDigest,
      deviceKnowledge,
      budgetKnowledge,
      command.response,
    ],
  );
}

async function insertCatalogReceipt(
  client: PoolClient,
  command: DeletePlanCommand,
  deviceKnowledge: number,
  serverKnowledge: number,
) {
  await client.query(
    `INSERT INTO semantic_catalog_command_receipts
       (principal_id, device_id, idempotency_key, payload_digest,
        starting_device_knowledge, ending_device_knowledge,
        server_knowledge, response)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
    [
      command.principalId,
      command.originDeviceId,
      command.idempotencyKey,
      command.payloadDigest,
      deviceKnowledge,
      serverKnowledge,
      command.response,
    ],
  );
}

function validateBase(command: DeletePlanCommand) {
  if (
    !command.catalogChangeSetId ||
    !command.principalId ||
    !command.planId ||
    !command.originDeviceId ||
    !command.idempotencyKey ||
    !Number.isSafeInteger(command.schemaVersion) ||
    command.schemaVersion <= 0 ||
    !/^[0-9a-f]{64}$/u.test(command.payloadDigest)
  ) {
    throw invalidOperation();
  }
}

function invalidOperation() {
  return new SemanticStoreError(
    'INVALID_OPERATION',
    'Plan lifecycle command failed semantic storage validation',
  );
}

function integer(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new SemanticStoreError(
      'INVALID_OPERATION',
      'Plan lifecycle knowledge is outside the supported range',
    );
  }
  return number;
}

function result(
  replayed: boolean,
  catalogServerKnowledge: number,
  budgetServerKnowledge: number | null,
  response: Readonly<Record<string, unknown>>,
): PlanLifecycleResult {
  return {
    replayed,
    catalogServerKnowledge,
    budgetServerKnowledge,
    response,
  };
}
