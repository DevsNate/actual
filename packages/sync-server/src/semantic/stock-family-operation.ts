import type { CatalogReader } from '@actual-app/semantic-core';

import {
  nonnegativeInteger,
  operationError,
  parseRequestData,
} from './stock-operation';
import type {
  StockOperationContext,
  StockOperationResponse,
} from './stock-operation';

const STOCK_FAMILY_SCHEMA_VERSION = 4;

export async function handleStockFamilySync(
  context: StockOperationContext,
  catalogReader: CatalogReader,
): Promise<StockOperationResponse> {
  const request = parseRequestData(context.requestData);
  if (!request) {
    return operationError(400, 'invalid_family_request');
  }
  const startingKnowledge = nonnegativeInteger(
    request.starting_device_knowledge,
  );
  const endingKnowledge = nonnegativeInteger(request.ending_device_knowledge);
  const serverKnowledge = nonnegativeInteger(
    request.device_knowledge_of_server,
  );
  if (
    request.family_id !== context.principal.id ||
    request.schema_version !== STOCK_FAMILY_SCHEMA_VERSION ||
    request.schema_version_of_knowledge !== STOCK_FAMILY_SCHEMA_VERSION ||
    startingKnowledge === null ||
    endingKnowledge === null ||
    serverKnowledge === null ||
    startingKnowledge !== endingKnowledge
  ) {
    return operationError(400, 'invalid_family_request');
  }

  const catalog = await catalogReader.readCatalog(context.principal.id);
  if (serverKnowledge > catalog.knowledge.currentServerKnowledge) {
    return operationError(409, 'server_knowledge_mismatch');
  }
  const ownedBudgetIds = catalog.memberships
    .filter(
      membership =>
        membership.principalId === context.principal.id &&
        !membership.isTombstone,
    )
    .map(membership => membership.budgetId)
    .sort();

  return {
    status: 200,
    body: {
      error: null,
      schema_version_of_response: STOCK_FAMILY_SCHEMA_VERSION,
      schema_version_of_server: STOCK_FAMILY_SCHEMA_VERSION,
      server_knowledge_of_device: endingKnowledge,
      current_server_knowledge: catalog.knowledge.currentServerKnowledge,
      changed_entities: {
        fe_family: { id: context.principal.id, is_tombstone: false },
        fe_family_members: [
          {
            id: context.principal.id,
            user_id: context.principal.id,
            family_id: context.principal.id,
            family_role: 'plan_manager',
            first_name: context.principal.displayName,
            display_initial:
              context.principal.displayName.trim().charAt(0).toUpperCase() ||
              '?',
            email: context.principal.loginName,
            owned_budget_ids: ownedBudgetIds,
            shared_budget_ids: [],
            sort_index: 0,
            is_tombstone: false,
          },
        ],
      },
    },
  };
}
