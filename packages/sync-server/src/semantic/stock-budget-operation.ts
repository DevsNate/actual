import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetVersionReader,
  BudgetChangeSetCommand,
  BudgetChangeWriter,
  BudgetDeviceAcknowledgementWriter,
  BudgetSnapshot,
} from '@actual-app/semantic-core';

import { parseStockAccountRenameDelta } from './stock-account-rename';
import {
  buildStockBudgetBackfill,
  buildStockBudgetBootstrap,
  buildStockBudgetEmptyDelta,
  buildStockBudgetReadDelta,
} from './stock-budget-bootstrap';
import { projectStockEntity } from './stock-budget-projection';
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
import { parseStockPristineAccountDelete } from './stock-pristine-account-delete';

export type StockBudgetChangeWriter = BudgetChangeWriter &
  BudgetDeviceAcknowledgementWriter;

type StockBudgetSyncDependencies = {
  budgetReader: BudgetVersionReader;
  changeWriter: StockBudgetChangeWriter;
};

export async function handleStockBudgetSync(
  context: StockOperationContext,
  dependencies: StockBudgetSyncDependencies,
): Promise<StockOperationResponse> {
  const syncRequest = parseBudgetSyncRequest(context.requestData);
  if (!syncRequest) {
    return operationError(400, 'invalid_budget_request');
  }

  const snapshot = await dependencies.budgetReader.readBudgetByVersion(
    context.principal.id,
    syncRequest.budgetVersionId,
  );
  if (!snapshot) {
    return operationError(403, 'user_does_not_have_read_permissions');
  }

  if (syncRequest.syncType === 'bootstrap') {
    if (Object.keys(syncRequest.changedEntities).length !== 0) {
      return operationError(400, 'invalid_budget_request');
    }
    if (syncRequest.deviceKnowledgeOfServer !== 0) {
      return operationError(409, 'budget_knowledge_mismatch');
    }
    return successResponse(
      snapshot.serverKnowledge,
      syncRequest.endingDeviceKnowledge,
      buildStockBudgetBootstrap(snapshot),
    );
  }
  if (syncRequest.syncType === 'backfill') {
    if (Object.keys(syncRequest.changedEntities).length !== 0) {
      return operationError(400, 'invalid_budget_request');
    }
    if (syncRequest.deviceKnowledgeOfServer !== 0) {
      return operationError(409, 'budget_knowledge_mismatch');
    }
    return successResponse(
      snapshot.serverKnowledge,
      syncRequest.endingDeviceKnowledge,
      buildStockBudgetBackfill(snapshot),
    );
  }
  if (syncRequest.syncType !== 'delta') {
    return operationError(501, 'unsupported_budget_sync_type');
  }

  if (Object.keys(syncRequest.changedEntities).length === 0) {
    if (syncRequest.deviceKnowledgeOfServer > snapshot.serverKnowledge) {
      return operationError(409, 'budget_knowledge_mismatch');
    }
    return successResponse(
      snapshot.serverKnowledge,
      syncRequest.endingDeviceKnowledge,
      syncRequest.deviceKnowledgeOfServer === snapshot.serverKnowledge
        ? buildStockBudgetEmptyDelta(snapshot)
        : buildStockBudgetReadDelta(
            snapshot,
            syncRequest.deviceKnowledgeOfServer,
          ),
    );
  }

  if (
    parseBudgetRenameConvergence(syncRequest.changedEntities, snapshot) &&
    syncRequest.endingDeviceKnowledge > syncRequest.startingDeviceKnowledge &&
    syncRequest.deviceKnowledgeOfServer === snapshot.serverKnowledge - 1
  ) {
    const response = successResponse(
      snapshot.serverKnowledge,
      syncRequest.endingDeviceKnowledge,
      buildStockBudgetEmptyDelta(snapshot),
    );
    const acknowledged = await dependencies.changeWriter.acknowledgeDevice({
      budgetId: snapshot.budgetId,
      originDeviceId: context.deviceId,
      startingDeviceKnowledge: syncRequest.startingDeviceKnowledge,
      endingDeviceKnowledge: syncRequest.endingDeviceKnowledge,
      expectedServerKnowledge: snapshot.serverKnowledge,
      idempotencyKey: context.clientRequestId,
      payloadDigest: createHash('sha256')
        .update(context.requestData)
        .digest('hex'),
      response: response.body,
    });
    return { status: 200, body: acknowledged.response };
  }

  const openedBudgetChanges = parseOpenedBudgetDelta(
    syncRequest.changedEntities,
    snapshot,
    context.principal.id,
  );
  const accountRenameChanges = openedBudgetChanges
    ? null
    : parseStockAccountRenameDelta(syncRequest.changedEntities, snapshot);
  const accountDelete =
    openedBudgetChanges || accountRenameChanges
      ? null
      : parseStockPristineAccountDelete(syncRequest.changedEntities, snapshot);
  const changes =
    openedBudgetChanges ?? accountRenameChanges ?? accountDelete?.changes;
  if (!changes) {
    return operationError(501, 'unsupported_budget_delta');
  }
  if (
    syncRequest.endingDeviceKnowledge - syncRequest.startingDeviceKnowledge !==
    changes.length
  ) {
    return operationError(400, 'invalid_budget_knowledge_range');
  }

  const serverKnowledgeAdvance = accountDelete ? 2 : 1;
  const nextServerKnowledge =
    syncRequest.deviceKnowledgeOfServer + serverKnowledgeAdvance;
  const response = successResponse(
    nextServerKnowledge,
    syncRequest.endingDeviceKnowledge,
    accountDelete?.changedEntities ?? buildStockBudgetEmptyDelta(snapshot),
  );
  const committed = await dependencies.changeWriter.commitChangeSet({
    changeSetId: `stock-budget:${snapshot.budgetId}:${context.clientRequestId}`,
    budgetId: snapshot.budgetId,
    originDeviceId: context.deviceId,
    startingDeviceKnowledge: syncRequest.startingDeviceKnowledge,
    endingDeviceKnowledge: syncRequest.endingDeviceKnowledge,
    expectedServerKnowledge: syncRequest.deviceKnowledgeOfServer,
    serverKnowledgeAdvance,
    schemaVersion: STOCK_BUDGET_SCHEMA_VERSION,
    idempotencyKey: context.clientRequestId,
    payloadDigest: createHash('sha256')
      .update(context.requestData)
      .digest('hex'),
    changes,
    response: response.body,
  });
  return { status: 200, body: committed.response };
}

