import { createHash, randomUUID } from 'node:crypto';

import type {
  CatalogCommandChange,
  CatalogCommandWriter,
  CatalogReader,
  BudgetMembership,
} from '@actual-app/semantic-core';

import type { BudgetLifecycleService } from './budget-lifecycle-service';
import {
  isRecord,
  nonnegativeInteger,
  operationError,
  parseRequestData,
  STOCK_CATALOG_SCHEMA_VERSION,
} from './stock-operation';
import type {
  StockOperationContext,
  StockOperationResponse,
} from './stock-operation';
import {
  projectStockPrivacyAgreement,
  projectStockUser,
} from './stock-user-projection';

export async function handleStockCatalogSync(
  context: StockOperationContext,
  dependencies: {
    catalogReader: CatalogReader;
    catalogWriter: CatalogCommandWriter;
    budgetLifecycleService: BudgetLifecycleService;
  },
): Promise<StockOperationResponse> {
  const syncRequest = parseCatalogSyncRequest(context.requestData);
  if (!syncRequest) {
    return operationError(400, 'invalid_catalog_request');
  }
  if (syncRequest.userId !== context.principal.id) {
    return operationError(403, 'principal_mismatch');
  }
  if (
    !validOutgoingEnvelope(syncRequest.changedEntities, context.principal.id)
  ) {
    return operationError(400, 'invalid_catalog_request');
  }

  const catalog = await dependencies.catalogReader.readCatalog(
    context.principal.id,
  );
  const outgoing = parseOutgoingChanges(
    syncRequest.changedEntities,
    context.principal.id,
    catalog.memberships,
  );
  if (outgoing === null) {
    return operationError(400, 'invalid_catalog_request');
  }
  if (
    syncRequest.deviceKnowledgeOfServer >
    catalog.knowledge.currentServerKnowledge
  ) {
    return operationError(409, 'server_knowledge_mismatch');
  }
  if (outgoing.kind === 'rename') {
    if (
      syncRequest.endingDeviceKnowledge -
        syncRequest.startingDeviceKnowledge !==
      1
    ) {
      return operationError(400, 'invalid_catalog_knowledge_range');
    }
    const result = await dependencies.budgetLifecycleService.renameBudget({
      principalId: context.principal.id,
      budgetId: outgoing.budgetId,
      originDeviceId: context.deviceId,
      idempotencyKey: context.clientRequestId,
      name: outgoing.name,
      catalogDeviceKnowledge: {
        starting: syncRequest.startingDeviceKnowledge,
        ending: syncRequest.endingDeviceKnowledge,
      },
    });
    return {
      status: 200,
      body: catalogResponse(
        syncRequest.endingDeviceKnowledge,
        result.catalogServerKnowledge,
        {},
      ),
    };
  }
  const outgoingChanges = outgoing.changes;
  if (outgoingChanges.length > 0) {
    const nextKnowledge = catalog.knowledge.currentServerKnowledge + 1;
    const body = catalogResponse(
      syncRequest.endingDeviceKnowledge,
      nextKnowledge,
      {},
    );
    const result = await dependencies.catalogWriter.commitCatalogCommand({
      changeSetId: randomUUID(),
      principalId: context.principal.id,
      originDeviceId: context.deviceId,
      startingDeviceKnowledge: syncRequest.startingDeviceKnowledge,
      endingDeviceKnowledge: syncRequest.endingDeviceKnowledge,
      expectedServerKnowledge: syncRequest.deviceKnowledgeOfServer,
      schemaVersion: STOCK_CATALOG_SCHEMA_VERSION,
      commandKind: 'stock-sync-user-settings',
      idempotencyKey: context.clientRequestId,
      payloadDigest: createHash('sha256')
        .update(context.requestData)
        .digest('hex'),
      changes: outgoingChanges,
      response: body,
    });
    return { status: 200, body: result.response };
  }

  const initialBootstrap =
    syncRequest.startingDeviceKnowledge === 0 &&
    syncRequest.deviceKnowledgeOfServer === 0;
  const changed =
    initialBootstrap ||
    syncRequest.deviceKnowledgeOfServer <
      catalog.knowledge.currentServerKnowledge;
  const memberships = changed ? catalog.memberships.map(projectMembership) : [];
  return {
    status: 200,
    body: catalogResponse(
      syncRequest.endingDeviceKnowledge,
      catalog.knowledge.currentServerKnowledge,
      changed
        ? {
            ce_user_budgets: memberships,
            ce_users: [projectStockUser(context.principal)],
            ce_user_settings: [],
            ce_user_privacy_policy_agreements: [
              projectStockPrivacyAgreement(context.principal),
            ],
          }
        : { ce_user_budgets: memberships },
    ),
  };
}

type CatalogSyncRequest = {
  userId: string;
  startingDeviceKnowledge: number;
  deviceKnowledgeOfServer: number;
  endingDeviceKnowledge: number;
  changedEntities: Readonly<Record<string, unknown>>;
};

