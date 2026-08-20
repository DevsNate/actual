import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import type { BudgetLifecycleService } from './budget-lifecycle-service';
import { authenticateSemanticRequest } from './catalog-api';

type Dependencies = {
  budgetLifecycleService: BudgetLifecycleService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticBudgetLifecycleHandlers(
  dependencies: Dependencies,
) {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '16kb' }));

  handlers.patch('/budgets/:budgetId', async (request, response) => {
    const context = requestContext(request, response, dependencies);
    const name = isRecord(request.body) ? request.body.name : null;
    if (!context || typeof name !== 'string' || !name.trim()) {
      if (context) {
        response.status(400).send({
          status: 'error',
          reason: 'invalid-budget-rename-request',
        });
      }
      return;
    }
    await execute(response, () =>
      dependencies.budgetLifecycleService.renameBudget({
        principalId: context.principal.id,
        budgetId: context.budgetId,
        originDeviceId: context.deviceId,
        idempotencyKey: context.idempotencyKey,
        name: name.trim(),
      }),
    );
  });

  handlers.delete('/budgets/:budgetId', async (request, response) => {
    const context = requestContext(request, response, dependencies);
    if (!context) {
      return;
    }
    await execute(response, () =>
      dependencies.budgetLifecycleService.deleteBudget({
        principalId: context.principal.id,
        budgetId: context.budgetId,
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
  const budgetId = request.params.budgetId?.trim() ?? '';
  if (!deviceId || !idempotencyKey || !budgetId) {
    response.status(400).send({
      status: 'error',
      reason: 'invalid-budget-lifecycle-request',
    });
    return null;
  }
  return { principal, deviceId, idempotencyKey, budgetId };
}

async function execute(
  response: express.Response,
  operation: () => Promise<{
    replayed: boolean;
    catalogServerKnowledge: number;
    budgetServerKnowledge: number | null;
    budget: import('@actual-app/semantic-core').BudgetLifecycleReceipt;
  }>,
) {
  try {
    const value = await operation();
    response.status(200).send({
      status: 'ok',
      data: {
        budget_id: value.budget.budgetId,
        ...(value.budget.kind === 'renamed'
          ? { name: value.budget.name }
          : { deleted: true }),
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
    console.error('Semantic budget lifecycle command failed', error);
    response.status(500).send({
      status: 'error',
      reason: 'semantic-budget-lifecycle-unavailable',
    });
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
