import { randomUUID } from 'node:crypto';

import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import { parseStockCheckingAccountBody } from './account-api';
import type { AccountCreationService } from './account-creation-service';
import { AccountCreationError } from './account-creation-service';
import { authenticateStockTokenRequest } from './stock-auth';
import { STOCK_API_VERSION } from './stock-operation';

type Dependencies = {
  accountCreationService: AccountCreationService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
  allocateRequestId?(): string;
};

export function createStockAccountGateway(
  dependencies: Dependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));

  handlers.post(
    '/direct_import/budgets/:planId/accounts',
    async (request, response) => {
      const principal = authenticateStockTokenRequest(
        request,
        response,
        token => dependencies.resolvePrincipal(token),
      );
      if (!principal) {
        return;
      }
      if (request.get('x-ynab-api-version') !== STOCK_API_VERSION) {
        response.status(400).send({ error: { id: 'unsupported_api_version' } });
        return;
      }

      const planId = request.params.planId?.trim() ?? '';
      const body = parseStockCheckingAccountBody(request.body);
      if (!planId || !body) {
        response.status(400).send({ error: { id: 'invalid_account_request' } });
        return;
      }

      try {
        const requestId = dependencies.allocateRequestId
          ? dependencies.allocateRequestId()
          : randomUUID();
        const result =
          await dependencies.accountCreationService.createCheckingAccount({
            principalId: principal.id,
            planId,
            originDeviceId: 'stock-web-direct-import',
            idempotencyKey: `stock-account-create:${requestId}`,
            ...body,
          });
        response.status(201).send(result.response);
      } catch (error) {
        if (error instanceof AccountCreationError) {
          response.status(error.code === 'plan-not-found' ? 404 : 400).send({
            error: { id: error.code },
          });
          return;
        }
        if (error instanceof SemanticStoreError) {
          response.status(409).send({ error: { id: error.code } });
          return;
        }
        console.error('Stock account creation failed', error);
        response
          .status(500)
          .send({ error: { id: 'account_creation_unavailable' } });
      }
    },
  );

  return handlers;
}
