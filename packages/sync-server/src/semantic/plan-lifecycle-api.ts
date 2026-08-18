import { createHash, randomUUID } from 'node:crypto';

import type {
  AuthenticatedPrincipal,
  DeletePlanCommand,
  PlanLifecycleWriter,
  RenamePlanCommand,
} from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import { authenticateSemanticRequest } from './catalog-api';

type Dependencies = {
  planLifecycleWriter: PlanLifecycleWriter;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
  allocateId(): string;
};

export function createSemanticPlanLifecycleHandlers(
  dependencies: Omit<Dependencies, 'allocateId'> &
    Partial<Pick<Dependencies, 'allocateId'>>,
) {
  const resolved = { allocateId: randomUUID, ...dependencies };
  const handlers = express.Router();
  handlers.use(express.json({ limit: '16kb' }));

  handlers.patch('/plans/:planId', async (request, response) => {
    const context = requestContext(request, response, resolved);
    const name = isRecord(request.body) ? request.body.name : null;
    if (!context || typeof name !== 'string' || !name.trim()) {
      if (context) {
        response.status(400).send({
          status: 'error',
          reason: 'invalid-plan-rename-request',
        });
      }
      return;
    }
    const responseBody = { budget_id: context.planId, name: name.trim() };
    const command: RenamePlanCommand = {
      catalogChangeSetId: resolved.allocateId(),
      budgetChangeSetId: resolved.allocateId(),
      principalId: context.principal.id,
      planId: context.planId,
      originDeviceId: context.deviceId,
      schemaVersion: 1,
      idempotencyKey: context.idempotencyKey,
      payloadDigest: digest(
        'rename-plan',
        context.principal.id,
        context.planId,
        { name: name.trim() },
      ),
      newName: name.trim(),
      response: responseBody,
    };
    await execute(response, () =>
      resolved.planLifecycleWriter.renamePlan(command),
    );
  });

  handlers.delete('/plans/:planId', async (request, response) => {
    const context = requestContext(request, response, resolved);
    if (!context) {
      return;
    }
    const responseBody = { budget_id: context.planId, deleted: true };
    const command: DeletePlanCommand = {
      catalogChangeSetId: resolved.allocateId(),
      principalId: context.principal.id,
      planId: context.planId,
      originDeviceId: context.deviceId,
      schemaVersion: 1,
      idempotencyKey: context.idempotencyKey,
      payloadDigest: digest(
        'delete-plan',
        context.principal.id,
        context.planId,
        {},
      ),
      response: responseBody,
    };
    await execute(response, () =>
      resolved.planLifecycleWriter.deletePlan(command),
    );
  });

  return handlers;
}

function requestContext(
  request: express.Request,
  response: express.Response,
  dependencies: Pick<Dependencies, 'resolvePrincipal'>,
) {
  const principal = authenticateSemanticRequest(
    request.get('x-actual-token'),
    response,
    dependencies,
  );
  if (!principal) {
    return null;
  }
  const deviceId = request.get('x-semantic-device-id')?.trim() ?? '';
  const idempotencyKey = request.get('idempotency-key')?.trim() ?? '';
  const planId = request.params.planId?.trim() ?? '';
  if (!deviceId || !idempotencyKey || !planId) {
    response.status(400).send({
      status: 'error',
      reason: 'invalid-plan-lifecycle-request',
    });
    return null;
  }
  return { principal, deviceId, idempotencyKey, planId };
}

async function execute(
  response: express.Response,
  operation: () => Promise<{
    replayed: boolean;
    catalogServerKnowledge: number;
    budgetServerKnowledge: number | null;
    response: Readonly<Record<string, unknown>>;
  }>,
) {
  try {
    const value = await operation();
    response.status(200).send({
      status: 'ok',
      data: {
        ...value.response,
        catalog_server_knowledge: value.catalogServerKnowledge,
        budget_server_knowledge: value.budgetServerKnowledge,
        replayed: value.replayed,
      },
    });
  } catch (error) {
    if (error instanceof SemanticStoreError) {
      response.status(error.code === 'IDEMPOTENCY_CONFLICT' ? 409 : 400).send({
        status: 'error',
        reason: error.code,
      });
      return;
    }
    console.error('Semantic plan lifecycle command failed', error);
    response.status(500).send({
      status: 'error',
      reason: 'semantic-plan-lifecycle-unavailable',
    });
  }
}

function digest(
  commandKind: string,
  principalId: string,
  planId: string,
  payload: Readonly<Record<string, unknown>>,
) {
  return createHash('sha256')
    .update(JSON.stringify({ commandKind, principalId, planId, payload }))
    .digest('hex');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
