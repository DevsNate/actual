import { createHash, randomUUID } from 'node:crypto';

import { buildStockPlanBootstrap } from '@actual-app/semantic-core';
import type {
  AuthenticatedPrincipal,
  CatalogReader,
  CreatePlanCommand,
  PlanCreator,
} from '@actual-app/semantic-core';
import { SemanticStoreError } from '@actual-app/semantic-postgres';
import express from 'express';

import { authenticateSemanticRequest } from './catalog-api';

export type SemanticPlanApiDependencies = {
  catalogReader: CatalogReader;
  planCreator: PlanCreator;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
  allocateId(): string;
  now(): Date;
};

const defaults = {
  allocateId: randomUUID,
  now: () => new Date(),
};

export function createSemanticPlanHandlers(
  dependencies: Omit<SemanticPlanApiDependencies, 'allocateId' | 'now'> &
    Partial<Pick<SemanticPlanApiDependencies, 'allocateId' | 'now'>>,
): express.Router {
  const resolved = { ...defaults, ...dependencies };
  const handlers = express.Router();
  handlers.use(express.json({ limit: '64kb' }));

  handlers.post('/plans', async (request, response) => {
    const principal = authenticateSemanticRequest(
      request.get('x-actual-token'),
      response,
      resolved,
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
      const catalog = await resolved.catalogReader.readCatalog(principal.id);
      const planId = resolved.allocateId();
      const budgetVersionId = resolved.allocateId();
      const membershipId = resolved.allocateId();
      const now = resolved.now();
      const responseBody = {
        budget_id: planId,
        budget_version_id: budgetVersionId,
      };
      const payloadDigest = digestPlanRequest(principal.id, body);
      const entities = buildStockPlanBootstrap({
        planId,
        budgetVersionId,
        principalId: principal.id,
        name: body.name,
        currencyFormat: body.currencyFormat,
        dateFormat: body.dateFormat,
        createdOn: now.toISOString().slice(0, 10),
        createdAtMilliseconds: now.getTime(),
        allocateId: () => resolved.allocateId(),
      });
      const command: CreatePlanCommand = {
        catalogChangeSetId: resolved.allocateId(),
        budgetChangeSetId: resolved.allocateId(),
        planId,
        budgetVersionId,
        membershipId,
        principalId: principal.id,
        originDeviceId,
        expectedCatalogServerKnowledge:
          catalog.knowledge.currentServerKnowledge,
        startingCatalogDeviceKnowledge: 0,
        endingCatalogDeviceKnowledge: 0,
        schemaVersion: 1,
        idempotencyKey,
        payloadDigest,
        name: body.name,
        permissions: 1,
        currencyFormat: body.currencyFormat,
        dateFormat: body.dateFormat,
        entities,
        response: responseBody,
      };
      const result = await resolved.planCreator.createPlan(command);
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

function digestPlanRequest(principalId: string, body: CreatePlanBody): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        principalId,
        name: body.name,
        currencyFormat: body.currencyFormat,
        dateFormat: body.dateFormat,
      }),
    )
    .digest('hex');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