type BudgetSyncRequest = {
  budgetVersionId: string;
  syncType: string;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
  deviceKnowledgeOfServer: number;
  changedEntities: Record<string, unknown>;
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
    startingDeviceKnowledge > endingDeviceKnowledge ||
    parsed.calculated_entities_included !== false ||
    !isRecord(parsed.changed_entities) ||
    typeof parsed.budget_version_id !== 'string' ||
    !parsed.budget_version_id ||
    typeof parsed.sync_type !== 'string'
  ) {
    return null;
  }
  return {
    budgetVersionId: parsed.budget_version_id,
    syncType: parsed.sync_type,
    startingDeviceKnowledge,
    endingDeviceKnowledge,
    deviceKnowledgeOfServer,
    changedEntities: parsed.changed_entities,
  };
}

function parseOpenedBudgetDelta(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
  principalId: string,
): BudgetChangeSetCommand['changes'] | null {
  if (
    !hasExactKeys(changedEntities, [
      'be_monthly_budgets',
      'be_onboarding_events',
    ])
  ) {
    return null;
  }
  const monthlyRows = changedEntities.be_monthly_budgets;
  const eventRows = changedEntities.be_onboarding_events;
  if (
    !Array.isArray(monthlyRows) ||
    monthlyRows.length !== 1 ||
    !Array.isArray(eventRows) ||
    eventRows.length !== 1 ||
    !isRecord(monthlyRows[0]) ||
    !isRecord(eventRows[0])
  ) {
    return null;
  }

  const monthRow = monthlyRows[0];
  const eventRow = eventRows[0];
  const currentMonth = currentBootstrapMonth(snapshot);
  const priorMonth = previousMonth(currentMonth);
  const expectedMonthId = `mb/${priorMonth.slice(0, 7)}/${snapshot.budgetVersionId}`;
  if (
    !hasExactKeys(monthRow, ['id', 'is_tombstone', 'month', 'note']) ||
    monthRow.id !== expectedMonthId ||
    monthRow.is_tombstone !== false ||
    monthRow.month !== priorMonth ||
    monthRow.note !== ''
  ) {
    return null;
  }
  if (
    !hasExactKeys(eventRow, [
      'created_at',
      'event_name',
      'id',
      'is_tombstone',
      'updated_at',
      'user_id',
    ]) ||
    !uuid(eventRow.id) ||
    eventRow.event_name !== 'opened_budget' ||
    eventRow.user_id !== principalId ||
    eventRow.is_tombstone !== false ||
    !isoTimestamp(eventRow.created_at) ||
    eventRow.updated_at !== eventRow.created_at
  ) {
    return null;
  }

  return [
    {
      entityKind: 'be_monthly_budgets',
      entityId: expectedMonthId,
      isTombstone: false,
      payload: {
        budgetVersionId: snapshot.budgetVersionId,
        bootstrapRole: 'opened-budget-prior-month',
        month: priorMonth,
        note: '',
        deviceKnowledge: null,
      },
    },
    {
      entityKind: 'be_onboarding_events',
      entityId: eventRow.id,
      isTombstone: false,
      payload: {
        budgetVersionId: snapshot.budgetVersionId,
        eventName: 'opened_budget',
        userId: principalId,
        createdAt: eventRow.created_at,
        updatedAt: eventRow.updated_at,
        deviceKnowledge: null,
        lastUpdatedByDeviceId: null,
        serverKnowledge: snapshot.serverKnowledge + 1,
      },
    },
  ];
}

