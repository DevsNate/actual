import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import type { BudgetCreationService } from './budget-creation-service';
import { authenticateStockTokenRequest } from './stock-auth';
import { STOCK_API_VERSION } from './stock-operation';

type Dependencies = {
  budgetCreationService: BudgetCreationService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createStockBudgetGateway(
  dependencies: Dependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));

  handlers.post('/budgets', async (request, response) => {
    const principal = authenticateStockTokenRequest(request, response, token =>
      dependencies.resolvePrincipal(token),
    );
    if (!principal) {
      return;
    }
    if (request.get('x-ynab-api-version') !== STOCK_API_VERSION) {
      response.status(400).send({ error: { id: 'unsupported_api_version' } });
      return;
    }

    const originDeviceId = request.get('x-ynab-device-id')?.trim() ?? '';
    const clientRequestId =
      request.get('x-ynab-client-request-id')?.trim() ?? '';
    const body = parseStockBudgetBody(request.body);
    if (!originDeviceId || !clientRequestId || !body) {
      response.status(400).send({ error: { id: 'invalid_budget_request' } });
      return;
    }
    response.set('x-ynab-client-request-id', clientRequestId);

    try {
      const result = await dependencies.budgetCreationService.createBudget({
        principalId: principal.id,
        originDeviceId,
        idempotencyKey: clientRequestId,
        name: body.name,
        currencyFormat: body.currencyFormat,
        dateFormat: body.dateFormat,
      });
      response.status(result.replayed ? 200 : 201).send({
        id: result.budget.budgetVersionId,
      });
    } catch (error) {
      if (error instanceof SemanticStoreError) {
        const conflict = [
          'IDEMPOTENCY_CONFLICT',
          'SERVER_KNOWLEDGE_MISMATCH',
          'DEVICE_KNOWLEDGE_MISMATCH',
        ].includes(error.code);
        response.status(conflict ? 409 : 400).send({
          error: { id: error.code },
        });
        return;
      }
      console.error('Stock budget creation failed', error);
      response
        .status(500)
        .send({ error: { id: 'budget_creation_unavailable' } });
    }
  });

  return handlers;
}

type StockBudgetBody = {
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};

function parseStockBudgetBody(value: unknown): StockBudgetBody | null {
  if (!isRecord(value) || !isRecord(value.budget)) {
    return null;
  }
  const name = value.budget.name;
  const currencyFormat = parseStructuredField(value.budget.currency_format);
  const dateFormat = parseStructuredField(value.budget.date_format);
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !currencyFormat ||
    !dateFormat
  ) {
    return null;
  }
  return {
    name: name.trim(),
    currencyFormat,
    dateFormat,
  };
}

function parseStructuredField(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