function parseCatalogSyncRequest(value: string): CatalogSyncRequest | null {
  const parsed = parseRequestData(value);
  if (!parsed) {
    return null;
  }
  const schemaVersion = nonnegativeInteger(parsed.schema_version);
  const knowledgeSchemaVersion = nonnegativeInteger(
    parsed.schema_version_of_knowledge,
  );
  const startingDeviceKnowledge = nonnegativeInteger(
    parsed.starting_device_knowledge,
  );
  const endingDeviceKnowledge = nonnegativeInteger(
    parsed.ending_device_knowledge,
  );
  const deviceKnowledgeOfServer = nonnegativeInteger(
    parsed.device_knowledge_of_server,
  );
  if (
    schemaVersion !== STOCK_CATALOG_SCHEMA_VERSION ||
    knowledgeSchemaVersion !== STOCK_CATALOG_SCHEMA_VERSION ||
    startingDeviceKnowledge === null ||
    endingDeviceKnowledge === null ||
    deviceKnowledgeOfServer === null ||
    endingDeviceKnowledge < startingDeviceKnowledge ||
    !isRecord(parsed.changed_entities) ||
    typeof parsed.user_id !== 'string' ||
    !parsed.user_id
  ) {
    return null;
  }
  return {
    userId: parsed.user_id,
    startingDeviceKnowledge,
    endingDeviceKnowledge,
    deviceKnowledgeOfServer,
    changedEntities: parsed.changed_entities,
  };
}

function parseOutgoingChanges(
  changedEntities: Readonly<Record<string, unknown>>,
  principalId: string,
  memberships: readonly BudgetMembership[],
):
  | { kind: 'changes'; changes: readonly CatalogCommandChange[] }
  | { kind: 'rename'; budgetId: string; name: string }
  | null {
  const keys = Object.keys(changedEntities);
  if (keys.length === 0) {
    return { kind: 'changes', changes: [] };
  }
  if (keys.length !== 1) {
    return null;
  }
  if (keys[0] === 'ce_user_budgets') {
    return parseBudgetRename(
      changedEntities.ce_user_budgets,
      principalId,
      memberships,
    );
  }
  if (keys[0] !== 'ce_user_settings') {
    return null;
  }
  const rows = changedEntities.ce_user_settings;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const changes: CatalogCommandChange[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !validUserSetting(row, principalId)) {
      return null;
    }
    changes.push({
      entityKind: 'ce_user_settings',
      entityId: row.id,
      isTombstone: false,
      payload: row,
    });
  }
  return { kind: 'changes', changes };
}

function parseBudgetRename(
  value: unknown,
  principalId: string,
  memberships: readonly BudgetMembership[],
): { kind: 'rename'; budgetId: string; name: string } | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return null;
  }
  const row = value[0];
  if (!validBudgetRenameRow(row, principalId)) {
    return null;
  }
  const membership = memberships.find(
    candidate =>
      candidate.id === row.id &&
      candidate.budgetId === row.budget_id &&
      candidate.budgetVersionId === row.budget_version_id &&
      candidate.principalId === row.user_id &&
      candidate.permissions === row.permissions &&
      !candidate.isTombstone,
  );
  if (!membership || membership.name === row.budget_name.trim()) {
    return null;
  }
  return {
    kind: 'rename',
    budgetId: membership.budgetId,
    name: row.budget_name.trim(),
  };
}

function validOutgoingEnvelope(
  changedEntities: Readonly<Record<string, unknown>>,
  principalId: string,
): boolean {
  const keys = Object.keys(changedEntities);
  if (keys.length === 0) {
    return true;
  }
  if (keys.length !== 1) {
    return false;
  }
  const rows = changedEntities[keys[0]];
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }
  if (keys[0] === 'ce_user_settings') {
    return rows.every(
      row => isRecord(row) && validUserSetting(row, principalId),
    );
  }
  return (
    keys[0] === 'ce_user_budgets' &&
    rows.length === 1 &&
    isRecord(rows[0]) &&
    validBudgetRenameRow(rows[0], principalId)
  );
}

function validBudgetRenameRow(
  row: Readonly<Record<string, unknown>>,
  principalId: string,
): row is Readonly<Record<string, unknown>> & {
  id: string;
  budget_id: string;
  budget_version_id: string;
  budget_name: string;
  user_id: string;
  permissions: number;
  is_tombstone: false;
  source: null;
  last_modified_at: string;
} {
  return (
    Object.keys(row).sort().join(',') ===
      'budget_id,budget_name,budget_version_id,id,is_tombstone,last_modified_at,permissions,source,user_id' &&
    typeof row.id === 'string' &&
    typeof row.budget_id === 'string' &&
    typeof row.budget_version_id === 'string' &&
    typeof row.budget_name === 'string' &&
    Boolean(row.budget_name.trim()) &&
    row.user_id === principalId &&
    Number.isSafeInteger(row.permissions) &&
    row.is_tombstone === false &&
    row.source === null &&
    typeof row.last_modified_at === 'string' &&
    !Number.isNaN(Date.parse(row.last_modified_at))
  );
}

function validUserSetting(
  row: Readonly<Record<string, unknown>>,
  principalId: string,
): row is Readonly<Record<string, unknown>> & { id: string } {
  return (
    Object.keys(row).sort().join(',') ===
      'id,setting_name,setting_value,user_id' &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    row.user_id === principalId &&
    typeof row.setting_name === 'string' &&
    row.setting_name.length > 0 &&
    typeof row.setting_value === 'string'
  );
}

function catalogResponse(
  serverKnowledgeOfDevice: number,
  currentServerKnowledge: number,
  changedEntities: Readonly<Record<string, unknown>>,
) {
  return {
    error: null,
    schema_version_of_response: STOCK_CATALOG_SCHEMA_VERSION,
    server_knowledge_of_device: serverKnowledgeOfDevice,
    current_server_knowledge: currentServerKnowledge,
    changed_entities: changedEntities,
  };
}

function projectMembership(membership: BudgetMembership) {
  return {
    id: membership.id,
    budget_id: membership.budgetId,
    budget_version_id: membership.budgetVersionId,
    user_id: membership.principalId,
    budget_name: membership.name,
    permissions: membership.permissions,
    source: membership.source,
    is_tombstone: membership.isTombstone,
    last_modified_at: membership.lastModifiedAt,
  };
}