function parseBudgetRenameConvergence(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): boolean {
  if (!hasExactKeys(changedEntities, ['be_budget'])) {
    return false;
  }
  const outgoing = changedEntities.be_budget;
  const current = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_budget' &&
      entity.entityId === snapshot.budgetVersionId &&
      !entity.isTombstone,
  );
  return Boolean(
    current &&
    isRecord(outgoing) &&
    outgoing.budget_name === snapshot.name &&
    isDeepStrictEqual(outgoing, projectStockEntity(current)),
  );
}

function successResponse(
  serverKnowledge: number,
  deviceKnowledge: number,
  changedEntities: Readonly<Record<string, unknown>>,
): StockOperationResponse {
  return {
    status: 200,
    body: {
      error: null,
      schema_version_of_response: STOCK_BUDGET_SCHEMA_VERSION,
      schema_version_of_server: STOCK_BUDGET_SCHEMA_VERSION,
      server_knowledge_of_device: deviceKnowledge,
      current_server_knowledge: serverKnowledge,
      changed_entities: changedEntities,
    },
  };
}

function currentBootstrapMonth(snapshot: BudgetSnapshot): string {
  const months = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_budgets' &&
        entity.payload.bootstrapRole !== 'opened-budget-prior-month',
    )
    .map(entity => entity.payload.month)
    .filter((month): month is string => typeof month === 'string')
    .sort();
  if (!months[0]) {
    throw new Error('Opened-budget delta requires a current month');
  }
  return months[0];
}

function previousMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})-01$/u.exec(month);
  if (!match) {
    throw new Error('Opened-budget delta requires an ISO month');
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, 1))
    .toISOString()
    .slice(0, 10);
}

function isoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
