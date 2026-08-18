import type { CatalogReader, PlanMembership } from '@actual-app/semantic-core';

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

export async function handleStockCatalogSync(
  context: StockOperationContext,
  catalogReader: CatalogReader,
): Promise<StockOperationResponse> {
  const syncRequest = parseCatalogSyncRequest(context.requestData);
  if (!syncRequest) {
    return operationError(400, 'invalid_catalog_request');
  }
  if (syncRequest.userId !== context.principal.id) {
    return operationError(403, 'principal_mismatch');
  }

  const catalog = await catalogReader.readCatalog(context.principal.id);
  if (
    syncRequest.deviceKnowledgeOfServer >
    catalog.knowledge.currentServerKnowledge
  ) {
    return operationError(409, 'server_knowledge_mismatch');
  }
  const memberships =
    syncRequest.deviceKnowledgeOfServer <
    catalog.knowledge.currentServerKnowledge
      ? catalog.memberships.map(projectMembership)
      : [];
  return {
    status: 200,
    body: {
      error: null,
      schema_version_of_response: STOCK_CATALOG_SCHEMA_VERSION,
      server_knowledge_of_device: syncRequest.endingDeviceKnowledge,
      current_server_knowledge: catalog.knowledge.currentServerKnowledge,
      changed_entities: { ce_user_budgets: memberships },
    },
  };
}

type CatalogSyncRequest = {
  userId: string;
  deviceKnowledgeOfServer: number;
  endingDeviceKnowledge: number;
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
    startingDeviceKnowledge !== endingDeviceKnowledge ||
    !isRecord(parsed.changed_entities) ||
    Object.keys(parsed.changed_entities).length !== 0 ||
    typeof parsed.user_id !== 'string' ||
    !parsed.user_id
  ) {
    return null;
  }
  return {
    userId: parsed.user_id,
    endingDeviceKnowledge,
    deviceKnowledgeOfServer,
  };
}

function projectMembership(membership: PlanMembership) {
  return {
    id: membership.id,
    budget_id: membership.planId,
    budget_version_id: membership.budgetVersionId,
    user_id: membership.principalId,
    budget_name: membership.name,
    permissions: membership.permissions,
    source: membership.source,
    is_tombstone: membership.isTombstone,
    last_modified_at: membership.lastModifiedAt,
  };
}
