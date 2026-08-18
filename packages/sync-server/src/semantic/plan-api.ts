import type {
  AuthenticatedPrincipal,
  PlanReader,
} from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import { authenticateSemanticRequest } from './catalog-api';
import type { PlanCreationService } from './plan-creation-service';

export type SemanticPlanApiDependencies = {
  planCreationService: PlanCreationService;
  planReader: PlanReader;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createSemanticPlanHandlers(
  dependencies: SemanticPlanApiDependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));

  handlers.get('/plans/:planId', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      dependencies,
    );
    if (!principal) {
      return;
    }
    const planId = request.params.planId?.trim() ?? '';
    if (!planId) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-plan-read-request',
      });
      return;
    }
    try {
      const plan = await dependencies.planReader.readPlan(principal.id, planId);
      if (!plan) {
        response.status(404).send({
          status: 'error',
          reason: 'plan-not-found',
        });
        return;
      }
      response.status(200).send({ status: 'ok', data: plan });
    } catch (error) {
      console.error('Semantic plan read failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-plan-read-unavailable',
      });
    }
  });

  handlers.post('/plans', async (request, response) => {
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
    const body = parseCreatePlanBody(request.body);
    if (!body || !idempotencyKey || !originDeviceId) {
      response.status(400).send({
        status: 'error',
        reason: 'invalid-plan-creation-request',
      });
      return;
    }

    try {
      const result = await dependencies.planCreationService.createPlan({
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
          ...result.response,
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
      console.error('Semantic plan creation failed', error);
      response.status(500).send({
        status: 'error',
        reason: 'semantic-plan-creation-unavailable',
      });
    }
  });

  return handlers;
}

type CreatePlanBody = {
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};

function parseCreatePlanBody(value: unknown): CreatePlanBody | null {
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
