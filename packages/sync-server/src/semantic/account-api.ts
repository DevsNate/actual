import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import type { AccountCreationService } from './account-creation-service';
import { AccountCreationError } from './account-creation-service';
import { authenticateSemanticRequest } from './catalog-api';

type Dependencies = {
  accountCreationService: AccountCreationService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticAccountHandlers(
  dependencies: Dependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));
  handlers.post('/plans/:planId/accounts', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }
    const planId = request.params.planId?.trim() ?? '';
    const originDeviceId = request.get('x-semantic-device-id')?.trim() ?? '';
    const idempotencyKey = request.get('idempotency-key')?.trim() ?? '';
    const body = parseStockCheckingAccountBody(request.body);
    if (!planId || !originDeviceId || !idempotencyKey || !body) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-account-creation-request',
      });
      return;
    }

    try {
      const result =
        await dependencies.accountCreationService.createCheckingAccount({
          principalId: principal.id,
          planId,
          originDeviceId,
          idempotencyKey,
          ...body,
        });
      response.status(result.replayed ? 200 : 201).send({
        status: 'ok',
        data: {
          ...result.response,
          budget_server_knowledge: result.serverKnowledge,
          replayed: result.replayed,
        },
      });
    } catch (error) {
      if (error instanceof AccountCreationError) {
        response.status(error.code === 'plan-not-found' ? 404 : 400).send({
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

export type StockCheckingAccountBody = {
  name: string;
  balance: number;
  startingBalanceDate: string;
};

export function parseStockCheckingAccountBody(
  value: unknown,
): StockCheckingAccountBody | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.type !== 'Checking' ||
    !Number.isSafeInteger(value.balance) ||
    typeof value.starting_balance_date !== 'string' ||
    value.debt_interest_rates !==
      JSON.stringify({
        [value.starting_balance_date.slice(0, 7) + '-01']: 0,
      }) ||
    value.debt_minimum_payments !==
      JSON.stringify({
        [value.starting_balance_date.slice(0, 7) + '-01']: 0,
      }) ||
    value.debt_escrow_amounts !== null ||
    value.paired_sub_category !== null ||
    value.is_migrating_to_debt_account !== false
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    balance: Number(value.balance),
    startingBalanceDate: value.starting_balance_date,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
