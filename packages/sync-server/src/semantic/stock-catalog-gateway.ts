import { AuthenticationError } from '@actual-app/semantic-core';
import type {
  AuthenticatedPrincipal,
  CatalogReader,
  PlanMembership,
} from '@actual-app/semantic-core';
import express from 'express';

const STOCK_API_VERSION = '2026-01-01';
const STOCK_CATALOG_SCHEMA_VERSION = 16;

type StockCatalogSyncRequest = {
  userId: string;
  deviceKnowledgeOfServer: number;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
};

export type StockCatalogGatewayDependencies = {
  catalogReader: CatalogReader;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createStockCatalogGateway(
  dependencies: StockCatalogGatewayDependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.urlencoded({ extended: false, limit: '64kb' }));

  handlers.post('/catalog', async (request, response) => {
    const principal = authenticate(request, response, dependencies);
    if (!principal) {
      return;
    }

    const clientRequestId = request.get('x-ynab-client-request-id');
    if (clientRequestId) {
      response.set('x-ynab-client-request-id', clientRequestId);
    }

    if (request.get('x-ynab-api-version') !== STOCK_API_VERSION) {
      sendError(response, 400, 'unsupported_api_version');
      return;
    }
    if (!request.get('x-ynab-device-id') || !clientRequestId) {
      sendError(response, 400, 'missing_request_context');
      return;
    }
    if (formField(request.body, 'operation_name') !== 'syncCatalogData') {
      sendError(response, 501, 'unsupported_operation');
      return;
    }

    const syncRequest = parseCatalogSyncRequest(
      formField(request.body, 'request_data'),
    );
    if (!syncRequest) {
      sendError(response, 400, 'invalid_catalog_request');
      return;
    }
    if (syncRequest.userId !== principal.id) {
      sendError(response, 403, 'principal_mismatch');
      return;
    }

    try {
      const catalog = await dependencies.catalogReader.readCatalog(
        principal.id,
      );
      if (
        syncRequest.deviceKnowledgeOfServer >
        catalog.knowledge.currentServerKnowledge
      ) {
        sendError(response, 409, 'server_knowledge_mismatch');
        return;
      }
      const memberships =
        syncRequest.deviceKnowledgeOfServer <
        catalog.knowledge.currentServerKnowledge
          ? catalog.memberships.map(projectMembership)
          : [];
      response.status(200).send({
        error: null,
        schema_version_of_response: STOCK_CATALOG_SCHEMA_VERSION,
        server_knowledge_of_device: syncRequest.endingDeviceKnowledge,
        current_server_knowledge: catalog.knowledge.currentServerKnowledge,
        changed_entities: {
          ce_user_budgets: memberships,
        },
      });
    } catch (error) {
      console.error('Stock catalog projection failed', error);
      sendError(response, 500, 'catalog_unavailable');
    }
  });

  return handlers;
}

function authenticate(
  request: express.Request,
  response: express.Response,
  dependencies: Pick<StockCatalogGatewayDependencies, 'resolvePrincipal'>,
): AuthenticatedPrincipal | null {
  try {
    return dependencies.resolvePrincipal(request.get('x-session-token') ?? '');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(response, 401, error.code);
      return null;
    }
    throw error;
  }
}

function parseCatalogSyncRequest(
  value: string | null,
): StockCatalogSyncRequest | null {
  if (!value) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const schemaVersion = integer(parsed.schema_version);
  const knowledgeSchemaVersion = integer(parsed.schema_version_of_knowledge);
  const startingDeviceKnowledge = integer(parsed.starting_device_knowledge);
  const endingDeviceKnowledge = integer(parsed.ending_device_knowledge);
  const deviceKnowledgeOfServer = integer(parsed.device_knowledge_of_server);
  const changedEntities = parsed.changed_entities;
  if (
    schemaVersion !== STOCK_CATALOG_SCHEMA_VERSION ||
    knowledgeSchemaVersion !== STOCK_CATALOG_SCHEMA_VERSION ||
    startingDeviceKnowledge === null ||
    endingDeviceKnowledge === null ||
    deviceKnowledgeOfServer === null ||
    startingDeviceKnowledge !== endingDeviceKnowledge ||
    !isRecord(changedEntities) ||
    Object.keys(changedEntities).length !== 0 ||
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

function formField(body: unknown, name: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const value = body[name];
  return typeof value === 'string' ? value : null;
}

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendError(response: express.Response, status: number, id: string) {
  response.status(status).send({ error: { id } });
}
