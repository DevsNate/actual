import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import { authenticateSemanticRequest } from './catalog-api';
import type { PlanLifecycleService } from './plan-lifecycle-service';

type Dependencies = {
  planLifecycleService: PlanLifecycleService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticPlanLifecycleHandlers(
  dependencies: Dependencies,
) {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '16kb' }));

  handlers.patch('/plans/:planId', async (request, response) => {
    const context = requestContext(request, response, dependencies);
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
    await execute(response, () =>
      dependencies.planLifecycleService.renamePlan({
        principalId: context.principal.id,
        planId: context.planId,
        originDeviceId: context.deviceId,
        idempotencyKey: context.idempotencyKey,
        name: name.trim(),
      }),
    );
  });

  handlers.delete('/plans/:planId', async (request, response) => {
    const context = requestContext(request, response, dependencies);
    if (!context) {
      return;
    }
    await execute(response, () =>
      dependencies.planLifecycleService.deletePlan({
        principalId: context.principal.id,
        planId: context.planId,
        originDeviceId: context.deviceId,
        idempotencyKey: context.idempotencyKey,
      }),
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
