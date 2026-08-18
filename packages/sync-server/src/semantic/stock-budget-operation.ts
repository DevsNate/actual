import type { BudgetVersionPlanReader } from '@actual-app/semantic-core';

import {
  buildStockBudgetBackfill,
  buildStockBudgetBootstrap,
} from './stock-budget-bootstrap';
import {
  isRecord,
  nonnegativeInteger,
  operationError,
  parseRequestData,
  STOCK_BUDGET_SCHEMA_VERSION,
} from './stock-operation';
import type {
  StockOperationContext,
  StockOperationResponse,
} from './stock-operation';

export async function handleStockBudgetSync(
  context: StockOperationContext,
  planReader: BudgetVersionPlanReader,
): Promise<StockOperationResponse> {
  const syncRequest = parseBudgetSyncRequest(context.requestData);
  if (!syncRequest) {
    return operationError(400, 'invalid_budget_request');
  }
  if (!['bootstrap', 'backfill'].includes(syncRequest.syncType)) {
    return operationError(501, 'unsupported_budget_sync_type');
  }
  if (syncRequest.deviceKnowledgeOfServer !== 0) {
    return operationError(409, 'budget_knowledge_mismatch');
  }

  const snapshot = await planReader.readPlanByBudgetVersion(
    context.principal.id,
    syncRequest.budgetVersionId,
  );
  if (!snapshot) {
    return operationError(403, 'user_does_not_have_read_permissions');
  }

  const changedEntities =
    syncRequest.syncType === 'bootstrap'
      ? buildStockBudgetBootstrap(snapshot)
      : buildStockBudgetBackfill(snapshot);
  return {
    status: 200,
    body: {
      error: null,
      schema_version_of_response: STOCK_BUDGET_SCHEMA_VERSION,
      schema_version_of_server: STOCK_BUDGET_SCHEMA_VERSION,
      server_knowledge_of_device: syncRequest.endingDeviceKnowledge,
      current_server_knowledge: snapshot.serverKnowledge,
      changed_entities: changedEntities,
    },
  };
}

type BudgetSyncRequest = {
  budgetVersionId: string;
  syncType: string;
  deviceKnowledgeOfServer: number;
  endingDeviceKnowledge: number;
};

function parseBudgetSyncRequest(value: string): BudgetSyncRequest | null {
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
    schemaVersion !== STOCK_BUDGET_SCHEMA_VERSION ||
    knowledgeSchemaVersion !== STOCK_BUDGET_SCHEMA_VERSION ||
    startingDeviceKnowledge === null ||
    endingDeviceKnowledge === null ||
    deviceKnowledgeOfServer === null ||
    startingDeviceKnowledge !== endingDeviceKnowledge ||
    parsed.calculated_entities_included !== false ||
    !isRecord(parsed.changed_entities) ||
    Object.keys(parsed.changed_entities).length !== 0 ||
    typeof parsed.budget_version_id !== 'string' ||
    !parsed.budget_version_id ||
    typeof parsed.sync_type !== 'string'
  ) {
    return null;
  }
  return {
    budgetVersionId: parsed.budget_version_id,
    syncType: parsed.sync_type,
    deviceKnowledgeOfServer,
    endingDeviceKnowledge,
  };
}
