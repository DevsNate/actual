import { createHash, randomUUID } from 'node:crypto';

import { buildStockPlanBootstrap } from '@actual-app/semantic-core';
import type {
  CatalogReader,
  CreatePlanCommand,
  CreatePlanResult,
  PlanCreator,
} from '@actual-app/semantic-core';

export type CreatePlanInput = {
  principalId: string;
  originDeviceId: string;
  idempotencyKey: string;
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};

export type PlanCreationService = {
  createPlan(input: CreatePlanInput): Promise<CreatePlanResult>;
};

type Dependencies = {
  catalogReader: CatalogReader;
  planCreator: PlanCreator;
  allocateId(): string;
  now(): Date;
};

export function createPlanCreationService(
  dependencies: Pick<Dependencies, 'catalogReader' | 'planCreator'> &
    Partial<Pick<Dependencies, 'allocateId' | 'now'>>,
): PlanCreationService {
  const resolved: Dependencies = {
    allocateId: randomUUID,
    now: () => new Date(),
    ...dependencies,
  };
  return {
    async createPlan(input) {
      const catalog = await resolved.catalogReader.readCatalog(
        input.principalId,
      );
      const planId = resolved.allocateId();
      const budgetVersionId = resolved.allocateId();
      const membershipId = resolved.allocateId();
      const now = resolved.now();
      const response = {
        budget_id: planId,
        budget_version_id: budgetVersionId,
      };
      const command: CreatePlanCommand = {
        catalogChangeSetId: resolved.allocateId(),
        budgetChangeSetId: resolved.allocateId(),
        planId,
        budgetVersionId,
        membershipId,
        principalId: input.principalId,
        originDeviceId: input.originDeviceId,
        expectedCatalogServerKnowledge:
          catalog.knowledge.currentServerKnowledge,
        schemaVersion: 1,
        idempotencyKey: input.idempotencyKey,
        payloadDigest: digest(input),
        name: input.name,
        permissions: 1,
        currencyFormat: input.currencyFormat,
        dateFormat: input.dateFormat,
        entities: buildStockPlanBootstrap({
          planId,
          budgetVersionId,
          principalId: input.principalId,
          name: input.name,
          currencyFormat: input.currencyFormat,
          dateFormat: input.dateFormat,
          createdOn: now.toISOString().slice(0, 10),
          createdAtMilliseconds: now.getTime(),
          allocateId: () => resolved.allocateId(),
        }),
        response,
      };
      return resolved.planCreator.createPlan(command);
    },
  };
}

function digest(input: CreatePlanInput) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind: 'create-plan',
        principalId: input.principalId,
        name: input.name,
        currencyFormat: input.currencyFormat,
        dateFormat: input.dateFormat,
      }),
    )
    .digest('hex');
}
