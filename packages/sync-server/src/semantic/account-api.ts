import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import type { AccountCreationService } from './account-creation-service';
import { AccountCreationError } from './account-creation-service';
import { authenticateSemanticRequest } from './catalog-api';
import { parseNativeUnlinkedCheckingAccountBody } from './native-account-operation';

type Dependencies = {
  accountCreationService: AccountCreationService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticAccountHandlers(
  dependencies: Dependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));
  handlers.post('/budgets/:budgetId/accounts', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }
    const budgetId = request.params.budgetId?.trim() ?? '';
    const originDeviceId = request.get('x-semantic-device-id')?.trim() ?? '';
    const idempotencyKey = request.get('idempotency-key')?.trim() ?? '';
    const body = parseNativeUnlinkedCheckingAccountBody(request.body);
    if (!budgetId || !originDeviceId || !idempotencyKey || !body) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-account-creation-request',
      });
      return;
    }

    try {
      const result =
        await dependencies.accountCreationService.createUnlinkedCheckingAccount(
          {
            principalId: principal.id,
            budgetId,
            originDeviceId,
            idempotencyKey,
            ...body,
          },
        );
      response.status(result.replayed ? 200 : 201).send({
        status: 'ok',
        data: {
          account: result.response,
          budget_server_knowledge: result.serverKnowledge,
          replayed: result.replayed,
        },
      });
    } catch (error) {
      if (error instanceof AccountCreationError) {
        response.status(error.code === 'budget-not-found' ? 404 : 400).send({
          status: 'error',
          reason: error.code,
        });
        return;
      }
      if (error instanceof SemanticStoreError) {
        response.status(409).send({
          status: 'error',
          reason: error.code,
        });
        return;
      }
      console.error('Semantic account creation failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-account-creation-unavailable',
      });
    }
  });
  return handlers;
}
