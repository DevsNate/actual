import type {
  AuthenticatedPrincipal,
  BudgetReader,
} from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import type { BudgetCreationService } from './budget-creation-service';
import { authenticateSemanticRequest } from './catalog-api';

export type SemanticBudgetApiDependencies = {
  budgetCreationService: BudgetCreationService;
  budgetReader: BudgetReader;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticBudgetHandlers(
  dependencies: SemanticBudgetApiDependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));

  handlers.get('/budgets/:budgetId', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }
    const budgetId = request.params.budgetId?.trim() ?? '';
    if (!budgetId) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-budget-read-request',
      });
      return;
    }
    try {
      const budget = await dependencies.budgetReader.readBudget(
        principal.id,
        budgetId,
      );
      if (!budget) {
        response.status(404).send({
          status: 'error',
          reason: 'budget-not-found',
        });
        return;
      }
      response.status(200).send({ status: 'ok', data: budget });
    } catch (error) {
      console.error('Semantic budget read failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-budget-read-unavailable',
      });
    }
  });

  handlers.post('/budgets', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }

    const idempotencyKey = request.get('idempotency-key')?.trim() ?? '';
    const originDeviceId = request.get('x-semantic-device-id')?.trim() ?? '';
    const body = parseCreateBudgetBody(request.body);
    if (!body || !idempotencyKey || !originDeviceId) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-budget-creation-request',
      });
      return;
    }

    try {
      const result = await dependencies.budgetCreationService.createBudget({
        principalId: principal.id,
        originDeviceId,
        idempotencyKey,
        name: body.name,
        currencyFormat: body.currencyFormat,
        dateFormat: body.dateFormat,
      });
      response.status(result.replayed ? 200 : 201).send({
        status: 'ok',
        data: {
          budget_id: result.budget.budgetId,
          budget_version_id: result.budget.budgetVersionId,
          catalog_server_knowledge: result.catalogServerKnowledge,
          budget_server_knowledge: result.budgetServerKnowledge,
          replayed: result.replayed,
        },
      });
    } catch (error) {
      if (error instanceof SemanticStoreError) {
        const conflict = [
          'IDEMPOTENCY_CONFLICT',
          'SERVER_KNOWLEDGE_MISMATCH',
          'DEVICE_KNOWLEDGE_MISMATCH',
        ].includes(error.code);
        response.status(conflict ? 409 : 400).send({
          status: 'error',
          reason: error.code,
        });
        return;
      }
      console.error('Semantic budget creation failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-budget-creation-unavailable',
      });
    }
  });

  return handlers;
}

type CreateBudgetBody = {
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};

function parseCreateBudgetBody(value: unknown): CreateBudgetBody | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = value.name;
  const currencyFormat = value.currency_format;
  const dateFormat = value.date_format;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !isRecord(currencyFormat) ||
    !isRecord(dateFormat)
  ) {
    return null;
  }
  return {
    name: name.trim(),
    currencyFormat,
    dateFormat,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
